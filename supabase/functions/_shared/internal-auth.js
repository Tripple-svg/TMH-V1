// New-format Supabase secret keys are not JWTs. SDK versions may omit their
// Bearer fallback, so internal callers send an explicit, server-only credential.
export function internalHeaders(serviceKey) {
  if (!serviceKey) throw new Error('Internal service credential is missing');
  return { 'x-haven-internal-key': serviceKey };
}

export function isInternalRequest(request, serviceKey) {
  return Boolean(serviceKey) && (request.headers.get('x-haven-internal-key') === serviceKey
    || request.headers.get('authorization') === `Bearer ${serviceKey}`);
}
