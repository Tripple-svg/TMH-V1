import React, { useRef, useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Minimize2, Maximize2, Zap, Target, BarChart3 } from 'lucide-react';
import { useHaven } from '../hooks/useHaven';
import ChatMessage from './chat/ChatMessage';
import ChatInput from './chat/ChatInput';

const LOGO_SRC = "/Tmhh.jpeg";

/* ─────────────────────────── Inline Thinking ─────────────────────────── */

function InlineThinking() {
  const [imgError, setImgError] = useState(false);
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="flex items-center gap-2.5"
    >
      <div className="flex items-center justify-center w-7 h-7 rounded-full overflow-hidden border border-zinc-700/50 bg-zinc-900 flex-shrink-0">
        {imgError ? (
          <Sparkles className="w-3.5 h-3.5 text-violet-400" />
        ) : (
          <img src={LOGO_SRC} alt="TMH" className="w-full h-full object-cover" onError={() => setImgError(true)} />
        )}
      </div>
      <div className="flex items-center gap-1 px-3 py-2 rounded-xl rounded-tl-sm bg-slate-800/50 border border-white/[0.04] backdrop-blur-sm">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '120ms' }} />
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '240ms' }} />
      </div>
    </motion.div>
  );
}

/* ─────────────────────────── Inline Quick Prompts ─────────────────────────── */

