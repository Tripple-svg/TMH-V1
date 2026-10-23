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
  let consented = false;
  try { consented = localStorage.getItem('tmh_cookie_consent') === 'true'; } catch { /* Optional analytics stays off. */ }
  const params = new URLSearchParams(window.location.search);
  let firstVisitAt = new Date().toISOString();
  let visitCount = 1;
  if (consented) {
    try {
      firstVisitAt = localStorage.getItem(FIRST_VISIT_KEY) || firstVisitAt;
      const savedCount = Number.parseInt(localStorage.getItem(VISIT_COUNT_KEY) || '0', 10);
      visitCount = Number.isFinite(savedCount) && savedCount >= 0 ? savedCount + 1 : 1;
      localStorage.setItem(FIRST_VISIT_KEY, firstVisitAt);
      localStorage.setItem(VISIT_COUNT_KEY, String(visitCount));
    } catch { /* Review submission must still work when storage is blocked. */ }
  }

  const firstVisitMs = new Date(firstVisitAt).getTime();
  const daysToConvert = Number.isFinite(firstVisitMs)
    ? Math.max(0, Math.floor((Date.now() - firstVisitMs) / 86_400_000))
    : 0;

  const userAgent = navigator.userAgent;
  const deviceType = /Mobi|Android|iPhone|iPad|iPod/i.test(userAgent)
    ? (/iPad|Tablet/i.test(userAgent) ? 'tablet' : 'mobile')
    : 'desktop';

  return {
    utmSource: consented ? params.get('utm_source') : null,
    utmCampaign: consented ? params.get('utm_campaign') : null,
    referrerUrl: consented ? document.referrer || null : null,
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
