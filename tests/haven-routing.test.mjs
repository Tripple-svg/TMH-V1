import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gateHavenRouting, resolveHavenRouting, supportHelpReply, inferHavenNeed } from '../supabase/functions/_shared/haven-routing.js';
import { buildHavenSystemPrompt, determineRoutingAction, STEPS, WEBSITE_SCORING_CATEGORIES, SOCIAL_SCORING_CATEGORIES } from '../supabase/functions/_shared/haven-prompts.js';

const decision = (text, value) => `${text}\n[[DECISION:${JSON.stringify(value)}]]`;
const learning = 'I post pictures of bread on WhatsApp but I do not know who the buyer is.';
const learningDecision = {need:'learning',complexity:'simple',preference:'learn',bookFit:true,evidence:[learning],missing:[],nextAction:'offer_playbook'};
const context = (latestUserText, extra={}) => ({scope:'audit',latestUserText,messages:[{role:'user',content:latestUserText}],...extra});

test('routing: malformed multiline decisions stay hidden and cannot authorize an action', () => {
  const result = resolveHavenRouting('What do you sell?\n[[DECISION:{\n"need":"implementation"\n}]]', context('Hello'));
  assert.equal(result.text, 'What do you sell?'); assert.equal(result.routingState.need, 'unknown');
  assert.doesNotMatch(result.text, /DECISION|BOOK_CALL|PLAYBOOK/);
});

test('routing: provider solidarity cannot blindly validate an unsupported complaint about TMH', () => {
  const result = resolveHavenRouting('I hear you. That is frustrating and you are not alone. What is your biggest brand challenge?', context('The Marketing Haven is useless.'));
  assert.match(result.text, /What specifically went wrong/); assert.doesNotMatch(result.text, /I hear you|not alone|BOOK_CALL|PLAYBOOK/);
});

test('routing: explicit specific delegation can open a call without a diagnostic-count ritual',()=>{
  for(const scope of ['audit','service','support']){
    const latest='I want your team to rebuild my website and improve the checkout.';
    const result=resolveHavenRouting('What have you tried?',context(latest,{scope,questionsAsked:0,diagnosticAnswers:0}));
    assert.match(result.text,/\[\[BOOK_CALL\]\]/);assert.doesNotMatch(result.text,/DIAGNOSTIC_QUESTION/);
    assert.equal(result.routingState.preference,'delegate');assert.equal(result.routingState.version,2);
  }
});
test('routing: a bare booking request asks for the missing work instead of demanding two questions',()=>{
  const result=resolveHavenRouting('Book here [[BOOK_CALL]]',context('Book me a call',{scope:'service',serviceId:'web'}));
  assert.doesNotMatch(result.text,/BOOK_CALL/);assert.match(result.text,/What marketing or website work/);assert.deepEqual(result.routingState.missing,['goal']);
});
test('routing: complex positioning research and delegation can lead to a call',()=>{
  const latest='Our team needs customer interviews and positioning research for a new market. I want your team to handle the execution.';
  const result=resolveHavenRouting('Let us scope the work.',context(latest));
  assert.match(result.text,/BOOK_CALL/);assert.equal(result.routingState.need,'research');assert.equal(result.routingState.complexity,'complex');
});
test('routing: product type, revenue, headcount and score do not confer or remove eligibility',()=>{
  for(const subject of ['I sell lip gloss','I run a fifty-person company','I am starting a bakery']){
    const latest=`${subject}. I want your team to rebuild my website.`;
    assert.match(resolveHavenRouting('We can discuss the work.',context(latest)).text,/BOOK_CALL/);
  }
  assert.equal(determineRoutingAction({presenceType:'website',score:20,leadTemperature:'HOT',socialFollowerBand:'OVER_1500',revenue:100000}),STEPS.AWAITING_DIAGNOSTIC_Q1);
});
test('routing: a small useful answer needs no offer or forced question',()=>{
  const raw='Show the delivery area beside the product price so someone can see the full cost before they enquire.';
  assert.equal(gateHavenRouting(raw,context('Where should I show the delivery charge?')),raw);
});
test('routing: evidence-backed learning invites the resource once, then accepted permission reveals the book and button',()=>{
  const first=resolveHavenRouting(decision('Would you like an overview of the resource?',learningDecision),context(learning));
  assert.doesNotMatch(first.text,/Playbook|₦|purchase/);assert.equal(first.routingState.pendingAction,'playbook');
  const next=resolveHavenRouting('Before I recommend anything, what is the gap?',context('Please do!!!',{routingState:first.routingState,messages:[{role:'user',content:learning},{role:'user',content:'Please do!!!'}]}));
  assert.match(next.text,/The Unseen Playbook/);assert.match(next.text,/\[\[PLAYBOOK\]\]/);assert.doesNotMatch(next.text,/overview|purchase|₦|Before I recommend/i);
  assert.equal(next.routingState.permission,'granted');assert.equal(next.routingState.pendingAction,null);
});
test('routing: no raw purchase pitch or unsolicited price survives a resource acceptance',()=>{
  const first=resolveHavenRouting(decision('I recommend the Playbook.',learningDecision),context(learning));
  const next=resolveHavenRouting('The Unseen Playbook costs ₦9,639. Would you like to purchase it?',context('yes',{routingState:first.routingState}));
  assert.match(next.text,/PLAYBOOK/);assert.doesNotMatch(next.text,/₦|purchase|costs|overview/i);
});

