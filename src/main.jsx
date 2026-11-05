// src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import {Sentry,sentryEnabled} from './lib/errorTracking';
import './index.css';
import {readInitialTheme} from './lib/themePreference';

import { ThemeProvider } from './context/ThemeContext'; 
import { UserProvider } from './context/UserContext';

// Force initial theme class setup on root <html> tag before React mounts
if (typeof window !== 'undefined') {
  if (readInitialTheme() === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <UserProvider>
        {sentryEnabled?<Sentry.ErrorBoundary fallback={<main role="alert" className="min-h-screen bg-zinc-950 p-8 text-zinc-100">This page could not open. <button onClick={()=>window.location.reload()} className="underline">Reload the page</button> or <a href="/support" className="underline">contact support</a>.</main>}><App /></Sentry.ErrorBoundary>:<App />}
      </UserProvider>
    </ThemeProvider>
  </React.StrictMode>
);
