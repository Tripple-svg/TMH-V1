import { codeHash, requestBucket } from "./playbook-recovery.ts";
import { edgeClientAddress } from './edge-client-address.ts';
export function verifiedClaims(request: Request) {
  // Call only after auth.getUser has verified this exact bearer.
  const token =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  try {
    return JSON.parse(
      atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
  } catch {
    return {};
  }
}
export async function backupHash(actor: string, code: string, secret: string) {
  return codeHash(
    "admin-backup:" + actor,
    code.replaceAll("-", "").toLowerCase(),
    secret,
  );
}
export function newBackupCodes() {
  return Array.from({ length: 10 }, () =>
    Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
      b.toString(16).padStart(2, "0"),
    )
      .join("")
      .match(/.{8}/g)!
      .join("-"),
  );
}
export async function auditNetwork(request: Request, key: string) {
  return requestBucket(request, key);
}
export function observedIp(request: Request) {
  return edgeClientAddress(request);
}
export function deviceLabel(request: Request) {
  const ua = request.headers.get("user-agent") || "";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
      ? "Firefox"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Other browser";
  const os = /Android/.test(ua)
    ? "Android"
    : /iPhone|iPad/.test(ua)
      ? "iOS"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "Other device";
  return `${browser} on ${os}`;
}
