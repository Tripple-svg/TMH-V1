const VISIT_COUNT_KEY = 'tmh_visit_count';
const FIRST_VISIT_KEY = 'tmh_first_visit_at';

function getOrCreateVisitorId() {
  const key = 'tmh_visitor_id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

export function captureTrackingData() {
  const params = new URLSearchParams(window.location.search);
  const firstVisitAt = localStorage.getItem(FIRST_VISIT_KEY) || new Date().toISOString();
  const visitCount = Number.parseInt(localStorage.getItem(VISIT_COUNT_KEY) || '0', 10) + 1;

  localStorage.setItem(FIRST_VISIT_KEY, firstVisitAt);
  localStorage.setItem(VISIT_COUNT_KEY, String(visitCount));

  const firstVisitMs = new Date(firstVisitAt).getTime();
  const daysToConvert = Number.isFinite(firstVisitMs)
    ? Math.max(0, Math.floor((Date.now() - firstVisitMs) / 86_400_000))
    : 0;

  const userAgent = navigator.userAgent;
  const deviceType = /Mobi|Android|iPhone|iPad|iPod/i.test(userAgent)
    ? (/iPad|Tablet/i.test(userAgent) ? 'tablet' : 'mobile')
    : 'desktop';

  return {
    utmSource: params.get('utm_source'),
    utmCampaign: params.get('utm_campaign'),
    referrerUrl: document.referrer || null,
    deviceType,
    visitCount,
    firstVisitAt,
    daysToConvert,
  };
}

export async function trackLinkClick(supabaseClient, reviewId, sessionId, linkType) {
  if (!supabaseClient || !linkType) return { success: false, error: new Error('Missing tracking client or link type') };

  const { error: eventError } = await supabaseClient.from('link_click_events').insert({
    review_id: reviewId || null,
    session_id: sessionId || null,
    link_type: linkType,
  });

  if (eventError) return { success: false, error: eventError };
  if (!reviewId) return { success: true };

  const update = {};
  if (linkType === 'booking') {
    update.clicked_booking_link = true;
    update.clicked_booking_at = new Date().toISOString();
  }
  if (linkType === 'playbook') {
    update.clicked_playbook_link = true;
    update.clicked_playbook_at = new Date().toISOString();
  }
  if (Object.keys(update).length === 0) return { success: true };

  const { error: reviewError } = await supabaseClient
    .from('brand_reviews')
    .update(update)
    .eq('id', reviewId);

  return reviewError ? { success: false, error: reviewError } : { success: true };
}

export { getOrCreateVisitorId };