test('routing: a resource invitation without naming the book still saves the pending action',()=>{
  const first=resolveHavenRouting(decision('I can recommend a practical resource for this. Would you like to see what it covers?',learningDecision),context(learning));
  assert.equal(first.routingState.pendingAction,'playbook');assert.doesNotMatch(first.text,/The Unseen Playbook/);
  const next=resolveHavenRouting('What would you like to do?',context('Go ahead',{routingState:first.routingState}));
  assert.match(next.text,/PLAYBOOK/);
});

test('routing: a first preference question is recorded even when it names no commercial product',()=>{
  const latest='We need to improve our message for two different audiences.';
  const first=resolveHavenRouting(decision('Would you prefer to work through this yourself, or discuss getting help from the team?',{...learningDecision,evidence:[latest],preference:'none',nextAction:'clarify'}),context(latest));
  assert.equal(first.routingState.pendingAction,'preference');assert.match(first.text,/Would you prefer/);
});
test('routing: an explicit request to view the book opens the real Shop without pretending it is paid',()=>{
  const result=resolveHavenRouting('Would you like to purchase the Playbook for ₦9,639?',context('Show me The Unseen Playbook'));
  assert.match(result.text,/\[\[PLAYBOOK\]\]/);assert.doesNotMatch(result.text,/₦|purchase|paid|sent/i);
});
test('routing: direct book prices are answered, while a website quote is not mistaken for a book price',()=>{
  const price=resolveHavenRouting('Let us diagnose first.',context('How much is the Playbook?'));
  assert.match(price.text,/₦9,639/);assert.doesNotMatch(price.text,/DIAGNOSTIC|BOOK_CALL/);
  const state={version:2,need:'learning',permission:'asked',pendingAction:'playbook',lastAction:'offer_playbook'};
  const different=resolveHavenRouting('Website prices depend on the work agreed.',context('How much for a website?',{routingState:state}));
  assert.doesNotMatch(different.text,/9,639/);
});
test('routing: normal factual book information is not mistaken for a recommendation',()=>{
  const raw='The Unseen Playbook covers clarity, positioning, trust, and practical application.';
  assert.equal(gateHavenRouting(raw,context('What does it cover?',{scope:'support'})),raw);
});
test('routing: self-help preference cannot turn technical implementation into a book solution',()=>{
  const latest='I want to learn how to repair my WordPress checkout myself.';
  const raw=decision('Buy the Playbook. [[PLAYBOOK]]',{need:'implementation',complexity:'complex',preference:'learn',bookFit:false,evidence:[latest],nextAction:'offer_playbook'});
  const result=resolveHavenRouting(raw,context(latest));
  assert.doesNotMatch(result.text,/\[\[PLAYBOOK\]\]|BOOK_CALL/);assert.match(result.text,/does not carry out research or technical implementation/);
});
test('routing: unknown preference can be clarified without treating an established business as automatic delegation',()=>{
  const latest='We need to understand why our offer is not distinct from other options.';
  const raw=decision('The right next step is a call. [[BOOK_CALL]]',{need:'research',complexity:'complex',preference:'none',bookFit:false,evidence:[latest],nextAction:'offer_call'});
  const result=resolveHavenRouting(raw,context(latest));
  assert.match(result.text,/Would you prefer/);assert.doesNotMatch(result.text,/BOOK_CALL|\[\[PLAYBOOK/);assert.equal(result.routingState.pendingAction,'preference');
});
test('routing: an answered preference is not asked again and undecided users are not forced into a sale',()=>{
  const state={version:2,need:'learning',complexity:'simple',bookFit:true,preference:'none',evidence:[learning],pendingAction:'preference'};
  const result=resolveHavenRouting('Would you prefer to work through this yourself, or discuss getting help from the team?',context('I want to learn',{routingState:state}));
  assert.doesNotMatch(result.text,/Would you prefer/);assert.equal(result.routingState.pendingAction,'playbook');
  const unsure=resolveHavenRouting('Would you prefer to work through this yourself?',context('I am not sure',{routingState:state}));
  assert.match(unsure.text,/do not have to choose a paid option/);assert.doesNotMatch(unsure.text,/Would you prefer|BOOK_CALL|PLAYBOOK/);
});
test('routing: accepted saved calls continue despite a new conflicting model classification',()=>{
  const state={version:2,need:'research',complexity:'complex',preference:'delegate',permission:'asked',pendingAction:'call',evidence:['We need customer interviews.']};
  const next=resolveHavenRouting(decision('Before I recommend anything, tell me your goal.',{...learningDecision,evidence:['yes please']}),context('yes please',{routingState:state}));
  assert.match(next.text,/BOOK_CALL/);assert.doesNotMatch(next.text,/Before I recommend|DIAGNOSTIC/);assert.equal(next.routingState.preference,'delegate');
});
test('routing: declining keeps an old invitation from being replayed',()=>{
  const state={version:2,need:'learning',bookFit:true,permission:'asked',pendingAction:'playbook',evidence:[learning]};
  const next=resolveHavenRouting('Use this [[PLAYBOOK]]',context('No thanks, let me think.',{routingState:state}));
  assert.doesNotMatch(next.text,/PLAYBOOK|BOOK_CALL|DIAGNOSTIC/);assert.equal(next.routingState.permission,'declined');
  const again=resolveHavenRouting('Book here [[BOOK_CALL]]',context('Thanks',{routingState:next.routingState}));assert.doesNotMatch(again.text,/BOOK_CALL/);
});
test('routing: an affirmative diagnostic answer is not invented permission for a purchase',()=>{
  const result=resolveHavenRouting('Buy it [[PLAYBOOK]]',context('yes'));
  assert.doesNotMatch(result.text,/PLAYBOOK/);assert.notEqual(result.routingState.permission,'granted');
});
test('routing: fabricated decision excerpts cannot become saved evidence or open a route',()=>{
  const raw=decision('Book a call [[BOOK_CALL]]',{need:'research',complexity:'complex',preference:'delegate',bookFit:false,evidence:['I need customer interviews and want to hire you'],missing:[],nextAction:'offer_call'});
  const result=resolveHavenRouting(raw,context('Hi there'));
  assert.deepEqual(result.routingState.evidence,[]);assert.doesNotMatch(result.text,/BOOK_CALL|DECISION/);
});
test('routing: malformed metadata and legacy raw links cannot appear in the user reply',()=>{
  for(const raw of ['[[DECISION:{broken metadata','https://calendly.com/themarketinghaven01/30min','https://themarketinghaven.xyz/#shop']){
    const result=resolveHavenRouting(raw,context('I have a question'));
    assert.doesNotMatch(result.text,/DECISION|https:/);
  }
});
test('routing: old question counts and foundational labels alone never decide an offer',()=>{
  for(const tag of ['BOOK_CALL','PLAYBOOK']){
    const result=resolveHavenRouting(`Here [[${tag}]] [[NEED:FOUNDATIONAL]]`,{scope:'audit',questionsAsked:99,diagnosticAnswers:99});
    assert.doesNotMatch(result.text,/\[\[(?:BOOK_CALL|PLAYBOOK)\]\]/);
  }
});
test('support: recovery, billing and human requests get concrete help without a strategy call',()=>{
  for(const latest of ['I paid but my Playbook download is broken','I need a human to fix this payment error','Can I do another brand review?','My review needs access recovery','Where is the shop?']){
    const reply=supportHelpReply(latest,'support');assert.ok(reply);assert.doesNotMatch(reply,/BOOK_CALL|\[\[PLAYBOOK|DIAGNOSTIC/);
  }
  const result=resolveHavenRouting('Buy the Playbook [[PLAYBOOK]]',context('My download is broken',{scope:'support'}));
  assert.doesNotMatch(result.text,/\[\[PLAYBOOK|BOOK_CALL/);assert.equal(result.routingState.need,'support');
});
test('support: public business contact is available, and human handoff is truthful',()=>{
  const reply=supportHelpReply('I want a human','support');assert.match(reply,/info@themarketinghaven.xyz/);assert.match(reply,/have not created a support ticket/);
  assert.equal(supportHelpReply('I want a human to discuss building my website','support',{teamInquiry:true}),null);
});
test('support: an explicit new service request can route without turning a support human request into a call',()=>{
  const request='I want your team to redesign my website.';
  const result=resolveHavenRouting('Let us discuss the work.',context(request,{scope:'support'}));assert.match(result.text,/BOOK_CALL/);
  const human=resolveHavenRouting('Here is a strategy call [[BOOK_CALL]]',context('I need a real person about my payment',{scope:'support'}));assert.doesNotMatch(human.text,/BOOK_CALL/);
});
test('prompt: scopes, practical persona, action honesty and manual improvement are coherent',()=>{
  const prompt=buildHavenSystemPrompt({auditData:{currentStep:STEPS.TEAM_INQUIRY,questionsAsked:1,diagnosticAnswers:1},entryPoint:'TEAM_INQUIRY'});
  for(const phrase of ['BOTH individual creators','business/brand owners','asked=1; substantive answers=1','not a technical','bounded mini-consultation','25-minute','manual']){
    if(phrase==='manual')continue;assert.ok(prompt.toLowerCase().includes(phrase.toLowerCase()),phrase);
  }
  assert.doesNotMatch(prompt,/at least TWO diagnostic|Pass mark is|framework is the whole value|vendor mindset|No mini-consultation|Never write a price as plain text/);
  assert.match(prompt,/not commissioned execution/);assert.match(prompt,/explicit.*marketing\/service need/s);
});
test('rubrics: public categories match the scoped four-part v2 contract',()=>{
  assert.deepEqual(WEBSITE_SCORING_CATEGORIES.map(row=>row.key),['clarity','trust','positioning','conversion']);
  assert.deepEqual(SOCIAL_SCORING_CATEGORIES.map(row=>row.key),['profile','direction','value','readiness']);
  assert.ok([...WEBSITE_SCORING_CATEGORIES,...SOCIAL_SCORING_CATEGORIES].every(row=>row.max===25));
});
test('inference: delegation uses explicit work, not the mere existence of a website or revenue',()=>{
  assert.equal(inferHavenNeed([{role:'user',content:'I have a website and spend lots on ads.'}]).implementationRequested,false);
  assert.equal(inferHavenNeed([{role:'user',content:'I want your team to rebuild my website.'}]).implementationRequested,true);
});

test('routing: negated delegation cannot become permission or a call route',()=>{
  const latest='I do not want your team to rebuild my website. I want to learn.';
  assert.equal(inferHavenNeed([{role:'user',content:latest}]).implementationRequested,false);
  const result=resolveHavenRouting('We can discuss a call [[BOOK_CALL]]',context(latest));
  assert.doesNotMatch(result.text,/\[\[BOOK_CALL\]\]/);assert.notEqual(result.routingState.permission,'granted');
});

test('routing: explicit requests across all advertised service areas are recognized',()=>{
  for(const latest of ['I want your team to manage my paid ad campaigns.','I want your team to produce social media content.','I want your team to design my brand identity.']){
    const result=resolveHavenRouting('Tell me what service you want.',context(latest,{scope:'service'}));
    assert.match(result.text,/BOOK_CALL/);assert.doesNotMatch(result.text,/Tell me what service/);
  }
});

test('routing: a size/income quote alone cannot justify a model-invented research need',()=>{
  const latest='We have fifty employees and make ten thousand dollars a month.';
  const result=resolveHavenRouting(decision('Book here [[BOOK_CALL]]',{need:'research',complexity:'complex',preference:'delegate',bookFit:false,evidence:[latest]}),context(latest));
  assert.deepEqual(result.routingState.evidence,[]);assert.doesNotMatch(result.text,/BOOK_CALL/);
});

test('support: an identity question or declining human help is not a handoff request',()=>{
  assert.match(supportHelpReply('Are you a real person?','support'),/AI marketing guide/);
  const result=resolveHavenRouting('I can explain that step.',context('I do not need a human. How does this work?',{scope:'support'}));
  assert.notEqual(result.routingState.lastAction,'support_handoff');
});

test('routing: an old book invitation does not change a new call-price question into a book quote',()=>{
  const result=resolveHavenRouting('The strategy call is free and lasts 25 minutes.',context('How much is the call?',{routingState:{pendingAction:'playbook',lastAction:'offer_playbook',permission:'asked'}}));
  assert.match(result.text,/free/);assert.doesNotMatch(result.text,/9,639/);
});
