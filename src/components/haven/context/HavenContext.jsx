// src/components/haven/context/HavenContext.jsx
// VERSION 5.6 — Persists haven_score, score_breakdown, biggest_leak,
// assessment_summary to brand_reviews alongside lead temperature
// and click flags.

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { STEPS, LEADS, SCORING_COPY } from '../config/prompts';
import { scheduleHavenSessionSync } from '../../../lib/havenSessionSync';
import { getHavenIdentity, CHAT_NOTICE_VERSION } from '../../../lib/havenIdentity';

export const HavenContext = createContext(null);

const STORAGE_KEYS = {
  support: 'tmh_haven_support_sessions',
  service: 'tmh_haven_service_sessions',
  audit:   'tmh_haven_audit_sessions',
};

const PROFILE_STORAGE_KEY        = 'tmh_haven_user_profile_v1';
const PREFLIGHT_STORAGE_KEY      = 'tmh_haven_audit_preflight_v1';
const LAST_SUPPORT_SESSION_KEY   = 'tmh_haven_last_support_session';
const REVIEW_RECOVERY_MESSAGE = 'This saved review needs access recovery. Please contact info@themarketinghaven.xyz to continue.';

const DEFAULT_USER_PROFILE = {
  name: '', brandName: '', email: '', whatsapp: '',
  businessDomain: '', mainGoal: '', platform: '', handle: '',
  screenshot: null, screenshotFileName: null, websiteUrl: null,
  scrapedWebSummary: null, scrapeFailed: false, scrapeState: null,
  auditScore: null, scoreBreakdown: null, biggestIssue: null,
  assessmentSummary: null, biggestLeak: null,
  biggestProblems: [], silentAccountId: null, exchangeCount: 0,
  currentStep: STEPS.GREETING, isReturningUser: false,
  leadTemperature: null,
  clickedBookingLink: false,
  clickedPlaybookLink: false,
  flag_status: 'white',
  reviewId: null, sessionId: null, accessToken: null,
};

const DEFAULT_PREFLIGHT = {
  status: 'idle', url: null, score: null, breakdown: null,
  biggestIssue: null, summary: null, error: null,
  dismissed: false, retryCount: 0,
};

const NAV_ACTION_RULES = [
  { test: /\b(upload|attach)\b.*\b(screenshot|image|photo|file)\b/i, action: 'upload' },
  { test: /\bshare\b.*\b(screenshot|image|photo)\b/i,                 action: 'upload' },
  { test: /\bshare\b.*\b(website|link|url)\b/i,                      action: 'link' },
  { test: /\bpaste\b.*\b(link|url|website)\b/i,                      action: 'link' },
  { test: /\b(share|send)\b.*\bmy\b.*\blink\b/i,                     action: 'link' },
];

function classifyChipAction(text) {
  if (!text || typeof text !== 'string') return null;
  for (const rule of NAV_ACTION_RULES) if (rule.test.test(text)) return rule.action;
  return null;
}

function parseNavChipsFromText(rawText) {
  if (!rawText) return { navChips: [], cleanedText: rawText || '' };
  const regex = /\[\[NAV_CHIPS:(.*?)\]\]/gs;
  const navChips = [];
  let match;
  while ((match = regex.exec(rawText)) !== null) {
    match[1].split(',').forEach((piece) => {
      const cleaned = piece.trim().replace(/^["']|["']$/g, '').trim();
      if (cleaned) navChips.push(cleaned);
    });
  }
  return { navChips, cleanedText: rawText.replace(regex, '').trim() };
}

function parseStepMarker(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return { step: null, cleanedText: rawText || '' };
  }
  const regex = /\[\[STEP:([A-Z0-9_]+)\]\]/g;
  let step = null;
  let match;
  while ((match = regex.exec(rawText)) !== null) {
    const candidate = match[1];
    if (Object.prototype.hasOwnProperty.call(STEPS, candidate)) step = candidate;
  }
  return { step, cleanedText: rawText.replace(regex, '').trim() };
}

function parseLeadMarker(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return { lead: null, cleanedText: rawText || '' };
  }
  const regex = /\[\[LEAD:([A-Z]+)\]\]/g;
  let lead = null;
  let match;
  while ((match = regex.exec(rawText)) !== null) {
    const candidate = match[1];
    if (Object.prototype.hasOwnProperty.call(LEADS, candidate)) lead = candidate;
  }
  return { lead, cleanedText: rawText.replace(regex, '').trim() };
}

function makeDefaultSupportSession() {
  return {
    id: 'session-default', title: 'General Support Chat', scope: 'support',
    serviceId: null, isPinned: false, createdAt: Date.now(), messages: [], hasGreeted: false,
    currentStep: STEPS.CUSTOMER_SUPPORT_OPEN,
  };
}

function loadSessionsForScope(scope) {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS[scope]);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) { console.warn(`Haven: Failed to load ${scope} sessions`, e); }
  return scope === 'support' ? [makeDefaultSupportSession()] : [];
}

function saveSessionsForScope(scope, sessions) {
  try {
    const clean = sessions.map(s => ({
      ...s, messages: s.messages.map(m => ({ ...m, image: null })),
    }));
    localStorage.setItem(STORAGE_KEYS[scope], JSON.stringify(clean));
  } catch (e) { console.warn(`Haven: Failed to save ${scope} sessions`, e); }
}

function loadUserProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (raw) return { ...DEFAULT_USER_PROFILE, ...JSON.parse(raw), screenshot: null };
  } catch (e) { console.warn('Haven: Failed to load user profile', e); }
  return { ...DEFAULT_USER_PROFILE };
}

function saveUserProfile(profile) {
  try {
    const { screenshot, ...rest } = profile;
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(rest));
  } catch (e) { console.warn('Haven: Failed to save user profile', e); }
}

function loadPreflight() {
  try {
    const raw = localStorage.getItem(PREFLIGHT_STORAGE_KEY);
    if (raw) return { ...DEFAULT_PREFLIGHT, ...JSON.parse(raw) };
  } catch (e) { console.warn('Haven: Failed to load preflight', e); }
  return { ...DEFAULT_PREFLIGHT };
}

function savePreflight(pf) {
  try { localStorage.setItem(PREFLIGHT_STORAGE_KEY, JSON.stringify(pf)); }
  catch (e) { console.warn('Haven: Failed to save preflight', e); }
}

function reviewAccess(profile = {}) {
  return { reviewId: profile.reviewId, sessionId: profile.sessionId, accessToken: profile.accessToken };
}

function matchingAuditSession(sessions, profile) {
  return sessions.find((session) => session.scope === 'audit' && session.id === profile.sessionId) || null;
}

async function readHavenResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (response.status === 403) {
    throw new Error(REVIEW_RECOVERY_MESSAGE);
  }
  if (!response.ok || data.ok === false) {
    const error = new Error(data.error || 'Haven could not complete the request. Please try again.');
    error.status = response.status;
    throw error;
  }
  return data;
}

async function callHavenAPI({ context, messages, screenshot, scope, signal, requestId, action }) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) throw new Error('Supabase is not configured.');

  const response = await fetch(`${supabaseUrl}/functions/v1/haven-chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${supabaseAnonKey}`,
      apikey: supabaseAnonKey,
    },
    signal,
    body: JSON.stringify({ context, messages, screenshot, scope, requestId, ...(action ? { action } : {}), noticeVersion: CHAT_NOTICE_VERSION }),
  });
  const data = await readHavenResponse(response);
  return { ...data, text: data.text || '', chips: data.chips || [] };
}

async function callScrapeWebsite(url, access, force = false) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) throw new Error('Supabase is not configured.');

  const response = await fetch(`${supabaseUrl}/functions/v1/scrape-website`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${supabaseAnonKey}`,
      apikey: supabaseAnonKey,
    },
    body: JSON.stringify({ url, context: access, force }),
  });
  return readHavenResponse(response);
}

async function callScoreSocial(screenshot, access, force = false) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) throw new Error('Supabase is not configured.');

  const response = await fetch(`${supabaseUrl}/functions/v1/score-social`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${supabaseAnonKey}`,
      apikey: supabaseAnonKey,
    },
    body: JSON.stringify({ screenshot, context: access, force }),
  });
  return readHavenResponse(response);
}

