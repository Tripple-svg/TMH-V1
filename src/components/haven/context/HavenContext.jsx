// src/components/haven/context/HavenContext.jsx
// VERSION 4.2 — Website scraping wired into audit flow.

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { buildHavenSystemPrompt, STEPS } from '../config/prompts';

export const HavenContext = createContext(null);

const STORAGE_KEYS = {
  support: 'tmh_haven_support_sessions',
  service: 'tmh_haven_service_sessions',
  audit:   'tmh_haven_audit_sessions',
};

const PROFILE_STORAGE_KEY = 'tmh_haven_user_profile_v1';

const DEFAULT_USER_PROFILE = {
  name: '', brandName: '', email: '', whatsapp: '',
  businessDomain: '', mainGoal: '', platform: '', handle: '',
  screenshot: null, screenshotFileName: null, websiteUrl: null,
  scrapedWebSummary: null,       // NEW — set after scraper runs
  scrapeInProgress: false,        // NEW — UI can show "reading site..."
  scrapeFailed: false,            // NEW — tells the prompt scraping failed
  auditScore: null, assessmentSummary: null, biggestLeak: null,
  biggestProblems: [], silentAccountId: null, exchangeCount: 0,
  currentStep: STEPS.GREETING, isReturningUser: false,
};

// ─── Nav chip classifier ─────────────────────────────────────────────────────
const NAV_ACTION_RULES = [
  { test: /\b(upload|attach)\b.*\b(screenshot|image|photo|file)\b/i, action: 'upload' },
  { test: /\bshare\b.*\b(screenshot|image|photo)\b/i,                 action: 'upload' },
  { test: /\bshare\b.*\b(website|link|url)\b/i,                      action: 'link' },
  { test: /\bpaste\b.*\b(link|url|website)\b/i,                      action: 'link' },
  { test: /\b(share|send)\b.*\bmy\b.*\blink\b/i,                     action: 'link' },
];

function classifyChipAction(text) {
  if (!text || typeof text !== 'string') return null;
  for (const rule of NAV_ACTION_RULES) {
    if (rule.test.test(text)) return rule.action;
  }
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
  const cleanedText = rawText.replace(regex, '').trim();
  return { navChips, cleanedText };
}

// ─── Storage helpers ─────────────────────────────────────────────────────────

function makeDefaultSupportSession() {
  return {
    id: 'session-default',
    title: 'General Support Chat',
    scope: 'support',
    serviceId: null,
    isPinned: false,
    createdAt: Date.now(),
    messages: [],
    hasGreeted: false,
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
      ...s,
      messages: s.messages.map(m => ({ ...m, image: null })),
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

async function callHavenAPI({ systemPrompt, messages, screenshot, scope, signal }) {
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
    body: JSON.stringify({ systemPrompt, messages, screenshot, scope }),
  });
  if (!response.ok) throw new Error(`Haven function error ${response.status}: ${await response.text()}`);
  const data = await response.json();
  return { text: data.text || '', chips: data.chips || [], model: data.model || null };
}

// ─── NEW: Website scraper ────────────────────────────────────────────────────
async function callScrapeWebsite(url) {
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
    body: JSON.stringify({ url }),
  });
  if (!response.ok) throw new Error(`Scraper error ${response.status}: ${await response.text()}`);
  const data = await response.json();
  if (!data.ok) throw new Error(data.error || 'Scraper returned ok: false');
  return data.summary || '';
}

