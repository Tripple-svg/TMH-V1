export class RawBodyError extends Error {
  constructor(public status:number,message:string){super(message);}
}
// Authenticate exactly these bytes; never stringify parsed JSON for a signature.
// An attacker with a syntactically valid signature header must not be able to
// allocate an unbounded body before signature verification runs.
export async function boundedRawBody(request:Request,max=65536){
  if(Number(request.headers.get('content-length'))>max)throw new RawBodyError(413,'Webhook payload is too large.');
  const reader=request.body?.getReader();if(!reader)return new Uint8Array();
  const chunks:Uint8Array[]=[];let length=0;
  try{
    while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;
      if(length>max){await reader.cancel();throw new RawBodyError(413,'Webhook payload is too large.');}chunks.push(value);}
    const result=new Uint8Array(length);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}return result;
  }finally{reader.releaseLock();}
}
