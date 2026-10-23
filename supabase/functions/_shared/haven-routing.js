const SERVICE_QUESTIONS = {
  web: 'In Brand & Web Engineering, which part of your website are you looking to improve, and what is going wrong there?',
  growth: 'In Strategic Growth, what are you trying to grow, and where is progress getting stuck?',
  content: 'In Content & Social, who are you trying to reach, and what is your content struggling to achieve?',
};

export function gateHavenRouting(rawText, context = {}) {
  const text = typeof rawText === 'string' ? rawText : '';
  const hasCall = /\[\[(?:BOOK_CALL|STEP:ROUTING_TO_CALL)\]\]|https?:\/\/(?:www\.)?calendly\.com\/|\b(?:book|schedule|arrange|recommend|suggest|hop|jump|join|next step)\b[^.!?\n]{0,60}\b(?:strategy )?call\b|\b(?:strategy|discovery) call\b[^.!?\n]{0,35}\b(?:would|could|will|can) help\b/i.test(text);
  const hasBook = /\[\[(?:PLAYBOOK|STEP:ROUTING_TO_PLAYBOOK)\]\]|https?:\/\/(?:www\.)?themarketinghaven\.xyz\/?(?:#shop|shop)|\b(?:buy|purchase|grab|recommend|suggest|start with)\b[^.!?\n]{0,60}\b(?:unseen )?playbook\b|\bplaybook\b[^.!?\n]{0,40}\b(?:right|best|next) (?:step|move|choice)\b/i.test(text);
  if (!hasCall && !hasBook) return text;
  if (/\b(?:let me think|not ready|rather not|don['’]?t want|do not want)\b/i.test(String(context.latestUserText || ''))) {
    return 'Of course. Take your time. You can come back to this conversation when you are ready.';
  }
  const qualified = Number(context.questionsAsked) >= 2 && Number(context.diagnosticAnswers) >= 2;
  const question = Number(context.questionsAsked) === 0
    ? SERVICE_QUESTIONS[context.serviceId] || 'What are you building, who is it for, and what is the main problem you want to solve?'
    : 'What have you already tried, and where does the process stop working?';
  if (!qualified) return `${question}\n[[DIAGNOSTIC_QUESTION]]`;
  const marker = text.match(/\[\[NEED:(FOUNDATIONAL|OPERATIONAL|UNKNOWN)\]\]/)?.[1]?.toLowerCase();
  let problem = context.problemType || marker || 'unknown';
  if (problem === 'unknown') {
    const latest = String(context.latestUserText || '');
    if (/\b(?:broken|crash(?:ing|es)?|not loading|payment fail(?:ing|ure)?|checkout fail(?:ing|ure)?|website (?:repair|rebuild)|implement|integration|tracking (?:setup|broken))\b/i.test(latest)) problem = 'operational';
    else if (/\b(?:positioning|clarity|unclear (?:offer|audience)|content direction|brand message|build(?:ing)? trust)\b/i.test(latest)) problem = 'foundational';
  }
  if (problem === 'foundational') {
    if (hasCall) return 'The gap we have identified is in clarity, positioning, or trust. The Unseen Playbook gives you a strategic foundation to work through it at your own pace.\n[[PLAYBOOK]]\n[[NEED:FOUNDATIONAL]]';
    return text.replace(/\[\[BOOK_CALL\]\]/g, '');
  }
  if (problem === 'operational' && hasCall && !(context.scope === 'support' && context.explicitCallRequested !== true)) {
    return text.replace(/\[\[PLAYBOOK\]\]/g, '');
  }
  if (context.scope === 'support' && problem === 'operational' && context.explicitCallRequested !== true) {
    return 'This sounds like an execution issue rather than a missing marketing foundation. Which exact step is failing so we can understand the right kind of help?\n[[DIAGNOSTIC_QUESTION]]';
  }
  return 'Before I recommend anything, is the main gap explaining your value to customers, or getting a specific website, campaign, or system to work?\n[[DIAGNOSTIC_QUESTION]]';
}
