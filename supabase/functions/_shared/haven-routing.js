const SERVICE_QUESTIONS = {
  web: 'In Brand & Web Engineering, which part of your website are you looking to improve, and what is going wrong there?',
  growth: 'In Strategic Growth, what are you trying to grow, and where is progress getting stuck?',
  content: 'In Content & Social, who are you trying to reach, and what is your content struggling to achieve?',
};

export function supportHelpReply(text, scope) {
  if (scope !== 'support') return null;
  const value = String(text || '').toLowerCase();
  if (/\b(?:another|new|second|redo|again)\b/.test(value) && /\b(?:brand review|review)\b/.test(value)) return 'Your saved brand review normally reopens from Request a Free Brand Review. For a fresh review or a different brand, contact info@themarketinghaven.xyz so the team can help without mixing your records. Deleting a review is a separate privacy action; it is not required just to ask a new question.';
  if (/\b(?:lost|missing|recover|recovery|restore|disappeared)\b/.test(value) && /\b(?:chat|review|access)\b/.test(value)) return 'An older chat can remain on this device even when its secure review access key is missing. Contact info@themarketinghaven.xyz to verify ownership and recover the saved review. Please do not share an access token or payment details in chat. Clearing storage again will not restore the key.';
  if (/\b(?:email|receipt|confirmation)\b/.test(value) && /\b(?:payment|paid|purchase|playbook)\b/.test(value) && /\b(?:missing|not|haven.t|didn.t|pending|never|where)\b/.test(value)) return 'If payment succeeded, check spam and the email address used at checkout. The purchase email may be delayed. You can reopen the Shop section to use the download option on this device, or contact info@themarketinghaven.xyz with your Paystack reference. Please do not pay again just to recover the email.';
  if (/\b(?:where|find|navigate|take me|show me|how do i)\b/.test(value)) {
    if (/\b(?:shop|playbook|download)\b/.test(value)) return 'The Unseen Playbook is in the Shop section of this website. Open the menu and choose Shop, or scroll to Digital Products. If you already purchased on this device, open the Playbook panel to check the download option. A missing saved purchase can be verified by the team using your Paystack reference.';
    if (/\b(?:services|web engineering|growth|content)\b/.test(value)) return 'Open the menu and choose Services. You can explore Brand & Web Engineering, Strategic Growth, or Content & Social there. Each card opens a conversation about that service.';
    if (/\b(?:privacy|delete|deletion|data)\b/.test(value)) return 'The Privacy Policy and Terms are linked in the footer. Use the data deletion request in the privacy section to remove your review and related conversations. Purchase access and cookie preferences are separate; deleting a review does not clear all browser storage.';
    if (/\b(?:team|about|contact)\b/.test(value)) return 'Open the menu and choose About to meet the team. You can also reach TMH at info@themarketinghaven.xyz for account or review access help.';
  }
  return null;
}

