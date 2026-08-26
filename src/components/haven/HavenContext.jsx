import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

const HavenContext = createContext(null);

const STORAGE_KEY = 'haven_chat_state_v3';

const defaultUserProfile = {
  name: '',
  businessDomain: '',
  auditScore: null,
};

const defaultInitialSession = {
  id: 'session-default',
  title: 'New Strategy Chat',
  isPinned: false,
  createdAt: Date.now(),
  messages: [
    {
      id: 'welcome',
      role: 'agent',
      content: "Hi there! I'm Haven, your marketing strategist. How can I help grow your business today?",
      timestamp: Date.now(),
    },
  ],
};

function loadStateFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        sessions: Array.isArray(parsed.sessions) && parsed.sessions.length > 0 ? parsed.sessions : [defaultInitialSession],
        activeSessionId: parsed.activeSessionId || defaultInitialSession.id,
        userProfile: parsed.userProfile || defaultUserProfile,
      };
    }
  } catch (e) {
    console.warn('Haven: Failed to load chat state from localStorage', e);
  }
  return {
    sessions: [defaultInitialSession],
    activeSessionId: defaultInitialSession.id,
    userProfile: defaultUserProfile,
  };
}

function saveStateToStorage(sessions, activeSessionId, userProfile) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ sessions, activeSessionId, userProfile }));
  } catch (e) {
    console.warn('Haven: Failed to save chat state to localStorage', e);
  }
}

export function HavenProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState('support');
  const [isThinking, setIsThinking] = useState(false);
  const [mounted, setMounted] = useState(false);

  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const saved = loadStateFromStorage();
  const [sessions, setSessions] = useState(saved.sessions);
  const [activeSessionId, setActiveSessionId] = useState(saved.activeSessionId);
  const [userProfile, setUserProfile] = useState(saved.userProfile);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) {
      saveStateToStorage(sessions, activeSessionId, userProfile);
    }
  }, [sessions, activeSessionId, userProfile, mounted]);

  const triggerToast = useCallback((msg) => {
    setToastMessage(msg);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2500);
  }, []);

  const openDrawer = useCallback((targetMode = 'support') => {
    setMode(targetMode);
    setIsOpen(true);
  }, []);

  const closeDrawer = useCallback(() => setIsOpen(false), []);
  const toggleDrawer = useCallback(() => setIsOpen((prev) => !prev), []);

  const currentSession = sessions.find((s) => s.id === activeSessionId) || sessions[0] || defaultInitialSession;
  const messages = currentSession ? currentSession.messages : [];

  const createNewSession = useCallback(() => {
    const newId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newSession = {
      id: newId,
      title: 'New Strategy Chat',
      isPinned: false,
      createdAt: Date.now(),
      messages: [],
    };

    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newId);
    triggerToast('New chat opened');
    return newId;
  }, [triggerToast]);

  const switchSession = useCallback((sessionId) => {
    setSessions((prev) => {
      if (prev.some((s) => s.id === sessionId)) {
        setActiveSessionId(sessionId);
      }
      return prev;
    });
  }, []);

  const togglePinSession = useCallback((sessionId) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, isPinned: !s.isPinned } : s))
    );
  }, []);

  // When deleting a chat, always auto-create and redirect to a brand new chat thread
  const deleteSession = useCallback((sessionId) => {
    setSessions((prev) => {
      const filtered = prev.filter((s) => s.id !== sessionId);

      const freshId = `session-${Date.now()}`;
      const freshSession = {
        id: freshId,
        title: 'New Strategy Chat',
        isPinned: false,
        createdAt: Date.now(),
        messages: [],
      };

      setActiveSessionId(freshId);
      return [freshSession, ...filtered];
    });
    triggerToast('Chat deleted');
  }, [triggerToast]);

  const updateSessionTitle = useCallback((sessionId, newTitle) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, title: newTitle } : s))
    );
  }, []);

  const addMessage = useCallback((role, content, attachment = null) => {
    const newMessage = {
      id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      role,
      content,
      attachment,
      timestamp: Date.now(),
    };

    setSessions((prev) =>
      prev.map((session) => {
        if (session.id !== activeSessionId) return session;

        const updatedMessages = [...session.messages, newMessage];

        let title = session.title;
        if (role === 'user' && (session.messages.length === 0 || session.title === 'New Strategy Chat')) {
          title = content.length > 28 ? `${content.substring(0, 28)}...` : content || 'Image Audit';
        }

        return {
          ...session,
          title,
          messages: updatedMessages,
        };
      })
    );

    return newMessage;
  }, [activeSessionId]);

  const sendMessage = useCallback(
    async (content, attachment = null) => {
      if ((!content.trim() && !attachment) || !activeSessionId) return;

      addMessage('user', content, attachment);
      setIsThinking(true);

      setTimeout(() => {
        let responseText = `I've analyzed your input regarding "${content ? content.substring(0, 24) : 'your uploaded asset'}...". Here is the core strategic takeaway.`;
        
        if (attachment) {
          responseText = "I've reviewed your uploaded asset. From a conversion standpoint, focusing on visual hierarchy and clear call-to-action placement will drive higher engagement.";
        }

        addMessage('agent', responseText);
        setIsThinking(false);
      }, 1600);
    },
    [activeSessionId, addMessage]
  );

  const updateUserProfile = useCallback((updates) => {
    setUserProfile((prev) => ({ ...prev, ...updates }));
  }, []);

  const clearChat = useCallback(() => {
    setSessions((prev) =>
      prev.map((s) => (s.id === activeSessionId ? { ...s, messages: [] } : s))
    );
    triggerToast('Conversation cleared');
  }, [activeSessionId, triggerToast]);

  const value = {
    isOpen,
    mode,
    setMode,
    toggleDrawer,
    openDrawer,
    closeDrawer,
    sessions,
    activeSessionId,
    currentSession,
    messages,
    createNewSession,
    switchSession,
    togglePinSession,
    deleteSession,
    updateSessionTitle,
    addMessage,
    sendMessage,
    userProfile,
    updateUserProfile,
    isThinking,
    clearChat,
    showToast,
    toastMessage,
    triggerToast,
  };

  return <HavenContext.Provider value={value}>{children}</HavenContext.Provider>;
}

export function useHaven() {
  const context = useContext(HavenContext);
  if (!context) {
    throw new Error('useHaven must be used within a HavenProvider');
  }
  return context;
}