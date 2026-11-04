import { createClient } from "https://esm.sh/@supabase/supabase-js@2.118.0";
import { observe } from "../_shared/observability.ts";
import {
  verifyOrigin,
  responseHeaders,
  readBoundedJson,
  HavenRequestError,
} from "../_shared/haven-request.ts";
import { publicRequestLimit } from "../_shared/abuse-limits.ts";
import {
  digest,
  privateToken,
  codeHash,
  limitRecovery,
} from "../_shared/playbook-recovery.ts";
import { deliverEmail, mailConfiguration } from "../_shared/resend-delivery.js";
import { privacyEmail } from "../_shared/email-template.js";
Deno.serve(
  observe("request-data-export", async (request) => {
    const json = (body: unknown, status = 200) =>
      Response.json(body, { status, headers: responseHeaders(request) });
    try {
      verifyOrigin(request);
      if (request.method === "OPTIONS")
        return new Response(null, {
          status: 204,
          headers: responseHeaders(request),
        });
      if (request.method !== "POST") return json({ ok: false }, 405);
      const body = await readBoundedJson(request, 1024),
        email =
          typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return json({ ok: true });
      const url = Deno.env.get("SUPABASE_URL"),
        key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!url || !key) throw Error("config");
      const db = createClient(url, key, { auth: { persistSession: false } });
      await publicRequestLimit(db, request, key, "data-export", 5, 900);
      await limitRecovery(
        db,
        "export-email:" + (await codeHash("export-email", email, key)),
        3,
        3600,
      );
      const token = privateToken(),
        id = crypto.randomUUID();
      // Send the same verification flow whether a review exists or not. No account enumeration.
      const inserted = await db
        .from("data_export_requests")
        .insert({ id, email, token_hash: await digest(token) });
      if (inserted.error) throw Error("record");
      const link =
        "https://themarketinghaven.xyz/data-access/confirm?token=" + token;
      const paragraphs = [
        "Someone requested a copy of the saved reviews and linked chats associated with this email.",
        "Confirm using the button within 24 hours. We will email a ZIP file to this inbox. Opening the link alone does not send an archive.",
        "If you did not request this, ignore this message. For purchase, booking, support or unlinked guest records, contact info@themarketinghaven.xyz for a verified access request.",
      ];
      await deliverEmail(
        mailConfiguration(Deno.env),
        {
          to: [email],
          subject: "Confirm your TMH data access request",
          text: paragraphs.join("\n\n") + "\n\n" + link,
          html: privacyEmail({
            title: "Your information, in your hands.",
            paragraphs,
            button: { label: "Confirm data access", href: link },
          }),
        },
        "data-export-verify/" + id,
      );
      return json({ ok: true });
    } catch (error) {
      if (error instanceof HavenRequestError)
        return json({ ok: false, error: error.message }, error.status);
      return json(
        {
          ok: false,
          error:
            "We could not confirm this request. Try again shortly or contact support.",
        },
        503,
      );
    }
  }),
);
