import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {productionDb,seedReview,rpc,scalar,ADMIN_A,SESSION_A} from '../tests/helpers/production-db.mjs';
// A physical, isolated PostgreSQL dump/restore rehearsal with synthetic records.
// Production backups and private Storage bytes must be rehearsed in staging too.
let source,restored;
try{
  source=await productionDb();await seedReview(source,'restore-review');
  await source.exec("insert into haven_sessions(id,review_id,scope,messages) values('restore-chat','restore-review','audit','[{\"role\":\"user\",\"content\":\"Synthetic restore check\"}]');insert into storage.objects(id,bucket_id,name) values(gen_random_uuid(),'tmh-screenshots','restore-review/synthetic.png')");
  const backup=await source.dumpDataDir('none');await source.close();source=null;
  restored=new PGlite({loadDataDir:backup});
  assert.equal(await scalar(restored,"select count(*)::int from brand_reviews where id='restore-review'"),1);
  assert.equal(await scalar(restored,"select messages->0->>'content' from haven_sessions where id='restore-chat'"),'Synthetic restore check');
  assert.equal(await scalar(restored,"select name from storage.objects where bucket_id='tmh-screenshots'"),'restore-review/synthetic.png');
  await restored.exec("select set_config('request.jwt.claim.role','service_role',false)");
  assert.equal(await rpc(restored,'admin_access_allowed',[ADMIN_A,'aal1',SESSION_A]),true);
  await restored.exec("set role authenticated;select set_config('request.jwt.claim.role','authenticated',false);select set_config('request.jwt.claims','{}',false)");
  await assert.rejects(restored.query('select * from admin_backup_codes'),e=>e.code==='42501');
  assert.equal(await scalar(restored,'select count(*)::int from brand_reviews'),0);
  console.log(JSON.stringify({ok:true,scope:'isolated PostgreSQL, synthetic data',backupBytes:backup.size,checks:['reviews','linked chat text','Storage metadata','admin RPC','RLS and grants'],productionBackupRestored:false,storageObjectBytesRestored:false},null,2));
}finally{await source?.close();await restored?.close();}
