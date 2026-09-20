// src/components/haven/components/HavenDrawer.jsx
// VERSION 3.8 — scroll-to-bottom on open; no more jumping to top.

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Menu, Plus, MoreVertical, Pin, MessageSquare, Sparkles,
  BarChart3, Target, Zap, Trash2, RotateCcw, Settings, Circle, ExternalLink,
} from 'lucide-react';
import { useHaven } from '../hooks/useHaven';
import ActionModals from './ActionModals';
import ChatMessage from './chat/ChatMessage';
import ChatInput from './chat/ChatInput';

const LOGO_SRC = '/Tmhh.jpeg';
const CALENDLY_URL = 'https://calendly.com/themarketinghaven01/30min';
const TIKTOK_URL = 'https://www.tiktok.com/@the_marketing_haven?_r=1&_t=ZS-99cNCs01SWj';
const FRESH_MS = 3000;

function isFreshMessage(msg) {
  return msg?.role === 'agent' && Date.now() - (msg.timestamp || 0) < FRESH_MS;
}

function getScopeLabel(scope, service) {
  if (scope === 'audit') return 'Brand Review';
  if (scope === 'service') return service?.title || 'Service Enquiry';
  return 'Customer Support';
}

function ThinkingIndicator() {
  const [err, setErr] = useState(false);
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
      className="flex items-center gap-3">
      <div className="w-8 h-8 rounded-full overflow-hidden border border-zinc-700/50 bg-zinc-900 flex-shrink-0 flex items-center justify-center">
        {err ? <Sparkles className="w-4 h-4 text-violet-400" />
          : <img src={LOGO_SRC} alt="Haven" className="w-full h-full object-cover" onError={() => setErr(true)} />}
      </div>
      <div className="flex items-center gap-1.5 px-4 py-3 rounded-2xl rounded-tl-sm bg-slate-800/60 border border-white/5">
        {[0, 150, 300].map(d => (
          <span key={d} className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />
        ))}
      </div>
    </motion.div>
  );
}

