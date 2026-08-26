import React, { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Send,
  User,
  Loader2,
  Trash2,
  Circle,
  Menu,
  Plus,
  MoreVertical,
  Pin,
  MessageSquare,
  Sparkles,
  BarChart3,
  Target,
  Zap,
  Paperclip,
  Image as ImageIcon,
} from 'lucide-react';
import { useHaven } from './HavenContext';

function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const LOGO_SRC = "/Tmhh.jpeg";

function AnimatedText({ text }) {
  const words = text.split(" ");

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05,
      },
    },
  };

  const wordVariants = {
    hidden: { opacity: 0, y: 4, filter: 'blur(4px)' },
    visible: {
      opacity: 1,
      y: 0,
      filter: 'blur(0px)',
      transition: { duration: 0.2, ease: 'easeOut' },
    },
  };

  return (
    <motion.span
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="inline-block"
    >
      {words.map((word, i) => (
        <motion.span
          key={`${word}-${i}`}
          variants={wordVariants}
          className="inline-block mr-1"
        >
          {word}
        </motion.span>
      ))}
    </motion.span>
  );
}

function MessageBubble({ message, isFirstMessage, shouldAnimateGreeting }) {
  const isUser = message.role === 'user';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 350, damping: 28 }}
      className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`flex max-w-[85%] gap-3 ${
          isUser ? 'flex-row-reverse' : 'flex-row'
        }`}
      >
        <div
          className={`flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full border overflow-hidden ${
            isUser
              ? 'bg-violet-500/20 border-violet-500/30'
              : 'bg-zinc-900 border-zinc-700/50'
          }`}
        >
          {isUser ? (
            <User className="w-4 h-4 text-violet-300" />
          ) : (
            <img
              src={LOGO_SRC}
              alt="TMH Logo"
              className="w-full h-full object-cover"
              onError={(e) => {
                e.target.style.display = 'none';
              }}
            />
          )}
        </div>

        <div className="flex flex-col gap-1">
          <div
            className={`px-4 py-3 rounded-2xl text-sm leading-relaxed backdrop-blur-sm border ${
              isUser
                ? 'bg-violet-600/20 border-violet-500/20 text-slate-100 rounded-tr-sm'
                : 'bg-slate-800/60 border-white/5 text-slate-300 rounded-tl-sm'
            }`}
          >
            {message.attachment && (
              <div className="mb-2 overflow-hidden rounded-lg border border-white/10 max-w-[200px]">
                <img
                  src={message.attachment}
                  alt="User attachment"
                  className="w-full h-auto object-cover"
                />
              </div>
            )}
            {isFirstMessage && !isUser && shouldAnimateGreeting ? (
              <AnimatedText text={message.content} />
            ) : (
              message.content
            )}
          </div>
          <span
            className={`text-[10px] text-slate-500 ${
              isUser ? 'text-right mr-1' : 'ml-1'
            }`}
          >
            {formatTime(message.timestamp)}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

function ThinkingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      className="flex items-center gap-3"
    >
      <div className="flex items-center justify-center w-8 h-8 rounded-full overflow-hidden border border-zinc-700/50 bg-zinc-900 flex-shrink-0">
        <img
          src={LOGO_SRC}
          alt="TMH Logo"
          className="w-full h-full object-cover"
          onError={(e) => {
            e.target.style.display = 'none';
          }}
        />
      </div>

      <div className="flex items-center gap-1.5 px-4 py-3 rounded-2xl rounded-tl-sm bg-slate-800/60 border border-white/5 backdrop-blur-sm">
        <span
          className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce"
          style={{ animationDelay: '0ms' }}
        />
        <span
          className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce"
          style={{ animationDelay: '150ms' }}
        />
        <span
          className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce"
          style={{ animationDelay: '300ms' }}
        />
      </div>
    </motion.div>
  );
}

