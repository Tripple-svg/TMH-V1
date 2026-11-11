function comparable(text: string) {
  return text.replace(/\[\[[\s\S]*?\]\]/g, ' ').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
}

export function repeatsLastReply(reply: string, previous: string) {
  const a = comparable(reply), b = comparable(previous);
  if (!a || !b) return false;
  if (a === b) return true;
  if (Math.min(a.length,b.length) < 12) return false;
  const pairs = new Map<string,number>();
  for (let i=1;i<a.length;i++) {
    const pair = a.slice(i-1,i+1);
    pairs.set(pair,(pairs.get(pair)||0)+1);
  }
  let matches = 0;
  for (let i=1;i<b.length;i++) {
    const pair = b.slice(i-1,i+1);
    const count = pairs.get(pair)||0;
    if (count) {
      matches++;
      pairs.set(pair,count-1);
    }
  }
  return 2*matches/(a.length+b.length-2) >= 0.9;
}
