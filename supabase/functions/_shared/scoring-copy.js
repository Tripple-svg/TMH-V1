export function scoreFailureCopy(reason, kind = 'website') {
  if (reason === 'reader_blocked') return 'The website refused the automated reader, so Haven could not inspect its content. No score was created. You can continue in chat and describe the site.';
  if (reason === 'reader_too_large') return 'The extracted page exceeded the reader limit. No score was created. You can continue in chat and describe the business.';
  if (reason === 'reader_timeout') return 'The website reader timed out before returning content. No score was created. Try again, or continue in chat.';
  if (reason === 'provider_unavailable') return 'The scoring service did not complete this review. No score was created. You can retry or continue in chat.';
  if (kind === 'social') return 'The screenshot did not show enough readable profile information for a fair score. Try a clearer screenshot with your bio and recent posts, or continue in chat.';
  if (reason === 'insufficient_text') return 'The reader extracted too little text for a fair website score. That does not tell us why the page could not be read, or whether its design is effective. Tell Haven what your business offers and continue from there.';
  if (reason === 'boilerplate_only') return 'Most of the extracted text was navigation, cookie notices or legal information. There was not enough business content to assess the offer fairly. You can continue in chat.';
  return 'The extracted content was not usable for a fair website score. Haven cannot infer the cause or judge the unseen design from that result. You can continue by describing your business.';
}
