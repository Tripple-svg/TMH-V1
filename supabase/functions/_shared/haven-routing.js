// One routing policy for primary and fallback models. User permission and
// evidence are server-owned; generated tags never authorize privileged actions.
const NEEDS = ['learning', 'implementation', 'research', 'support', 'unknown'];
const COMPLEXITIES = ['simple', 'complex', 'unknown'];
const PREFERENCES = ['learn', 'delegate', 'unsure', 'none'];
const ACTIONS = ['answer', 'clarify', 'offer_playbook', 'offer_call', 'support_handoff', 'close'];
const CONTACT = 'info@themarketinghaven.xyz';
const ROUTES = /\[\[(?:BOOK_CALL|PLAYBOOK|TIKTOK_CONTENT)\]\]/g;
const CALL_URL = /https?:\/\/(?:www\.)?calendly\.com\/[^\s<>]+/gi;
const SHOP_URL = /https?:\/\/(?:www\.)?themarketinghaven\.xyz\/?#shop\b/gi;
const SUPPORT_ISSUE = /\b(?:download|billing|payment|paid|receipt|otp|refund|access|log[ -]?in|restriction|restricted|delet(?:e|ion)|privacy)\b/i;
const WORK = /\b(?:websites?|sites?|wordpress|checkout|landing pages?|product pages?|campaigns?|ads?|paid media|tracking|funnels?|brand identity|branding|brand strategy|positioning|content|social media|marketing|customer research|market research)\b/i;
const DELEGATE = /\b(?:(?:your|the|tmh) team|hire|done[ -]for[ -]me|do it for me|(?:build|make|design|create|develop|rebuild) (?:me|us)|(?:want|need) (?:mine|ours|my website|our website) (?:to be |to look )?(?:like yours|like your)|handle (?:it|the (?:work|execution))|help from (?:your|the) team)\b/i;
const IMPLEMENT = /\b(?:rebuild|implement|redesign|set up|build|repair|fix|manage|run|design|develop|create|produce|write|improve|help with|work on)\b/i;
const RESEARCH = /\b(?:customer interviews?|interview(?:ing)? customers|customer research|market research|competitor research|research (?:the|a|our) market|new market|multiple audiences|different customer segments)\b/i;
const LEARN = /\b(?:i|we)\s+(?:(?:would\s+)?(?:like|want|prefer|need)\s+(?:to\s+)?)?learn\b|\b(?:teach me|learn the framework|work through (?:it|this) myself|do (?:it|this) myself|by myself|on my own)\b/i;
const RESOURCE_REQUEST = /\b(?:show|see|open|get|recommend|share|buy|purchase|read)\b[^.!?\n]{0,65}\b(?:book|playbook|resource|guide)\b|\b(?:book|playbook)\b[^.!?\n]{0,30}\b(?:please|where|how)\b/i;
const BARE_BOOKING = /\b(?:book|schedule|arrange|want|need|discuss)\b[^.!?\n]{0,45}\bcall\b|\bcall me\b/i;
const HUMAN = /\b(?:human|real person|speak (?:to|with) (?:a person|someone|the team)|talk (?:to|with) (?:a person|someone|the team)|member of (?:your|the) team)\b/i;
const PRICE = /\b(?:price|cost|how much|amount|naira)\b|₦/i;
const DIAGNOSTIC = '[[DIAGNOSTIC_QUESTION]]';

