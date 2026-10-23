// Shared constants and copy; only the edge function constructs the system prompt.
export {
  STEPS, LEADS, FLAGS, SCORING_COPY, CALENDLY_URL,
  WEBSITE_SCORING_CATEGORIES, SOCIAL_SCORING_CATEGORIES,
  getFollowerBand, hasSignificantMismatch, determineRoutingAction,
} from '../../../../supabase/functions/_shared/haven-prompts.js';
