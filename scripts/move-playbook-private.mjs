// Run with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the process environment.
// Keep the public file until private storage and byte-for-byte delivery are verified.
import { readFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
const client = createClient(url, key, { auth: { persistSession: false } });
const bucketId = 'playbook-private';
let result = await client.storage.getBucket(bucketId);
if (result.error && (String(result.error.status) === '404' || result.error.message === 'Bucket not found')) {
  const created = await client.storage.createBucket(bucketId, { public: false });
  if (created.error) throw created.error;
  result = await client.storage.getBucket(bucketId);
}
if (result.error) throw result.error;
if (result.data?.public !== false) throw new Error('Bucket is not private. Upload and deletion aborted.');
console.log('Confirmed playbook-private is private.');

const source = fileURLToPath(new URL('../public/The_Unseen_Playbook!.pdf', import.meta.url));
const bytes = await readFile(source);
const bucket = client.storage.from(bucketId);
const uploaded = await bucket.upload('The_Unseen_Playbook.pdf', bytes, { contentType: 'application/pdf', upsert: true });
if (uploaded.error) throw uploaded.error;
const downloaded = await bucket.download('The_Unseen_Playbook.pdf');
if (downloaded.error) throw downloaded.error;
if (!bytes.equals(Buffer.from(await downloaded.data.arrayBuffer()))) throw new Error('Uploaded bytes do not match.');
const checked = await client.storage.getBucket(bucketId);
if (checked.error || checked.data?.public !== false) throw new Error('Final private-bucket check failed.');
await unlink(source);
console.log('Private upload verified; removed public PDF. Rebuild and deploy the frontend to remove the old public asset.');
