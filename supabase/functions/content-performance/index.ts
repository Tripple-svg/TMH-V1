import { createClient } from "https://esm.sh/@supabase/supabase-js@2.118.0";
import { observe } from "../_shared/observability.ts";
import {
  verifyOrigin,
  responseHeaders,
  readBoundedJson,
  HavenRequestError,
} from "../_shared/haven-request.ts";
import { digest } from "../_shared/playbook-recovery.ts";
Deno.serve(
  observe("content-performance", async (request) => {
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
      const body = await readBoundedJson(request, 700);
      if (
        body.consented !== true ||
        typeof body.visitorId !== "string" ||
        !/^[a-f0-9-]{36}$/i.test(body.visitorId) ||
        typeof body.visitorToken !== "string" ||
        !/^[a-f0-9]{64}$/i.test(body.visitorToken) ||
        ![
          "hero",
          "about",
          "services",
          "free-class",
          "shop",
          "testimonials",
        ].includes(body.content) ||
        !["view", "action"].includes(body.event)
      )
        return json({ ok: false }, 400);
      const url = Deno.env.get("SUPABASE_URL"),
        key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!url || !key) throw Error("config");
      const db = createClient(url, key, { auth: { persistSession: false } }),
        limit = await db.rpc("consume_playbook_limit", {
          p_bucket: "content-performance:global",
          p_max: 100,
          p_seconds: 10,
        });
      if (limit.error) throw Error("limit");
      if (limit.data !== true) return json({ ok: false }, 429);
      const result = await db.rpc("record_content_performance", {
        p_visitor: body.visitorId,
        p_hash: await digest(body.visitorToken),
        p_content: body.content,
        p_event: body.event,
      });
      if (result.error?.code === "42501") return json({ ok: false }, 403);
      if (result.error || result.data !== true) throw Error("event");
      return json({ ok: true });
    } catch (error) {
      return json(
        { ok: false },
        error instanceof HavenRequestError ? error.status : 503,
      );
    }
  }),
);
