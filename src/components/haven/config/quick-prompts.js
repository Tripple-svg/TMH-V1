// These are real user questions, scoped to the entry point, rather than offers.
export function quickPrompts(scope, serviceId) {
  if (serviceId === 'team-inquiry') return [
    ['Discuss a project','I would like to discuss a project with your team.'],
    ['Find the right service','Which TMH service fits the work I need?'],
    ['Website help','I want your team to improve my website.'],
    ['Contact the team','How can I contact your team directly?'],
  ];
  if (scope === 'support') return [
    ['Download help','My Playbook download did not work. What should I do?'],
    ['Recover my copy','Where is Already purchased, and how do I recover my copy?'],
    ['Saved review','How can I reopen or correct my saved brand review?'],
    ['Contact support','I need to speak to a human about a platform issue.'],
  ];
  if (scope === 'service') return [
    ['What is included?','What does this service cover?'],
    ['Discuss my project','I would like your team to help with a project.'],
    ['How it works','What happens after I book a call?'],
    ['Choosing a service','How do I choose the right service for my business?'],
  ];
  return [
    ['Understand my review','What does my review tell me, and what could you not assess?'],
    ['Clarify my offer','Help me make my offer easier for a customer to understand.'],
    ['Understand my buyers','How can I work out who is most likely to buy from me?'],
    ['Choose a next step','Help me choose one practical next step for my brand.'],
  ];
}
