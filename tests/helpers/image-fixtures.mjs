// Real 2 × 3 pixel still images encoded by Pillow, shared by server fixtures.
export const IMAGE_BASE64={
  'image/png':'iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAAFElEQVR4nGP0SutiYGBgYgADKAUAF2IBQDXZhRoAAAAASUVORK5CYII=',
  'image/jpeg':'/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAADAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDBooor1DgP/9k=',
  'image/webp':'UklGRjQAAABXRUJQVlA4ICgAAACwAQCdASoCAAMAAUAmJYgCdLoABDAAAP7u09/q7E+E/QfN9j2Y4AAA',
};
export const PNG_BYTES=Buffer.from(IMAGE_BASE64['image/png'],'base64');
export const PNG_DATA_URL='data:image/png;base64,'+IMAGE_BASE64['image/png'];

// Pad a real PNG with a standards-compliant ancillary text chunk. This permits
// maximum upload boundary tests without replacing image bytes with fake data.
export function largePngBytes(byteLength){
  const dataLength=byteLength-PNG_BYTES.length-12;
  if(!Number.isSafeInteger(byteLength)||dataLength<8)throw Error('Requested PNG size is too small.');
  const chunk=Buffer.alloc(dataLength+12,65);
  chunk.writeUInt32BE(dataLength,0);chunk.write('tEXt',4,'ascii');chunk.write('Comment\0',8,'ascii');
  let crc=0xffffffff;
  for(let index=4;index<chunk.length-4;index++){
    crc^=chunk[index];
    for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);
  }
  chunk.writeUInt32BE((crc^0xffffffff)>>>0,chunk.length-4);
  return Buffer.concat([PNG_BYTES.subarray(0,-12),chunk,PNG_BYTES.subarray(-12)]);
}
