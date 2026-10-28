import { useRef, useState, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Send, Paperclip, Square, X, Mic, MicOff } from 'lucide-react';
import { reviewScreenshotError, reviewScreenshotFileError } from '../../../../lib/reviewScreenshot';

const MAX_MESSAGE_LENGTH = 4000;

const SpeechRecognitionAPI =
  typeof window !== 'undefined'
    ? (window.SpeechRecognition || window.webkitSpeechRecognition)
    : null;

function releaseRecognition(recognition) {
  if (!recognition) return;
  recognition.onresult = null;
  recognition.onend = null;
  recognition.onerror = null;
  try { recognition.abort(); } catch { /* Recognition may already have ended. */ }
}

const ChatInput = forwardRef(function ChatInput(
  { onSend, onStop, isThinking = false, disabled = false, size = 'full', onTypingChange },
  ref
) {
  const [inputValue, setInputValue]           = useState('');
  const [imagePreview, setImagePreview]       = useState(null);
  const [imageLoading, setImageLoading]       = useState(false);
  const [placeholderOverride, setPlaceholderOverride] = useState(null);
  const [isRecording, setIsRecording]         = useState(false);
  const [inputError, setInputError]           = useState('');
  const reduceMotion = useReducedMotion();

  const inputRef       = useRef(null);
  const fileInputRef   = useRef(null);
  const recognitionRef = useRef(null);
  const baseTextRef    = useRef('');
  const transcriptRef  = useRef('');

  const isCompact = size === 'compact';

  useImperativeHandle(ref, () => ({
    focus: (placeholderText) => {
      if (placeholderText) setPlaceholderOverride(placeholderText);
      requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
    },
    openFilePicker: () => { if (!disabled && !isThinking) fileInputRef.current?.click(); },
    clearPlaceholderOverride: () => setPlaceholderOverride(null),
  }), [disabled, isThinking]);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      const maxH = isCompact ? 100 : 120;
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, maxH)}px`;
    }
  }, [inputValue, isCompact]);

  useEffect(() => {
    if (onTypingChange) {
      onTypingChange(Boolean(inputValue.trim()) || Boolean(imagePreview));
    }
  }, [inputValue, imagePreview, onTypingChange]);

  useEffect(() => {
    return () => {
      const recognition = recognitionRef.current;
      recognitionRef.current = null;
      releaseRecognition(recognition);
    };
  }, []);

  const stopRecording = useCallback((resetIdle = true) => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    // Freeze the visible draft. Late final events cannot duplicate or replace it.
    releaseRecognition(recognition);
    if (resetIdle) setIsRecording(false);
  }, []);

  useEffect(() => {
    if (disabled || isThinking) stopRecording();
  }, [disabled, isThinking, stopRecording]);

  const handleMicClick = useCallback(() => {
    if (!SpeechRecognitionAPI || disabled || isThinking) return;
    if (recognitionRef.current) { stopRecording(); return; }
    if (inputValue.length >= MAX_MESSAGE_LENGTH) { setInputError('Messages can contain up to 4,000 characters. Please shorten your message before recording.'); return; }

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    try { recognition.lang = 'en-NG'; } catch { recognition.lang = 'en-US'; }
    baseTextRef.current = inputValue;
    transcriptRef.current = '';
    setInputError('');

    recognition.onresult = event => {
      if (recognitionRef.current !== recognition) return;
      const final = [], interim = [];
      // results contains the full session. Reconstruct by index rather than
      // appending resultIndex again when a browser repeats final results.
      for (let index = 0; index < event.results.length; index++) {
        const result = event.results[index];
        const text = result[0]?.transcript?.trim();
        if (text) (result.isFinal ? final : interim).push(text);
      }
      transcriptRef.current = final.join(' ');
      const combined = [baseTextRef.current, transcriptRef.current, interim.join(' ')].filter(Boolean).join(' ');
      setInputValue(combined.slice(0, MAX_MESSAGE_LENGTH));
      setInputError(combined.length > MAX_MESSAGE_LENGTH ? 'Messages can contain up to 4,000 characters. Please shorten your message.' : '');
      if (combined.length >= MAX_MESSAGE_LENGTH) stopRecording();
    };
    recognition.onend = () => {
      if (recognitionRef.current !== recognition) return;
      setInputValue([baseTextRef.current, transcriptRef.current].filter(Boolean).join(' ').slice(0, MAX_MESSAGE_LENGTH));
      recognitionRef.current = null;
      setIsRecording(false);
      releaseRecognition(recognition);
    };
    recognition.onerror = event => {
      if (recognitionRef.current !== recognition) return;
      // Keep confirmed words and typed prefix; discard provisional guesses.
      setInputValue([baseTextRef.current, transcriptRef.current].filter(Boolean).join(' ').slice(0, MAX_MESSAGE_LENGTH));
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setInputError('Microphone access was blocked. You can type your message instead.');
      } else {
        setInputError(event.error === 'no-speech' ? 'No speech was captured. Try again or type your message.' : 'Voice input stopped. Your confirmed words are saved; you can type or try again.');
      }
      recognitionRef.current = null;
      setIsRecording(false);
      releaseRecognition(recognition);
    };

    recognitionRef.current = recognition;
    setIsRecording(true);
    try { recognition.start(); } catch {
      recognitionRef.current = null;
      setIsRecording(false);
      setInputError('Voice input could not start. You can type your message instead.');
      releaseRecognition(recognition);
    }
  }, [disabled, isThinking, inputValue, stopRecording]);

  const handleImageSelect = useCallback((e) => {
    if (disabled || isThinking) return;
    const file = e.target.files?.[0];
    if (!file) return;
    const fileError = reviewScreenshotFileError(file);
    if (fileError) {
      setInputError(fileError);
      setImagePreview(null);
      setImageLoading(false);
      e.target.value = '';
      return;
    }
    setInputError('');
    setImageLoading(true);
    const reader = new FileReader();
    reader.onload = () => {
      const image = String(reader.result);
      const error = reviewScreenshotError(image);
      setImagePreview(error ? null : image);
      setInputError(error || '');
      setImageLoading(false);
    };
    reader.onerror = () => {
      setInputError('This image could not be read. Please choose it again.');
      setImageLoading(false);
      setImagePreview(null);
    };
    reader.readAsDataURL(file);
  }, [disabled, isThinking]);

  const handleRemoveImage = useCallback(() => {
    setImagePreview(null);
    setImageLoading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleSubmit = useCallback((e) => {
    if (e) e.preventDefault();
    if ((!inputValue.trim() && !imagePreview) || isThinking || disabled || imageLoading) return;
    const imageError = reviewScreenshotError(imagePreview);
    if (imageError) { setInputError(imageError); return; }
    stopRecording();
    onSend(inputValue, imagePreview);
    setInputValue('');
    setPlaceholderOverride(null);
    setInputError('');
    handleRemoveImage();
  }, [inputValue, imagePreview, isThinking, disabled, imageLoading, onSend, handleRemoveImage, stopRecording]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSubmit(e);
    }
  }, [handleSubmit]);

  const previewSize   = isCompact ? 'w-12 h-12' : 'w-16 h-16';
  const inputPadding  = isCompact ? 'pl-3 pr-14 py-2' : 'pl-4 pr-16 py-3';
  const buttonSize    = isCompact ? 'w-9 h-9'    : 'w-11 h-11';
  const sendIconSize  = isCompact ? 'w-4 h-4'    : 'w-5 h-5';
  const stopIconSize  = isCompact ? 'w-3 h-3'    : 'w-4 h-4';

  const defaultPlaceholder = isCompact ? 'Ask Haven...' : 'Ask Haven anything...';
  const activePlaceholder  = placeholderOverride || defaultPlaceholder;

  return (
    <div className="w-full max-w-full overflow-hidden">
      {imagePreview && (
        <motion.div
          initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.98 }}
          transition={{ duration: reduceMotion ? 0 : 0.16 }}
          className="relative inline-block mb-3"
        >
          <div className={`${previewSize} rounded-xl overflow-hidden border border-white/[0.08] bg-zinc-900 relative`}>
            {imageLoading ? (
              <div className="flex items-center justify-center w-full h-full">
                <div className="w-4 h-4 border-2 border-zinc-500/30 border-t-zinc-300 rounded-full animate-spin motion-reduce:animate-none" />
              </div>
            ) : (
              <img src={imagePreview} alt="Upload preview" className="w-full h-full object-cover" />
            )}
          </div>
          <motion.button
            whileTap={{ scale: 0.85 }}
            onClick={handleRemoveImage}
            type="button"
            aria-label="Remove attached image"
            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-zinc-950 text-zinc-400 hover:text-white border border-white/[0.08] flex items-center justify-center cursor-pointer shadow-lg"
          >
            <X className="w-3 h-3" />
          </motion.button>
        </motion.div>
      )}

      <form onSubmit={handleSubmit} className="flex items-end gap-2">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleImageSelect}
          accept="image/png,image/jpeg,image/webp"
          disabled={isThinking || disabled}
          className="hidden"
        />

        <div className="flex-1 relative flex items-center min-w-0">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => {
              if (recognitionRef.current) stopRecording();
              const text = e.target.value;
              setInputValue(text.slice(0, MAX_MESSAGE_LENGTH));
              setInputError(text.length >= MAX_MESSAGE_LENGTH ? 'Messages can contain up to 4,000 characters. Please shorten your message if needed.' : '');
            }}
            onKeyDown={handleKeyDown}
            placeholder={activePlaceholder}
            rows={1}
            maxLength={MAX_MESSAGE_LENGTH}
            aria-label="Message Haven"
            aria-describedby={inputError ? 'haven-message-error haven-message-count' : 'haven-message-count'}
            aria-invalid={Boolean(inputError)}
            /* text-[16px] on mobile prevents iOS auto-zoom. md:text-sm for desktop. */
            className={`w-full resize-none rounded-xl bg-zinc-900/80 border border-white/[0.1] ${inputPadding} text-[16px] md:text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-400 transition-colors scrollbar-none`}
            style={{ minHeight: isCompact ? '36px' : '44px', maxHeight: isCompact ? '100px' : '120px' }}
            disabled={isThinking || disabled}
          />
          <div className={`absolute flex items-center gap-1.5 ${isCompact ? 'right-2.5' : 'right-3'}`}>
            {SpeechRecognitionAPI && (
              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                onClick={handleMicClick}
                className={isRecording
                  ? 'text-red-400 transition-colors cursor-pointer p-0.5 animate-pulse'
                  : 'text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer p-0.5'}
                title={isRecording ? 'Stop voice input' : 'Voice input'}
                aria-label={isRecording ? 'Stop voice input' : 'Start voice input'}
                aria-pressed={isRecording}
                disabled={isThinking || disabled}
              >
                {isRecording
                  ? <MicOff className={isCompact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
                  : <Mic className={isCompact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />}
              </motion.button>
            )}
            <motion.button
              type="button"
              whileTap={{ scale: 0.9 }}
              onClick={() => fileInputRef.current?.click()}
              className="text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer"
              title="Attach PNG, JPEG or WebP · up to 5 MB"
              aria-label="Attach a PNG, JPEG or WebP image"
              disabled={isThinking || disabled}
            >
              <Paperclip className={isCompact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
            </motion.button>
          </div>
        </div>

        {isThinking ? (
          <motion.button
            whileTap={{ scale: 0.88 }}
            type="button"
            onClick={onStop}
            className={`flex items-center justify-center ${buttonSize} rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-white/[0.08] text-zinc-200 transition-all cursor-pointer`}
            title="Stop response"
            aria-label="Stop response"
          >
            <Square className={`${stopIconSize} fill-current`} />
          </motion.button>
        ) : (
          <motion.button
            whileTap={{ scale: 0.88 }}
            type="submit"
            disabled={(!inputValue.trim() && !imagePreview) || disabled || imageLoading}
            aria-label="Send message"
            className={`flex items-center justify-center ${buttonSize} rounded-xl bg-zinc-100 hover:bg-white disabled:bg-zinc-900 disabled:text-zinc-600 text-zinc-950 transition-colors cursor-pointer disabled:cursor-not-allowed`}
          >
            <Send className={sendIconSize} />
          </motion.button>
        )}
      </form>
      <div className={`${inputError || imagePreview || inputValue.length > 3500 ? "mt-2 flex items-start justify-between gap-3" : "sr-only"} text-[11px] leading-relaxed text-zinc-500`}>
        {inputError && <p id="haven-message-error" role="alert" className="text-amber-200/90">{inputError}</p>}
        <span id="haven-message-count" className={inputError || inputValue.length >= 3600 ? 'shrink-0 tabular-nums' : 'sr-only'}>{inputValue.length.toLocaleString()} / 4,000</span>
      </div>
    </div>
  );
});

export default ChatInput;
