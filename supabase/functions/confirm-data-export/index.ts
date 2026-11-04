import { createClient } from "https://esm.sh/@supabase/supabase-js@2.118.0";
import { zipSync, strToU8 } from "https://esm.sh/fflate@0.8.3";
import { observe } from "../_shared/observability.ts";
import {
  verifyOrigin,
  responseHeaders,
  readBoundedJson,
  HavenRequestError,
} from "../_shared/haven-request.ts";
import { publicRequestLimit } from "../_shared/abuse-limits.ts";
import { digest } from "../_shared/playbook-recovery.ts";
import { deliverEmail, mailConfiguration } from "../_shared/resend-delivery.js";
import { privacyEmail } from "../_shared/email-template.js";
Deno.serve(
  observe("confirm-data-export", async (request) => {
    const json = (body: unknown, status = 200) =>
      Response.json(body, { status, headers: responseHeaders(request) });
    try {
      verifyOrigin(request);
      if (request.method === "OPTIONS")
        return new Response(null, {
          status: 204,
          headers: responseHeaders(request),
        });
      if (request.method !== "POST")
        return json(
          { ok: false, error: "Confirm this request on the website." },
          405,
        );
      const body = await readBoundedJson(request, 512);
      if (typeof body.token !== "string" || !/^[a-f0-9]{64}$/.test(body.token))
        return json({ ok: false, error: "This link is invalid." }, 400);
      const url = Deno.env.get("SUPABASE_URL"),
        key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!url || !key) throw Error("config");
      const db = createClient(url, key, { auth: { persistSession: false } });
      await publicRequestLimit(db, request, key, "confirm-export", 10, 900);
      const prepared = await db.rpc("prepare_data_export", {
        p_hash: await digest(body.token),
      });
      if (prepared.error) throw Error("prepare");
      const row = prepared.data;
      if (row?.unavailable)
        return json(
          {
            ok: false,
            error: "This link expired or was already used. Request a new link.",
          },
          410,
        );
      if (row?.tooLarge)
        return json(
          {
            ok: false,
            error:
              "Your archive needs personal assistance. Contact info@themarketinghaven.xyz for a secure data access request.",
          },
          413,
        );
      if (!row?.id || !row.email || !row.snapshot) throw Error("snapshot");
      const zip = zipSync(
        {
          "reviews-and-chats.json": strToU8(
            JSON.stringify(row.snapshot, null, 2),
          ),
          "README.txt": strToU8(
            "TMH saved reviews and linked chats. This archive does not include every purchase, booking, support, security or unlinked guest record. Contact info@themarketinghaven.xyz for assistance with those records. Keep this archive private.",
          ),
        },
        { mtime: new Date("2020-01-01T00:00:00Z"), level: 6 },
      );
      let binary = "";
      for (let offset = 0; offset < zip.length; offset += 8192)
        binary += String.fromCharCode(...zip.subarray(offset, offset + 8192));
      const paragraphs = [
        "Your requested saved reviews and linked chats are attached as a ZIP file containing JSON. Keep it somewhere private.",
        "This archive covers the records matched to your verified inbox. Ask us about other record categories, corrections or privacy concerns at info@themarketinghaven.xyz.",
      ];
      const accepted = await deliverEmail(
        mailConfiguration(Deno.env),
        {
          to: [row.email],
          subject: "Your TMH data archive",
          text: paragraphs.join("\n\n"),
          html: privacyEmail({
            title: "Your data archive is ready.",
            paragraphs,
          }),
          attachments: [{ filename: "tmh-data.zip", content: btoa(binary) }],
        },
        "data-export/" + row.id,
      );
      const saved = await db
        .from("data_export_requests")
        .update({
          accepted_at: new Date().toISOString(),
          email_id: accepted,
          snapshot: null,
        })
        .eq("id", row.id);
      if (saved.error) throw Error("marker");
      return json({ ok: true });
    } catch (error) {
      if (error instanceof HavenRequestError)
        return json({ ok: false, error: error.message }, error.status);
      return json(
        {
          ok: false,
          error:
            "Your archive could not be confirmed. Retry this link shortly or contact support.",
        },
        503,
      );
    }
  }),
);
