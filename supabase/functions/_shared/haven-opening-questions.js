export const NEED_HELP_NEW_CHAT = 'need-help-new-chat';

export const OPENING_QUESTIONS = {
  needHelp: 'Do you need help with your marketing or finding something on this website?',
  siteSupport: 'What can I help you with?',
  team: "Before I do, what's this about?",
  service: 'What would you like to improve, and what is getting in the way right now?',
  noPresence: "Before we go deeper - are you building from scratch, or do you already have customers and simply haven't set up a social space yet?",
};

export function publicOpeningQuestion(scope, serviceId) {
  if (scope === 'service') return OPENING_QUESTIONS.service;
  if (serviceId === 'site-support') return OPENING_QUESTIONS.siteSupport;
  if (serviceId === 'team-inquiry') return OPENING_QUESTIONS.team;
  return OPENING_QUESTIONS.needHelp;
}
