import { createClient } from "https://esm.sh/@supabase/supabase-js@2.118.0";
import { observe } from "../_shared/observability.ts";
import {healthConfiguration} from '../_shared/health-configuration.ts';
Deno.serve(
  observe("health", async (request) => {
    const headers = {
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
    };
    if (!["GET", "HEAD"].includes(request.method))
      return Response.json({ ok: false }, { status: 405, headers });
    let checks: Record<string, boolean> = {
      database: false,
      rpc: false,
      vault: false,
      cron: false,
      workers: false,
    };
    try {
      const url = Deno.env.get("SUPABASE_URL"),
        key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!url || !key) throw Error("config");
      const db = createClient(url, key, {
        auth: { persistSession: false },
        global: {
          fetch: (url, init) =>
            fetch(url, { ...init, signal: AbortSignal.timeout(5000) }),
        },
      });
      const result = await db.rpc("production_health_checks");
      if (!result.error && result.data)
        checks = Object.fromEntries(
          Object.keys(checks).map((name) => [name, result.data[name] === true]),
        );
    } catch {
      /* Public output contains check names only, never secrets or SQL. */
    }
    const configuration=healthConfiguration(Deno.env);
    const ok = Object.values(checks).every(Boolean)&&Object.values(configuration.required).every(Boolean);
    return new Response(
      request.method === "HEAD" ? null : JSON.stringify({ ok, checks,configuration,scope:'infrastructure_and_configuration',providerAvailability:'not_probed' }),
      { status: ok ? 200 : 503, headers },
    );
  }),
);
