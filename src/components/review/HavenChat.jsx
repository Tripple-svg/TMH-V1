// src/components/review/HavenChat.jsx
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, CheckCircle2, X, Rocket, Package, Lightbulb, Send, Code, Share2, TrendingUp, HelpCircle } from 'lucide-react';

const contextConfig = {
  audit: {
    title: 'Haven Audit Console',
    replies: [
      { icon: Rocket, label: 'Building a Service Brand', type: 'service' },
      { icon: Package, label: 'Selling Physical Products', type: 'product' },
      { icon: Lightbulb, label: 'Just an Idea Right Now', type: 'idea' },
    ]
  },
  service_web: {
    title: 'Brand & Web Engineering',
    replies: [
      { icon: Code, label: 'What tech stack do you use?', type: 'web_tech' },
      { icon: Rocket, label: 'Do you build custom web apps?', type: 'web_custom' },
      { icon: Lightbulb, label: 'How fast can we launch?', type: 'web_speed' },
    ]
  },
  service_content: {
    title: 'Content & Social Architecture',
    replies: [
      { icon: Share2, label: 'How do you structure content?', type: 'content_struct' },
      { icon: Rocket, label: 'Can you handle video scripts?', type: 'content_video' },
      { icon: Lightbulb, label: 'What channels do you focus on?', type: 'content_channels' },
    ]
  },
  service_growth: {
    title: 'Strategic Growth & Funnels',
    replies: [
      { icon: TrendingUp, label: 'How do your funnels work?', type: 'growth_funnel' },
      { icon: Rocket, label: 'Do you run live campaigns?', type: 'growth_campaign' },
      { icon: Lightbulb, label: 'What benchmarks do you track?', type: 'growth_stats' },
    ]
  },
  support: {
    title: 'Haven Customer Support',
    replies: [
      { icon: HelpCircle, label: 'Check Playbook Order Status', type: 'supp_order' },
      { icon: Rocket, label: 'Masterclass Access Help', type: 'supp_class' },
      { icon: Lightbulb, label: 'Speak to Strategy Team', type: 'supp_human' },
    ]
  }
};

