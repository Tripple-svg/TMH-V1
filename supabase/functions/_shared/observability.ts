import { logEvent } from "./logger.ts";
import { PUBLIC_ORIGINS } from "./cors.ts";

let sentry: Promise<any> | undefined;
export async function reportFailure(event: string, requestId: string) {
  if (!Deno.env.get("SENTRY_DSN")) return;
  try {
    sentry ||= import("https://esm.sh/@sentry/deno@10.22.0?target=deno").then(
      (sdk) => {
        sdk.init({
          dsn: Deno.env.get("SENTRY_DSN"),
          defaultIntegrations: false,
          sendDefaultPii: false,
          tracesSampleRate: 0,
          beforeSend: (item) => ({
            type: undefined,
            event_id: item.event_id,
            timestamp: item.timestamp,
            platform: "javascript",
            level: "error",
            message: "Edge operation failed",
            tags: item.tags,
          }),
        });
        return sdk;
      },
    );
    const sdk = await sentry;
    sdk.withScope((scope: any) => {
      scope.setTag("function", event);
      scope.setTag("request_id", requestId);
      sdk.captureMessage("Edge operation failed", "error");
    });
    await sdk.flush(1000);
  } catch {
    logEvent("warn", "sentry.unavailable", requestId);
  }
}

export function observe(
  name: string,
  handler: (request: Request) => Response | Promise<Response>,
) {
  return async (request: Request) => {
    const id = globalThis.crypto?.randomUUID?.() || Date.now().toString(36);
    try {
      const response = await handler(request);
      logEvent(
        response.status >= 500 ? "error" : "info",
        name + "." + (response.status >= 500 ? "failed" : "completed"),
        id,
      );
      if (response.status >= 500) await reportFailure(name, id);
      // Do not consume streams or change webhook/capability semantics.
      try {
        response.headers.set("x-request-id", id);
      } catch {
        /* A readonly streaming response can still be returned unchanged. */
      }
      return response;
    } catch {
      logEvent("error", name + ".unhandled", id);
      await reportFailure(name, id);
      const origin = request.headers.get("origin");
      return Response.json(
        { ok: false, error: "Service temporarily unavailable.", requestId: id },
        {
          status: 503,
          headers: {
            "Cache-Control": "no-store",
            Vary: "Origin",
            ...(origin && PUBLIC_ORIGINS.includes(origin)
              ? { "Access-Control-Allow-Origin": origin }
              : {}),
          },
        },
      );
    }
  };
}
