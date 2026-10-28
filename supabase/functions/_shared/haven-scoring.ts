import { HavenRequestError } from './haven-request.ts';
import { RUBRIC_VERSION, WEBSITE_RUBRIC, SOCIAL_RUBRIC } from './scoring-rubric.js';

export const MAX_SUMMARY_CHARS = 6000;
export type ScoringResult = {
  state: 'valid' | 'insufficient_evidence'; reason?: string | null; score: number | null;
  breakdown: Record<string, number> | null; biggestIssue: string | null;
  rubricVersion: string; evidence?: Record<string, { checks: number[]; observation: string; quote: string; improvement: string }> | null;
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

export function parseScoringResult(raw: string, kind: 'website' | 'social', sourceText?: string): ScoringResult | null {
  try {
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const value = JSON.parse(cleaned);
    if (['bad_data', 'insufficient_evidence'].includes(value.state)) return { state: 'insufficient_evidence', rubricVersion: RUBRIC_VERSION, reason: kind === 'social' ? 'unreadable_profile' : 'insufficient_text', score: null, breakdown: null, biggestIssue: null, evidence: null };
    if (value.rubricVersion !== RUBRIC_VERSION) return null;
    if (value.state !== 'valid' || !Number.isInteger(value.score) || value.score < 0 || value.score > 100) return null;
    const keys = Object.keys(kind === 'website' ? WEBSITE_RUBRIC : SOCIAL_RUBRIC);
    const max = 25;
    if (!value.breakdown || keys.some((key) => !Number.isInteger(value.breakdown[key]) || value.breakdown[key] < 0 || value.breakdown[key] > max)) return null;
    const breakdown = Object.fromEntries(keys.map((key) => [key, value.breakdown[key]]));
    if (Object.values(breakdown).reduce((a, b) => a + b, 0) !== value.score) return null;
    const evidence: NonNullable<ScoringResult['evidence']> = {};
    for (const key of keys) {
      const item = value.evidence?.[key];
      if (!item || !Array.isArray(item.checks) || item.checks.length !== 5 || item.checks.some((n: unknown) => !Number.isInteger(n) || Number(n)<0 || Number(n)>5)
        || item.checks.reduce((a: number,b: number)=>a+b,0)!==breakdown[key]
        || typeof item.observation !== 'string' || !item.observation.trim() || item.observation.length>600
        || typeof item.quote !== 'string' || item.quote.length>400
        || typeof item.improvement !== 'string' || !item.improvement.trim() || item.improvement.length>600) return null;
      if (kind === 'website' && sourceText !== undefined && item.quote && !sourceText.includes(item.quote)) return null;
      evidence[key] = { checks: item.checks, observation: item.observation.trim(), quote: item.quote, improvement: item.improvement.trim() };
    }
    if (typeof value.biggestIssue !== 'string' || !value.biggestIssue.trim() || value.biggestIssue.length > 600) return null;
    return { state: 'valid', rubricVersion: RUBRIC_VERSION, score: value.score, breakdown, evidence, biggestIssue: value.biggestIssue.trim() };
  } catch { return null; }
}

export async function persistScoring(supabase: any, reviewId: string, result: ScoringResult | { state: 'failed' | 'insufficient_evidence'; reason?: string }, summary: string | null, revision = 0) {
  const valid = result.state === 'valid' ? result as ScoringResult : null;
  const { data, error } = await supabase.from('brand_reviews').update({
    scrape_state: result.state, score_reason: result.state === 'valid' ? null : result.reason || 'provider_unavailable', scraped_summary: summary,
    haven_score: valid?.score ?? null, score_breakdown: valid?.breakdown ?? null,
    biggest_leak: valid?.biggestIssue ?? null, score_observed_at: new Date().toISOString(),
    rubric_version: RUBRIC_VERSION, score_evidence: valid?.evidence ?? null,
  }).eq('id', reviewId).eq('scoring_revision', revision).select('id').single();
  if (error || !data) throw new HavenRequestError('Could not save this review result. The source may have changed; retry the current review.', 409);
}

export function cachedScoring(review: Record<string, any>, kind: 'website' | 'social') {
  if (review.rubric_version !== RUBRIC_VERSION) return null;
  const observed = new Date(review.score_observed_at).getTime();
  if (!Number.isFinite(observed) || Date.now() - observed >= 24 * 60 * 60 * 1000) return null;
  if (review.scrape_state === 'insufficient_evidence') return { state: 'insufficient_evidence' as const, rubricVersion: RUBRIC_VERSION, reason: review.score_reason || 'unreadable_content', score: null, breakdown: null, biggestIssue: null };
  return parseScoringResult(JSON.stringify({ state: review.scrape_state, score: review.haven_score,
    breakdown: review.score_breakdown, biggestIssue: review.biggest_leak, rubricVersion: review.rubric_version, evidence: review.score_evidence }), kind, kind === 'website' ? review.scraped_summary : undefined);
}

export function websiteContentReason(summary: string) {
  if (summary.length < 300 || (summary.match(/[\p{L}][\p{L}'’-]*/gu) || []).length < 45) return 'insufficient_text';
  if (/privacy|cookie|terms|all rights reserved/i.test(summary) && !hasMeaningfulBusinessText(summary)) return 'boilerplate_only';
  return 'unreadable_content';
}