const QuickPromptCards = React.memo(function QuickPromptCards({ onSelectPrompt }) {
  const [err, setErr] = useState(false);
  const prompts = [
    { title: 'Funnel Breakdown', desc: 'Audit landing page conversion points', icon: Target },
    { title: 'Ad Strategy', desc: 'Draft simple campaign launch ideas', icon: Zap },
    { title: 'Content Ideas', desc: 'Build engaging post concepts', icon: Sparkles },
    { title: 'Conversion Review', desc: 'Identify bottlenecks in sales channels', icon: BarChart3 },
  ];
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="flex flex-col items-center justify-center min-h-[75%] text-center px-2 py-6 space-y-8">
      <div className="flex flex-col items-center space-y-4">
        <div className="w-16 h-16 rounded-2xl overflow-hidden border border-white/10">
          {err ? <div className="w-full h-full flex items-center justify-center bg-slate-800"><Sparkles className="w-8 h-8 text-slate-400" /></div>
            : <img src={LOGO_SRC} alt="Haven" className="w-full h-full object-cover" onError={() => setErr(true)} />}
        </div>
        <div className="space-y-1.5">
          <h3 className="text-xl font-semibold text-slate-100">What can Haven help you with today?</h3>
          <p className="text-sm text-slate-400 max-w-xs leading-relaxed">Select a prompt below or type your question directly.</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
        {prompts.map((p, i) => {
          const Icon = p.icon;
          return (
            <motion.button key={i} whileHover={{ scale: 1.02, y: -2 }} whileTap={{ scale: 0.98 }}
              onClick={() => onSelectPrompt(p.desc)}
              className="group flex flex-col items-start p-4 text-left rounded-xl bg-slate-900/60 border border-white/[0.06] hover:border-violet-500/30 hover:bg-slate-800/60 transition-all cursor-pointer">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-violet-500/10 border border-violet-500/15 mb-3">
                <Icon className="w-4 h-4 text-violet-400" />
              </div>
              <span className="text-sm font-medium text-slate-200 line-clamp-1">{p.title}</span>
              <span className="text-xs text-slate-500 line-clamp-2 mt-1">{p.desc}</span>
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
});

function BookingModal({ isOpen, onClose }) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
          <motion.div initial={{ opacity: 0, scale: 0.92, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 8 }}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-slate-950 border border-white/[0.08] shadow-2xl p-6 text-center space-y-4">
            <div className="w-12 h-12 mx-auto rounded-xl overflow-hidden border border-white/10">
              <img src={LOGO_SRC} alt="TMH" className="w-full h-full object-cover" />
            </div>
            <h3 className="text-base font-semibold text-slate-100">Book Your Free Strategy Call</h3>
            <p className="text-sm text-slate-400 leading-relaxed">Pick a time that works. We're available Monday–Friday, 5–8 PM WAT.</p>
            <a href={CALENDLY_URL} target="_blank" rel="noopener noreferrer" onClick={onClose}
              className="flex items-center justify-center gap-2 w-full px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-all">
              <span>Choose a Time</span><ExternalLink className="w-4 h-4" />
            </a>
            <p className="text-xs text-slate-500">You'll receive a confirmation email after booking.</p>
            <button onClick={onClose}
              className="w-full px-4 py-2 rounded-xl text-sm text-slate-400 bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] transition-all cursor-pointer">
              Not right now
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function HavenDrawer() {
  const {
    isOpen, closeDrawer, activeScope, activeService, viewState,
    sessions = [], activeSessionId, currentSession, messages = [],
    createNewSession, switchSession, togglePinSession, deleteSession,
    sendMessage, sendNavChipIntent, isThinking, userProfile = {},
    showToast, toastMessage, clearChat, stopResponse,
    bookingNoticeOpen, setBookingNoticeOpen,
  } = useHaven();

  const [showHistorySidebar, setShowHistorySidebar] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [modalType, setModalType] = useState(null);
  const [showBookingModal, setShowBookingModal] = useState(false);

  const scrollRef     = useRef(null);
  const endRef        = useRef(null);
  const menuRef       = useRef(null);
  const optsBtnRef    = useRef(null);
  const chatInputRef  = useRef(null);

  const isSupportScope = activeScope === 'support';
  const scopeLabel     = getScopeLabel(activeScope, activeService);

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // ── FIX: Open at bottom, not top ──
  // On drawer open or session switch, jump instantly to the newest message
  // so the user lands where they left off, not at the start of history.
  useEffect(() => {
    if (!isOpen) return;
    // rAF ensures the drawer's slide-in animation hasn't left the scroll
    // container in a stale measurement state during the same paint cycle.
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    });
  }, [isOpen, activeSessionId]);

  // Auto-scroll to bottom on new messages (unchanged)
  useEffect(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    if (scrollHeight - scrollTop - clientHeight < 150) {
      requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }));
    }
  }, [messages, isThinking]);

  useEffect(() => {
    if (!showOptionsMenu) return;
    const h = e => {
      if (menuRef.current && !menuRef.current.contains(e.target) &&
          optsBtnRef.current && !optsBtnRef.current.contains(e.target))
        setShowOptionsMenu(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [showOptionsMenu]);

  useEffect(() => {
    if (!showHistorySidebar) return;
    const h = e => {
      const s = document.getElementById('haven-history-sidebar');
      const b = document.getElementById('haven-menu-btn');
      if (s && !s.contains(e.target) && b && !b.contains(e.target)) setShowHistorySidebar(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [showHistorySidebar]);

  const handleChipSelect = useCallback((text) => {
    if (text === '__BOOK_CALL__') { setShowBookingModal(true); return; }

    if (text === '__PLAYBOOK__') {
      closeDrawer();
      setTimeout(() => {
        document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('open-playbook-modal'));
        }, 400);
      }, 200);
      return;
    }

    if (text === '__TIKTOK_CONTENT__') {
      window.open(TIKTOK_URL, '_blank', 'noopener,noreferrer');
      return;
    }

    sendMessage(text);
  }, [sendMessage, closeDrawer]);

  const handleNavChipSelect = useCallback((navChip) => {
    if (!navChip || !navChip.text) return;
    sendNavChipIntent(navChip.text);

    if (navChip.action === 'upload') {
      chatInputRef.current?.openFilePicker();
    } else if (navChip.action === 'link') {
      chatInputRef.current?.focus('Paste your website link here…');
    } else {
      chatInputRef.current?.focus();
    }
  }, [sendNavChipIntent]);

  const handleQuickPrompt = useCallback(t => { if (t) sendMessage(t); }, [sendMessage]);
  const handleSend = useCallback((t, img) => sendMessage(t, img), [sendMessage]);

  const pinned   = sessions.filter(s => s.isPinned);
  const unpinned = sessions.filter(s => !s.isPinned);

  const SessionBtn = ({ s }) => (
    <motion.button whileTap={{ scale: 0.98 }}
      onClick={() => { switchSession(s.id, 'support'); setShowHistorySidebar(false); }}
      className={`w-full text-left p-2.5 rounded-xl text-xs flex items-center gap-2.5 cursor-pointer transition-colors ${
        s.id === activeSessionId
          ? 'bg-violet-600/15 border border-violet-500/25 text-white font-medium'
          : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
      }`}>
      <MessageSquare className={`w-3.5 h-3.5 flex-shrink-0 ${s.id === activeSessionId ? 'text-violet-400' : 'text-slate-500'}`} />
      <span className="truncate flex-1">{s.title}</span>
    </motion.button>
  );

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={() => { setShowHistorySidebar(false); setShowOptionsMenu(false); closeDrawer(); }}
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" />

            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="fixed top-0 right-0 z-50 h-full w-full max-w-md flex flex-col bg-slate-950/[0.96] backdrop-blur-xl border-l border-white/[0.06] shadow-2xl overflow-hidden">

              <AnimatePresence>
                {showToast && (
                  <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                    className="absolute top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-1.5 rounded-full bg-violet-600/90 border border-violet-400/30 text-white text-xs font-medium shadow-lg flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-violet-200" /><span>{toastMessage}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="relative flex items-center justify-between px-4 py-3.5 border-b border-white/[0.05] bg-slate-900/60 z-20">
                <div className="flex items-center gap-2.5">
                  {isSupportScope && (
                    <motion.button whileTap={{ scale: 0.92 }} id="haven-menu-btn"
                      onClick={() => setShowHistorySidebar(p => !p)}
                      className="p-2 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-white/[0.05] transition-colors cursor-pointer">
                      <Menu className="w-5 h-5" />
                    </motion.button>
                  )}
                  <div className="flex items-center gap-2.5">
                    <div className="relative w-9 h-9 rounded-xl overflow-hidden border border-zinc-700/50 bg-zinc-900">
                      <img src={LOGO_SRC} alt="Haven" className="w-full h-full object-cover" />
                      <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-slate-950 border border-emerald-500/40 flex items-center justify-center">
                        <Circle className="w-2 h-2 text-emerald-400 fill-emerald-400" />
                      </div>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-slate-100">Haven</span>
                      <div className="flex items-center gap-1.5">
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                        </span>
                        <span className="text-[10px] text-emerald-400 font-medium">{scopeLabel}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-0.5">
                  {isSupportScope && (
                    <>
                      <motion.button whileTap={{ scale: 0.92 }}
                        onClick={() => { createNewSession(); setShowHistorySidebar(false); }}
                        className="p-2 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-white/[0.05] transition-colors cursor-pointer">
                        <Plus className="w-5 h-5" />
                      </motion.button>
                      <div className="relative">
                        <motion.button ref={optsBtnRef} whileTap={{ scale: 0.92 }}
                          onClick={() => setShowOptionsMenu(p => !p)}
                          className="p-2 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-white/[0.05] transition-colors cursor-pointer">
                          <MoreVertical className="w-4 h-4" />
                        </motion.button>
                        <AnimatePresence>
                          {showOptionsMenu && (
                            <motion.div ref={menuRef}
                              initial={{ opacity: 0, scale: 0.95, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.95, y: -4 }} transition={{ duration: 0.15 }}
                              className="absolute right-0 mt-2 w-52 rounded-xl bg-slate-900/95 border border-white/[0.08] shadow-2xl py-1 z-50 text-xs overflow-hidden">
                              <button onClick={() => { togglePinSession(activeSessionId); setShowOptionsMenu(false); }}
                                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-slate-300 hover:bg-white/[0.04] text-left cursor-pointer">
                                <Pin className="w-3.5 h-3.5 text-violet-400" />{currentSession?.isPinned ? 'Unpin Chat' : 'Pin Chat'}
                              </button>
                              <button onClick={() => { setModalType('clear_confirm'); setShowOptionsMenu(false); }}
                                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-slate-300 hover:bg-white/[0.04] text-left cursor-pointer">
                                <RotateCcw className="w-3.5 h-3.5 text-amber-400" />Clear Chat Messages
                              </button>
                              <button onClick={() => { setModalType('settings'); setShowOptionsMenu(false); }}
                                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-slate-300 hover:bg-white/[0.04] text-left cursor-pointer">
                                <Settings className="w-3.5 h-3.5 text-blue-400" />Session Info & Settings
                              </button>
                              <div className="my-1 border-t border-white/[0.05]" />
                              <button onClick={() => { setModalType('delete_confirm'); setShowOptionsMenu(false); }}
                                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-red-400 hover:bg-red-500/[0.08] text-left cursor-pointer">
                                <Trash2 className="w-3.5 h-3.5" />Delete Chat Session
                              </button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </>
                  )}
                  <motion.button whileTap={{ scale: 0.92 }}
                    onClick={() => { setShowHistorySidebar(false); setShowOptionsMenu(false); closeDrawer(); }}
                    className="p-2 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-white/[0.05] transition-colors cursor-pointer">
                    <X className="w-5 h-5" />
                  </motion.button>
                </div>
              </div>

              <AnimatePresence>
                {(userProfile.name || userProfile.businessDomain || userProfile.auditScore != null) && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                    className="px-5 py-2.5 bg-slate-900/40 border-b border-white/[0.04] flex items-center gap-2 flex-wrap overflow-hidden">
                    {userProfile.name && <span className="text-[11px] px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06] text-slate-300">{userProfile.name}</span>}
                    {userProfile.businessDomain && <span className="text-[11px] px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06] text-slate-300">{userProfile.businessDomain}</span>}
                    {userProfile.auditScore != null && (
                      <span className={`text-[11px] px-2 py-0.5 rounded-md border font-medium ${
                        userProfile.auditScore >= 80 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                        : userProfile.auditScore >= 50 ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                        : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
                        Score: {userProfile.auditScore}
                      </span>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {showHistorySidebar && isSupportScope && (
                  <>
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      onClick={() => setShowHistorySidebar(false)}
                      className="absolute inset-0 z-30 bg-black/40" />
                    <motion.div id="haven-history-sidebar"
                      initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
                      transition={{ type: 'spring', stiffness: 350, damping: 32 }}
                      className="absolute top-[3.25rem] left-0 bottom-0 w-3/4 max-w-[280px] z-40 bg-slate-900/[0.97] border-r border-white/[0.06] p-4 flex flex-col space-y-4 shadow-2xl">
                      <div className="flex items-center justify-between pb-2 border-b border-white/[0.05]">
                        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Chat History</span>
                        <motion.button whileTap={{ scale: 0.95 }}
                          onClick={() => { createNewSession(); setShowHistorySidebar(false); }}
                          className="p-1.5 rounded-lg bg-violet-600/20 text-violet-300 hover:bg-violet-600/35 text-[11px] font-medium flex items-center gap-1 px-2.5 cursor-pointer">
                          <Plus className="w-3 h-3" /> New
                        </motion.button>
                      </div>
                      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                        {pinned.length > 0 && (
                          <div className="space-y-1">
                            <span className="text-[10px] font-medium text-slate-500 flex items-center gap-1 uppercase tracking-wider"><Pin className="w-2.5 h-2.5" /> Pinned</span>
                            {pinned.map(s => <SessionBtn key={s.id} s={s} />)}
                          </div>
                        )}
                        <div className="space-y-1">
                          <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Recent Chats</span>
                          {unpinned.length === 0 && pinned.length === 0
                            ? <p className="text-xs text-slate-500 py-2 italic">No recent chats.</p>
                            : unpinned.map(s => <SessionBtn key={s.id} s={s} />)
                          }
                        </div>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>

              <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain px-5 py-5 space-y-5">
                {viewState === 'landing'
                  ? <QuickPromptCards onSelectPrompt={handleQuickPrompt} />
                  : messages.map((msg, idx) => (
                    <ChatMessage
                      key={msg.id || idx}
                      message={msg}
                      size="full"
                      shouldAnimateGreeting={isFreshMessage(msg)}
                      shouldShowChips={idx === messages.length - 1}
                      onChipSelect={handleChipSelect}
                      onNavChipSelect={handleNavChipSelect}
                    />
                  ))
                }
                {isThinking && <ThinkingIndicator />}
                <div ref={endRef} />
              </div>

              <div className="px-4 py-4 border-t border-white/[0.05] bg-slate-900/60">
                <ChatInput
                  ref={chatInputRef}
                  onSend={handleSend}
                  onStop={stopResponse}
                  isThinking={isThinking}
                  size="full"
                />
                <p className="mt-2.5 text-center text-[10px] text-slate-600 tracking-wide">
                  Powered by The Marketing Haven · AI responses may vary
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <ActionModals modalType={modalType} onClose={() => setModalType(null)}
        onConfirm={() => {
          if (modalType === 'delete_confirm') deleteSession(activeSessionId);
          if (modalType === 'clear_confirm') clearChat();
          setModalType(null);
        }}
        currentSession={currentSession} userProfile={userProfile}
      />

      <BookingModal
        isOpen={showBookingModal || bookingNoticeOpen}
        onClose={() => { setShowBookingModal(false); setBookingNoticeOpen(false); }}
      />
    </>
  );
}