const InlineQuickPrompts = React.memo(function InlineQuickPrompts({ onSelect, hide }) {
  const [imgError, setImgError] = useState(false);

  const prompts = [
    { title: 'Funnel Breakdown', desc: 'Audit conversion points', icon: Target },
    { title: 'Ad Strategy', desc: 'Campaign launch ideas', icon: Zap },
    { title: 'Content Ideas', desc: 'Engaging post concepts', icon: Sparkles },
    { title: 'Conversion Review', desc: 'Sales bottlenecks', icon: BarChart3 },
  ];

  if (hide) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col items-center justify-center py-6 space-y-5"
    >
      <div className="flex flex-col items-center space-y-2">
        <div className="relative">
          <div className="absolute inset-0 rounded-xl bg-violet-500/15 blur-lg" />
          <div className="relative inline-flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-violet-600/15 to-fuchsia-600/15 border border-violet-500/15 overflow-hidden">
            {imgError ? (
              <Sparkles className="w-5 h-5 text-violet-300" />
            ) : (
              <img src={LOGO_SRC} alt="Haven" className="w-full h-full object-cover" onError={() => setImgError(true)} />
            )}
          </div>
        </div>
        <h4 className="text-sm font-semibold text-slate-100">Ask Haven</h4>
        <p className="text-[11px] text-slate-500">Pick a topic or type below</p>
      </div>

      <div className="grid grid-cols-2 gap-2 w-full">
        {prompts.map((p, idx) => {
          const Icon = p.icon;
          return (
            <motion.button
              key={idx}
              whileTap={{ scale: 0.97 }}
              onClick={() => onSelect(p.desc)}
              className="group flex flex-col items-start p-2.5 text-left rounded-lg bg-slate-900/50 border border-white/[0.04] hover:border-violet-500/20 hover:bg-slate-800/50 transition-all cursor-pointer"
            >
              <Icon className="w-3.5 h-3.5 text-violet-400 mb-1.5 group-hover:scale-110 transition-transform" />
              <span className="text-[11px] font-medium text-slate-300 line-clamp-1">{p.title}</span>
              <span className="text-[9px] text-slate-500 line-clamp-1 mt-0.5">{p.desc}</span>
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
});

/* ─────────────────────────── Main Inline Modal ─────────────────────────── */

/**
 * HavenInlineModal - used for contextual, anchored Haven pop-ups
 * (e.g. triggered from a specific page section rather than the main
 * support drawer). Uses the SAME HavenContext session system as
 * HavenDrawer - it does not manage its own separate message state,
 * so whatever scope/session is active in context is what renders here.
 */
export default function HavenInlineModal({
  isOpen,
  onClose,
  anchor = 'bottom-right',
  width = 380,
  height = 520,
  title = 'Haven',
  subtitle = 'AI Marketing Assistant',
  showQuickPrompts = true,
  className = '',
}) {
  const {
    messages = [],
    sendMessage,
    isThinking,
    userProfile = {},
    stopResponse,
  } = useHaven();

  const [isExpanded, setIsExpanded] = useState(false);
  const [inputHasContent, setInputHasContent] = useState(false);

  const scrollRef = useRef(null);
  const endRef = useRef(null);
  const containerRef = useRef(null);

  /* ── Scroll to bottom ── */
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  /* ── Click outside to close ── */
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        onClose?.();
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, onClose]);

  /**
   * BUG FIX (Bug B pattern, same as ServiceGrid): lock body scroll while
   * this inline modal is open, EXCEPT when anchored (bottom-right etc.)
   * rather than centered - anchored popovers shouldn't necessarily block
   * page scroll the way a full centered modal should. Only lock for
   * 'center' anchor, which behaves like a true modal.
   */
  useEffect(() => {
    if (anchor === 'center') {
      document.body.style.overflow = isOpen ? 'hidden' : '';
      return () => { document.body.style.overflow = ''; };
    }
  }, [isOpen, anchor]);

  const handleSend = useCallback((text, image) => {
    sendMessage(text, image);
  }, [sendMessage]);

  const handleQuickPrompt = useCallback((text) => {
    if (text) sendMessage(text);
  }, [sendMessage]);

  const positionClasses = {
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4',
    'center': 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
  };
  const anchorClass = positionClasses[anchor] || positionClasses['bottom-right'];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {anchor === 'center' && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[55] bg-black/50"
              onClick={onClose}
            />
          )}

          <motion.div
            ref={containerRef}
            initial={{ opacity: 0, scale: 0.9, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 16 }}
            transition={{ type: 'spring', stiffness: 350, damping: 28 }}
            className={`fixed z-[56] ${anchorClass} ${className}`}
            style={{
              width: isExpanded ? Math.min(width * 1.15, 520) : width,
              height: isExpanded ? Math.min(height * 1.15, 680) : height,
              maxWidth: 'calc(100vw - 2rem)',
              maxHeight: 'calc(100vh - 2rem)',
            }}
          >
            <div className="w-full h-full flex flex-col rounded-2xl bg-slate-950/[0.97] border border-white/[0.07] shadow-2xl shadow-black/70 backdrop-blur-xl overflow-hidden">
              {/* ── Header ── */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05] bg-slate-900/60 backdrop-blur-xl flex-shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="relative flex items-center justify-center w-8 h-8 rounded-lg overflow-hidden border border-zinc-700/50 bg-zinc-900">
                    <img src={LOGO_SRC} alt="TMH" className="w-full h-full object-cover" />
                    <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-slate-950 border border-emerald-500/40 flex items-center justify-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    </div>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-slate-100 tracking-tight">{title}</span>
                    <span className="text-[10px] text-slate-500">{subtitle}</span>
                  </div>
                </div>

                <div className="flex items-center gap-0.5">
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setIsExpanded((p) => !p)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/[0.05] transition-colors cursor-pointer"
                    title={isExpanded ? 'Collapse' : 'Expand'}
                  >
                    {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={onClose}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/[0.05] transition-colors cursor-pointer"
                    aria-label="Close"
                  >
                    <X className="w-4 h-4" />
                  </motion.button>
                </div>
              </div>

              {/* ── Profile Chip ── */}
              <AnimatePresence>
                {(userProfile.name || userProfile.businessDomain || userProfile.auditScore != null) && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="px-4 py-2 bg-slate-900/40 border-b border-white/[0.04] flex items-center gap-2 flex-wrap overflow-hidden"
                  >
                    {userProfile.name && (
                      <span className="px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] text-[10px] text-slate-400">
                        {userProfile.name}
                      </span>
                    )}
                    {userProfile.businessDomain && (
                      <span className="px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] text-[10px] text-slate-400">
                        {userProfile.businessDomain}
                      </span>
                    )}
                    {userProfile.auditScore != null && (
                      <span className={`px-1.5 py-0.5 rounded border text-[10px] font-medium ${
                        userProfile.auditScore >= 80 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                        : userProfile.auditScore >= 50 ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                        : 'bg-red-500/10 border-red-500/20 text-red-400'
                      }`}>
                        Score: {userProfile.auditScore}
                      </span>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── Messages ── */}
              <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-4"
              >
                {messages.length === 0 && showQuickPrompts ? (
                  <InlineQuickPrompts onSelect={handleQuickPrompt} hide={inputHasContent} />
                ) : (
                  messages.map((message, index) => (
                    <ChatMessage
                      key={message.id || index}
                      message={message}
                      size="compact"
                      shouldAnimateGreeting={index === 0 && message.role === 'agent'}
                    />
                  ))
                )}
                {isThinking && <InlineThinking />}
                <div ref={endRef} />
              </div>

              {/* ── Input ── */}
              <div className="px-3.5 py-3 border-t border-white/[0.05] bg-slate-900/60 backdrop-blur-xl flex-shrink-0">
                <ChatInput
                  onSend={handleSend}
                  onStop={stopResponse}
                  isThinking={isThinking}
                  size="compact"
                  onTypingChange={setInputHasContent}
                />
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}