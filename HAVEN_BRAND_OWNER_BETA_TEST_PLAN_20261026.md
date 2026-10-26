# Haven: three-owner beta test plan

Proposed first round: November 2026, after the October 26 branch is deployed and the intended Gemini account is configured. February 2027 remains the launch target. This is a proposed plan, not a scheduled automation.

The purpose is to find out whether Haven understands a real business, remembers the conversation, gives useful guidance and completes the correct next step. Three people provide valuable qualitative evidence; they do not establish reliability at public scale.

## Participants and format

| Participant | Starting point | Main task |
| --- | --- | --- |
| A | Operating business with a website | Review the site, discuss a real obstacle, and explore implementation support if appropriate. |
| B | Business with social media | Submit a clear profile screenshot, discuss a real content or sales problem, and challenge any inaccurate diagnosis. |
| C | Business with no online presence | Select None yet, discuss their audience and first offer, and seek a practical starting point. |

Give each person 30–45 minutes independently, followed by a 15-minute interview. Do not coach their wording or tell them what answer to expect. Let them use their own business facts and natural English or Pidgin if they prefer. Read the privacy notice first: chats are saved and the authorized TMH team can review them. Avoid confidential customer information, passwords, access keys and bank details. Obtain permission before recording a session.

Use separate email addresses and browser profiles so the three reviews are independent. Record device, browser, date, time and the public build identifier/branch under test. A facilitator should locate the matching records in Admin; participants need not expose private access keys.

## Shared checks for all three owners

1. Find the review, services, Playbook, human-contact and privacy options without assistance. Note any unclear label or blocked button.
2. Complete the relevant review. A usable score must be tied to visible/extracted evidence. A reader failure must explain the actual saved reason, without inventing a broken design or presenting an absent score as zero.
3. Explain the real business problem in their own words. Respond naturally to two useful diagnostic questions; note any question that repeats an answer already supplied.
4. Continue for 15–20 turns. Ask Haven what it understands about the business. Correct one fact, then return to it later. It should use the correction and distinguish a fact from an assumption.
5. Ask a support question in the middle of the marketing discussion, such as where to recover a purchase or how to request another review. It should answer that question directly rather than restart a sales script.
6. Accept an offered next step with a short reply such as Yes please. It should continue that specific offer, including the call route when a qualified call was offered.
7. Decline or say Let me think. It should respect the decision and avoid cycling through more pitches.
8. Give specific negative feedback, for example The review was unhelpful because the button did not work. It should investigate calmly, avoid agreeing that TMH is useless, and avoid treating a genuine complaint as abuse.
9. Close and reopen the drawer, then reload the same browser. Check the saved conversation, current restriction status and whether the discussion continues coherently.
10. Start a separate support or service conversation. It must not pretend to remember a different thread's story. A verified brand identity may be linked, but conversation notes are scoped to their original chat.

## Path-specific checks

Website: use an ordinary text-rich business website first. Separately test an image-heavy site or a reader refusal. Ask whether Haven actually tested a checkout or only read page content. It must not fabricate traffic, drop-off rates, revenue, mobile testing or technical findings.

Social: use a screenshot with readable bio and recent posts. Repeat with an unreadable screenshot in a separate approved QA review. Low follower count alone must not determine business seriousness, a score or the offer. A scoring-provider failure must not invent a numerical result.

None yet: the review must enter chat directly, even after an earlier failed website review existed on the device. No stale website error or scorecard should appear. Ask for one useful starting action without being forced into an immediate purchase.

Playbook reader: use a legitimate purchase and inbox verification. Ask for help applying clarity, trust, positioning or friction to one product. Haven should offer focused application help and remember the chosen product; it should not resell the same book or disclose entire chapters/exercises. Unverified visitors must not unlock private chapter notes by claiming ownership.

Team inquiry: enter through Talk to Our Team. Confirm the record appears in Team Inquiries, retains its transcript, and remains linked under the lead when ownership is verified. Assign an owner, status, follow-up date and next action; refresh and confirm they persist. On two admin browsers, edit the same inquiry: a stale save must preserve the draft and require reloading the newer saved details.

## Facilitator-only operational and security checks

Use disposable QA identities for moderation. First distinct abusive message: recorded strike, white status. Second: yellow warning. Third: red restriction. Replaying the same request must not add a strike. Check lead, support, service and team-inquiry entry points. Clear a recorded first strike directly, without issuing an unwanted yellow warning. Clear a restriction and confirm new messages resume saving. A guest alert should identify the session/source without inventing an email or name.

Team alerts must reach both francis.teamhaven@gmail.com and paschal.tmh@gmail.com. The approved OTP/recovery QA inbox is francis.teamhaven@gmail.com. Provider acceptance is not proof of inbox delivery: check received mail and Resend's delivery events.

Do not make an unauthorized real payment. For an approved transaction, verify ₦9,639 at Paystack as well as the card/modal. A new payment must open its private download directly, without an OTP. Check callback/reference mismatch and a provider outage: no unverified download or second charge; the saved receipt must remain retryable. Confirm one purchase row per reference, the styled thank-you email, and historical legitimate ₦100 purchases remaining recoverable under the migration cutoff policy.

Recovery is for another device, missing/expired purchase proof or manually cleared storage. Review deletion must preserve the independent purchase proof. Different review and receipt emails are allowed; receipt inbox ownership is the check. Recovery: email/reference alone must not return a URL. Check a wrong code, five wrong attempts, expiry after ten minutes, reuse of a consumed code, resend cooldown, a wrong buyer email and a different device. A valid code should unlock the correct buyer's copy. One download action is shown per page visit; a later visit or recovery can open it again. This is a UI rule, not DRM.

Test network interruption and both-provider failure in staging. Retry must retain the exact saved user message and avoid duplicate turns. Restore connectivity, retry and inspect the Admin transcript. Check completed Gemini/Groq reply counts, failed/stalled turns and pending flag delivery work. These are not token or billing counters.

Use a real iPhone Safari keyboard: portrait/landscape, opening/closing the keyboard, typing a long message, scrolling the transcript and closing the drawer. The background must stay locked and the composer remain reachable. Desktop viewport emulation cannot prove this.

## Feedback form

Record the task, exact message, expected outcome, actual outcome, time/device/browser and a redacted screenshot. Do not paste OTPs, access tokens, full payment references, card details or another person's private messages.

Score each item from 1–5: understood my business; remembered my answers; useful advice; natural tone; correct next step; ease of use; trust in the explanation. Ask: Which answer felt generic? Which question was unnecessary? What useful action would you take tomorrow? Would you return without being prompted? What nearly made you stop?

Classify findings: P0 = wrong-user access, payment/download authorization failure, private-data disclosure or a lost confirmed purchase; P1 = broken main flow, repeated context loss, unjustified restriction or missing transcript; P2 = wording, layout or minor friction.

## Exit criteria and proposed schedule

Do not approve launch with an unresolved P0. Resolve and retest P1 issues in review → chat → appropriate next step, payment → direct download, later recovery → OTP → download, moderation → notification, and admin follow-up. Aim for at least 4/5 on understanding, usefulness and continuity from all three participants; any low score requires reviewing the transcript rather than averaging it away.

November: run the first pilot, collect unprompted feedback and fix observed failures. December: replay the same cases plus new edge cases against the intended paid model. January: repeat real-device checks, load/error-budget checks, payment reconciliation, recovery, admin security and delivery monitoring. February: make a go/no-go decision from that evidence. Avoid repeated cosmetic redesigns while core outcomes are still unproven.
