import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';
import vm from 'node:vm';
import {IMAGE_BASE64,PNG_BYTES,PNG_DATA_URL} from './helpers/image-fixtures.mjs';

function load(path){
  const module={exports:{}};
  const code=buildSync({entryPoints:[path],bundle:true,write:false,format:'cjs',platform:'node'}).outputFiles[0].text;
  vm.runInNewContext(code,{module,exports:module.exports,Uint8Array,TextDecoder,btoa});
  return module.exports;
}
const {decodeScreenshotDataUrl,validateScreenshotBytes}=load('supabase/functions/_shared/screenshot-validation.ts');
const {screenshotPart}=load('supabase/functions/_shared/haven-request.ts');
const {storedReviewScreenshot}=load('supabase/functions/_shared/review-access.ts');
const dataUrl=(mime,bytes)=>`data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;

test('screenshots accept genuine PNG, JPEG and WebP files and preserve the vision payload',()=>{
  for(const [mime,base64] of Object.entries(IMAGE_BASE64)){
    const parsed=decodeScreenshotDataUrl(`data:${mime};base64,${base64}`);
    assert.equal(parsed.mimeType,mime);assert.equal(parsed.width,2);assert.equal(parsed.height,3);
    assert.deepEqual(Buffer.from(parsed.bytes),Buffer.from(base64,'base64'));
    const part=screenshotPart(`data:${mime};base64,${base64}`);
    assert.equal(part.inline_data.mime_type,mime);assert.equal(part.inline_data.data,base64);
  }
});

test('screenshots reject renamed HTML/SVG, wrong MIME, bad padding, incomplete headers and truncated files',()=>{
  const invalid=[
    dataUrl('image/png',Buffer.from('<html><script>alert(1)</script></html>')),
    dataUrl('image/png',Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')),
    dataUrl('image/png',Buffer.from(IMAGE_BASE64['image/jpeg'],'base64')),
    'data:image/png;base64,','data:image/png;base64,YR==','data:image/png;base64,a===',
    dataUrl('image/png',PNG_BYTES.subarray(0,8)),
    ...Object.entries(IMAGE_BASE64).map(([mime,base64])=>dataUrl(mime,Buffer.from(base64,'base64').subarray(0,-2))),
  ];
  for(const value of invalid){
    assert.throws(()=>decodeScreenshotDataUrl(value),error=>error.status===400);
    assert.throws(()=>screenshotPart(value),error=>error.status===400);
  }
  const corrupted=Buffer.from(PNG_BYTES);corrupted[corrupted.length-1]^=1;
  assert.throws(()=>validateScreenshotBytes(corrupted,'image/png'),error=>error.status===400);
});

test('screenshots bound decoded dimensions and compressed bytes before vision or storage',()=>{
  for(const [width,height] of [[16385,1],[10000,5000]]){
    const png=Buffer.from(PNG_BYTES);png.writeUInt32BE(width,16);png.writeUInt32BE(height,20);
    assert.throws(()=>decodeScreenshotDataUrl(dataUrl('image/png',png)),error=>error.status===413);
  }
  const jpeg=Buffer.from(IMAGE_BASE64['image/jpeg'],'base64'),sof=jpeg.indexOf(Buffer.from([255,192]));
  jpeg.writeUInt16BE(16385,sof+7);
  assert.throws(()=>validateScreenshotBytes(jpeg,'image/jpeg'),error=>error.status===413);
  const webp=Buffer.from(IMAGE_BASE64['image/webp'],'base64');webp.writeUInt16LE(10000,26);webp.writeUInt16LE(5000,28);
  assert.throws(()=>validateScreenshotBytes(webp,'image/webp'),error=>error.status===413);
  assert.throws(()=>validateScreenshotBytes(new Uint8Array(5*1024*1024+1),'image/png'),error=>error.status===413);
});

test('stored screenshots are revalidated before they can enter a vision request',async()=>{
  const db=blob=>({storage:{from(bucket){assert.equal(bucket,'tmh-screenshots');return{download:async()=>({data:blob,error:null})};}}});
  const review={id:'saved-review',screenshot_url:'saved-review/review.png'};
  assert.equal(await storedReviewScreenshot(db(new Blob([PNG_BYTES],{type:'image/png'})),review),PNG_DATA_URL);
  for(const bytes of [Buffer.from('<svg/>'),PNG_BYTES.subarray(0,8)]){
    await assert.rejects(()=>storedReviewScreenshot(db(new Blob([bytes],{type:'image/png'})),review),error=>error.status===400);
  }
});
