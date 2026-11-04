const ISSUES = new Set(['review_access', 'rate_limit', 'purchase', 'booking', 'other']);
export function supportPrefill(search) {
  const query = new URLSearchParams(search);
  const issue = query.get('issue') || query.get('category') || '';
  return { category: ISSUES.has(issue) ? issue : 'other', message: (query.get('message') || query.get('description') || (issue === 'rate_limit' ? 'I reached a limit in Haven and need help.\n\nWhat I was trying to do: \nApproximate time: ' : ISSUES.has(issue) ? '' : issue)).slice(0, 4000) };
}
