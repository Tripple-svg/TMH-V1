import { logEvent } from "./logger.ts";
import { PUBLIC_ORIGINS } from "./cors.ts";

let sentry: Promise<any> | undefined;
export function privateEdgeEvent(item:any){
  const name=/^[a-z0-9-]{1,80}$/i.test(item.tags?.function||'')?item.tags.function:'unknown';
  const status=/^5\d\d$/.test(String(item.tags?.http_status))?String(item.tags.http_status):'503';
  return {type:undefined,event_id:item.event_id,timestamp:item.timestamp,platform:'javascript',level:'error' as const,
    message:`Edge operation failed: ${name} (HTTP ${status})`,tags:{function:name,request_id:item.tags?.request_id,http_status:status},
    fingerprint:['tmh-edge',name,status]};
}
export async function reportFailure(event: string, requestId: string,status=503) {
  if (!Deno.env.get("SENTRY_DSN")) return;
  try {
    sentry ||= import("https://esm.sh/@sentry/deno@10.22.0?target=deno").then(
      (sdk) => {
        sdk.init({
          dsn: Deno.env.get("SENTRY_DSN"),
          defaultIntegrations: false,
          sendDefaultPii: false,
          // Pinned Deno SDK metadata is forwarded to Relay's envelope header.
          // Explicitly suppress inference from the reporting connection too.
          _metadata:{sdk:{name:'sentry.javascript.deno',version:'10.22.0',settings:{infer_ip:'never'}}},
          tracesSampleRate: 0,
          beforeSend: privateEdgeEvent,
        });
        return sdk;
      },
    );
    const sdk = await sentry;
    sdk.withScope((scope: any) => {
      scope.setTag("function", event);
      scope.setTag("request_id", requestId);
      scope.setTag('http_status',String(status));
      sdk.captureMessage("Edge operation failed", "error");
    });
    await sdk.flush(1000);
  } catch {
    logEvent("warn", "sentry.unavailable", requestId);
  }
}

export function observe(
  name: string,
  handler: (request: Request,requestId:string) => Response | Promise<Response>,
) {
  return async (request: Request) => {
    const id = globalThis.crypto?.randomUUID?.() || Date.now().toString(36);
    try {
      const response = await handler(request,id);
      logEvent(
        response.status >= 500 ? "error" : "info",
        name + "." + (response.status >= 500 ? "failed" : "completed"),
        id,
      );
      if (response.status >= 500) await reportFailure(name, id,response.status);
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
