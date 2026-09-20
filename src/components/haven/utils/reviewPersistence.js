// src/components/haven/utils/reviewPersistence.js
// Shared localStorage for the brand review forms (Hero + Header).
// Both forms read/write the same keys so a user can start in one and
// finish in the other without losing anything.

const FORM_DATA_KEY = 'tmh_review_form_data_v1';
const FORM_STEP_KEY = 'tmh_review_form_step_v1';

export const DEFAULT_FORM_DATA = {
  fullName: '',
  brandName: '',
  whatsapp: '',
  email: '',
  mainGoal: 'More Leads & Enquiries',
  platformType: 'social',
  socialPlatform: '',
  websiteUrl: '',
  socialLink: '',
};

export function loadReviewFormData() {
  try {
    const raw = localStorage.getItem(FORM_DATA_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_FORM_DATA, ...parsed };
    }
  } catch (e) {
    console.warn('reviewPersistence: failed to load form data', e);
  }
  return { ...DEFAULT_FORM_DATA };
}

export function saveReviewFormData(data) {
  try {
    localStorage.setItem(FORM_DATA_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('reviewPersistence: failed to save form data', e);
  }
}

export function clearReviewFormData() {
  try {
    localStorage.removeItem(FORM_DATA_KEY);
    localStorage.removeItem(FORM_STEP_KEY);
  } catch {}
}

export function loadReviewFormStep() {
  try {
    const raw = localStorage.getItem(FORM_STEP_KEY);
    return raw ? Number(raw) : 1;
  } catch {
    return 1;
  }
}

export function saveReviewFormStep(step) {
  try {
    localStorage.setItem(FORM_STEP_KEY, String(step));
  } catch {}
}

/** True if the user has typed anything meaningful into either form. */
export function hasStoredFormData() {
  const data = loadReviewFormData();
  return Boolean(
    (data.fullName && data.fullName.trim()) ||
    (data.email && data.email.trim()) ||
    (data.whatsapp && data.whatsapp.trim()) ||
    (data.brandName && data.brandName.trim())
  );
}