// ─── PROVIDER ────────────────────────────────────────────────────────────────

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

  const [supportSessions, setSupportSessions] = useState([makeDefaultSupportSession()]);
  const [serviceSessions, setServiceSessions] = useState([]);
  const [auditSessions, setAuditSessions]     = useState([]);

  const [activeScope, setActiveScope]         = useState('support');
  const [activeSessionId, setActiveSessionId] = useState('session-default');
  const [viewState, setViewState]             = useState('landing');
  const [userProfile, setUserProfile]         = useState({ ...DEFAULT_USER_PROFILE });

  const abortControllerRef = useRef(null);

  useEffect(() => {
    setSupportSessions(loadSessionsForScope('support'));
    setServiceSessions(loadSessionsForScope('service'));
    setAuditSessions(loadSessionsForScope('audit'));
    setUserProfile(loadUserProfile());
    setMounted(true);
    return () => { if (abortControllerRef.current) abortControllerRef.current.abort(); };
  }, []);

  useEffect(() => { if (mounted) saveSessionsForScope('support', supportSessions); }, [supportSessions, mounted]);
  useEffect(() => { if (mounted) saveSessionsForScope('service', serviceSessions); }, [serviceSessions, mounted]);
  useEffect(() => { if (mounted) saveSessionsForScope('audit', auditSessions); },    [auditSessions,   mounted]);
  useEffect(() => { if (mounted) saveUserProfile(userProfile); },                    [userProfile,     mounted]);

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
      role, content, image, timestamp: Date.now(), ...extraProps,
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
          title = content?.length > 28
            ? `${content.substring(0, 28)}...`
            : (content || 'Strategy Discussion');
        }
        return { ...session, title, messages: updatedMessages };
      })
    );
    return newMessage;
  }, [activeScope, activeSessionId, setSessionsForScope]);

  const createSession = useCallback((scope, { title, serviceId = null, initialMessage = null } = {}) => {
    const newSession = {
      id: `session-${scope}-${serviceId || 'gen'}-${Date.now()}`,
      title: title || 'New Chat', scope, serviceId,
      isPinned: false, createdAt: Date.now(),
      messages: initialMessage ? [initialMessage] : [],
      hasGreeted: Boolean(initialMessage),
    };
    setSessionsForScope(scope, prev => [newSession, ...prev]);
    setActiveScope(scope);
    setActiveSessionId(newSession.id);
    setViewState(initialMessage ? 'chatting' : 'landing');
    return newSession.id;
  }, [setSessionsForScope]);

  // ─── Website scraping trigger ─────────────────────────────────────────────
  // Fires when the audit drawer opens with a website URL. Runs in background.
  // By the time the user replies to the greeting, the summary should be ready.
  const runScraper = useCallback(async (url) => {
    if (!url) return;
    setUserProfile(prev => ({ ...prev, scrapeInProgress: true, scrapeFailed: false }));
    try {
      const summary = await callScrapeWebsite(url);
      setUserProfile(prev => ({
        ...prev,
        scrapedWebSummary: summary,
        scrapeInProgress: false,
        scrapeFailed: !summary,
      }));
      console.log('[Haven] Scrape complete:', summary.slice(0, 120) + '…');
    } catch (err) {
      console.warn('[Haven] Scrape failed:', err);
      setUserProfile(prev => ({
        ...prev,
        scrapedWebSummary: null,
        scrapeInProgress: false,
        scrapeFailed: true,
      }));
    }
  }, []);

  // ─── openDrawer ───────────────────────────────────────────────────────────

  const openDrawer = useCallback((targetMode = 'support', payload = {}) => {
    const { profileData, serviceData } = payload;
    setMode(targetMode);

    if (serviceData) setActiveService(serviceData);
    else setActiveService(null);

    if (profileData) {
      setUserProfile(prev => ({
        ...prev,
        ...profileData,
        // Reset scraper state on new submission so a fresh URL re-fetches
        scrapedWebSummary: null,
        scrapeInProgress: false,
        scrapeFailed: false,
        exchangeCount: prev.exchangeCount || 0,
        currentStep: STEPS.GREETING,
      }));
    }

    // ── SERVICE INQUIRY ──
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
            content: `${greetingName}! I can see you're interested in our **${serviceData.title}** service.\n\nWe build this specifically to create high-converting growth architecture for brands ready to scale. What's the specific bottleneck you're trying to eliminate right now?`,
            chips: ['Getting people to notice us', 'Turning attention into sales', 'Not sure where we lose them'],
          },
        });
      }

    // ── AUDIT ──
    } else if (targetMode === 'audit') {
      const name           = profileData?.name           || userProfile.name;
      const brandName      = profileData?.brandName      || userProfile.brandName;
      const isReturning    = profileData?.isReturningUser || userProfile.isReturningUser || false;
      const businessDomain = profileData?.businessDomain || userProfile.businessDomain;
      const screenshot     = profileData?.screenshot     || userProfile.screenshot;
      const websiteUrl     = profileData?.websiteUrl     || userProfile.websiteUrl;

      let platform;
      if (businessDomain === 'website') {
        platform = websiteUrl ? `your website (${websiteUrl})` : 'your website';
      } else if (businessDomain === 'website_and_social') {
        platform = 'your website and social media';
      } else if (businessDomain === 'none') {
        platform = 'your brand';
      } else {
        platform = profileData?.platform || userProfile.platform || 'your social media';
      }

      if (isReturning) {
        const existingAudit = auditSessions.length > 0
          ? auditSessions.reduce((best, s) =>
              (s.messages?.length || 0) > (best.messages?.length || 0) ? s : best
            , auditSessions[0])
          : null;

        if (existingAudit && existingAudit.messages.length > 0) {
          setActiveScope('audit');
          setActiveSessionId(existingAudit.id);
          setViewState('chatting');
          setIsOpen(true);
          return;
        }
      }

      // ─── NEW: Kick off the scraper if this is a website submission ───
      if (businessDomain === 'website' && websiteUrl) {
        // Fire and forget — don't block the drawer opening.
        runScraper(websiteUrl);
      }

      const greetingName = name ? `Hi ${name}` : 'Hi there';
      const brand        = brandName ? ` for **${brandName}**` : '';

      let greetingContent = '';
      if (businessDomain === 'none') {
        greetingContent = `${greetingName}! I've received your details${brand}.\n\nYou mentioned you're starting from scratch — that's actually a great position to be in. Before anything else, tell me: what are you building, and who is it for?`;
      } else if (screenshot) {
        greetingContent = `${greetingName}! I've received your submission${brand} and I can see the screenshot you uploaded.\n\nI'm going to go through it properly. But first — what's been the single biggest challenge with getting sales or enquiries from ${platform} lately?`;
      } else {
        greetingContent = `${greetingName}! I've received your submission${brand}.\n\nI'm initialising the diagnostic review for ${platform}. Before I share what I'm seeing, what's been the single biggest challenge with getting sales or enquiries lately?`;
      }

      createSession('audit', {
        title: `${brandName || 'Brand'} Review`,
        serviceId: 'brand-audit',
        initialMessage: {
          id: `agent-${Date.now()}`, role: 'agent',
          content: greetingContent, image: null, timestamp: Date.now(),
        },
      });

    // ── BOOKING ──
    } else if (targetMode === 'booking') {
      setBookingNoticeOpen(true);
      return;

    // ── SUPPORT (includes team inquiry and customer support) ──
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
            title: 'Talk to Our Team',
            serviceId: 'team-inquiry',
            initialMessage: {
              id: `agent-${Date.now()}`, role: 'agent', image: null, timestamp: Date.now(),
              content: `Hey there! I'm Haven — I help connect people to the right TMH team member.\n\nBefore I do, what's this about? Tell me a bit about your brand and what you're looking to discuss, and I'll make sure we route you properly.`,
              chips: ['I want to discuss a service', 'I have a general question', 'Something else'],
            },
          });
        }
      } else {
        const defaultSupport = supportSessions.find(s => s.id === 'session-default');
        const target = defaultSupport || supportSessions.find(s => !s.serviceId) || supportSessions[0];

        if (target) {
          setActiveSessionId(target.id);

          if (target.messages.length === 0 && !target.hasGreeted) {
            const greeting = {
              id: `agent-${Date.now()}`, role: 'agent', image: null, timestamp: Date.now(),
              isSeedGreeting: true,
              content: `Hi there! I'm Haven — TMH's elite digital marketing strategist.\n\nI help brands cut through the noise, fix the exact thing killing their sales, and turn attention into real revenue. What's going on with your brand right now?`,
            };
            setSessionsForScope('support', prev =>
              prev.map(s => s.id === target.id
                ? { ...s, messages: [greeting], hasGreeted: true }
                : s
              )
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
  }, [createSession, userProfile, serviceSessions, supportSessions, auditSessions, setSessionsForScope, runScraper]);

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
      const filtered  = prev.filter(s => s.id !== sessionId);
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

  // ─── sendMessage ──────────────────────────────────────────────────────────

  const sendMessage = useCallback(async (content, image = null, options = {}) => {
    if (!content?.trim() && !image) return;

    const bucket = getSessionsForScope(activeScope);
    if (!bucket.some(s => s.id === activeSessionId)) {
      createSession('support', { title: 'New Chat' });
      return;
    }

    setViewState('chatting');
    addMessage('user', content, image || null);
    setUserProfile(prev => ({ ...prev, exchangeCount: (prev.exchangeCount || 0) + 1 }));
    setIsThinking(true);

    const isReturningInThisScope =
      activeScope === 'audit' ? (userProfile.isReturningUser || false) : false;

    const systemPrompt = buildHavenSystemPrompt({
      userName:  userProfile.name      || 'there',
      brandName: userProfile.brandName || 'your business',
      entryPoint: activeScope === 'audit'   ? 'AUDIT_FLOW'
                : activeScope === 'service' ? 'SERVICE_GRID'
                : 'CUSTOMER_SUPPORT',
      serviceName: activeService?.title || null,
      auditData: {
        currentStep:       userProfile.currentStep    || STEPS.GREETING,
        presenceType:      userProfile.businessDomain,
        hasWebsite:        userProfile.businessDomain === 'website' || userProfile.businessDomain === 'website_and_social',
        websiteUrl:        userProfile.websiteUrl,
        hasNoPresence:     userProfile.businessDomain === 'none',
        platform:          userProfile.platform,
        handle:            userProfile.handle,
        isReturningUser:   isReturningInThisScope,
        mainGoal:          userProfile.mainGoal,
        // NEW — feeds the site summary into the prompt
        scrapedWebSummary: userProfile.scrapedWebSummary || null,
        scrapeFailed:      userProfile.scrapeFailed || false,
      },
    });

    const sessionMessages = currentSession?.messages || [];

    const priorUserMessages = sessionMessages
      .slice(0, Math.max(0, sessionMessages.length - 1))
      .filter(m => m.role === 'user' && !m.isChipIntent);
    const isFirstRealUserMessage = priorUserMessages.length === 0;

    const aiMessages = sessionMessages
      .filter(m => !m.isChipIntent)
      .filter(m => !(isFirstRealUserMessage && m.isSeedGreeting))
      .map(m => ({ role: m.role, content: m.content }));

    const allMessages = [...aiMessages, { role: 'user', content: content || '' }];

    const isFirstAuditMessage = activeScope === 'audit' && priorUserMessages.length === 0;
    const screenshotToSend = image || (isFirstAuditMessage ? userProfile.screenshot : null);

    const controller = new AbortController();
    abortControllerRef.current = controller;
    if (options?.signal) {
      options.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    try {
      const result = await callHavenAPI({
        systemPrompt, messages: allMessages,
        screenshot: screenshotToSend, scope: activeScope, signal: controller.signal,
      });

      const { navChips: navChipsFromTag, cleanedText } = parseNavChipsFromText(result.text);

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

      const agentExtraProps = {};
      if (specialChips.length > 0) {
        agentExtraProps.chips = specialChips;
      } else if (regularChips.length > 0) {
        agentExtraProps.chips = regularChips;
      }
      if (navChipObjects.length > 0) agentExtraProps.navChips = navChipObjects;

      addMessage('agent', cleanedText, null, agentExtraProps);

    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('Haven: Response cancelled');
      } else {
        console.error('Haven: API error', err);
        const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
        addMessage('agent', isOffline
          ? "Looks like your connection dropped. Once you're back online, send that again — I've kept your spot."
          : "I'm having trouble reaching the server right now. Give it a moment and try again — I'm still here."
        );
      }
    } finally {
      setIsThinking(false);
      abortControllerRef.current = null;
    }
  }, [activeScope, activeSessionId, currentSession, getSessionsForScope, createSession, addMessage, userProfile, activeService]);

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

  const getSavedReviewFormData = useCallback(() => {
    return {
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
    };
  }, [userProfile]);

  const clearExistingReview = useCallback(() => {
    setAuditSessions([]);
    setUserProfile(prev => ({
      ...DEFAULT_USER_PROFILE,
      name:     prev.name,
      email:    prev.email,
      whatsapp: prev.whatsapp,
    }));
    setActiveScope('support');
    setActiveSessionId('session-default');
    setViewState('landing');
  }, []);

  const value = {
    isOpen, mode, setMode, toggleDrawer, openDrawer, closeDrawer,
    activeScope, activeService, viewState,
    sessions, activeSessionId, currentSession, messages,
    createNewSession, switchSession, togglePinSession, deleteSession, clearChat,
    addMessage, sendMessage, sendNavChipIntent, isThinking, setIsThinking, stopResponse,
    userProfile, updateUserProfile,
    bookingNoticeOpen, setBookingNoticeOpen,
    showToast, toastMessage, triggerToast,
    activeMenuSessionId, setActiveMenuSessionId,
    hasExistingReview, getSavedReviewFormData, clearExistingReview,
  };

  return <HavenContext.Provider value={value}>{children}</HavenContext.Provider>;
}

export function useHaven() {
  const ctx = useContext(HavenContext);
  if (!ctx) throw new Error('useHaven must be used within a HavenProvider');
  return ctx;
}