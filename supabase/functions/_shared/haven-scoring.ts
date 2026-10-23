import { HavenRequestError } from './haven-request.ts';

export const MAX_SUMMARY_CHARS = 6000;
export type ScoringResult = {
  state: 'valid' | 'bad_data'; score: number | null;
  breakdown: Record<string, number> | null; biggestIssue: string | null;
};

export function normalizeWebsiteUrl(raw: unknown) {
  if (typeof raw !== 'string' || raw.length > 2048) throw new HavenRequestError('A valid website URL is required.');
  let url: URL;
  try { url = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`); }
  catch { throw new HavenRequestError('A valid website URL is required.'); }
  const host = url.hostname.toLowerCase();
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password
    || (url.port && !['80', '443'].includes(url.port))
    || !host.includes('.') || /(?:^|\.)(?:localhost|local|internal)$/.test(host)
    || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':')
    || /[\u0000-\u0020]/.test(raw)) {
    throw new HavenRequestError('Please provide a public website URL.');
  }
  url.hash = '';
  return url.toString();
}

export function extractWebsiteText(raw: string) {
  const markdown = raw.includes('Markdown Content:') ? raw.slice(raw.indexOf('Markdown Content:') + 17) : raw;
  const content = markdown.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/https?:\/\/\S+/g, '')
    .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return content.slice(0, MAX_SUMMARY_CHARS);
}

export function hasMeaningfulBusinessText(summary: string) {
  const words = summary.toLowerCase().match(/[\p{L}][\p{L}'’-]*/gu) || [];
  const unique = new Set(words);
  if (summary.length < 300 || words.length < 45 || unique.size < 25) return false;
  const legalTerms = words.filter((word) => /^(privacy|cookie|cookies|consent|copyright|liability|jurisdiction|legal|rights|licence|license|gdpr|agreement|terms|conditions)$/.test(word)).length;
  const lines = summary.split('\n').map((line) => line.trim()).filter(Boolean);
  const legalLines = lines.filter((line) => /privacy|cookie|terms of|all rights reserved|liability|jurisdiction|personal data|governing law/i.test(line));
  const legalChars = legalLines.reduce((total, line) => total + line.length, 0);
  return legalTerms / words.length < 0.12 && legalChars / summary.length < 0.65;
}

export function parseScoringResult(raw: string, kind: 'website' | 'social'): ScoringResult | null {
  try {
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const value = JSON.parse(cleaned);
    if (value.state === 'bad_data') return { state: 'bad_data', score: null, breakdown: null, biggestIssue: null };
    if (value.state !== 'valid' || !Number.isInteger(value.score) || value.score < 0 || value.score > 100) return null;
    const keys = kind === 'website' ? ['clarity', 'trust', 'conversion', 'technical', 'content']
      : ['profile', 'consistency', 'engagement', 'readiness'];
    const max = kind === 'website' ? 20 : 25;
    if (!value.breakdown || keys.some((key) => !Number.isInteger(value.breakdown[key]) || value.breakdown[key] < 0 || value.breakdown[key] > max)) return null;
    const breakdown = Object.fromEntries(keys.map((key) => [key, value.breakdown[key]]));
    if (Object.values(breakdown).reduce((a, b) => a + b, 0) !== value.score) return null;
    if (typeof value.biggestIssue !== 'string' || !value.biggestIssue.trim() || value.biggestIssue.length > 600) return null;
    return { state: 'valid', score: value.score, breakdown, biggestIssue: value.biggestIssue.trim() };
  } catch { return null; }
}

export async function persistScoring(supabase: any, reviewId: string, result: ScoringResult | { state: 'failed' }, summary: string | null) {
  const valid = result.state === 'valid' ? result as ScoringResult : null;
  const { error } = await supabase.from('brand_reviews').update({
    scrape_state: result.state, scraped_summary: summary,
    haven_score: valid?.score ?? null, score_breakdown: valid?.breakdown ?? null,
    biggest_leak: valid?.biggestIssue ?? null, score_observed_at: new Date().toISOString(),
  }).eq('id', reviewId).select('id').single();
  if (error) throw new HavenRequestError('Could not save your review result. Please try again.', 500);
}

export function cachedScoring(review: Record<string, any>, kind: 'website' | 'social') {
  const observed = new Date(review.score_observed_at).getTime();
  if (!Number.isFinite(observed) || Date.now() - observed >= 24 * 60 * 60 * 1000) return null;
  if (review.scrape_state === 'bad_data') return { state: 'bad_data' as const, score: null, breakdown: null, biggestIssue: null };
  return parseScoringResult(JSON.stringify({ state: review.scrape_state, score: review.haven_score,
    breakdown: review.score_breakdown, biggestIssue: review.biggest_leak }), kind);
}
