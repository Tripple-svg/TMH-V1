import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, MessageCircle, CheckCircle2, Clock, X, Rocket, Package, Lightbulb, Send } from 'lucide-react';

const quickReplies = [
  { icon: Rocket, label: 'Building a Service Brand', type: 'service' },
  { icon: Package, label: 'Selling Physical Products', type: 'product' },
  { icon: Lightbulb, label: 'Just an Idea Right Now', type: 'idea' },
];

export default function HavenChat({ userData, mode, onClose, isHavenBackendLive = false }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [typing, setTyping] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const endRef = useRef(null);

  const name = userData?.fullName?.split(' ')[0] || 'there';
  const brand = userData?.brandName || 'your brand';

  useEffect(() => {
    if (mode === 'returning') {
      const msg = `Hi ${name}! I noticed you clicked the request review button again. Since you've already submitted your brand, how can I help you today? Do you want to check on your review status or learn more about our core services?`;
      pushMessage(msg, 'agent');
    } else if (mode === 'newbie') {
      const msg = `Hi ${name}! No website or active social page yet? No worries at all—everyone starts somewhere. I'm Haven. Tell me a bit about what brand or service you're looking to build.`;
      pushMessage(msg, 'agent');
      setTimeout(() => setShowQuickReplies(true), 1200);
    } else if (mode === 'scan') {
      const sequence = [
        { text: `Thanks ${name}! Your brand details are locked in.`, delay: 600 },
        { text: `Scanning ${brand} presence across channels...`, delay: 2200 },
        { text: `Cross-referencing industry benchmarks and competitor positioning...`, delay: 4200 },
        { text: `Compiling your strategic transformation roadmap...`, delay: 6200 },
        { text: `Audit complete. A detailed review is heading to your WhatsApp shortly.`, delay: 8200 },
      ];
      sequence.forEach(msg => {
        setTimeout(() => {
          setTyping(true);
          setTimeout(() => {
            setMessages(prev => [...prev, { id: Date.now(), from: 'agent', text: msg.text }]);
            setTyping(false);
          }, 900);
        }, msg.delay);
      });
    }
  }, [mode, name, brand]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing]);

  const pushMessage = (text, from) => {
    setTyping(true);
    setTimeout(() => {
      setMessages(prev => [...prev, { id: Date.now(), from, text }]);
      setTyping(false);
    }, 800);
  };

  const handleQuickReply = (reply) => {
    setShowQuickReplies(false);
    setMessages(prev => [...prev, { id: Date.now(), from: 'user', text: reply.label }]);
    
    let botResponse = "Got it! Let me pull up the best starting roadmap for you.";
    if (reply.type === 'service') {
      botResponse = "Got it—you're building a service-based brand. Let's structure high-ticket offer frameworks for you.";
    } else if (reply.type === 'product') {
      botResponse = "Got it—you're selling physical products. Let's focus on brand positioning and retention funnels.";
    } else if (reply.type === 'idea') {
      botResponse = "Got it—you're launching fresh from an idea! Let me guide you through turning that concept into a structured business architecture.";
    }

    setTimeout(() => {
      pushMessage(botResponse, 'agent');
    }, 600);
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const userMsg = inputText.trim();
    setInputText('');
    setMessages(prev => [...prev, { id: Date.now(), from: 'user', text: userMsg }]);

    setTimeout(() => {
      pushMessage(`Thanks for sharing! Our strategy team will factor this into your ${brand} assessment and update you directly via WhatsApp.`, 'agent');
    }, 1000);
  };

  return (
    <motion.div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <motion.div className="relative w-full max-w-2xl h-[80vh] sm:h-[700px] flex flex-col rounded-2xl sm:rounded-3xl bg-gray-900 text-white backdrop-blur-xl border border-white/10 shadow-2xl overflow-hidden z-10"
        initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}>
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
              <Bot className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h4 className="text-white font-semibold text-sm">Haven Audit Console</h4>
              <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                Live Assistant
              </div>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Messages Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-600/20 border border-blue-500/20 flex items-center justify-center shrink-0 mt-1">
              <Bot className="w-4 h-4 text-blue-400" />
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl rounded-tl-sm px-4 py-3 max-w-[85%]">
              <p className="text-sm text-gray-200 leading-relaxed">Welcome to the Audit Console. I'm processing your request in real time.</p>
            </div>
          </div>

          {messages.map(msg => (
            <motion.div key={msg.id} initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} className={`flex gap-3 ${msg.from === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-8 h-8 rounded-full border flex items-center justify-center shrink-0 mt-1 ${msg.from === 'agent' ? 'bg-blue-600/20 border-blue-500/20' : 'bg-white/10 border-white/10'}`}>
                {msg.from === 'agent' ? <Bot className="w-4 h-4 text-blue-400" /> : <MessageCircle className="w-4 h-4 text-gray-300" />}
              </div>
              <div className={`rounded-2xl px-4 py-3 max-w-[85%] ${msg.from === 'agent' ? 'bg-white/5 border border-white/10 rounded-tl-sm' : 'bg-blue-600/20 border border-blue-500/20 rounded-tr-sm'}`}>
                <p className="text-sm text-gray-200 leading-relaxed">{msg.text}</p>
              </div>
            </motion.div>
          ))}

          {typing && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-600/20 border border-blue-500/20 flex items-center justify-center shrink-0 mt-1">
                <Bot className="w-4 h-4 text-blue-400" />
              </div>
              <div className="bg-white/5 border border-white/10 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5">
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}

          <AnimatePresence>
            {showQuickReplies && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-wrap gap-2 pt-2">
                {quickReplies.map(q => (
                  <button key={q.label} onClick={() => handleQuickReply(q)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-blue-600/10 border border-blue-500/30 text-blue-300 text-sm font-medium hover:bg-blue-600/20 hover:border-blue-500/50 transition-all">
                    <q.icon className="w-4 h-4" />{q.label}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {messages.length > 0 && !typing && messages[messages.length - 1].text.includes('Audit complete') && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-center pt-4">
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
                <CheckCircle2 className="w-4 h-4" />Audit Finalized
              </div>
            </motion.div>
          )}

          <div ref={endRef} />
        </div>

        {/* Interactive Chat Input / Footer */}
        <div className="p-4 border-t border-white/10 bg-white/5">
          <form onSubmit={handleSendMessage} className="flex items-center gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Type your message to Haven..."
              className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500 transition-colors"
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="p-3 rounded-xl bg-blue-600 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-500 transition-all shrink-0">
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </motion.div>
    </motion.div>
  );
}