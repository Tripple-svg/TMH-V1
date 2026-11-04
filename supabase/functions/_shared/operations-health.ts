export async function recordWorkerSuccess(db:any,name:string) {
  const result=await db.rpc('record_worker_success',{p_name:name});
  if(result.error||result.data!==true)throw Error('heartbeat');
}
