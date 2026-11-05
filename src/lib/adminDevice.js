const KEY='tmh_admin_device_v1';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let memoryId;
// A security notification hint only. This never grants authentication or access.
export function getAdminDeviceId(storage){
  try{
    storage??=globalThis.localStorage;
    const saved=storage?.getItem(KEY);
    if(UUID.test(saved||''))return saved;
    const id=crypto.randomUUID();storage?.setItem(KEY,id);memoryId=id;return id;
  }catch{memoryId||=crypto.randomUUID();return memoryId;}
}