function QuickPromptCards({ onSelectPrompt }) {
  const prompts = [
    {
      title: 'Funnel Breakdown',
      desc: 'Audit landing page conversion points',
      icon: Target,
    },
    {
      title: 'Ad Strategy',
      desc: 'Draft simple campaign launch ideas',
      icon: Zap,
    },
    {
      title: 'Content Ideas',
      desc: 'Build engaging post concepts',
      icon: Sparkles,
    },
    {
      title: 'Conversion Review',
      desc: 'Identify bottlenecks in sales channels',
      icon: BarChart3,
    },
  ];

  return (
    <div className="flex flex-col items-center justify-center min-h-[70%] text-center px-2 py-6 space-y-6">
      <div className="space-y-2">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-violet-600/10 border border-violet-500/20 text-violet-400 mb-1">
          <Sparkles className="w-6 h-6" />
        </div>
        <h3 className="text-base font-medium text-slate-100">
          What can Haven help you with today?
        </h3>
        <p className="text-xs text-slate-400 max-w-xs">
          Select a prompt below or type your question directly.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2.5 w-full">
        {prompts.map((p, idx) => {
          const Icon = p.icon;
          return (
            <button
              key={idx}
              onClick={() => onSelectPrompt(p.desc)}
              className="flex flex-col items-start p-3 text-left rounded-xl bg-slate-900/60 border border-white/5 hover:border-violet-500/30 hover:bg-slate-800/60 transition-all group cursor-pointer"
            >
              <Icon className="w-4 h-4 text-violet-400 mb-2 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-medium text-slate-200 line-clamp-1">
                {p.title}
              </span>
              <span className="text-[10px] text-slate-500 line-clamp-2 mt-0.5">
                {p.desc}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function HavenDrawer() {
  const {
    isOpen,
    mode,
    closeDrawer,
    sessions,
    activeSessionId,
    currentSession,
    messages,
    createNewSession,
    switchSession,
    togglePinSession,
    deleteSession,
    sendMessage,
    isThinking,
    userProfile,
    showToast,
    toastMessage,
  } = useHaven();

  const [inputValue, setInputValue] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [showHistorySidebar, setShowHistorySidebar] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);

  // Typing state logic for initial greeting
  const [isTypingInitialGreeting, setIsTypingInitialGreeting] = useState(false);
  const [hasAnimatedGreeting, setHasAnimatedGreeting] = useState(() => {
    return sessionStorage.getItem('haven_greeting_animated') === 'true';
  });

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Initial typing animation on default session open
  useEffect(() => {
    if (isOpen && !hasAnimatedGreeting && messages.length === 1 && currentSession?.id === 'session-default') {
      setIsTypingInitialGreeting(true);
      const timer = setTimeout(() => {
        setIsTypingInitialGreeting(false);
        setHasAnimatedGreeting(true);
        sessionStorage.setItem('haven_greeting_animated', 'true');
      }, 900);

      return () => clearTimeout(timer);
    } else if (isOpen) {
      setIsTypingInitialGreeting(false);
    }
  }, [isOpen, hasAnimatedGreeting, messages.length, currentSession]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isThinking, isTypingInitialGreeting]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    if ((!inputValue.trim() && !selectedImage) || isThinking || isTypingInitialGreeting) return;
    sendMessage(inputValue, selectedImage);
    setInputValue('');
    setSelectedImage(null);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleQuickPrompt = (promptText) => {
    sendMessage(promptText);
  };

  const pinnedSessions = sessions.filter((s) => s.isPinned);
  const unpinnedSessions = sessions.filter((s) => !s.isPinned);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => {
              setShowHistorySidebar(false);
              closeDrawer();
            }}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          />

          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed top-0 right-0 z-50 h-full w-full max-w-md flex flex-col bg-slate-950/95 backdrop-blur-md border-l border-white/10 shadow-2xl shadow-black/50 overflow-hidden"
          >
            <AnimatePresence>
              {showToast && (
                <motion.div
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="absolute top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-1.5 rounded-full bg-violet-600/90 border border-violet-400/30 text-white text-xs font-medium shadow-lg backdrop-blur-md flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5 text-violet-200" />
                  <span>{toastMessage}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Header: Replaced 'Haven AI' with 'Haven' */}
            <div className="relative flex items-center justify-between px-4 py-3 border-b border-white/5 bg-slate-900/50 backdrop-blur-xl z-20">
              <div className="flex items-center gap-2">
                {mode === 'support' && (
                  <button
                    onClick={() => setShowHistorySidebar((prev) => !prev)}
                    className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/5 transition-colors cursor-pointer"
                    aria-label="Toggle history sidebar"
                  >
                    <Menu className="w-5 h-5" />
                  </button>
                )}

                <div className="flex items-center gap-2.5">
                  <div className="relative flex items-center justify-center w-8 h-8 rounded-xl overflow-hidden border border-zinc-700/50 bg-zinc-900">
                    <img
                      src={LOGO_SRC}
                      alt="TMH Logo"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center w-3 h-3 rounded-full bg-slate-950 border border-emerald-500/50">
                      <Circle className="w-1.5 h-1.5 text-emerald-400 fill-emerald-400" />
                    </div>
                  </div>

                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-slate-100">
                      Haven
                    </span>
                    <span className="text-[10px] text-emerald-400 font-medium">
                      Online
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {mode === 'support' && (
                  <button
                    onClick={() => {
                      createNewSession();
                      setShowHistorySidebar(false);
                    }}
                    className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/5 transition-colors cursor-pointer"
                    title="New chat"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                )}

                {mode === 'support' && (
                  <div className="relative">
                    <button
                      onClick={() => setShowOptionsMenu((prev) => !prev)}
                      className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/5 transition-colors cursor-pointer"
                      title="Chat Options"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>

                    <AnimatePresence>
                      {showOptionsMenu && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95, y: -5 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95, y: -5 }}
                          className="absolute right-0 mt-2 w-44 rounded-xl bg-slate-900 border border-white/10 shadow-xl py-1 z-50 backdrop-blur-xl text-xs"
                        >
                          <button
                            onClick={() => {
                              togglePinSession(activeSessionId);
                              setShowOptionsMenu(false);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-slate-300 hover:bg-white/5 transition-colors text-left cursor-pointer"
                          >
                            <Pin className="w-3.5 h-3.5 text-violet-400" />
                            <span>
                              {currentSession?.isPinned ? 'Unpin Chat' : 'Pin Chat'}
                            </span>
                          </button>

                          <button
                            onClick={() => {
                              deleteSession(activeSessionId);
                              setShowOptionsMenu(false);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-red-400 hover:bg-red-500/10 transition-colors text-left cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete Chat</span>
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                <button
                  onClick={() => {
                    setShowHistorySidebar(false);
                    closeDrawer();
                  }}
                  className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/5 transition-colors cursor-pointer"
                  aria-label="Close drawer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Profile Summary */}
            {(userProfile.name || userProfile.businessDomain || userProfile.auditScore) && (
              <div className="px-5 py-2 bg-slate-900/30 border-b border-white/5 flex items-center gap-3">
                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                  {userProfile.name && (
                    <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/5">
                      {userProfile.name}
                    </span>
                  )}
                  {userProfile.businessDomain && (
                    <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/5">
                      {userProfile.businessDomain}
                    </span>
                  )}
                  {userProfile.auditScore !== null && (
                    <span
                      className={`px-2 py-0.5 rounded-md border font-medium ${
                        userProfile.auditScore >= 80
                          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                          : userProfile.auditScore >= 50
                          ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                          : 'bg-red-500/10 border-red-500/20 text-red-400'
                      }`}
                    >
                      Score: {userProfile.auditScore}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* History Overlay Sidebar */}
            <AnimatePresence>
              {showHistorySidebar && mode === 'support' && (
                <>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setShowHistorySidebar(false)}
                    className="absolute inset-0 z-30 bg-black/50 backdrop-blur-xs"
                  />
                  <motion.div
                    initial={{ x: '-100%' }}
                    animate={{ x: 0 }}
                    exit={{ x: '-100%' }}
                    transition={{ type: 'spring', stiffness: 350, damping: 32 }}
                    className="absolute top-14 left-0 bottom-0 w-3/4 max-w-[280px] z-40 bg-slate-900/95 border-r border-white/10 p-4 flex flex-col space-y-4 shadow-2xl backdrop-blur-xl"
                  >
                    <div className="flex items-center justify-between pb-2 border-b border-white/5">
                      <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                        Chat History
                      </span>
                      <button
                        onClick={createNewSession}
                        className="p-1 rounded bg-violet-600/20 text-violet-300 hover:bg-violet-600/40 text-[11px] font-medium flex items-center gap-1 px-2 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" /> New
                      </button>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-thin scrollbar-thumb-white/10">
                      {pinnedSessions.length > 0 && (
                        <div className="space-y-1">
                          <span className="text-[10px] font-medium text-slate-500 flex items-center gap-1 uppercase tracking-wider">
                            <Pin className="w-2.5 h-2.5" /> Pinned
                          </span>
                          {pinnedSessions.map((s) => (
                            <button
                              key={s.id}
                              onClick={() => {
                                switchSession(s.id);
                                setShowHistorySidebar(false);
                              }}
                              className={`w-full text-left p-2.5 rounded-xl text-xs flex items-center gap-2.5 transition-colors cursor-pointer ${
                                s.id === activeSessionId
                                  ? 'bg-violet-600/20 border border-violet-500/30 text-white font-medium'
                                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                              }`}
                            >
                              <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 text-violet-400" />
                              <span className="truncate flex-1">{s.title}</span>
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="space-y-1">
                        <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                          Recent Chats
                        </span>
                        {unpinnedSessions.length === 0 && pinnedSessions.length === 0 ? (
                          <p className="text-xs text-slate-500 py-2 italic">
                            No recent chats.
                          </p>
                        ) : (
                          unpinnedSessions.map((s) => (
                            <button
                              key={s.id}
                              onClick={() => {
                                switchSession(s.id);
                                setShowHistorySidebar(false);
                              }}
                              className={`w-full text-left p-2.5 rounded-xl text-xs flex items-center gap-2.5 transition-colors cursor-pointer ${
                                s.id === activeSessionId
                                  ? 'bg-violet-600/20 border border-violet-500/30 text-white font-medium'
                                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                              }`}
                            >
                              <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 text-slate-500" />
                              <span className="truncate flex-1">{s.title}</span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>

            {/* Messages View */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5 space-y-5 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
              {messages.length === 0 ? (
                <QuickPromptCards onSelectPrompt={handleQuickPrompt} />
              ) : (
                <>
                  {isTypingInitialGreeting ? (
                    <ThinkingIndicator />
                  ) : (
                    messages.map((message, index) => (
                      <MessageBubble
                        key={message.id}
                        message={message}
                        isFirstMessage={index === 0}
                        shouldAnimateGreeting={
                          !hasAnimatedGreeting &&
                          messages.length <= 1 &&
                          currentSession?.id === 'session-default'
                        }
                      />
                    ))
                  )}
                </>
              )}

              {isThinking && !isTypingInitialGreeting && <ThinkingIndicator />}

              <div ref={messagesEndRef} />
            </div>

            {/* Input Footer with Image Upload support */}
            <div className="px-4 py-4 border-t border-white/5 bg-slate-900/50 backdrop-blur-xl">
              {/* Selected Image Preview Thumbnail */}
              {selectedImage && (
                <div className="relative inline-block mb-3">
                  <div className="w-16 h-16 rounded-xl overflow-hidden border border-violet-500/40 bg-slate-800">
                    <img
                      src={selectedImage}
                      alt="Upload preview"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <button
                    onClick={() => setSelectedImage(null)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-slate-900 text-slate-400 hover:text-white border border-white/10 flex items-center justify-center cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}

              <form onSubmit={handleSubmit} className="flex items-end gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageSelect}
                  accept="image/*"
                  className="hidden"
                />

                <div className="flex-1 relative flex items-center">
                  <textarea
                    ref={inputRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask Haven anything..."
                    rows={1}
                    className="w-full resize-none rounded-xl bg-slate-800/60 border border-white/10 pl-4 pr-10 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500/30 transition-all scrollbar-none"
                    style={{ minHeight: '44px', maxHeight: '120px' }}
                    disabled={isThinking || isTypingInitialGreeting}
                  />

                  {/* Image attachment icon button */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute right-3 text-slate-400 hover:text-violet-400 transition-colors cursor-pointer"
                    title="Upload image audit asset"
                    disabled={isThinking || isTypingInitialGreeting}
                  >
                    <Paperclip className="w-4 h-4" />
                  </button>
                </div>

                <motion.button
                  whileTap={{ scale: 0.92 }}
                  type="submit"
                  disabled={(!inputValue.trim() && !selectedImage) || isThinking || isTypingInitialGreeting}
                  className="flex items-center justify-center w-11 h-11 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:bg-slate-800 disabled:text-slate-600 text-white shadow-lg shadow-violet-600/20 disabled:shadow-none transition-all cursor-pointer"
                >
                  {isThinking ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Send className="w-5 h-5" />
                  )}
                </motion.button>
              </form>

              <p className="mt-2 text-center text-[10px] text-slate-600">
                Powered by The Marketing Haven · AI responses may vary
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}