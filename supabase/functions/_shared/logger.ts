// Deliberately no arbitrary metadata argument. Never serialize provider errors,
// request headers, bodies, identities, credentials or conversation content.
export function logEvent(
  level: "info" | "warn" | "error",
  event: string,
  requestId = "background",
) {
  const safeEvent = /^[a-z0-9_.-]{1,100}$/i.test(event)
    ? event
    : "operation_failed";
  const safeId = /^[a-z0-9-]{1,64}$/i.test(requestId)
    ? requestId
    : "background";
  const sink = console[level] || console.error;
  sink?.(
    JSON.stringify({
      level,
      event: safeEvent,
      timestamp: new Date().toISOString(),
      request_id: safeId,
    }),
  );
}