function wantsDelegation(text) {
  return DELEGATE.test(text) && !/\b(?:do not|don['’]?t|rather not|no need|not want)\b.{0,60}\b(?:team|hire|handle|do it)/i.test(text);
}
function wantsLearning(text) {
  return LEARN.test(text) && !/\b(?:do not|don['’]?t|rather not|not want)\b.{0,45}\b(?:learn|myself|my own)/i.test(text);
}
function humanRequest(text) {
  return HUMAN.test(text) && /\b(?:want|need|please|connect|speak|talk|transfer|put me|can i|could i)\b/i.test(text)
    && !/\b(?:do not|don['’]?t|no need|not want)\b.{0,45}\b(?:human|person|team)/i.test(text);
}
function hasBusinessNeed(text) {
  return RESEARCH.test(text) || (WORK.test(text) || learningSubject(text))
    && /\b(?:need|want|struggl\w*|problem|stuck|not|don['’]?t|nobody|no sales|no orders|declin\w*|drop\w*|missing|unclear|wrong|confus\w*|can['’]?t|cannot|los\w*|disappear\w*|improv\w*|rebuild|research|interview\w*|audience|why|how)\b/i.test(text);
}

function userTexts(context = {}) {
  return [...(Array.isArray(context.messages) ? context.messages : [])
    .filter(message => message?.role === 'user' && typeof message.content === 'string')
    .slice(-8).map(message => message.content), String(context.latestUserText || '')].filter(Boolean);
}
function learningSubject(text) {
  return /\b(?:audience|customer|buyer|offer|value|positioning|message|trust|content|post|sell|sales|brand|bread|business)\b/i.test(text);
}
function exactEvidence(value, sources) {
  return Array.isArray(value) ? [...new Set(value.filter(quote => typeof quote === 'string' && quote.length >= 4 && quote.length <= 300
    && !/\[\[|@|\b(?:password|otp|api.?key|access.?token|card number)\b|[a-f0-9]{64}|\d{13,}/i.test(quote)
    && sources.some(source => source.includes(quote))))].slice(0, 4) : [];
}
function quotedSources(sources) {
  return sources.filter(source => source.trim().length >= 12 && !/\[\[|@|\b(?:password|otp|api.?key|access.?token|card number)\b|[a-f0-9]{64}|\d{13,}/i.test(source))
    .slice(-3).map(source => source.slice(0, 300));
}
function cleanMetadata(text) {
  return String(text).replace(/\[\[DECISION:[\s\S]*?(?:\]\]|$)/g, '')
    .replace(/\[\[NEED:[A-Z_]+\]\]/g, '').trim();
}
function cleanReply(text) {
  return cleanMetadata(text).replace(ROUTES, '').replace(/\[\[STEP:ROUTING_TO_(?:CALL|PLAYBOOK|CONTENT)\]\]/g, '')
    .replace(CALL_URL, '').replace(SHOP_URL, '').trim();
}
function isDecline(text) {
  return /^(?:no|no thanks|not now|not yet|not ready)[.!\s]*$/i.test(text)
    || /\b(?:let me think|not ready|rather not|not right now)\b/i.test(text)
    || /\b(?:don['’]?t|do not)\s+(?:(?:want|need)(?:\s+to)?\s+)?(?:book|buy|purchase|schedule|arrange|call|(?:the )?playbook|(?:a )?resource)\b/i.test(text);
}
function publicSupport(text, context) {
  return context.scope === 'support' && !context.teamInquiry && (SUPPORT_ISSUE.test(text) || humanRequest(text));
}
function normalizeState(previous = {}) {
  const oldNeed = previous.problemType === 'foundational' ? 'learning' : previous.problemType === 'operational' ? 'implementation' : 'unknown';
  return {
    version: 2,
    need: NEEDS.includes(previous.need) ? previous.need : oldNeed,
    complexity: COMPLEXITIES.includes(previous.complexity) ? previous.complexity : 'unknown',
    preference: PREFERENCES.includes(previous.preference) ? previous.preference : 'none',
    bookFit: previous.bookFit === true,
    evidence: Array.isArray(previous.evidence) ? previous.evidence.filter(quote => typeof quote === 'string').slice(0, 4).map(quote => quote.slice(0, 300)) : [],
    missing: Array.isArray(previous.missing) ? previous.missing.filter(key => ['goal', 'scope', 'evidence', 'preference', 'problem'].includes(key)) : [],
    permission: ['none', 'asked', 'granted', 'declined'].includes(previous.permission) ? previous.permission : 'none',
    pendingAction: ['call', 'playbook', 'service', 'preference'].includes(previous.pendingAction) ? previous.pendingAction : null,
    lastAction: ACTIONS.includes(previous.lastAction) ? previous.lastAction : 'answer',
    // Legacy clients may still render this field; it no longer decides a route.
    problemType: previous.problemType === 'foundational' || previous.problemType === 'operational' ? previous.problemType : 'unknown',
  };
}

export function inferHavenNeed(messages = []) {
  const sources = userTexts({ messages });
  const facts = sources.join('\n');
  const latest = sources.at(-1) || '';
  const latestPreference = [...sources].reverse().find(value => wantsDelegation(value) || wantsLearning(value));
  const preference = latestPreference ? wantsDelegation(latestPreference) ? 'delegate' : 'learn' : 'none';
  const implementationRequested = sources.some(value => wantsDelegation(value) && (IMPLEMENT.test(value) || /like yours/i.test(value)) && WORK.test(value));
  const researchRequested = sources.some(value => RESEARCH.test(value));
  const need = researchRequested ? 'research' : implementationRequested ? 'implementation'
    : wantsLearning(latest) && learningSubject(facts) ? 'learning' : 'unknown';
  return { implementationRequested, researchRequested, need, complexity: researchRequested || implementationRequested ? 'complex' : 'unknown',
    preference, bookFit: need === 'learning' && !IMPLEMENT.test(latest),
    evidence: quotedSources(sources.filter(value => RESEARCH.test(value) || (wantsDelegation(value) && IMPLEMENT.test(value) && WORK.test(value)) || wantsLearning(value))),
    problemType: ['research', 'implementation'].includes(need) ? 'operational' : need === 'learning' ? 'foundational' : 'unknown' };
}

export function isAffirmative(text) {
  return /^(?:yes(?: (?:please|sure|of course))?|please do(?: it)?(?: again)?|go ahead|show me|sure|okay|ok|continue|i am interested)$/.test(
    String(text || '').toLowerCase().replace(/[!.,?]/g, ' ').replace(/\s+/g, ' ').trim());
}
export function acceptedCallInvitation(latest, messages = []) {
  const previous = [...messages].reverse().find(message => message.role === 'agent');
  return isAffirmative(latest) && /\b(?:would you like|want to|shall we|can i)\b[^?\n]{0,160}\b(?:book|schedule|call)\b/i.test(previous?.content || '');
}

export function supportHelpReply(text, scope, context = {}) {
  if (scope !== 'support') return null;
  const value = String(text || '').toLowerCase();
  if (/already purchased|recovery (?:page|panel|form|option)/.test(value) && /not|isn.t|missing|where|visible|show|find/.test(value)) return 'Open Get The Unseen Playbook in Digital Products on the homepage (#shop). Already purchased is a tab inside that panel, not a link below the product card. If this device already has valid purchase access, the panel shows your saved download instead. If recovery still is not available, email info@themarketinghaven.xyz with what you see. Do not clear your saved access or pay again.';
  if (humanRequest(value) && (!context.teamInquiry || SUPPORT_ISSUE.test(value))) return `You can reach Team Haven at ${CONTACT} or through the WhatsApp contact in the footer. Tell them what happened so they can review it; I have not created a support ticket or booked a strategy call.`;
  if (/\b(?:are you|is this)\b.{0,25}\b(?:human|real person|ai|bot)\b/.test(value)) return 'I am Haven, TMH’s AI marketing guide. I can help with marketing and questions about this platform. If you need a person, Team Haven is available through the contact details in the footer.';
  if (/\b(?:another|new|second|redo|again)\b/.test(value) && /\b(?:brand review|review)\b/.test(value)) return 'Your saved brand review normally reopens from Request a Free Brand Review. Use the review correction controls to replace a wrong link or screenshot. For a different brand or a fresh review, contact info@themarketinghaven.xyz so the team can help without mixing your records. Deleting a review is a separate privacy action.';
  if (/\b(?:lost|missing|recover|recovery|restore|disappeared)\b/.test(value) && /\b(?:chat|review|access)\b/.test(value) && !/\b(?:playbook|purchase|download)\b/.test(value)) return 'A visible older chat does not restore the secure review access key. Contact info@themarketinghaven.xyz to verify ownership and recover that review. Please do not share an access token in chat. Clearing storage again will not restore the key.';
  if (/\b(?:otp|code)\b/.test(value) && /arriv|receiv|inbox|spam|delay|sent|email/.test(value)) return 'Check the inbox and spam folder for the checkout email you entered. If the code has not arrived, wait for the resend timer in Already purchased, then request a fresh code there. Avoid requesting several codes at once. If it is still missing, contact info@themarketinghaven.xyz; I cannot resend it from chat, and you should not share a code here.';
  if (/\b(?:playbook|download|copy|pdf|ebook)\b/.test(value)
    && /\b(?:missing|lost|not|haven.t|didn.t|where|how|broken|recover|again|another|different|laptop|computer|expired|failed|help|problem)\b/.test(value)) {
    if (/\b(?:downloaded|download was|file|files|folder)\b/.test(value) && /\b(?:lost|find|missing|where|saved)\b/.test(value)) return 'First check Downloads or the Files app on the device you used. If the copy is missing, open Get The Unseen Playbook again. Saved purchase access can reopen it on a later page visit; on another device, choose Already purchased to verify your checkout inbox. You do not need to pay again.';
    if (/\b(?:another|different|laptop|computer|new phone)\b/.test(value)) return 'If you already bought the book, you can open your copy on that device. Go to Get The Unseen Playbook, choose Already purchased, and enter your checkout email and Paystack reference. Confirm the six-digit code sent to that inbox to unlock the download. Enter those details in the recovery panel, not here.';
    if(!/\b(?:paid|purchased|bought|already|again|lost|broken|missing|expired|my)\b/.test(value))return 'After a successful checkout, your download opens in the Playbook panel. If you already bought a copy, open Get The Unseen Playbook and choose Already purchased to recover it using your checkout email, receipt reference and the code sent to your inbox. Keep those details in that panel rather than this chat.';
    return 'You do not need to pay again. Open Get The Unseen Playbook: if your purchase is saved on this device, use its download option. Otherwise, choose Already purchased, enter your checkout email and Paystack reference, then confirm the six-digit code sent to your inbox. If that still does not work, email info@themarketinghaven.xyz. Keep your recovery details and code in the secure panel, not this chat.';
  }
  if (/\b(?:where|find|navigate|take me|show me|how do i)\b/.test(value)) {
    if (/\b(?:shop|playbook|download)\b/.test(value)) return 'Open Playbook in the menu, or scroll to Digital Products. Get The Unseen Playbook opens its panel. A new verified checkout opens the download directly; on another device or without saved access, Already purchased confirms the checkout inbox with a one-time code. Enter recovery details only in that panel.';
    if (/\b(?:services|web engineering|growth|content)\b/.test(value)) return 'Open Services in the menu. Brand & Web Engineering covers brand/web implementation, Strategic Growth & Consulting covers positioning and growth systems, and Content & Social Architecture covers content planning and production. Each card explains the service and opens its enquiry.';
    if (/\b(?:privacy|delete|deletion|data)\b/.test(value)) return 'Privacy Policy, Terms and Data Deletion are in the footer. The confirmed deletion flow targets saved reviews and their linked chats/screenshots; purchase access and all browser storage are separate. Contact info@themarketinghaven.xyz for records outside that flow.';
    if (/\b(?:team|about|contact)\b/.test(value)) return 'About introduces Team Haven. Public contact is info@themarketinghaven.xyz and WhatsApp +2347084232046 in the footer; the public location is Lagos, Nigeria.';
  }
  return null;
}

const SERVICE_QUESTIONS = {
  web: 'Which part of your website needs work, and what should a customer be able to do there?',
  growth: 'What result are you trying to improve, and where is progress getting stuck?',
  content: 'Who are you trying to reach, and what do you want your content to help them do?',
};
function bookExplanation(raw, state) {
  const candidate = cleanReply(raw).replace(/\[\[(?:STEP:[A-Z0-9_]+|DIAGNOSTIC_QUESTION|CHIPS:.*?)\]\]/gs, '').trim();
  if (/The Unseen Playbook/.test(candidate) && candidate.length <= 550 && !PRICE.test(candidate) && !/learning need|gap we have discussed|practical exercises for/i.test(candidate)
    && !/\?|\b(?:buy|purchase|guarantee|will fix|exact blueprint|guaranteed fix|losing money|bleeding money)\b/i.test(candidate)) return candidate;
  const customer = /\b(?:audience|customer|buyer|anybody)\b/i.test(state.evidence.join(' '));
  return customer
    ? 'The Unseen Playbook can help you choose who your offer is for and give that buyer a clear reason to care. You can use its questions to sharpen one offer for one audience. The button below opens the details.'
    : /\btrust|proof|testimonial/i.test(state.evidence.join(' '))
      ? 'The Unseen Playbook explains how clarity, positioning and trust affect a buying decision. For the proof gap you described, it can help you work out what would give a buyer a concrete reason to believe your offer. Open the details below to see whether it fits.'
      : 'The Unseen Playbook offers a way to examine your offer and the obstacles a buyer faces. The button below opens the details so you can decide whether it suits what you want to work on.';
}
function callExplanation(raw) {
  const candidate = cleanReply(raw).replace(/\[\[(?:STEP:[A-Z0-9_]+|DIAGNOSTIC_QUESTION|CHIPS:.*?)\]\]/gs, '').trim();
  if (candidate && candidate.length <= 550 && /\b(?:call|scope|team can discuss)\b/i.test(candidate)
    && !/\?|\b(?:playbook|booked|scheduled|guarantee|losing money|bleeding money|before i recommend|tell me your goal|qualif(?:y|ication))\b/i.test(candidate)) return /\bstrategy call\b/i.test(candidate)?candidate:candidate.replace(/\b(?:free\s+)?call\b/i,'free strategy call');
  return 'The team can discuss the scope of the work you have described on a free 25-minute strategy call. Choose an available time using the button below; the call helps establish fit and does not commission a project.';
}
function result(text, state, action) {
  state.lastAction = action;
  state.problemType = state.need === 'learning' ? 'foundational' : ['implementation', 'research'].includes(state.need) ? 'operational' : 'unknown';
  const visible=cleanMetadata(text).replace(/\b(?:free\s+)?(?:(\d+)[ -]minute\s+)?strategy call(s)?\b/gi,(_match,minutes,plural)=>`free ${minutes?minutes+'-minute ':''}strategy call${plural||''}`);
  return { text: visible, routingState: state };
}

export function resolveHavenRouting(rawText, context = {}) {
  const raw = typeof rawText === 'string' ? rawText : '';
  const latest = String(context.latestUserText || '').trim();
  const previous = normalizeState(context.routingState);
  const state = { ...previous, evidence: [...previous.evidence], missing: [...previous.missing] };
  if ((context.bookingStatus?.confirmed || context.bookingStatus?.pending) && (/\[\[BOOK_CALL\]\]/.test(raw) || BARE_BOOKING.test(latest) || wantsDelegation(latest))) {
    state.pendingAction=null;state.permission='none';
    return result(context.bookingStatus.confirmed
      ? 'You already have an upcoming call. Bring this issue to that meeting; your Calendly confirmation has the details and options to manage it.'
      : 'A booking page was opened recently. Complete that booking first; if you left without booking, you can try again after the reservation expires (up to 30 minutes).',state,'answer');
  }
  const sources = userTexts(context);
  const inferred = inferHavenNeed([...sources.map(content => ({ role: 'user', content }))]);
  const marker = [...raw.matchAll(/\[\[DECISION:(\{[^\r\n]*\})\]\]/g)].at(-1);
  let proposed = null;
  if (marker && marker[1].length <= 5000) {
    try {
      const value = JSON.parse(marker[1]);
      const evidence = exactEvidence(value.evidence, sources);
      if (evidence.some(hasBusinessNeed) || value.need === 'support' && evidence.length) proposed = { ...value, evidence };
    } catch { /* Invalid metadata never becomes facts or UI content. */ }
  }
  if (proposed && !isAffirmative(latest)) {
    if (NEEDS.includes(proposed.need)) state.need = proposed.need;
    if (COMPLEXITIES.includes(proposed.complexity)) state.complexity = proposed.complexity;
    if (PREFERENCES.includes(proposed.preference)) state.preference = proposed.preference;
    state.bookFit = proposed.bookFit === true;
    state.evidence = proposed.evidence;
    state.missing = Array.isArray(proposed.missing) ? proposed.missing.filter(key => ['goal', 'scope', 'evidence', 'preference', 'problem'].includes(key)).slice(0, 4) : [];
  }
  const currentDelegation = wantsDelegation(latest) && WORK.test(latest) && (IMPLEMENT.test(latest) || RESEARCH.test(latest) || /like yours/i.test(latest));
  const currentResearch = RESEARCH.test(latest);
  if (inferred.need !== 'unknown' && (currentDelegation || currentResearch || (!proposed && ['unknown','support'].includes(state.need)))) {
    state.need = inferred.need;
    state.complexity = inferred.complexity === 'unknown' ? state.complexity : inferred.complexity;
    state.evidence = inferred.evidence.length ? inferred.evidence : state.evidence;
    if (inferred.bookFit) state.bookFit = true;
  }
  if ((wantsDelegation(latest) || wantsLearning(latest)) && inferred.preference !== 'none') state.preference = inferred.preference;
  if (!isAffirmative(latest) && previous.need !== 'unknown' && state.need !== previous.need) {
    state.pendingAction = null;
    state.permission = 'none';
  }
  // A legacy NEED marker is a subject hint, never sufficient evidence by itself.
  const legacy = raw.match(/\[\[NEED:(FOUNDATIONAL|OPERATIONAL)\]\]/)?.[1];
  if (state.need === 'unknown' && legacy && sources.some(hasBusinessNeed)) {
    state.need = legacy === 'FOUNDATIONAL' ? 'learning' : 'implementation';
    state.evidence = quotedSources(sources);
    if (legacy === 'FOUNDATIONAL') state.bookFit = true;
  }
  const isSupport = publicSupport(latest, context);
  if (isSupport) {
    state.need = 'support'; state.bookFit = false; state.pendingAction = null; state.permission = 'none';
    const help = supportHelpReply(latest, context.scope, { teamInquiry: context.teamInquiry });
    if (help) return result(help + '\n[[STEP:CUSTOMER_SUPPORT_OPEN]]', state, humanRequest(latest) ? 'support_handoff' : 'answer');
    const answer = cleanReply(raw);
    if (!/\b(?:recommend|buy|purchase|book a|strategy call|playbook can help)\b/i.test(answer)) return result(answer, state, 'answer');
    return result('Let us address the support issue first. What happens when you try that step?\n[[STEP:CUSTOMER_SUPPORT_OPEN]]', state, 'clarify');
  }
  const offersBook = /\[\[(?:PLAYBOOK|STEP:ROUTING_TO_PLAYBOOK)\]\]|\b(?:recommend|suggest|buy|purchase|get|start with)\b[^.!?\n]{0,65}\b(?:playbook|resource|guide)\b|\b(?:playbook|resource)\b[^.!?\n]{0,75}\b(?:can help|could help|can guide|right next step)\b|\b(?:would you|may i|can i|shall i)\b[^.!?\n]{0,100}\b(?:playbook|resource|overview)\b/i.test(raw) || proposed?.nextAction === 'offer_playbook';
  const offersCall = /\[\[(?:BOOK_CALL|STEP:ROUTING_TO_CALL)\]\]|\b(?:book|schedule|hop|jump|join|next step)\b[^.!?\n]{0,60}\bcall\b|\bstrategy call\b[^.!?\n]{0,45}\b(?:would|could|will|can) help\b/i.test(raw) || CALL_URL.test(raw) || proposed?.nextAction === 'offer_call';
  CALL_URL.lastIndex = 0;
  const declines = isDecline(latest);
  const affirmative = isAffirmative(latest);
  const asksCall = !declines && BARE_BOOKING.test(latest);
  const asksResource = !declines && RESOURCE_REQUEST.test(latest);
  const knowsNeed = state.evidence.length > 0 && state.need !== 'unknown' && state.need !== 'support';
  const explicitDelegation = currentDelegation;
  const wantsTeam = state.preference === 'delegate' || asksCall || explicitDelegation;
  const learningFits = state.need === 'learning' && state.bookFit && state.preference !== 'delegate';
  const wasOffered = previous.permission === 'asked' && ['playbook', 'call', 'service'].includes(previous.pendingAction);
  if (declines && (offersBook || offersCall || wasOffered)) {
    state.permission = 'declined'; state.pendingAction = null;
    return result('Of course. Take your time. You can return to this conversation if you want to continue.\n[[STEP:CLEAN_EXIT]]', state, 'close');
  }
  const bookPrice = PRICE.test(latest) && (/\b(?:playbook|book)\b/i.test(latest)
    || latest.length < 70 && !WORK.test(latest) && !/\b(?:call|service|team|project|consulting|delivery)\b/i.test(latest)
      && (previous.pendingAction === 'playbook' || previous.lastAction === 'offer_playbook'));
  if (bookPrice && !asksResource) {
    return result('The Unseen Playbook costs ₦9,639. Its contents and checkout are in the Shop section.\n[[STEP:CUSTOMER_SUPPORT_OPEN]]', state, 'answer');
  }
  if (context.playbookVerified === true && !asksCall && !explicitDelegation) {
    return result(cleanReply(raw), state, 'answer');
  }
  // Prior invitations survive short replies without re-running a question ritual.
  if (affirmative && (previous.pendingAction === 'call' && previous.permission === 'asked' || context.acceptedCall === true)) {
    state.permission = 'granted'; state.pendingAction = null; state.preference = 'delegate';
    return result(callExplanation(raw) + '\n[[BOOK_CALL]]\n[[STEP:ROUTING_TO_CALL]]', state, 'offer_call');
  }
  if (affirmative && previous.pendingAction === 'playbook' && previous.permission === 'asked' && context.playbookVerified !== true) {
    state.permission = 'granted'; state.pendingAction = null; state.preference = 'learn';
    return result(bookExplanation(raw, state) + '\n[[PLAYBOOK]]\n[[STEP:ROUTING_TO_PLAYBOOK]]', state, 'offer_playbook');
  }
  if ((explicitDelegation || (asksCall && knowsNeed)) && context.scope !== undefined) {
    state.permission = 'granted'; state.pendingAction = null; state.preference = 'delegate';
    return result(callExplanation(raw) + '\n[[BOOK_CALL]]\n[[STEP:ROUTING_TO_CALL]]', state, 'offer_call');
  }
  // A direct request to inspect the public book is not an inferred sale or proof
  // of purchase; the real Shop UI still performs checkout and verification.
  if (asksResource && /\b(?:unseen|playbook|book)\b/i.test(latest) && context.playbookVerified !== true) {
    state.permission = 'granted'; state.pendingAction = null;
    return result(bookExplanation(raw, state) + '\n[[PLAYBOOK]]\n[[STEP:ROUTING_TO_PLAYBOOK]]', state, 'offer_playbook');
  }
  if (state.permission === 'declined' && (offersBook || offersCall) && !asksCall && !asksResource && !explicitDelegation) return result('Take your time. If another question comes up, you can ask it here.\n[[STEP:CLEAN_EXIT]]', state, 'close');
  const preferenceQuestion = /would you prefer[^?\n]{0,150}\b(?:yourself|team)|which fits your bandwidth/i.test(raw);
  const repeatedPreference = previous.pendingAction === 'preference' && preferenceQuestion;
  if (repeatedPreference && /\b(?:not sure|unsure|don['’]?t know|do not know)\b/i.test(latest)) {
    state.pendingAction = null; state.preference = 'unsure';
    return result('We can start with one manageable next step using what you have shared, then decide whether you need more help. You do not have to choose a paid option now.\n[[STEP:AWAITING_DIAGNOSTIC_Q2]]', state, 'answer');
  }
  if (offersBook || offersCall || preferenceQuestion) {
    if (knowsNeed && preferenceQuestion && ['none', 'unsure'].includes(state.preference)) {
      state.missing = ['preference']; state.pendingAction = 'preference';
      return result('Would you prefer to work through this yourself, or discuss getting help from the team?\n[[STEP:AWAITING_DIAGNOSTIC_Q2]]', state, 'clarify');
    }
    if (knowsNeed && wantsTeam) {
      state.permission = 'asked'; state.pendingAction = 'call';
      return result('The work you have described can be discussed with the team. Would you like to explore its scope on a free 25-minute strategy call?\n[[STEP:AWAITING_PERMISSION]]', state, 'offer_call');
    }
    if (knowsNeed && learningFits) {
      state.permission = 'asked'; state.pendingAction = 'playbook';
      return result('I can recommend a practical resource for working on the audience, offer and trust questions we have discussed. Would you like to see what it covers?\n[[STEP:AWAITING_PERMISSION]]', state, 'offer_playbook');
    }
    if (knowsNeed && ['none', 'unsure'].includes(state.preference)) {
      state.missing = ['preference']; state.pendingAction = 'preference';
      return result('Would you prefer to work through this yourself, or discuss getting help from the team?\n[[STEP:AWAITING_DIAGNOSTIC_Q2]]', state, 'clarify');
    }
    if (knowsNeed && state.preference === 'learn') {
      return result('The Playbook does not carry out research or technical implementation. I can help you understand a bounded next step for doing this yourself. Which part would you like to work through?\n[[STEP:AWAITING_DIAGNOSTIC_Q2]]', state, 'clarify');
    }
    const question = asksCall ? 'What marketing or website work would you like the team to help with?'
      : SERVICE_QUESTIONS[context.serviceId] || 'What would you most like to improve, and what is getting in the way?';
    state.missing = ['goal'];
    return result(question + '\n' + DIAGNOSTIC + '\n[[STEP:AWAITING_DIAGNOSTIC_Q2]]', state, 'clarify');
  }
  if (asksCall && !knowsNeed) {
    state.missing = ['goal'];
    return result('What marketing or website work would you like the call to help you solve?\n' + DIAGNOSTIC + '\n[[STEP:AWAITING_DIAGNOSTIC_Q2]]', state, 'clarify');
  }
  let answer = cleanReply(raw);
  // A complaint about TMH needs its actual issue addressed. Do not turn a
  // provider's canned solidarity into an endorsement of an unsupported claim.
  if (/\b(?:tmh|haven|the marketing haven)\b/i.test(latest)
    && /\b(?:useless|rubbish|terrible|stupid|fake|scam)\b/i.test(latest)
    && /\bi hear you\b|you are not alone|you['’]re not alone/i.test(answer)) {
    answer = 'What specifically went wrong with TMH or Haven, and what were you trying to do?';
  }
  if (!bookPrice && /\bplaybook\b/i.test(answer) && /₦|\bNGN\b|\bnaira\b/i.test(answer)) {
    answer = answer.split(/(?<=[.!?])\s+/).filter(sentence => !/₦|\bNGN\b|\bnaira\b/i.test(sentence)).join(' ');
    if (!answer.trim()) answer = 'The Shop section explains The Unseen Playbook and what it covers.';
  }
  return result(answer, state, raw.includes(DIAGNOSTIC) ? 'clarify' : 'answer');
}
export function gateHavenRouting(rawText, context = {}) {
  return resolveHavenRouting(rawText, context).text;
}
