import React, { useRef, useState, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { motion } from 'framer-motion';
import { Send, Paperclip, Square, X, Mic, MicOff } from 'lucide-react';

// Web Speech API — Chrome, Edge, Safari. Not available in Firefox.
const SpeechRecognitionAPI =
  typeof window !== 'undefined'
    ? (window.SpeechRecognition || window.webkitSpeechRecognition)
    : null;

/**
 * ChatInput - shared input bar.
 *
 * IMPERATIVE API (via ref):
 *   ref.current.focus(placeholderOverride?)
 *   ref.current.openFilePicker()
 *   ref.current.clearPlaceholderOverride()
 */
const ChatInput = forwardRef(function ChatInput(
  { onSend, onStop, isThinking = false, disabled = false, size = 'full', onTypingChange },
  ref
) {
  const [inputValue, setInputValue]           = useState('');
  const [imagePreview, setImagePreview]       = useState(null);
  const [imageLoading, setImageLoading]       = useState(false);
  const [placeholderOverride, setPlaceholderOverride] = useState(null);
  const [isRecording, setIsRecording]         = useState(false);

  const inputRef       = useRef(null);
  const fileInputRef   = useRef(null);
  const recognitionRef = useRef(null);
  const baseTextRef    = useRef('');
  const transcriptRef  = useRef('');

  const isCompact = size === 'compact';

  useImperativeHandle(ref, () => ({
    focus: (placeholderText) => {
      if (placeholderText) setPlaceholderOverride(placeholderText);
      requestAnimationFrame(() => inputRef.current?.focus());
    },
    openFilePicker: () => {
      fileInputRef.current?.click();
    },
    clearPlaceholderOverride: () => setPlaceholderOverride(null),
  }), []);

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

  // Stop speech recognition on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch { /* noop */ }
        recognitionRef.current = null;
      }
    };
  }, []);

  const stopRecording = useCallback((resetIdle = true) => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* noop */ }
      recognitionRef.current = null;
    }
    if (resetIdle) setIsRecording(false);
  }, []);

  const handleMicClick = useCallback(() => {
    if (!SpeechRecognitionAPI) return;

    if (isRecording) {
      stopRecording();
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = false;
    recognition.interimResults = true;
    try {
      recognition.lang = 'en-NG'; // Nigerian English
    } catch {
      recognition.lang = 'en-US';
    }

    baseTextRef.current = inputValue;   // preserve what's already typed
    transcriptRef.current = '';

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          transcriptRef.current = (transcriptRef.current + ' ' + result[0].transcript).trim();
        } else {
          interim += result[0].transcript;
        }
      }
      const combined = [baseTextRef.current, transcriptRef.current, interim]
        .filter(Boolean)
        .join(' ');
      setInputValue(combined);
    };

    recognition.onend = () => {
      setIsRecording(false);
      recognitionRef.current = null;
    };

    recognition.onerror = (event) => {
      if (event.error === 'not-allowed') {
        alert('Microphone access was blocked. Please allow microphone permission in your browser to use voice input.');
      } else {
        console.warn('ChatInput: Speech recognition error:', event.error);
      }
      setIsRecording(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    setIsRecording(true);
    try {
      recognition.start();
    } catch (err) {
      console.warn('ChatInput: Failed to start speech recognition:', err);
      setIsRecording(false);
      recognitionRef.current = null;
    }
  }, [isRecording, inputValue, stopRecording]);

  const handleImageSelect = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageLoading(true);
    const reader = new FileReader();
    reader.onload = () => {
      setImagePreview(reader.result);
      setImageLoading(false);
    };
    reader.onerror = () => {
      console.error('ChatInput: Failed to read image file.');
      setImageLoading(false);
      setImagePreview(null);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleRemoveImage = useCallback(() => {
    setImagePreview(null);
    setImageLoading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleSubmit = useCallback((e) => {
    if (e) e.preventDefault();
    if ((!inputValue.trim() && !imagePreview) || isThinking || disabled || imageLoading) return;
    stopRecording();
    onSend(inputValue, imagePreview);
    setInputValue('');
    setPlaceholderOverride(null);
    handleRemoveImage();
  }, [inputValue, imagePreview, isThinking, disabled, imageLoading, onSend, handleRemoveImage, stopRecording]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }, [handleSubmit]);

  const previewSize   = isCompact ? 'w-12 h-12' : 'w-16 h-16';
  const inputTextSize = isCompact ? 'text-xs'    : 'text-sm';
  const inputPadding  = isCompact ? 'pl-3 pr-14 py-2' : 'pl-4 pr-16 py-3';
  const buttonSize    = isCompact ? 'w-9 h-9'    : 'w-11 h-11';
  const sendIconSize  = isCompact ? 'w-4 h-4'    : 'w-5 h-5';
  const stopIconSize  = isCompact ? 'w-3 h-3'    : 'w-4 h-4';

  const defaultPlaceholder = isCompact ? 'Ask Haven...' : 'Ask Haven anything...';
  const activePlaceholder  = placeholderOverride || defaultPlaceholder;

  return (
    <div>
      {imagePreview && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="relative inline-block mb-3"
        >
          <div className={`${previewSize} rounded-xl overflow-hidden border border-white/[0.08] bg-zinc-900 relative`}>
            {imageLoading ? (
              <div className="flex items-center justify-center w-full h-full">
                <div className="w-4 h-4 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
              </div>
            ) : (
              <img src={imagePreview} alt="Upload preview" className="w-full h-full object-cover" />
            )}
          </div>
          <motion.button
            whileTap={{ scale: 0.85 }}
            onClick={handleRemoveImage}
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
          accept="image/*"
          className="hidden"
        />

        <div className="flex-1 relative flex items-center">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={activePlaceholder}
            rows={1}
            className={`w-full resize-none rounded-xl bg-zinc-900/60 border border-white/[0.08] ${inputPadding} ${inputTextSize} text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500/40 focus:ring-1 focus:ring-blue-500/20 transition-all scrollbar-none`}
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
              title="Upload image asset"
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
          >
            <Square className={`${stopIconSize} fill-current`} />
          </motion.button>
        ) : (
          <motion.button
            whileTap={{ scale: 0.88 }}
            type="submit"
            disabled={(!inputValue.trim() && !imagePreview) || disabled || imageLoading}
            className={`flex items-center justify-center ${buttonSize} rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-900 disabled:text-zinc-600 text-white transition-all cursor-pointer disabled:cursor-not-allowed`}
          >
            <Send className={sendIconSize} />
          </motion.button>
        )}
      </form>
    </div>
  );
});

export default ChatInput;