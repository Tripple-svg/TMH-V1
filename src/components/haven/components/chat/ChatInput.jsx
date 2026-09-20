import React, { useRef, useState, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { motion } from 'framer-motion';
import { Send, Paperclip, Square, X } from 'lucide-react';

/**
 * ChatInput - shared input bar used by both HavenDrawer and HavenInlineModal.
 *
 * IMPERATIVE API (via ref):
 *   ref.current.focus(placeholderOverride?)  -> focuses textarea, sets a temp placeholder
 *   ref.current.openFilePicker()             -> opens the native file picker
 *   ref.current.clearPlaceholderOverride()   -> resets placeholder to default
 */
const ChatInput = forwardRef(function ChatInput(
  { onSend, onStop, isThinking = false, disabled = false, size = 'full', onTypingChange },
  ref
) {
  const [inputValue, setInputValue]           = useState('');
  const [imagePreview, setImagePreview]       = useState(null);
  const [imageLoading, setImageLoading]       = useState(false);
  const [placeholderOverride, setPlaceholderOverride] = useState(null);

  const inputRef     = useRef(null);
  const fileInputRef = useRef(null);

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

    onSend(inputValue, imagePreview);
    setInputValue('');
    setPlaceholderOverride(null);
    handleRemoveImage();
  }, [inputValue, imagePreview, isThinking, disabled, imageLoading, onSend, handleRemoveImage]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }, [handleSubmit]);

  const previewSize   = isCompact ? 'w-12 h-12' : 'w-16 h-16';
  const inputTextSize = isCompact ? 'text-xs'    : 'text-sm';
  const inputPadding  = isCompact ? 'pl-3 pr-9 py-2' : 'pl-4 pr-10 py-3';
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
          <div className={`${previewSize} rounded-xl overflow-hidden border border-violet-500/30 bg-slate-800 shadow-sm relative`}>
            {imageLoading ? (
              <div className="flex items-center justify-center w-full h-full">
                <div className="w-4 h-4 border-2 border-violet-400/30 border-t-violet-400 rounded-full animate-spin" />
              </div>
            ) : (
              <img src={imagePreview} alt="Upload preview" className="w-full h-full object-cover" />
            )}
          </div>
          <motion.button
            whileTap={{ scale: 0.85 }}
            onClick={handleRemoveImage}
            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-slate-900 text-slate-400 hover:text-white border border-white/10 flex items-center justify-center cursor-pointer shadow-sm"
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
            className={`w-full resize-none rounded-xl bg-slate-800/70 border border-white/[0.07] ${inputPadding} ${inputTextSize} text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/30 transition-all scrollbar-none`}
            style={{ minHeight: isCompact ? '36px' : '44px', maxHeight: isCompact ? '100px' : '120px' }}
            disabled={isThinking || disabled}
          />
          <motion.button
            type="button"
            whileTap={{ scale: 0.9 }}
            onClick={() => fileInputRef.current?.click()}
            className={`absolute ${isCompact ? 'right-2.5' : 'right-3'} text-slate-500 hover:text-violet-400 transition-colors cursor-pointer`}
            title="Upload image asset"
            disabled={isThinking || disabled}
          >
            <Paperclip className={isCompact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
          </motion.button>
        </div>

        {isThinking ? (
          <motion.button
            whileTap={{ scale: 0.88 }}
            type="button"
            onClick={onStop}
            className={`flex items-center justify-center ${buttonSize} rounded-xl bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/20 transition-all cursor-pointer`}
            title="Stop response"
          >
            <Square className={`${stopIconSize} fill-current`} />
          </motion.button>
        ) : (
          <motion.button
            whileTap={{ scale: 0.88 }}
            type="submit"
            disabled={(!inputValue.trim() && !imagePreview) || disabled || imageLoading}
            className={`flex items-center justify-center ${buttonSize} rounded-xl bg-violet-600 hover:bg-violet-500 disabled:bg-slate-800 disabled:text-slate-600 text-white shadow-lg shadow-violet-600/20 disabled:shadow-none transition-all cursor-pointer`}
          >
            <Send className={sendIconSize} />
          </motion.button>
        )}
      </form>
    </div>
  );
});

export default ChatInput;