export default function HavenChat({ userData, mode, context = 'audit', onClose }) {
  const storageKey = `tmh_haven_chat_${context}`;

  const [messages, setMessages] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [inputText, setInputText] = useState('');
  const [typing, setTyping] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const endRef = useRef(null);

  const name = userData?.fullName?.split(' ')[0] || userData?.name?.split(' ')[0] || '';
  const greetingName = name ? name : 'there';
  const brand = userData?.brandName || 'your business';

  const makeId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(storageKey, JSON.stringify(messages));
    }
  }, [messages, storageKey]);

  useEffect(() => {
    if (messages.length > 0) return;

    if (context === 'support') {
      const msg = name
        ? `Hi ${name}! Haven Customer Support here. How can our team assist you with your order, playbooks, or access today?`
        : `Hi there! Welcome to Customer Support. What can I help you clarify or troubleshoot right now?`;
      pushMessage(msg, 'agent');
      setTimeout(() => setShowQuickReplies(true), 1000);
      return;
    }

    if (context === 'service_web') {
      const msg = name
        ? `Hi ${name}! Interested in Brand & Web Engineering? We build custom web apps engineered for conversion. What specific questions do you have?`
        : `Hi there! Looking to engineer a high-performing web application? What aspect of our engineering service would you like to explore?`;
      pushMessage(msg, 'agent');
      setTimeout(() => setShowQuickReplies(true), 1000);
      return;
    }

    if (context === 'service_content') {
      const msg = name
        ? `Hi ${name}! Ready to elevate ${brand}'s content positioning? Let me know what you'd like to understand about our content architecture.`
        : `Hi there! Looking to build high-converting content frameworks? How can I help you break down our content strategy?`;
      pushMessage(msg, 'agent');
      setTimeout(() => setShowQuickReplies(true), 1000);
      return;
    }

    if (context === 'service_growth') {
      const msg = name
        ? `Hi ${name}! Let's talk scale for ${brand}. How can I assist you with our funnel engineering and growth infrastructure?`
        : `Hi there! Ready to build structured conversion funnels? What questions do you have about our growth architecture?`;
      pushMessage(msg, 'agent');
      setTimeout(() => setShowQuickReplies(true), 1000);
      return;
    }

    // Default Audit flows
    if (mode === 'returning') {
      const msg = `Hi ${greetingName}! I noticed you requested an update. Since ${brand} details are already logged, how can I assist your review today?`;
      pushMessage(msg, 'agent');
    } else if (mode === 'newbie') {
      const msg = `Hi ${greetingName}! Starting fresh without an active web presence? No problem—we build from zero. Tell me about the brand concept you want to launch.`;
      pushMessage(msg, 'agent');
      setTimeout(() => setShowQuickReplies(true), 1200);
    } else if (mode === 'scan') {
      const sequence = [
        { text: `Thanks ${greetingName}! Brand parameters logged.`, delay: 600 },
        { text: `Scanning ${brand} presence across channels...`, delay: 2200 },
        { text: `Cross-referencing industry benchmarks and competitor positioning...`, delay: 4200 },
        { text: `Compiling your strategic transformation roadmap...`, delay: 6200 },
        { text: `Audit complete! Detailed analysis will arrive on your WhatsApp shortly.`, delay: 8200 },
      ];

      sequence.forEach(msg => {
        setTimeout(() => {
          setTyping(true);
          setTimeout(() => {
            setMessages(prev => [...prev, { id: makeId(), from: 'agent', text: msg.text }]);
            setTyping(false);
          }, 900);
        }, msg.delay);
      });
    }
  }, [mode, context, name, greetingName, brand, messages.length]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing]);

  const pushMessage = (text, from) => {
    setTyping(true);
    setTimeout(() => {
      setMessages(prev => [...prev, { id: makeId(), from, text }]);
      setTyping(false);
    }, 800);
  };

  const handleQuickReply = (reply) => {
    setShowQuickReplies(false);
    setMessages(prev => [...prev, { id: makeId(), from: 'user', text: reply.label }]);

    let botResponse = "Got it! Let me break that down for you.";

    if (reply.type === 'web_tech') {
      botResponse = "We engineer modern React & Vite frontends with Tailwind CSS, backed by high-performance APIs and Paystack integration for seamless payments.";
    } else if (reply.type === 'web_custom') {
      botResponse = "Yes! Every platform we build is 100% custom-tailored to your brand architecture—no generic, bloated templates.";
    } else if (reply.type === 'web_speed') {
      botResponse = "Standard web engineering sprints take between 2 to 4 weeks from architecture lock-in to live production release.";
    } else if (reply.type === 'supp_order') {
      botResponse = "Please reply with your WhatsApp number or email address used during purchase, and our support desk will verify your download link immediately.";
    } else if (reply.type === 'supp_class') {
      botResponse = "You can access our free masterclass directly at freeclass.themarketinghaven.xyz or tell me your topic of interest here!";
    } else if (reply.type === 'supp_human') {
      botResponse = "Understood. I have logged your request for senior consultation. A team member will ping your WhatsApp shortly.";
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
    setMessages(prev => [...prev, { id: makeId(), from: 'user', text: userMsg }]);

    setTimeout(() => {
      pushMessage(`Thanks for sharing! I've appended this directly to your active ${context.replace('_', ' ')} file. Our strategy team will review it.`, 'agent');
    }, 1000);
  };

  const activeConfig = contextConfig[context] || contextConfig.audit;

  return (
    <motion.div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        className="relative w-full max-w-2xl h-[80vh] sm:h-[700px] flex flex-col rounded-2xl sm:rounded-3xl bg-gray-900 text-white backdrop-blur-xl border border-white/10 shadow-2xl overflow-hidden z-10"
        initial={{ scale: 0.96, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 10 }}
        transition={{ type: 'spring', damping: 25, stiffness: 350 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full overflow-hidden bg-zinc-800 border border-white/20 shrink-0">
              <img src="/Tmh.jpeg" alt="Haven Logo" className="w-full h-full object-cover" />
            </div>
            <div>
              <h4 className="text-white font-semibold text-sm">{activeConfig.title}</h4>
              <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                Active Haven Assistant
              </div>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-all cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Messages Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
          {messages.map(msg => (
            <motion.div key={msg.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`flex gap-3 ${msg.from === 'user' ? 'flex-row-reverse' : ''}`}>
              {msg.from === 'agent' ? (
                <div className="w-8 h-8 rounded-full overflow-hidden border border-white/20 shrink-0 mt-0.5">
                  <img src="/Tmh.jpeg" alt="Haven AI" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="w-8 h-8 rounded-full border border-white/10 bg-white/10 flex items-center justify-center shrink-0 mt-0.5">
                  <MessageCircle className="w-4 h-4 text-gray-300" />
                </div>
              )}
              <div className={`rounded-2xl px-4 py-3 max-w-[85%] ${msg.from === 'agent' ? 'bg-white/5 border border-white/10 rounded-tl-sm' : 'bg-blue-600/20 border border-blue-500/20 rounded-tr-sm'}`}>
                <p className="text-sm text-gray-200 leading-relaxed">{msg.text}</p>
              </div>
            </motion.div>
          ))}

          {typing && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full overflow-hidden border border-white/20 shrink-0 mt-0.5">
                <img src="/Tmh.jpeg" alt="Haven AI" className="w-full h-full object-cover" />
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
                {activeConfig.replies.map(q => (
                  <button key={q.label} onClick={() => handleQuickReply(q)} className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-blue-600/10 border border-blue-500/30 text-blue-300 text-sm font-medium hover:bg-blue-600/20 hover:border-blue-500/50 transition-all cursor-pointer">
                    <q.icon className="w-4 h-4" />{q.label}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <div ref={endRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-white/10 bg-white/5">
          <form onSubmit={handleSendMessage} className="flex items-center gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Type your message to Haven..."
              className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500 transition-colors"
            />
            <button type="submit" disabled={!inputText.trim()} className="p-3 rounded-xl bg-blue-600 text-white disabled:opacity-40 hover:bg-blue-500 transition-all shrink-0 cursor-pointer">
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </motion.div>
    </motion.div>
  );
}