export function resolveHavenRouting(rawText, context = {}) {
  const text = typeof rawText === 'string' ? rawText : '';
  const previous = context.routingState || {};
  const marker = text.match(/\[\[NEED:(FOUNDATIONAL|OPERATIONAL|UNKNOWN)\]\]/)?.[1]?.toLowerCase();
  let problemType = marker && marker !== 'unknown' ? marker : previous.problemType || context.problemType || 'unknown';
  const state = { problemType, permission: previous.permission || 'none' };
  const latest = String(context.latestUserText || '').trim();
  const qualified = Number(context.questionsAsked) >= 2 && Number(context.diagnosticAnswers) >= 2;
  const declined = /\b(?:let me think|not ready|rather not|don['’]?t want|do not want|not right now)\b/i.test(latest) || /^(?:no|no thanks|not now)[.!\s]*$/i.test(latest) || /\b(?:don['’]?t|do not)\s+(?:(?:want|need)(?:\s+to)?\s+)?(?:book|schedule|arrange|call)\b/i.test(latest);
  const agrees = /^(?:yes(?: please)?|please do(?: it)?(?: again)?|go ahead|show me|yes,? show me|sure|okay|ok|continue|i['’]?m interested)[.!\s]*$/i.test(latest);
  const asksCall = !declined && /\b(?:book|schedule|arrange|want|need)\b[^.!?\n]{0,45}\bcall\b/i.test(latest);
  const controlReply = agrees || (asksCall && latest.length <= 100 && !/\b(?:website|checkout|broken|campaign|ads|tracking|positioning|clarity|content|offer)\b/i.test(latest));
  if (controlReply && previous.problemType && previous.problemType !== 'unknown') {
    problemType = previous.problemType; state.problemType = problemType;
  }
  if (previous.problemType && previous.problemType !== 'unknown' && problemType !== previous.problemType) state.permission = 'none';
  const offers = /\[\[(?:BOOK_CALL|PLAYBOOK|STEP:ROUTING_TO_CALL|STEP:ROUTING_TO_PLAYBOOK)\]\]|https?:\/\/(?:www\.)?(?:calendly\.com|themarketinghaven\.xyz\/?#shop)|\b(?:recommend|suggest|buy|purchase|grab|start with)\b[^.!?\n]{0,65}\b(?:playbook|call)\b|\bplaybook\b[^.!?\n]{0,70}\b(?:guide|help|right|best|next|would|can)\b|\b(?:book|schedule|hop|jump|join|next step)\b[^.!?\n]{0,60}\bcall\b|\bstrategy call\b[^.!?\n]{0,35}\b(?:would|could|will|can) help\b/i.test(text);
  const permissionAsk = text.includes('[[STEP:AWAITING_PERMISSION]]');
  if (declined && (offers || previous.permission === 'asked')) {
    state.permission = 'declined';
    return { text: 'Of course. Take your time. You can come back to this conversation when you are ready.\n[[STEP:CLEAN_EXIT]]', routingState: state };
  }
  if (qualified && problemType !== 'unknown') {
    if ((previous.permission === 'asked' && agrees) || (asksCall && problemType === 'operational')) state.permission = 'granted';
    if (state.permission === 'granted') {
      if (problemType === 'operational' && context.scope === 'support' && !context.explicitCallRequested && agrees) return { text: 'TMH’s Services section is where you can discuss implementation work with the team. Open the card that matches the website, content, or campaign work we have discussed; its enquiry chat will help capture the scope.\n[[STEP:CLEAN_EXIT]]', routingState: state };
      if (problemType === 'foundational' && (offers || agrees)) return { text: 'The Unseen Playbook is a practical guide to clarifying your message, positioning your offer, and building trust. It can help you work through that foundation at your own pace. It does not guarantee sales. You can see what it covers here.\n[[PLAYBOOK]]\n[[STEP:ROUTING_TO_PLAYBOOK]]', routingState: state };
      if (problemType === 'operational' && (offers || asksCall || agrees) && (context.scope !== 'support' || context.explicitCallRequested)) return { text: 'A strategy call is a useful next step for the execution problem we have discussed. The team can clarify the scope and what support would fit. You can choose a time here.\n[[BOOK_CALL]]\n[[STEP:ROUTING_TO_CALL]]', routingState: state };
    }
    if (offers || permissionAsk || asksCall) {
      state.permission = 'asked';
      const leadIn = asksCall && problemType === 'foundational' ? 'I hear that you would like a call. From what you have shared, the first gap is in your message and positioning, so a call may not be the best first step. ' : '';
      const offer = problemType === 'foundational'
        ? 'There is a resource that can help you tighten that message and give people a clearer reason to choose you. Would you like me to show you what it covers?'
        : context.scope === 'support' && !context.explicitCallRequested
          ? 'This needs practical implementation rather than a general marketing guide. Would you like me to explain the relevant TMH service?'
          : 'There is a way our team can help you work through this execution problem. Would you like me to explain the next step?';
      return { text: `${leadIn}${offer}\n[[STEP:AWAITING_PERMISSION]]`, routingState: state };
    }
  }
  let gated = text;
  if (offers) {
    const question = !qualified
      ? Number(context.questionsAsked) === 0
        ? SERVICE_QUESTIONS[context.serviceId] || 'What are you building, who is it for, and what is the main problem you want to solve?'
        : 'What have you already tried, and where does the process stop working?'
      : 'To make sure the recommendation fits, what specifically would you want to change first?';
    gated = `${question}\n[[DIAGNOSTIC_QUESTION]]`;
  }
  if (asksCall && !qualified) {
    const question = Number(context.questionsAsked) < 1 ? SERVICE_QUESTIONS[context.serviceId] || 'What would you like the call to help you solve?'
      : 'To make sure the call would be useful, what have you tried so far, and what happened?';
    gated = `I can help you work out the right next step. ${question}\n[[DIAGNOSTIC_QUESTION]]`;
  }
  return { text: gated, routingState: state };
}

export function gateHavenRouting(rawText, context = {}) {
  return resolveHavenRouting(rawText, context).text;
}
