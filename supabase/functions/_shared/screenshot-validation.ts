// Inspect the encoded file before storing it or forwarding it to a vision API.
// Limits apply to the canvas dimensions, not only its compressed byte size.
export class ScreenshotValidationError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
const MAX_BYTES=5*1024*1024, MAX_SIDE=16384, MAX_PIXELS=40_000_000;
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function invalid():never{throw new ScreenshotValidationError('Upload a complete, valid PNG, JPEG or WebP screenshot.');}
const ascii=(bytes:Uint8Array,offset:number,length:number)=>String.fromCharCode(...bytes.subarray(offset,offset+length));
const be16=(b:Uint8Array,o:number)=>b[o]*256+b[o+1];
const le16=(b:Uint8Array,o:number)=>b[o]+b[o+1]*256;
const be32=(b:Uint8Array,o:number)=>b[o]*16777216+b[o+1]*65536+b[o+2]*256+b[o+3];
const le24=(b:Uint8Array,o:number)=>b[o]+b[o+1]*256+b[o+2]*65536;
const le32=(b:Uint8Array,o:number)=>le24(b,o)+b[o+3]*16777216;
function dimensions(width:number,height:number){
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<=0||height<=0)invalid();
  if(width>MAX_SIDE||height>MAX_SIDE||width*height>MAX_PIXELS)throw new ScreenshotValidationError('Screenshot dimensions are too large. Use at most 16,384 pixels per side and 40 million pixels in total.',413);
  return {width,height};
}
const crcTable=Array.from({length:256},(_,index)=>{let value=index;for(let bit=0;bit<8;bit++)value=(value>>>1)^((value&1)?0xedb88320:0);return value>>>0;});
function crc32(bytes:Uint8Array,start:number,end:number){let crc=0xffffffff;for(let i=start;i<end;i++)crc=(crc>>>8)^crcTable[(crc^bytes[i])&255];return(crc^0xffffffff)>>>0;}
function png(bytes:Uint8Array){
  if(bytes.length<45||ascii(bytes,0,8)!=='\x89PNG\r\n\x1a\n')invalid();
  let offset=8,canvas:ReturnType<typeof dimensions>|null=null,dataBytes=0;
  const zlibPrefix:number[]=[];
  while(offset+12<=bytes.length){
    const length=be32(bytes,offset),end=offset+12+length,type=ascii(bytes,offset+4,4);
    if(end>bytes.length||! /^[A-Za-z]{4}$/.test(type))invalid();
    if(offset===8&&type!=='IHDR')invalid();
    if(type==='IHDR'){
      if(canvas||length!==13)invalid();
      canvas=dimensions(be32(bytes,offset+8),be32(bytes,offset+12));
      const depth=bytes[offset+16],color=bytes[offset+17];
      if(!({0:[1,2,4,8,16],2:[8,16],3:[1,2,4,8],4:[8,16],6:[8,16]} as Record<number,number[]>)[color]?.includes(depth)||bytes[offset+18]!==0||bytes[offset+19]!==0||bytes[offset+20]>1)invalid();
    }
    if(crc32(bytes,offset+4,end-4)!==be32(bytes,end-4))invalid();
    if(type==='IDAT'){
      dataBytes+=length;
      for(let index=offset+8;index<end-4&&zlibPrefix.length<2;index++)zlibPrefix.push(bytes[index]);
    }
    if(type==='IEND'){
      if(length!==0||end!==bytes.length||!canvas||dataBytes<8||zlibPrefix.length!==2||(zlibPrefix[0]&15)!==8||(zlibPrefix[0]>>>4)>7||(zlibPrefix[1]&32)!==0||(zlibPrefix[0]*256+zlibPrefix[1])%31!==0)invalid();
      return canvas;
    }
    offset=end;
  }
  return invalid();
}
function jpeg(bytes:Uint8Array){
  if(bytes.length<4||bytes[0]!==255||bytes[1]!==216)invalid();
  let offset=2,canvas:ReturnType<typeof dimensions>|null=null,hasScan=false,entropyBytes=0;
  while(offset<bytes.length){
    if(bytes[offset++]!==255)invalid();
    while(bytes[offset]===255)offset++;
    const marker=bytes[offset++];
    if(marker===217){if(offset!==bytes.length||!canvas||!hasScan||!entropyBytes)invalid();return canvas;}
    if(marker===0||marker===216||(marker>=208&&marker<=215)||offset+2>bytes.length)invalid();
    const length=be16(bytes,offset),end=offset+length;
    if(length<2||end>bytes.length)invalid();
    if([192,193,194].includes(marker)){
      if(length<11||canvas)invalid();
      const components=bytes[offset+7];
      if(![1,3,4].includes(components)||length!==8+3*components||![8,12].includes(bytes[offset+2]))invalid();
      canvas=dimensions(be16(bytes,offset+5),be16(bytes,offset+3));
    }else if(marker>=192&&marker<=207&&![196,200,204].includes(marker))invalid();
    if(marker===218){
      if(!canvas||length<8||length!==6+2*bytes[offset+2])invalid();
      hasScan=true;offset=end;
      while(offset<bytes.length){
        if(bytes[offset]!==255){entropyBytes++;offset++;continue;}
        const start=offset++;
        while(bytes[offset]===255)offset++;
        const next=bytes[offset];
        if(next===0){entropyBytes++;offset++;continue;}
        if(next>=208&&next<=215){offset++;continue;}
        offset=start;break;
      }
    }else offset=end;
  }
  return invalid();
}
function webp(bytes:Uint8Array){
  if(bytes.length<26||ascii(bytes,0,4)!=='RIFF'||ascii(bytes,8,4)!=='WEBP'||le32(bytes,4)!==bytes.length-8)invalid();
  let offset=12,canvas:ReturnType<typeof dimensions>|null=null,image:ReturnType<typeof dimensions>|null=null;
  while(offset+8<=bytes.length){
    const type=ascii(bytes,offset,4),size=le32(bytes,offset+4),start=offset+8,end=start+size;
    if(end+(size%2)>bytes.length)invalid();
    if(type==='VP8X'){
      if(offset!==12||size!==10||canvas||(bytes[start]&0xc3)!==0)invalid(); // Still images only; reserved bits must be zero.
      canvas=dimensions(1+le24(bytes,start+4),1+le24(bytes,start+7));
    }else if(type==='VP8 '){
      if(image||size<=10||(bytes[start]&1)!==0||ascii(bytes,start+3,3)!=='\x9d\x01\x2a')invalid();
      const partition=(le24(bytes,start)>>>5);
      if(partition===0||partition>size-10)invalid();
      image=dimensions(le16(bytes,start+6)&0x3fff,le16(bytes,start+8)&0x3fff);
    }else if(type==='VP8L'){
      if(image||size<=5||bytes[start]!==0x2f||(bytes[start+4]>>>5)!==0)invalid();
      image=dimensions(1+((bytes[start+1]|bytes[start+2]<<8)&0x3fff),1+((bytes[start+2]>>6|bytes[start+3]<<2|bytes[start+4]<<10)&0x3fff));
    }else if(type==='ANIM'||type==='ANMF')invalid();
    offset=end+(size%2);
  }
  if(offset!==bytes.length||!image)invalid();
  if(canvas&&(canvas.width!==image.width||canvas.height!==image.height))invalid();
  return canvas||image;
}
export function validateScreenshotBytes(bytes:Uint8Array,mimeType:string){
  if(bytes.length>MAX_BYTES)throw new ScreenshotValidationError('Screenshot exceeds 5 MB.',413);
  if(!bytes.length)invalid();
  const canvas=mimeType==='image/png'?png(bytes):mimeType==='image/jpeg'?jpeg(bytes):mimeType==='image/webp'?webp(bytes):invalid();
  return {...canvas,mimeType};
}
export function decodeScreenshotDataUrl(value:unknown){
  if(typeof value!=='string')invalid();
  if(value.length>7*1024*1024)throw new ScreenshotValidationError('Screenshot exceeds 5 MB.',413);
  const match=/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if(!match||match[2].length%4!==0)invalid();
  const [ ,mimeType,base64]=match,padding=base64.endsWith('==')?2:base64.endsWith('=')?1:0;
  const length=base64.length*3/4-padding;
  if(length>MAX_BYTES)throw new ScreenshotValidationError('Screenshot exceeds 5 MB.',413);
  if((padding===2&&(alphabet.indexOf(base64.at(-3)!)&15)!==0)||(padding===1&&(alphabet.indexOf(base64.at(-2)!)&3)!==0))invalid();
  const bytes=new Uint8Array(length);let out=0;
  for(let i=0;i<base64.length;i+=4){
    const packed=(alphabet.indexOf(base64[i])<<18)|(alphabet.indexOf(base64[i+1])<<12)|((base64[i+2]==='='?0:alphabet.indexOf(base64[i+2]))<<6)|(base64[i+3]==='='?0:alphabet.indexOf(base64[i+3]));
    if(out<length)bytes[out++]=packed>>>16;if(out<length)bytes[out++]=packed>>>8;if(out<length)bytes[out++]=packed;
  }
  return {bytes,base64,...validateScreenshotBytes(bytes,mimeType)};
}
