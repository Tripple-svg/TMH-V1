// Browser CORS is separate from authentication. Signed webhooks and internal
// workers do not use these browser origins; every private handler still checks
// its JWT, signature or private capability when Origin is absent.
export const PUBLIC_ORIGINS=[
  'https://themarketinghaven.xyz','https://www.themarketinghaven.xyz',
  'http://localhost:5173','http://localhost:5175','http://localhost:3000',
  'http://127.0.0.1:5173','http://127.0.0.1:5175',
];
