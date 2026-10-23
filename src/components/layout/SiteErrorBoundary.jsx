import { Component } from 'react';

export default class SiteErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { console.error('TMH: page rendering failed. Reload to recover.'); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main role="alert" className="flex min-h-screen items-center justify-center bg-zinc-950 p-6 text-zinc-100">
        <div className="max-w-md space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-7">
          <h1 className="text-2xl font-semibold">This page could not load.</h1>
          <p className="text-sm leading-relaxed text-zinc-400">Reload to try again. If this continues, contact info@themarketinghaven.xyz.</p>
          <button type="button" onClick={() => window.location.reload()} className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-950">Reload page</button>
        </div>
      </main>
    );
  }
}
