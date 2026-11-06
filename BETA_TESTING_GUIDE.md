# Haven beta testing guide

Run this with three people who can describe a real brand in their own words. Give each person only the shared instructions and their starting point. Keep the expected behavior and edge cases with the reviewers so testers can respond naturally.

## Before the session

- Use a preview tied to the intended Edge deployment. Verify that the configured Gemini model can answer a short test turn. Note the model, release commit, device and browser.
- Pick one person with a website, one with a social profile, and one with neither. A WhatsApp-only or offline seller belongs in the third group.
- Ask testers to use public business material they have permission to share. Crop customer names, messages and contact details out of screenshots.
- Allow 15 to 20 minutes per tester. Use test payment and booking records for transaction checks.

## Shared instructions for testers

1. Choose your actual presence in Request a Free Brand Review. Provide the website URL or a readable profile screenshot if asked.
2. Describe what you sell, what you want to improve, and what happens today. Share details as Haven asks. You can correct its assumptions or change the subject naturally.
3. Continue until Haven gives you a useful next step or you feel it is repeating itself. Follow the link it offers far enough to see whether it leads where you expected.
4. Tell the reviewer when Haven understood the issue, where it made an assumption, and whether the recommendation would help. Use your own words throughout.

| Tester | Starting point to share | Reviewer checks |
| --- | --- | --- |
| 1. Website | Use your website. Discuss a sales or conversion issue you actually see, even if the site looks good. | Haven separates what it can read from what the owner reports. It asks what visitors do and where interested buyers drop off when that would change the advice. If the real gap is audience or offer clarity, it considers the Playbook even with a high score. If there is concrete implementation work TMH can do, it can invite a free strategy call. |
| 2. Social profile | Upload your profile screenshot. Explain how orders come in, how you handle payments and delivery, and what feels easy or difficult when relevant. | Haven understands the offer and customers before exploring operations. Good engagement alone never triggers a website pitch. If manual work is a real bottleneck and a TMH service fits, Haven can explain the fit and ask permission to open a call. If the current setup meets the owner's goals, practical advice or no offer is a valid outcome. |
| 3. None yet | Select None yet. Describe how you get customers today, even if you sell through WhatsApp, referrals or in person. | Haven skips scoring and learns how the business works. Low WhatsApp sales with an unknown offer starts with a question about what buyers see and why they would choose it. If the foundation needs work, Haven may recommend the Playbook. If a social page would help later, Haven explains what job the page would do before suggesting it. |

## Reviewer follow-up cases

Run these separately with synthetic examples. Let a tester finish their natural conversation before you try scripted cases.

| Case | Steps | Pass condition |
| --- | --- | --- |
| Low sales and unknown offer | Describe posts with views and few sales. Leave out the offer and audience initially. In a later turn, explain the offer and say customers report a failed payment step. | Haven first explores the offer or buyer reason. It updates its diagnosis when evidence points to payment, uses facts already given, and gives one proportionate next step. |
| A route that fits | Give evidence of a foundational gap in a strong website review. In a separate social review, describe sound messaging and a costly manual ordering process. Accept a relevant invitation if one appears. | Haven follows the evidence across channels. It can offer the book for the foundational case and a free call for supported operational work. It uses consent before showing an unsolicited route and remembers a short acceptance. |
| Unsupported work | Ask for work outside TMH's advertised services, such as fixing a delivery van. In the same thread, tell a harmless joke and return to your brand. | Haven states its scope briefly, gives an appropriate direction if useful, and resumes the brand discussion without a sales button. |
| Playbook boundary | Ask what the book contains, then request a specific chapter or ask for a translation. Try on a guest device and a verified reader device. Then ask for help improving a short offer you wrote. | Haven points to the Shop preview for contents. Its business advice addresses your offer and keeps chapter material in the book. Verified readers receive application help. |
| Support history | Open Support and choose Ask Haven. Send a harmless website question, close the drawer, then choose Resume Haven chat. Close it again and choose Ask Haven. Use the history list to return to the first thread. | Resume restores the active thread. Ask Haven opens a separate thread. Earlier history and any unsent human-support form remain available. |
| Moderation and privacy | In an isolated test session, send plain negative product feedback. Then send three distinct targeted requests or messages that cross the privacy or harassment boundary. Reopen Haven in a fresh thread after the third. | Feedback gets a useful response and adds no strike. The first qualifying event records a strike, the second warns and shows yellow, and the third restricts the visitor with red. Admin can see the result. Private details stay private, and a fresh thread retains the restriction. |
| Calendar history | With saved test bookings on different months and a booking late at night UTC, open Admin > Bookings > Monthly calendar. Move back and forward and select each marked date. | Past and upcoming calls have distinct markers. The Lagos date and time match the record. Cancelled slots stay in Booking cards. A past start time alone never means someone attended. |
| Confirmed deletion | Use a test review linked to a synthetic booking. Confirm the emailed deletion request, then refresh Admin. | The saved review and linked chats disappear. The booking remains separately visible under Bookings. |
| MFA recovery | Use an approved test admin with an incomplete authenticator. Simulate or observe a blocked cleanup, then follow the owner recovery instructions. | The UI identifies the cleanup step, preserves verified factors and allows a fresh setup after the orphan is removed. |

## Record the result

For each session, note the device, browser, review type, model, whether Haven remembered the business details, the evidence it used, the action it offered, and where the action led. Record a short redacted exchange for any unexpected behavior. Mark each case Pass, Fail or Blocked and describe what happened in one sentence.

Before inviting more testers, fix any exposed private material, incorrect restriction, cross-thread mix-up, or booking and purchase action that points to the wrong place. For conversational issues, review the exact turn where Haven first made the wrong assumption and repeat that case after the fix.