export function HavenProvider({ children }) {
  const [isOpen, setIsOpen]               = useState(false);
  const [mode, setMode]                   = useState('support');
  const [activeService, setActiveService] = useState(null);
  const [isThinking, setIsThinking]       = useState(false);
  const [mounted, setMounted]             = useState(false);
  const [showToast, setShowToast]         = useState(false);
  const [toastMessage, setToastMessage]   = useState('');
  const [activeMenuSessionId, setActiveMenuSessionId] = useState(null);
  const [bookingNoticeOpen, setBookingNoticeOpen]     = useState(false);
  const [bookingContext, setBookingContext] = useState({ source: null, serviceId: null });

  const [supportSessions, setSupportSessions] = useState([makeDefaultSupportSession()]);
  const [serviceSessions, setServiceSessions] = useState([]);
  const [auditSessions, setAuditSessions]     = useState([]);

  const [activeScope, setActiveScope]         = useState('support');
  const [activeSessionId, setActiveSessionId] = useState('session-default');
  const [viewState, setViewState]             = useState('landing');
  const [userProfile, setUserProfile]         = useState({ ...DEFAULT_USER_PROFILE });
  const [auditPreflight, setAuditPreflight]   = useState({ ...DEFAULT_PREFLIGHT });
  const [sessionSaveState, setSessionSaveState] = useState('saved');

  const abortControllerRef = useRef(null);
  const publicSessionIdsRef = useRef(new Map());
  const pendingTurnsRef = useRef(new Map());
  const inFlightTurnsRef = useRef(new Set());
  const scoringRequestRef = useRef(0);

  useEffect(() => {
    setSupportSessions(loadSessionsForScope('support'));
    setServiceSessions(loadSessionsForScope('service'));
    setAuditSessions(loadSessionsForScope('audit'));
    setUserProfile(loadUserProfile());
    setAuditPreflight(loadPreflight());
    setMounted(true);
    return () => { if (abortControllerRef.current) abortControllerRef.current.abort(); };
  }, []);

  useEffect(() => { if (mounted) saveSessionsForScope('support', supportSessions); }, [supportSessions, mounted]);
  useEffect(() => { if (mounted) saveSessionsForScope('service', serviceSessions); }, [serviceSessions, mounted]);
  useEffect(() => { if (mounted) saveSessionsForScope('audit', auditSessions); },    [auditSessions,   mounted]);
  useEffect(() => { if (mounted) saveUserProfile(userProfile); },                    [userProfile,     mounted]);
  useEffect(() => { if (mounted) savePreflight(auditPreflight); },                   [auditPreflight,  mounted]);

  useEffect(() => {
    const handleSave = (event) => {
      if (event.detail?.sessionId === userProfile.sessionId) setSessionSaveState(event.detail.state);
    };
    window.addEventListener('haven-session-sync', handleSave);
    return () => window.removeEventListener('haven-session-sync', handleSave);
  }, [userProfile.sessionId]);

  useEffect(() => {
    if (!mounted) return;
    if (activeScope !== 'support') return;
    try {
      localStorage.setItem(LAST_SUPPORT_SESSION_KEY, activeSessionId);
    } catch {}
  }, [activeScope, activeSessionId, mounted]);

  // Sync only the owned conversation snapshot and click metadata. AI results stay server-owned.
  useEffect(() => {
    if (!mounted) return;

    const access = reviewAccess({ reviewId: userProfile.reviewId, sessionId: userProfile.sessionId, accessToken: userProfile.accessToken });
    if (!access.sessionId || !access.reviewId || !access.accessToken) return;
    const session = matchingAuditSession(auditSessions, access);
    if (!session) return;

    scheduleHavenSessionSync({
      sessionId: session.id,
      reviewId: access.reviewId,
      accessToken: access.accessToken,
      messages: session.messages,
      metadataOnly: true,
      clickedBookingLink: userProfile.clickedBookingLink || false,
      clickedPlaybookLink: userProfile.clickedPlaybookLink || false,
    });
  }, [
    auditSessions,
    userProfile.clickedBookingLink,
    userProfile.clickedPlaybookLink,
    userProfile.accessToken,
    userProfile.reviewId,
    userProfile.sessionId,
    mounted,
  ]);

  const getSessionsForScope = useCallback((scope) => {
    if (scope === 'support') return supportSessions;
    if (scope === 'service') return serviceSessions;
    if (scope === 'audit')   return auditSessions;
    return [];
  }, [supportSessions, serviceSessions, auditSessions]);

  const setSessionsForScope = useCallback((scope, updaterFn) => {
    if (scope === 'support')      setSupportSessions(updaterFn);
    else if (scope === 'service') setServiceSessions(updaterFn);
    else if (scope === 'audit')   setAuditSessions(updaterFn);
  }, []);

  const sessions       = getSessionsForScope(activeScope);
  const currentSession = sessions.find(s => s.id === activeSessionId)
    ?? (activeScope === 'support' ? makeDefaultSupportSession() : null);
  const messages       = currentSession?.messages ?? [];

  const triggerToast = useCallback((msg) => {
    setToastMessage(msg);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2500);
  }, []);

  const updateUserProfile = useCallback((updates) => {
    setUserProfile(prev => ({ ...prev, ...updates }));
  }, []);

  const addMessage = useCallback((role, content, image = null, extraProps = {}) => {
    const newMessage = {
      id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      role, content, image, timestamp: Date.now(), reveal: role === 'agent', ...extraProps,
    };
    setSessionsForScope(activeScope, prev =>
      prev.map(session => {
        if (session.id !== activeSessionId) return session;
        const updatedMessages = [...session.messages, newMessage];
        let title = session.title;
        if (role === 'user' && !extraProps.isChipIntent && (
          session.messages.length === 0 ||
          session.title === 'New Chat' ||
          session.title === 'General Support Chat'
        )) {
          title = content?.length > 28 ? `${content.substring(0, 28)}...` : (content || 'Strategy Discussion');
        }
        return { ...session, title, messages: updatedMessages };
      })
    );
    return newMessage;
  }, [activeScope, activeSessionId, setSessionsForScope]);

  const createSession = useCallback((scope, { id: providedId, title, serviceId = null, initialMessage = null } = {}) => {
    const newSession = {
      id: providedId || `session-${scope}-${serviceId || 'gen'}-${Date.now()}`,
      title: title || 'New Chat', scope, serviceId,
      isPinned: false, createdAt: Date.now(),
      messages: initialMessage ? [{ ...initialMessage, reveal: true }] : [],
      hasGreeted: Boolean(initialMessage),
      currentStep: scope === 'audit' ? STEPS.AWAITING_DIAGNOSTIC_Q1
        : scope === 'service' ? STEPS.SERVICE_GRID_OPEN
          : serviceId === 'team-inquiry' ? STEPS.TEAM_INQUIRY : STEPS.CUSTOMER_SUPPORT_OPEN,
    };
    setSessionsForScope(scope, prev => [newSession, ...prev]);
    setActiveScope(scope);
    setActiveSessionId(newSession.id);
    setViewState(initialMessage ? 'chatting' : 'landing');
    return newSession.id;
  }, [setSessionsForScope]);

  const runScraper = useCallback(async (url, { force = false, access = userProfile } = {}) => {
    if (!url) return;
    const requestId = ++scoringRequestRef.current;

    setAuditPreflight(prev => ({
      status: 'scraping', url, score: null, breakdown: null, biggestIssue: null,
      summary: null, error: null, dismissed: false, retryCount: prev.retryCount || 0,
    }));
    setUserProfile(prev => ({ ...prev, scrapedWebSummary: null, scrapeFailed: false, scrapeState: null,
      auditScore: null, scoreBreakdown: null, biggestIssue: null }));

    try {
      // Only a fresh server response may supply scores; browser caches are not authority.
      const result = await callScrapeWebsite(url, reviewAccess(access), force);
      if (requestId !== scoringRequestRef.current) return;
      if (!result.ok) throw new Error(result.error || 'Scraper returned ok: false');
      if (!['valid', 'bad_data'].includes(result.state)) throw new Error(SCORING_COPY.failed);
      const valid = result.state === 'valid' && Number.isInteger(result.score);

      setAuditPreflight(prev => ({
        status: valid ? 'ready' : 'bad_data', url,
        score: valid ? result.score : null, breakdown: valid ? result.breakdown : null,
        biggestIssue: result.biggestIssue ?? null, summary: result.summary || '',
        error: null, dismissed: false, retryCount: prev.retryCount || 0,
      }));
      setUserProfile(prev => ({
        ...prev,
        scrapedWebSummary: result.summary || null, scrapeFailed: false, scrapeState: result.state,
        auditScore: valid ? result.score : null, scoreBreakdown: valid ? result.breakdown : null,
        biggestIssue: result.biggestIssue ?? null,
      }));

    } catch (err) {
      if (requestId !== scoringRequestRef.current) return;
      console.warn('[Haven] Website scrape failed:', err);
      setAuditPreflight(prev => ({
        status: 'failed', url, score: null, breakdown: null, biggestIssue: null,
        summary: null,
        error: err instanceof Error && /access recovery/.test(err.message) ? err.message : SCORING_COPY.failed,
        dismissed: false, retryCount: (prev.retryCount || 0) + 1,
      }));
      setUserProfile(prev => ({ ...prev, scrapedWebSummary: null, scrapeFailed: true, scrapeState: 'failed', auditScore: null, scoreBreakdown: null, biggestIssue: null }));
    }
  }, [userProfile]);

  const runSocialScorer = useCallback(async (screenshot, { force = false, access = userProfile } = {}) => {
    if (!screenshot) return;
    const requestId = ++scoringRequestRef.current;

    setAuditPreflight(prev => ({
      status: 'scraping', url: null, score: null, breakdown: null, biggestIssue: null,
      summary: null, error: null, dismissed: false, retryCount: prev.retryCount || 0,
    }));
    setUserProfile(prev => ({ ...prev, scrapedWebSummary: null, scrapeFailed: false, scrapeState: null,
      auditScore: null, scoreBreakdown: null, biggestIssue: null }));

    try {
      const result = await callScoreSocial(screenshot, reviewAccess(access), force);
      if (requestId !== scoringRequestRef.current) return;
      if (!result.ok) throw new Error(result.error || 'Social scorer returned ok: false');
      if (!['valid', 'bad_data'].includes(result.state)) throw new Error('Social scoring failed.');
      const valid = result.state === 'valid' && Number.isInteger(result.score);

      setAuditPreflight(prev => ({
        status: valid ? 'ready' : 'bad_data', url: null,
        score: valid ? result.score : null, breakdown: valid ? result.breakdown : null,
        biggestIssue: result.biggestIssue ?? null, summary: null,
        error: null, dismissed: false, retryCount: prev.retryCount || 0,
      }));
      setUserProfile(prev => ({
        ...prev,
        auditScore: valid ? result.score : null, scoreBreakdown: valid ? result.breakdown : null,
        biggestIssue: result.biggestIssue ?? null,
        scrapedWebSummary: null,
        scrapeFailed: false, scrapeState: result.state,
      }));
    } catch (err) {
      if (requestId !== scoringRequestRef.current) return;
      console.warn('[Haven] Social score failed:', err);
      setAuditPreflight(prev => ({
        status: 'failed', url: null, score: null, breakdown: null, biggestIssue: null,
        summary: null,
        error: err instanceof Error ? err.message : 'Unknown error',
        dismissed: false, retryCount: (prev.retryCount || 0) + 1,
      }));
      setUserProfile(prev => ({ ...prev, scrapedWebSummary: null, scrapeFailed: true, scrapeState: 'failed', auditScore: null, scoreBreakdown: null, biggestIssue: null }));
    }
  }, [userProfile]);

  const retryScrape = useCallback(() => {
    if (userProfile.businessDomain === 'social' && userProfile.screenshot) {
      runSocialScorer(userProfile.screenshot, { force: true });
    } else if (userProfile.websiteUrl) {
      runScraper(userProfile.websiteUrl, { force: true });
    }
  }, [userProfile.businessDomain, userProfile.screenshot, userProfile.websiteUrl, runScraper, runSocialScorer]);

  const proceedFromPreflight = useCallback(() => {
    setAuditPreflight(prev => ({ ...prev, dismissed: true }));
  }, []);

  const resetPreflight = useCallback(() => {
    scoringRequestRef.current += 1;
    setAuditPreflight({ ...DEFAULT_PREFLIGHT });
  }, []);

  const openDrawer = useCallback((targetMode = 'support', payload = {}) => {
    const { profileData, serviceData } = payload;
    setMode(targetMode);

    if (serviceData) setActiveService(serviceData);
    else setActiveService(null);

    if (profileData) {
      setUserProfile(prev => ({
        ...prev, ...profileData,
        exchangeCount: prev.exchangeCount || 0,
        currentStep: targetMode === 'audit' ? STEPS.AWAITING_DIAGNOSTIC_Q1 : prev.currentStep,
      }));
    }

    if (targetMode === 'service_inquiry' && serviceData) {
      const sid = serviceData.id || serviceData.title;
      const existing = serviceSessions.find(s => s.serviceId === sid);
      if (existing) {
        setActiveScope('service');
        setActiveSessionId(existing.id);
        setViewState('chatting');
      } else {
        const name = profileData?.name || userProfile.name;
        const greetingName = name ? `Hi ${name}` : 'Hi there';
        createSession('service', {
          title: serviceData.title, serviceId: sid,
          initialMessage: {
            id: `agent-${Date.now()}`, role: 'agent', image: null, timestamp: Date.now(),
            content: `${greetingName}! I can see you're interested in our **${serviceData.title}** service.\n\nWhat would you like to improve, and what is getting in the way right now?`,
            chips: ['Getting people to notice us', 'Turning attention into sales', 'Not sure where we lose them'],
          },
        });
      }
    } else if (targetMode === 'audit') {
      const name           = profileData?.name           || userProfile.name;
      const brandName      = profileData?.brandName      || userProfile.brandName;
      const isReturning    = profileData?.isReturningUser || userProfile.isReturningUser || false;
      const businessDomain = profileData?.businessDomain || userProfile.businessDomain;
      const screenshot     = profileData?.screenshot     || userProfile.screenshot;
      const websiteUrl     = profileData?.websiteUrl     || userProfile.websiteUrl;
      const access = { ...userProfile, ...profileData };
      if (access.sessionId !== userProfile.sessionId) scoringRequestRef.current += 1;
      if (!access.reviewId || !access.sessionId || !access.accessToken) {
        scoringRequestRef.current += 1;
        setActiveScope('audit');
        setActiveSessionId(access.sessionId || 'legacy-review');
        setViewState('chatting');
        setAuditPreflight({ ...DEFAULT_PREFLIGHT, status: 'failed', error: REVIEW_RECOVERY_MESSAGE, retryCount: 2 });
        setIsOpen(true);
        return;
      }

      if (isReturning) {
        const existingAudit = matchingAuditSession(auditSessions, access);

        if (existingAudit && existingAudit.messages.length > 0) {
          setActiveScope('audit');
          setActiveSessionId(existingAudit.id);
          setViewState('chatting');
          setIsOpen(true);
          return;
        }
      }

      resetPreflight();

      if (businessDomain === 'website' && websiteUrl) {
        runScraper(websiteUrl, { access });
      } else if (businessDomain === 'social' && screenshot) {
        runSocialScorer(screenshot, { access });
      }

      const greetingName = name ? `Hi ${name}` : 'Hi there';
      const brand        = brandName ? ` for **${brandName}**` : '';

      let greetingContent = '';
      if (businessDomain === 'none') {
        greetingContent = `${greetingName}! I've received your details${brand}.\n\nBefore we go deeper — are you building from scratch, or do you already have customers and simply haven't set up a social space yet?`;
      } else {
        greetingContent = `${greetingName}! I've received your submission${brand}.\n\nBefore we dig into anything — what's the single biggest challenge you're facing with ${brandName || 'your brand'} at the moment?`;
      }

      createSession('audit', {
        id: access.sessionId || undefined,
        title: `${brandName || 'Brand'} Review`,
        serviceId: 'brand-audit',
        initialMessage: {
          id: `agent-${Date.now()}`, role: 'agent',
          content: greetingContent, image: null, timestamp: Date.now(),
          isSeedGreeting: true, reveal: true,
        },
      });
    } else if (targetMode === 'booking') {
      setBookingContext({ source: payload.source ?? null, serviceId: payload.serviceId ?? null });
      setBookingNoticeOpen(true);
      return;
    } else {
      setActiveScope('support');
      const isTeamInquiry = profileData?.entryContext === 'team_inquiry';

      if (isTeamInquiry) {
        const existingTeam = supportSessions.find(s => s.serviceId === 'team-inquiry' && s.messages.length > 0);
        if (existingTeam) {
          setActiveSessionId(existingTeam.id);
          setViewState('chatting');
        } else {
          createSession('support', {
            title: 'Talk to Our Team', serviceId: 'team-inquiry',
            initialMessage: {
              id: `agent-${Date.now()}`, role: 'agent', image: null, timestamp: Date.now(),
              content: `Hey there! I'm Haven — I help connect people to the right TMH team member.\n\nBefore I do, what's this about? Tell me a bit about your brand and what you're looking to discuss, and I'll make sure we route you properly.`,
              chips: ['I want to discuss a service', 'I have a general question', 'Something else'],
            },
          });
        }
      } else {
        let lastSupportId = null;
        try {
          lastSupportId = localStorage.getItem(LAST_SUPPORT_SESSION_KEY);
        } catch {}

        const lastSupport = lastSupportId
          ? supportSessions.find((s) => s.id === lastSupportId)
          : null;

        const defaultSupport = supportSessions.find((s) => s.id === 'session-default');
        const target = lastSupport || defaultSupport || supportSessions.find((s) => !s.serviceId) || supportSessions[0];

        if (target) {
          setActiveSessionId(target.id);
          if (target.messages.length === 0 && !target.hasGreeted) {
            const greeting = {
              id: `agent-${Date.now()}`, role: 'agent', image: null, timestamp: Date.now(),
              isSeedGreeting: true, reveal: true,
              content: `Hi, I'm Haven, your digital marketing assistant at TMH. I help individual creators and business owners work through their marketing, and I can help you find your way around this website.\n\nWhat are you building, and where are you getting stuck?`,
            };
            setSessionsForScope('support', prev =>
              prev.map(s => s.id === target.id ? { ...s, messages: [greeting], hasGreeted: true } : s)
            );
            setViewState('chatting');
          } else {
            setViewState(target.messages.length === 0 ? 'landing' : 'chatting');
          }
        } else {
          createSession('support', { title: 'General Support Chat' });
        }
      }
    }

    setIsOpen(true);
  }, [createSession, userProfile, serviceSessions, supportSessions, auditSessions, setSessionsForScope, runScraper, runSocialScorer, resetPreflight]);

  const closeDrawer  = useCallback(() => setIsOpen(false), []);
  const toggleDrawer = useCallback(() => setIsOpen(prev => !prev), []);

  const createNewSession = useCallback(() => {
    const newId = createSession('support', { title: 'New Chat' });
    triggerToast('New chat started');
    return newId;
  }, [createSession, triggerToast]);

  const switchSession = useCallback((sessionId, scope = activeScope) => {
    const target = getSessionsForScope(scope).find(s => s.id === sessionId);
    if (target) {
      setActiveScope(scope);
      setActiveSessionId(sessionId);
      setViewState(target.messages.length === 0 ? 'landing' : 'chatting');
    }
    setActiveMenuSessionId(null);
  }, [activeScope, getSessionsForScope]);

  const togglePinSession = useCallback((sessionId) => {
    setSessionsForScope(activeScope, prev =>
      prev.map(s => s.id === sessionId ? { ...s, isPinned: !s.isPinned } : s)
    );
    setActiveMenuSessionId(null);
  }, [activeScope, setSessionsForScope]);

  const deleteSession = useCallback((sessionId) => {
    setSessionsForScope(activeScope, prev => {
      const filtered = prev.filter(s => s.id !== sessionId);
      const wasActive = activeSessionId === sessionId;
      if (activeScope === 'support') {
        if (filtered.length === 0) {
          const fresh = makeDefaultSupportSession();
          if (wasActive) { setActiveSessionId(fresh.id); setViewState('landing'); }
          return [fresh];
        }
        if (wasActive) {
          const fallback = filtered.find(s => !s.serviceId) || filtered[0];
          setActiveSessionId(fallback.id);
          setViewState(fallback.messages.length === 0 ? 'landing' : 'chatting');
        }
        return filtered;
      }
      if (wasActive) {
        setActiveScope('support');
        const fallback = supportSessions.find(s => s.id === 'session-default') || supportSessions[0];
        if (fallback) {
          setActiveSessionId(fallback.id);
          setViewState(fallback.messages.length === 0 ? 'landing' : 'chatting');
        }
      }
      return filtered;
    });
    setActiveMenuSessionId(null);
    triggerToast('Chat deleted');
  }, [activeScope, activeSessionId, setSessionsForScope, supportSessions, triggerToast]);

  const stopResponse = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsThinking(false);
    triggerToast('Response stopped');
  }, [triggerToast]);

  const sendNavChipIntent = useCallback((text) => {
    if (!text) return;
    addMessage('user', text, null, { isChipIntent: true });
  }, [addMessage]);

  const sendMessage = useCallback(async (content, image = null, options = {}) => {
    if (!content?.trim() && !image) return;
    const bucket = getSessionsForScope(activeScope);
    if (!bucket.some(s => s.id === activeSessionId)) {
      createSession('support', { title: 'New Chat' });
      return;
    }

    setViewState('chatting');
    const turnKey = `${activeScope}/${activeSessionId}`;
    if (inFlightTurnsRef.current.has(turnKey)) return;
    const pending = pendingTurnsRef.current.get(turnKey) || (currentSession?.failedTurn ? { ...currentSession.failedTurn, failed: true } : null);
    if (pending?.failed && /^(?:please )?(?:try again|retry|please do(?: it)? again)[.!\s]*$/i.test(content || '')) {
      content = pending.content; image = pending.image;
    }
    const retrying = pending?.content === content && pending?.image === image;
    const requestId = retrying ? pending.requestId : crypto.randomUUID();
    pendingTurnsRef.current.set(turnKey, retrying ? { ...pending, failed: false } : { requestId, content, image });
    inFlightTurnsRef.current.add(turnKey);
    setSessionsForScope(activeScope, prev => prev.map(s => s.id === activeSessionId ? { ...s, failedTurn: null } : s));
    if (!retrying) addMessage('user', content, image || null, { requestId });
    if (!retrying) setUserProfile(prev => ({ ...prev, exchangeCount: (prev.exchangeCount || 0) + 1 }));
    setIsThinking(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const abort = () => controller.abort();
    if (options?.signal) {
      if (options.signal.aborted) controller.abort();
      options.signal.addEventListener('abort', abort, { once: true });
    }
    try {
      if (activeScope === 'audit' && (!userProfile.reviewId || !userProfile.sessionId || !userProfile.accessToken)) throw new Error(REVIEW_RECOVERY_MESSAGE);
      const identity = getHavenIdentity();
      let publicSessionId = currentSession?.serverSessionId || publicSessionIdsRef.current.get(turnKey);
      if (activeScope !== 'audit' && !publicSessionId) {
        publicSessionId = crypto.randomUUID();
        publicSessionIdsRef.current.set(turnKey, publicSessionId);
        setSessionsForScope(activeScope, prev => prev.map(session => session.id === activeSessionId ? { ...session, serverSessionId: publicSessionId } : session));
      }
      const linkedAccess = userProfile.reviewId && userProfile.sessionId && userProfile.accessToken
        ? { reviewId: userProfile.reviewId, reviewSessionId: userProfile.sessionId, accessToken: userProfile.accessToken } : {};
      const context = activeScope === 'audit' ? { ...identity, ...reviewAccess(userProfile) } : {
        ...identity, ...linkedAccess, sessionId: publicSessionId,
        userName: userProfile.name || 'there', brandName: userProfile.brandName || 'your business',
        serviceId: activeService?.id || null,
        entryContext: currentSession?.serviceId === 'team-inquiry' ? 'team_inquiry' : null,
        currentStep: currentSession?.currentStep,
      };

      const sessionMessages = currentSession?.messages || [];
      const priorUserMessages = sessionMessages
        .filter(m => m.role === 'user' && !m.isChipIntent);
      const isFirstRealUserMessage = priorUserMessages.length === 0;

      const aiMessages = sessionMessages
        .filter(m => !m.isChipIntent)
        .filter(m => !(isFirstRealUserMessage && m.isSeedGreeting))
        .slice(-39)
        .map(m => ({ role: m.role, content: (m.content || '').slice(0, 4000) }));

      const allMessages = [{ role: 'user', content: content || '' }];
      let historyChars = content?.length || 0;
      for (let index = aiMessages.length - 1; index >= 0; index--) {
        if (historyChars + aiMessages[index].content.length > 24000) break;
        allMessages.unshift(aiMessages[index]);
        historyChars += aiMessages[index].content.length;
      }
      const isFirstAuditMessage = activeScope === 'audit' && priorUserMessages.length === 0;
      const screenshotToSend = image || (isFirstAuditMessage ? userProfile.screenshot : null);

      const payload = retrying && pending.payload ? pending.payload : {
        context, messages: allMessages, requestId,
        screenshot: retrying && pending.screenshot !== undefined ? pending.screenshot : screenshotToSend, scope: activeScope,
      };
      pendingTurnsRef.current.set(turnKey, { requestId, content, image, payload });
      const result = await callHavenAPI({ ...payload, signal: controller.signal });

      pendingTurnsRef.current.delete(turnKey);
      if (result.flagStatus) setUserProfile(prev => ({ ...prev, flag_status: result.flagStatus }));
      const { step: newStep, cleanedText: textAfterStep } = parseStepMarker(result.text);
      const { lead: newLead, cleanedText: textAfterLead } = parseLeadMarker(textAfterStep);
      const { navChips: navChipsFromTag, cleanedText } = parseNavChipsFromText(textAfterLead);
      if (result.currentStep || newStep) {
        setSessionsForScope(activeScope, prev => prev.map((session) => session.id === activeSessionId
          ? { ...session, currentStep: result.currentStep || newStep } : session));
      }

      const regularChips = [];
      const navChipObjects = [];

      const considerAsNav = (text) => {
        const action = classifyChipAction(text);
        if (action) navChipObjects.push({ text, action });
        else regularChips.push(text);
      };
      navChipsFromTag.forEach(considerAsNav);
      (result.chips || []).forEach(considerAsNav);

      const specialChips = [];
      if (result.text.includes('[[BOOK_CALL]]'))       specialChips.push('__BOOK_CALL__');
      if (result.text.includes('[[PLAYBOOK]]'))        specialChips.push('__PLAYBOOK__');
      if (result.text.includes('[[TIKTOK_CONTENT]]'))  specialChips.push('__TIKTOK_CONTENT__');

      const agentExtraProps = { reveal: true };
      if (specialChips.length > 0) agentExtraProps.chips = specialChips;
      else if (regularChips.length > 0) agentExtraProps.chips = regularChips;
      if (navChipObjects.length > 0) agentExtraProps.navChips = navChipObjects;

      if (activeScope === 'audit') {
        const profileUpdates = {};
        if (result.currentStep || newStep) profileUpdates.currentStep = result.currentStep || newStep;
        if (result.leadTemperature || newLead) profileUpdates.leadTemperature = result.leadTemperature || newLead;
        if (result.flagStatus) profileUpdates.flag_status = result.flagStatus;
        if (Object.keys(profileUpdates).length > 0) {
          setUserProfile(prev => ({ ...prev, ...profileUpdates }));
        }
      }

      addMessage('agent', cleanedText, null, agentExtraProps);
    } catch (err) {
      const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
      const error = err.name === 'AbortError' ? 'Response stopped. You can retry the same message.'
        : /access recovery/.test(err.message) || [400, 403, 413].includes(err.status) ? err.message
        : isOffline ? 'Your connection dropped. Your message is saved on this device. Retry when you are back online.'
        : err.status === 409 ? 'Haven is still finishing this message. Wait a moment, then retry.'
        : 'Haven could not finish this response. Retry your saved message to continue from the same point.';
      const saved = pendingTurnsRef.current.get(turnKey);
      if (saved) pendingTurnsRef.current.set(turnKey, { ...saved, failed: true });
      setSessionsForScope(activeScope, prev => prev.map(s => s.id === activeSessionId
        ? { ...s, failedTurn: { content, image, requestId, screenshot: saved?.payload?.screenshot || null, error } } : s));
    } finally {
      options?.signal?.removeEventListener('abort', abort);
      inFlightTurnsRef.current.delete(turnKey);
      setIsThinking(false);
      abortControllerRef.current = null;
    }
  }, [activeScope, activeSessionId, currentSession, getSessionsForScope, setSessionsForScope, createSession, addMessage, userProfile, activeService]);

  const clearChat = useCallback(() => {
    setSessionsForScope(activeScope, prev =>
      prev.map(s => s.id === activeSessionId ? { ...s, messages: [], hasGreeted: false } : s)
    );
    setViewState('landing');
    triggerToast('Conversation cleared');
  }, [activeScope, activeSessionId, setSessionsForScope, triggerToast]);

  const hasExistingReview = useCallback(() => {
    const hasProfile = Boolean(userProfile.name && (userProfile.email || userProfile.whatsapp));
    const hasAuditSession = auditSessions.some(
      s => s.scope === 'audit' && s.messages && s.messages.length > 0
    );
    return hasProfile || hasAuditSession;
  }, [userProfile, auditSessions]);

  const getSavedReviewFormData = useCallback(() => ({
    name:           userProfile.name           || '',
    brandName:      userProfile.brandName      || '',
    email:          userProfile.email          || '',
    whatsapp:       userProfile.whatsapp       || '',
    mainGoal:       userProfile.mainGoal       || '',
    businessDomain: userProfile.businessDomain || '',
    websiteUrl:     userProfile.websiteUrl     || '',
    platform:       userProfile.platform       || '',
    handle:         userProfile.handle         || '',
    screenshot:     null,
    reviewId:       userProfile.reviewId,
    sessionId:      userProfile.sessionId,
    accessToken:    userProfile.accessToken,
  }), [userProfile]);

  const clearExistingReview = useCallback(() => {
    setAuditSessions([]);
    setUserProfile(prev => ({
      ...DEFAULT_USER_PROFILE,
      name: prev.name, email: prev.email, whatsapp: prev.whatsapp,
    }));
    setActiveScope('support');
    setActiveSessionId('session-default');
    setViewState('landing');
    resetPreflight();
  }, [resetPreflight]);

  const recheckHavenAccess = useCallback(async () => {
    const identity = getHavenIdentity();
    const linked = userProfile.reviewId && userProfile.sessionId && userProfile.accessToken
      ? { reviewId: userProfile.reviewId, reviewSessionId: userProfile.sessionId, accessToken: userProfile.accessToken } : {};
    const key = `${activeScope}/${activeSessionId}`;
    let sessionId = currentSession?.serverSessionId || publicSessionIdsRef.current.get(key);
    if (!sessionId) { sessionId = crypto.randomUUID(); publicSessionIdsRef.current.set(key, sessionId); }
    const context = activeScope === 'audit' ? { ...identity, ...reviewAccess(userProfile) }
      : { ...identity, ...linked, sessionId, serviceId: activeService?.id || null };
    const result = await callHavenAPI({ action: 'access', context, scope: activeScope });
    if (!['white','yellow','red'].includes(result.flagStatus)) throw new Error('Could not verify your access. Please try again.');
    setUserProfile((previous) => ({ ...previous, flag_status: result.flagStatus }));
    return result.flagStatus;
  }, [activeScope, activeSessionId, currentSession, userProfile, activeService]);

  const value = {
    isOpen, mode, setMode, toggleDrawer, openDrawer, closeDrawer,
    activeScope, activeService, viewState,
    sessions, activeSessionId, currentSession, messages,
    createNewSession, switchSession, togglePinSession, deleteSession, clearChat,
    addMessage, sendMessage, sendNavChipIntent, isThinking, setIsThinking, stopResponse,
    userProfile, updateUserProfile, recheckHavenAccess,
    bookingNoticeOpen, setBookingNoticeOpen, bookingContext,
    showToast, toastMessage, triggerToast,
    activeMenuSessionId, setActiveMenuSessionId,
    hasExistingReview, getSavedReviewFormData, clearExistingReview,
    auditPreflight, proceedFromPreflight, resetPreflight, runScraper, runSocialScorer, retryScrape, sessionSaveState,
  };

  return <HavenContext.Provider value={value}>{children}</HavenContext.Provider>;
}

export function useHaven() {
  const ctx = useContext(HavenContext);
  if (!ctx) throw new Error('useHaven must be used within a HavenProvider');
  return ctx;
}
