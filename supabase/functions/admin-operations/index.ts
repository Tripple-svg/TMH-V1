import { ADMIN_ALERT_RECIPIENTS } from "../_shared/admin-alerts.js";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.118.0";
import { observe } from "../_shared/observability.ts";
import {
  requireAdmin,
  readAdminBody,
  AdminAuthError,
} from "../_shared/admin-auth.ts";
import { publicRequestLimit } from "../_shared/abuse-limits.ts";
import { limitRecovery, codeHash } from "../_shared/playbook-recovery.ts";
import {
  verifyOrigin,
  responseHeaders,
  HavenRequestError,
} from "../_shared/haven-request.ts";
import {
  verifiedClaims,
  newBackupCodes,
  backupHash,
  auditNetwork,
  observedIp,
  deviceLabel,
} from "../_shared/admin-operations.ts";
import { deliverEmail, mailConfiguration } from "../_shared/resend-delivery.js";
import { editorialEmail } from "../_shared/email-template.js";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
Deno.serve(
  observe("admin-operations", async (request) => {
    const json = (body: unknown, status = 200) =>
      Response.json(body, {
        status,
        headers: {
          ...responseHeaders(request),
          ...(status === 429 ? { "Retry-After": "900" } : {}),
        },
      });
    try {
      verifyOrigin(request);
      if (request.method === "OPTIONS")
        return new Response(null, {
          status: 204,
          headers: responseHeaders(request),
        });
      if (request.method !== "POST")
        return json({ ok: false, error: "Method not allowed." }, 405);
      const url = Deno.env.get("SUPABASE_URL"),
        key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!url || !key) throw Error("config");
      const db = createClient(url, key, { auth: { persistSession: false } }),
        body = await readAdminBody(request),
        network = await auditNetwork(request, key);
      // Recovery is a separate, narrow path. It grants no data access and never
      // manufactures an AAL2 token. Password + code remove lost factors, followed
      // by global sign-out and an ordinary fresh password sign-in.
      if (body.action === "recoverMfa") {
        await publicRequestLimit(db, request, key, "admin-recovery", 5, 900);
        const bearer = request.headers
          .get("authorization")
          ?.match(/^Bearer\s+(\S+)$/i)?.[1];
        if (!bearer || bearer === key)
          return json(
            { ok: false, error: "Sign in with your password first." },
            401,
          );
        const verified = await db.auth.getUser(bearer);
        if (verified.error || !verified.data.user)
          return json({ ok: false, error: "Sign in again." }, 401);
        const actor = verified.data.user,
          claims = verifiedClaims(request);
        const passwordTime = Array.isArray(claims.amr)
          ? claims.amr.find((item: any) => item.method === "password")
              ?.timestamp
          : 0;
        if (
          !Number.isFinite(passwordTime) ||
          Date.now() / 1000 - passwordTime > 300 ||
          passwordTime > Date.now() / 1000 + 30
        )
          return json(
            {
              ok: false,
              error:
                "Sign out and use your password again before recovering MFA.",
            },
            403,
          );
        const current = await db.rpc("admin_recovery_allowed", {
          p_actor: actor.id,
          p_session: UUID.test(claims.session_id || "")
            ? claims.session_id
            : null,
        });
        if (current.error || current.data !== true)
          return json(
            { ok: false, error: "Admin recovery is unavailable." },
            403,
          );
        await limitRecovery(db, "admin-backup:" + actor.id, 5, 900);
        if (
          typeof body.code !== "string" ||
          !/^([a-f0-9]{8}-){3}[a-f0-9]{8}$/i.test(body.code.trim())
        )
          return json(
            { ok: false, error: "Enter an unused backup code." },
            400,
          );
        const consumed = await db.rpc("consume_admin_backup_code", {
          p_actor: actor.id,
          p_hash: await backupHash(actor.id, body.code.trim(), key),
          p_network: network,
        });
        if (consumed.error) throw Error("recovery");
        if (consumed.data !== true)
          return json(
            { ok: false, error: "This code is invalid or was already used." },
            400,
          );
        const listed = await db.auth.admin.mfa.listFactors({
          userId: actor.id,
        });
        if (listed.error || !Array.isArray(listed.data?.factors))
          throw Error("factors");
        for (const factor of listed.data.factors) {
          const removed = await db.auth.admin.mfa.deleteFactor({
            userId: actor.id,
            id: factor.id,
          });
          if (removed.error) throw Error("factor");
        }
        const revoked = await db.auth.admin.signOut(bearer, "global");
        if (revoked.error) throw Error("signout");
        const burned = await db
          .from("admin_backup_codes")
          .update({ consumed_at: new Date().toISOString() })
          .eq("actor_id", actor.id)
          .is("consumed_at", null);
        if (burned.error) throw Error("codes");
        return json({ ok: true, recovered: true });
      }
      const actor = await requireAdmin(db, request, key);
      const rpc = async (name: string, args: Record<string, unknown> = {}) => {
        const result = await db.rpc(name, { p_actor: actor.id, ...args });
        if (result.error?.code === "42501")
          throw new AdminAuthError(
            "This action requires another current admin or a fresh sign-in.",
            403,
          );
        if (result.error) throw Error("operation");
        return result.data;
      };
      if (body.action === "insights") {
        const days = body.days === 7 ? 7 : 30;
        const [insights, content] = await Promise.all([
          rpc("admin_insights", { p_days: days }),
          rpc("admin_content_performance", { p_days: days }),
        ]);
        return json({ ok: true, insights, content });
      }
      if (body.action === "activity") {
        const result = await db
          .from("admin_login_events")
          .select("id,actor_id,device,ip_address,city,occurred_at")
          .order("occurred_at", { ascending: false })
          .limit(100);
        if (result.error) throw Error("activity");
        return json({ ok: true, events: result.data });
      }
      if (body.action === "login") {
        const claims = verifiedClaims(request);
        if (!UUID.test(claims.session_id || ""))
          return json(
            { ok: false, error: "Sign in again to record this device." },
            400,
          );
        const ip = observedIp(request),
          device = deviceLabel(request);
        let city: string | null = null;
        // Optional configured geolocation. No exact location or browser geolocation.
        const geoKey = Deno.env.get("IPINFO_TOKEN");
        if (geoKey && ip !== "unknown")
          try {
            const response = await fetch(
              "https://ipinfo.io/" + encodeURIComponent(ip) + "/json",
              {
                headers: { Authorization: "Bearer " + geoKey },
                signal: AbortSignal.timeout(2000),
              },
            );
            if (response.ok) {
              const data = await response.json();
              if (typeof data.city === "string") city = data.city.slice(0, 120);
            }
          } catch {
            /* City remains unavailable. */
          }
        const combo = await codeHash(
          "admin-device:" + actor.id,
          ip + ":" + (request.headers.get("user-agent") || "").slice(0, 1000),
          key,
        );
        const result = await rpc("record_admin_login", {
          p_session: claims.session_id,
          p_combo: combo,
          p_device: device,
          p_ip: ip,
          p_city: city,
        });
        if (result.alert) {
          const paragraphs = [
            `An admin account signed in from ${device}.`,
            `Observed IP: ${ip}. City estimate: ${city || "Unavailable"}.`,
            `Admin reference: ${actor.id}. If this was unexpected, revoke sessions and review the account in Supabase Auth.`,
          ];
          const accepted = await deliverEmail(
            mailConfiguration(Deno.env),
            {
              to: ADMIN_ALERT_RECIPIENTS,
              subject: "TMH admin: new sign-in device",
              text: paragraphs.join("\n\n"),
              html: editorialEmail({
                label: "ACCOUNT SECURITY",
                title: "Review a new sign-in.",
                paragraphs,
                button: {
                  label: "Open Admin",
                  href: "https://themarketinghaven.xyz/admin",
                },
              }),
            },
            "admin-login/" + result.generation,
          );
          const saved = await db
            .from("admin_login_devices")
            .update({ alert_accepted_at: new Date().toISOString() })
            .eq("actor_id", actor.id)
            .eq("combo_hash", combo)
            .eq("alert_generation", result.generation);
          if (saved.error || !accepted) throw Error("marker");
        }
        return json({ ok: true });
      }
      if (body.action === "generateBackupCodes") {
        if (verifiedClaims(request).aal !== "aal2")
          return json(
            {
              ok: false,
              error:
                "Verify your authenticator before generating backup codes.",
            },
            403,
          );
        const codes = newBackupCodes(),
          hashes = await Promise.all(
            codes.map((code) => backupHash(actor.id, code, key)),
          );
        await rpc("replace_admin_backup_codes", {
          p_hashes: hashes,
          p_network: network,
        });
        return json({ ok: true, codes });
      }
      if (body.action === "limits")
        return json({ ok: true, limits: await rpc("admin_active_limits") });
      if (body.action === "clearLimit") {
        if (
          typeof body.id !== "string" ||
          body.id.length > 200 ||
          typeof body.reason !== "string" ||
          body.reason.trim().length < 10 ||
          body.reason.length > 500
        )
          return json(
            { ok: false, error: "Add a reason of at least 10 characters." },
            400,
          );
        return json({
          ok: true,
          cleared: await rpc("clear_admin_limit", {
            p_id: body.id,
            p_reason: body.reason,
            p_network: network,
          }),
        });
      }
      if (body.action === "requestDeletion") {
        if (
          !["review", "purchase"].includes(body.kind) ||
          typeof body.id !== "string" ||
          body.id.length > 200 ||
          typeof body.reason !== "string" ||
          body.reason.trim().length < 10 ||
          body.reason.length > 500
        )
          return json(
            { ok: false, error: "Select a record and add a reason." },
            400,
          );
        const result = await rpc("request_admin_deletion", {
          p_kind: body.kind,
          p_id: body.id,
          p_reason: body.reason,
          p_network: network,
        });
        return json(
          { ok: !result.missing, ...result },
          result.missing ? 404 : 200,
        );
      }
      if (body.action === "approvals") {
        const result = await db
          .from("admin_deletion_approvals")
          .select(
            "id,record_type,record_id,requested_by,reason,created_at,expires_at,executed_at,cleanup_path,cleanup_completed_at",
          )
          .order("created_at", { ascending: false })
          .limit(100);
        if (result.error) throw Error("approvals");
        return json({ ok: true, approvals: result.data, actorId: actor.id });
      }
      if (body.action === "approveDeletion" || body.action === "retryCleanup") {
        if (!UUID.test(body.id || ""))
          return json({ ok: false, error: "Select a pending approval." }, 400);
        let result;
        if (body.action === "approveDeletion") {
          result = await rpc("approve_admin_deletion", {
            p_id: body.id,
            p_network: network,
          });
          if (!result.deleted)
            return json(
              {
                ok: false,
                error: result.conflict
                  ? "The record changed. Request a new approval."
                  : "This approval expired or was already used.",
              },
              409,
            );
        } else {
          const row = await db
            .from("admin_deletion_approvals")
            .select("record_id,cleanup_path,executed_at,cleanup_completed_at")
            .eq("id", body.id)
            .single();
          if (row.error || !row.data?.executed_at)
            return json(
              { ok: false, error: "Cleanup record unavailable." },
              404,
            );
          result = {
            recordId: row.data.record_id,
            cleanupPath: row.data.cleanup_completed_at
              ? null
              : row.data.cleanup_path,
          };
        }
        if (result.cleanupPath) {
          if (
            !result.cleanupPath.startsWith(result.recordId + "/") ||
            result.cleanupPath.split("/").includes("..")
          )
            throw Error("path");
          const removed = await db.storage
            .from("tmh-screenshots")
            .remove([result.cleanupPath]);
          if (removed.error)
            return json(
              {
                ok: false,
                error:
                  "Records deleted. Screenshot cleanup is pending. Use Retry cleanup.",
              },
              503,
            );
          const saved = await db
            .from("admin_deletion_approvals")
            .update({ cleanup_completed_at: new Date().toISOString() })
            .eq("id", body.id);
          if (saved.error) throw Error("cleanup");
        }
        return json({ ok: true, ...result });
      }
      if (body.action === "markResponse") {
        if (!UUID.test(body.id || "") || !Number.isSafeInteger(body.revision))
          return json({ ok: false, error: "Select a request." }, 400);
        const done = await rpc("mark_support_response", {
          p_id: body.id,
          p_revision: body.revision,
          p_network: network,
        });
        return json(
          {
            ok: done,
            error: done
              ? undefined
              : "Request changed. Refresh before retrying.",
          },
          done ? 200 : 409,
        );
      }
      if (body.action === "followups") {
        const refreshed = await db.rpc("refresh_lead_followup_nudges");
        if (refreshed.error) throw Error("followups");
        const result = await db
          .from("admin_followup_nudges")
          .select("review_id,due_at,approved_at,accepted_at,first_attempt_at")
          .order("due_at")
          .limit(100);
        if (result.error) throw Error("followups");
        return json({ ok: true, nudges: result.data });
      }
      if (body.action === "approveNudge") {
        if (typeof body.id !== "string" || body.id.length > 200)
          return json({ ok: false, error: "Select a lead." }, 400);
        const approved = await rpc("approve_lead_nudge", {
          p_id: body.id,
          p_network: network,
        });
        return json(
          {
            ok: approved,
            error: approved ? undefined : "This lead no longer needs a nudge.",
          },
          approved ? 200 : 409,
        );
      }
      return json({ ok: false, error: "Unknown admin action." }, 400);
    } catch (error) {
      if (error instanceof AdminAuthError || error instanceof HavenRequestError)
        return json({ ok: false, error: error.message }, error.status);
      return json(
        {
          ok: false,
          error:
            "This operation could not be confirmed. Refresh before retrying. If recovery failed, use another unused backup code or contact the owner.",
        },
        503,
      );
    }
  }),
);
