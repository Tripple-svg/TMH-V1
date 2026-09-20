// src/components/haven/components/chat/ChatMessage.jsx
import React, { memo, useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { User, Sparkles, Calendar, ArrowRight, BookOpen, Music2 } from 'lucide-react';

const LOGO_SRC = "/Tmhh.jpeg";
const CALENDLY_FALLBACK_URL = "https://calendly.com/themarketinghaven01/30min";

function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function useTypewriter(fullText, shouldAnimate, speed = 15) {
  const [displayedText, setDisplayedText] = useState(shouldAnimate ? '' : fullText);
  const indexRef = useRef(0);

  useEffect(() => {
    if (!shouldAnimate) {
      setDisplayedText(fullText);
      return;
    }

    indexRef.current = 0;
    setDisplayedText('');

    const interval = setInterval(() => {
      indexRef.current += 1;
      setDisplayedText(fullText.slice(0, indexRef.current));

      if (indexRef.current >= fullText.length) {
        clearInterval(interval);
      }
    }, speed);

    return () => clearInterval(interval);
  }, [fullText, shouldAnimate, speed]);

  return displayedText;
}

/**
 * stripTagArtifacts — remove every tag AND every partial/orphan bracket
 * so no fragments ever appear mid-stream or after the fact.
 */
function stripTagArtifacts(text) {
  if (!text) return '';
  let t = text;

  t = t.replace(/\[\[.*?\]\]/gs, '');
  t = t.replace(/\[\[[^\]]*\]/gs, '');
  t = t.replace(/\[\[[^\]]*$/gs, '');
  t = t.replace(/[[\]]/g, '');

  return t.trim();
}

/**
 * renderInlineMarkdown — converts **bold** and *italic* into elements.
 */
function renderInlineMarkdown(text) {
  if (!text) return null;
  const parts = text.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g);
  return parts.map((part, i) => {
    const boldMatch = part.match(/^\*\*([^*\n]+)\*\*$/);
    if (boldMatch) {
      return <strong key={i} className="font-semibold text-slate-100">{boldMatch[1]}</strong>;
    }
    const italicMatch = part.match(/^\*([^*\n]+)\*$/);
    if (italicMatch) {
      return <em key={i} className="italic text-slate-200">{italicMatch[1]}</em>;
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

function NavChipBar({ navChips, onNavChipSelect }) {
  if (!navChips || navChips.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, duration: 0.2 }}
      className="mt-2 flex flex-wrap gap-2 overflow-x-auto pb-1"
    >
      {navChips.map((chip, idx) => (
        <button
          key={`nav-${chip.text}-${idx}`}
          type="button"
          onClick={() => onNavChipSelect?.(chip)}
          className="shrink-0 flex items-center gap-1.5 rounded-full border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-xs text-violet-200 transition hover:border-violet-400 hover:bg-violet-500/20 hover:text-white cursor-pointer"
        >
          <ArrowRight className="w-3 h-3" />
          <span>{chip.text}</span>
        </button>
      ))}
    </motion.div>
  );
}

function ChipBar({ chips, onChipSelect }) {
  if (!chips || chips.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, duration: 0.2 }}
      className="mt-2 flex flex-wrap gap-2 overflow-x-auto pb-1"
    >
      {chips.map((chip, idx) => {
        if (chip === '__BOOK_CALL__') {
          return (
            <button
              key={`bc-${idx}`}
              type="button"
              onClick={() => onChipSelect?.('__BOOK_CALL__')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-all shadow-md shadow-blue-600/20 cursor-pointer"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Book a Strategy Call</span>
            </button>
          );
        }
        if (chip === '__PLAYBOOK__') {
          return (
            <button
              key={`pb-${idx}`}
              type="button"
              onClick={() => onChipSelect?.('__PLAYBOOK__')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-all shadow-md shadow-blue-600/20 cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Get The Unseen Playbook</span>
            </button>
          );
        }
        if (chip === '__TIKTOK_CONTENT__') {
          return (
            <button
              key={`tt-${idx}`}
              type="button"
              onClick={() => onChipSelect?.('__TIKTOK_CONTENT__')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white text-xs font-semibold transition-all shadow-md shadow-pink-600/20 cursor-pointer"
            >
              <Music2 className="w-3.5 h-3.5" />
              <span>Watch on TikTok</span>
            </button>
          );
        }
        return (
          <button
            key={`${chip}-${idx}`}
            type="button"
            onClick={() => onChipSelect?.(chip)}
            className="shrink-0 rounded-full border border-violet-500/30 bg-slate-800/60 px-3 py-1.5 text-xs text-slate-300 transition hover:border-violet-400/60 hover:bg-violet-500/15 hover:text-white cursor-pointer"
          >
            {chip}
          </button>
        );
      })}
    </motion.div>
  );
}

const ChatMessage = memo(function ChatMessage({
  message,
  shouldAnimateGreeting = false,
  size = 'full',
  shouldShowChips = false,
  onChipSelect,
  onNavChipSelect,
}) {
  const isUser = message.role === 'user';
  const [imgError, setImgError] = useState(false);
  const [attachmentLoading, setAttachmentLoading] = useState(Boolean(message.image) && !message.image?.startsWith('data:'));

  const cleanFullText = stripTagArtifacts(message.content || '');
  const displayedText = useTypewriter(cleanFullText, !isUser && shouldAnimateGreeting);

  const rawChips    = message.chips || [];
  const rawNavChips = message.navChips || [];
  const hasBookCallTag = message.content?.includes('[[BOOK_CALL]]');
  const hasPlaybookTag = message.content?.includes('[[PLAYBOOK]]');
  const hasTikTokTag   = message.content?.includes('[[TIKTOK_CONTENT]]');

  let chips = rawChips;
  if (chips.length === 0) {
    if (hasBookCallTag) chips = ['__BOOK_CALL__'];
    else if (hasPlaybookTag) chips = ['__PLAYBOOK__'];
    else if (hasTikTokTag) chips = ['__TIKTOK_CONTENT__'];
  }

  const isCompact      = size === 'compact';
  const avatarSize     = isCompact ? 'w-7 h-7' : 'w-8 h-8';
  const iconSize       = isCompact ? 'w-3.5 h-3.5' : 'w-4 h-4';
  const bubbleTextSize = isCompact ? 'text-xs' : 'text-sm';
  const bubblePadding  = isCompact ? 'px-3 py-2' : 'px-4 py-3';
  const timeTextSize   = isCompact ? 'text-[9px]' : 'text-[10px]';
  const gapSize        = isCompact ? 'gap-2.5' : 'gap-3';

  const showChipRows = !isUser && shouldShowChips && (chips.length > 0 || rawNavChips.length > 0);

  // Only render the bubble when there's actual content. Prevents empty
  // bubbles when the AI returns just a tag (chip-only response).
  const hasBubbleContent = Boolean(displayedText) || Boolean(message.image);

  return (
    <motion.div
      initial={{ opacity: 0, y: isCompact ? 6 : 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: isCompact ? 400 : 350, damping: 28 }}
      className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      <div className={`flex ${isCompact ? 'max-w-[90%]' : 'max-w-[85%]'} ${gapSize} ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        <div
          className={`flex-shrink-0 flex items-center justify-center ${avatarSize} rounded-full border overflow-hidden ${
            isUser ? 'bg-violet-500/20 border-violet-500/30' : 'bg-zinc-900 border-zinc-700/50'
          }`}
        >
          {isUser ? (
            <User className={`${iconSize} text-violet-300`} />
          ) : imgError ? (
            <Sparkles className={`${iconSize} text-violet-400`} />
          ) : (
            <img
              src={LOGO_SRC}
              alt="TMH Logo"
              className="w-full h-full object-cover"
              onError={() => setImgError(true)}
            />
          )}
        </div>

        <div className="flex flex-col gap-1">
          {hasBubbleContent && (
            <div
              className={`${bubblePadding} rounded-2xl ${bubbleTextSize} leading-relaxed backdrop-blur-sm border ${
                isUser
                  ? 'bg-violet-600/20 border-violet-500/20 text-slate-100 rounded-tr-sm'
                  : 'bg-slate-800/60 border-white/5 text-slate-300 rounded-tl-sm'
              }`}
            >
              {message.image && (
                <div className={`mb-2 overflow-hidden rounded-lg border border-white/10 ${isCompact ? 'max-w-[160px]' : 'max-w-[240px]'} relative`}>
                  {attachmentLoading && (
                    <div className="flex items-center justify-center h-24 bg-slate-900/60">
                      <div className="w-5 h-5 border-2 border-violet-400/30 border-t-violet-400 rounded-full animate-spin" />
                    </div>
                  )}
                  <img
                    src={message.image}
                    alt="User Upload"
                    className={`w-full h-auto object-cover ${attachmentLoading ? 'hidden' : 'block'} max-h-[240px]`}
                    onLoad={() => setAttachmentLoading(false)}
                    onError={() => setAttachmentLoading(false)}
                  />
                </div>
              )}
              {displayedText && (
                <span className="whitespace-pre-wrap break-words">
                  {renderInlineMarkdown(displayedText)}
                </span>
              )}
            </div>
          )}

          {showChipRows && (
            <>
              {rawNavChips.length > 0 && (
                <NavChipBar navChips={rawNavChips} onNavChipSelect={onNavChipSelect} />
              )}
              {chips.length > 0 && (
                <ChipBar chips={chips} onChipSelect={onChipSelect} />
              )}
            </>
          )}

          <span className={`${timeTextSize} text-slate-500 ${isUser ? 'text-right mr-1' : 'ml-1'}`}>
            {formatTime(message.timestamp || Date.now())}
          </span>
        </div>
      </div>
    </motion.div>
  );
});

export default ChatMessage;