/**
 * diagnosticRules.js
 * Pure ES Module containing heuristic calculations, leak classifications, 
 * recommendation routing, and audit step tracking for the Haven Diagnostic Engine.
 */

/**
 * Calculates a baseline diagnostic score out of 100 based on profile data completeness.
 * @param {Object} profile - User profile state from HavenContext
 * @returns {number} Integer score between 0 and 100
 */
export function calculateAuditScore(profile = {}) {
  let score = 40; // Base starting diagnostic score

  if (profile.brandName && profile.brandName.trim().length > 0) {
    score += 10;
  }
  if (profile.businessDomain || profile.platform) {
    score += 15;
  }
  if (profile.email && profile.email.includes('@')) {
    score += 10;
  }
  if (profile.whatsapp || profile.handle) {
    score += 10;
  }
  if (profile.screenshot) {
    score += 15;
  }

  // Ensure strict integer boundaries [0, 100]
  return Math.min(Math.max(Math.round(score), 0), 100);
}

/**
 * Identifies EXACTLY ONE dominant revenue leak category based on score and domain status.
 * @param {number} score - Diagnostic audit score
 * @param {Object} profile - User profile state
 * @returns {string} Primary revenue leak classification message
 */
export function identifyRevenueLeak(score, profile = {}) {
  const hasDomain = Boolean(profile.businessDomain || profile.platform);

  if (score < 45 || !hasDomain) {
    return "Clarity Leak: Visitors don't immediately understand what you sell or why it matters.";
  }
  
  if (score >= 45 && score <= 65) {
    return "Trust Leak: Visitors see the value, but lack proof, social proof, or authority indicators to buy.";
  }

  return "Friction Leak: Visitors want to buy, but checkout, messaging flow, or buy buttons are causing drop-offs.";
}

/**
 * Routes the user to either 'The Unseen Playbook' or a 'Strategy Consultation'.
 * @param {number} score - Diagnostic audit score
 * @param {Object} profile - User profile state
 * @returns {Object} Solution metadata object
 */
export function getRecommendedNextStep(score, profile = {}) {
  if (score < 60) {
    return {
      type: 'playbook',
      name: 'The Unseen Playbook',
      price: '₦9,639',
      link: 'https://themarketinghaven.xyz/playbook', // Adjust route/URL as needed
      description: 'Step-by-step self-implementation framework to eliminate conversion leaks.'
    };
  }

  return {
    type: 'consultation',
    name: 'Strategy Consultation with TMH Team',
    price: 'Custom Strategy Scope',
    link: 'https://themarketinghaven.xyz/book-strategy', // Adjust route/URL as needed
    description: '1-on-1 growth architecture review with Francis Fadeyi or Paschal Ikiriko.'
  };
}

/**
 * Evaluates the current diagnostic step (Steps 1 through 7) based on profile state and message exchanges.
 * @param {Object} userProfile - Current user profile
 * @param {Array} messageHistory - Current session messages
 * @returns {Object} Progress status `{ currentStep, isComplete, nextAction }`
 */
export function evaluateAuditProgress(userProfile = {}, messageHistory = []) {
  const exchangeCount = userProfile.exchangeCount || Math.floor(messageHistory.length / 2);
  let currentStep = userProfile.currentAuditStep || 1;

  // Progress logic based on active exchange flow
  if (exchangeCount === 0) {
    currentStep = 1; // Acknowledge & Personalize
  } else if (exchangeCount === 1) {
    currentStep = 2; // Ask Diagnostic Questions
  } else if (exchangeCount === 2) {
    currentStep = 3; // Reflect & Validate
  } else if (exchangeCount === 3) {
    currentStep = 4; // Deliver Audit Score & Single Leak
  } else if (exchangeCount === 4) {
    currentStep = 5; // Ask Permission to Bridge
  } else if (exchangeCount === 5) {
    currentStep = 6; // Recommend Solution (Playbook / Consultation)
  } else if (exchangeCount >= 6) {
    currentStep = 7; // Soft Close
  }

  return {
    currentStep,
    isComplete: currentStep >= 7,
    nextAction: currentStep < 7 
      ? `Awaiting step ${currentStep + 1} input` 
      : 'Diagnostic engine sequence complete'
  };
}