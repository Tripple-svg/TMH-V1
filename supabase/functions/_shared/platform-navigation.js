export const PLATFORM_ACTIONS={
  __FOOTER__:{label:'Show footer links',section:'footer'},
  __SUPPORT__:{label:'Open Support',path:'/support'},
  __DATA_ACCESS__:{label:'Download my data',path:'/data-access'},
  __DELETE_DATA__:{label:'Open Data Deletion',dialog:'data-deletion'},
  __TEAM__:{label:'Meet Team Haven',section:'about'},
  __REVIEW_DETAILS__:{label:'Edit my review details',dialog:'review-details'},
};
export function platformNavigationHelp(text){
  const value=String(text||'').toLowerCase();
  if(/\b(?:delete|remove|erase)\b.{0,40}\b(?:my data|personal data|saved data|my information)\b|\bdata deletion\b/.test(value))return {text:'Use Data Deletion under Legal & Safety in the footer, or open it with the button below. Enter the review email and confirm the email link to continue. Opening the form does not delete anything. This flow covers your saved review and linked chats/screenshots; ask Support about other records.',chips:['__DELETE_DATA__','__FOOTER__']};
  if(/\b(?:download|export|copy)\b.{0,35}\b(?:my data|personal data|saved data|my information)\b|\bdata export\b/.test(value))return {text:'Choose Download my data under Legal & Safety in the footer, or use the button below. Enter your email on that page and confirm the inbox link. Your archive includes a readable My-Data.html and a JSON copy of matching saved reviews and linked chats. I have not requested or downloaded it from this chat.',chips:['__DATA_ACCESS__','__FOOTER__']};
  if(/\b(?:edit|change|correct|restart|reset|clear)\b.{0,35}\b(?:my review|review details|brand details|saved review)\b/.test(value))return {text:'Open your saved Brand Review and choose Edit review details. You can correct your name, brand, phone or goal there. To begin the conversation again, use Restart this review and confirm it yourself. Your access, purchase and booking remain separate. For a wrong URL or screenshot, choose Review source, then Wrong website/screenshot? Try Again.',chips:['__REVIEW_DETAILS__']};
  if(/\b(?:show|find|open|where|go|take me)\b.{0,30}\bfooter\b|^show website help[.!?]*$/.test(value))return {text:'The footer is at the bottom of the homepage. Contact Information has Send a support request, email and WhatsApp. Legal & Safety has Data Deletion, Download my data, Privacy Policy and Terms. Use a button below to go straight there.',chips:['__FOOTER__','__SUPPORT__','__DATA_ACCESS__']};
  if(/\b(?:support (?:form|request)|contact support)\b/.test(value)&&!/\b(?:status|progress|reply|answered|received)\b/.test(value))return {text:'Choose Send a support request under Contact Information in the footer, or use Open Support below. Choose the closest issue, explain what happened and complete the consent and security check. A reference appears after the request is saved. I have not submitted a request for you.',chips:['__SUPPORT__']};
  if(/\b(?:where|meet|who are|find|show)\b.{0,30}\b(?:the team|team haven|team section)\b/.test(value))return {text:'Meet Team Haven in About on the homepage. That section shows the public team roles. Public contact links are in the footer; private addresses, personal numbers and account details are not available through Haven.',chips:['__TEAM__','__FOOTER__']};
  return null;
}
