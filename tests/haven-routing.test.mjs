import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gateHavenRouting } from '../supabase/functions/_shared/haven-routing.js';
import { buildHavenSystemPrompt, determineRoutingAction, STEPS } from '../supabase/functions/_shared/haven-prompts.js';

test('routing: all entry points require two asked questions AND two substantive answers before either offer', () => {
  for (const scope of ['audit','support','service']) for(const [asked,answers] of [[0,0],[1,1],[2,1],[1,2]]) for(const tag of ['BOOK_CALL','PLAYBOOK']) {
    const result=gateHavenRouting(`The right move is here. [[${tag}]] [[NEED:OPERATIONAL]]`,{scope,questionsAsked:asked,diagnosticAnswers:answers,explicitCallRequested:true});
    assert.doesNotMatch(result,/\[\[(?:BOOK_CALL|PLAYBOOK)\]\]/);assert.match(result,/\[\[DIAGNOSTIC_QUESTION\]\]/);
  }
});
test('routing: explicit first-message booking requests still need service-specific qualification', () => {
  const result=gateHavenRouting('Book a call. [[BOOK_CALL]]',{scope:'service',serviceId:'web',questionsAsked:0,diagnosticAnswers:0,explicitCallRequested:true});
  assert.match(result,/Brand & Web Engineering/);assert.match(result,/website/);assert.doesNotMatch(result,/BOOK_CALL/);
});
test('routing: qualified support never offers a call without an explicit request', () => {
  const raw='We can repair the checkout. [[BOOK_CALL]] [[NEED:OPERATIONAL]]';
  assert.doesNotMatch(gateHavenRouting(raw,{scope:'support',questionsAsked:2,diagnosticAnswers:2,explicitCallRequested:false}),/BOOK_CALL/);
  assert.match(gateHavenRouting(raw,{scope:'support',questionsAsked:2,diagnosticAnswers:2,explicitCallRequested:true}),/BOOK_CALL/);
});
test('routing: a foundational diagnosis selects the Playbook even if the model tries to send an established business to a call', () => {
  const result=gateHavenRouting('Book a call. [[BOOK_CALL]] [[NEED:FOUNDATIONAL]]',{scope:'audit',questionsAsked:2,diagnosticAnswers:2});
  assert.match(result,/PLAYBOOK/);assert.doesNotMatch(result,/BOOK_CALL/);
});
test('routing: a technical operational defect cannot be sold the Playbook', () => {
  const result=gateHavenRouting('Buy the Playbook. [[PLAYBOOK]] [[NEED:OPERATIONAL]]',{scope:'service',questionsAsked:2,diagnosticAnswers:2});
  assert.doesNotMatch(result,/PLAYBOOK|BOOK_CALL/);assert.match(result,/DIAGNOSTIC_QUESTION/);
});
test('routing: unknown need and raw booking/shop links cannot bypass qualification', () => {
  for(const raw of ['https://calendly.com/themarketinghaven01/30min','https://themarketinghaven.xyz/#shop']) {
    assert.doesNotMatch(gateHavenRouting(raw,{questionsAsked:1,diagnosticAnswers:1}),/https:/);
  }
  assert.doesNotMatch(gateHavenRouting('[[PLAYBOOK]]',{questionsAsked:2,diagnosticAnswers:2}),/PLAYBOOK/);
});
test('routing: factual product information can be answered without treating every mention as an offer', () => {
  const raw='The Unseen Playbook covers clarity, positioning, trust, and practical application.';
  assert.equal(gateHavenRouting(raw,{scope:'support',questionsAsked:0,diagnosticAnswers:0}),raw);
});

test('routing: ordinary sales phrasing and step-only routes cannot skip diagnosis', () => {
  for (const raw of ["Let's hop on a call.", 'The next step is a strategy call.', 'A strategy call would help.', 'The Playbook is the right next step.', '[[STEP:ROUTING_TO_CALL]]', '[[STEP:ROUTING_TO_PLAYBOOK]]']) {
    assert.match(gateHavenRouting(raw,{questionsAsked:1,diagnosticAnswers:1}), /DIAGNOSTIC_QUESTION/);
  }
});

test('routing: declining or hesitating cannot be overridden by an earlier booking request', () => {
  const result = gateHavenRouting('Book a call. [[BOOK_CALL]] [[NEED:OPERATIONAL]]', {scope:'support',questionsAsked:2,diagnosticAnswers:2,explicitCallRequested:true,latestUserText:"I don't want a call. Let me think."});
  assert.doesNotMatch(result,/BOOK_CALL|DIAGNOSTIC_QUESTION/); assert.match(result,/Take your time/);
});
test('routing: income, follower bands, a website or a low score alone no longer select a call', () => {
  const result=determineRoutingAction({presenceType:'website',score:20,leadTemperature:'HOT',socialFollowerBand:'OVER_1500'});
  assert.equal(result,STEPS.AWAITING_DIAGNOSTIC_Q1);
  assert.equal(determineRoutingAction({questionsAsked:2,diagnosticAnswers:2,problemType:'foundational'}),STEPS.ROUTING_TO_PLAYBOOK);
});
test('routing prompt: both audiences, server qualification counts and current Playbook scope are explicit', () => {
  const prompt=buildHavenSystemPrompt({auditData:{currentStep:STEPS.CUSTOMER_SUPPORT_OPEN,questionsAsked:1,diagnosticAnswers:1}});
  assert.match(prompt,/BOTH individual creators/);assert.match(prompt,/business\/brand owners/);
  assert.match(prompt,/asked=1; substantive answers=1/);assert.match(prompt,/NOT a technical website repair manual/);
  assert.doesNotMatch(prompt,/SKIP the doorbell and ROUTE IMMEDIATELY|Then PICK call/);
});
