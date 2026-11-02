import {useCallback,useEffect,useState} from 'react';

export default function VisitorActivityPanel({onRequest,onAuthLost}){
  const [data,setData]=useState(null),[siteData,setSiteData]=useState(null),[error,setError]=useState(''),[siteError,setSiteError]=useState(''),[busy,setBusy]=useState(false);
  const load=useCallback(async()=>{
    setBusy(true);
    try{
      const result=await onRequest({action:'visitorActivity'});
      if(result.code==='unauthorised')onAuthLost?.();
      else if(result.ok){setData(result.activity);setSiteData(result.siteActivity);setError(result.activityError||'');setSiteError(result.siteActivityError||'');}
      else setError(result.error||'Visitor activity could not be loaded.');
    }catch{setError('Visitor activity could not be loaded. Refresh to retry.');}
    finally{setBusy(false);}
  },[onRequest,onAuthLost]);
  useEffect(()=>{const task=setTimeout(()=>void load(),0);return()=>clearTimeout(task);},[load]);
  return <section aria-label="Website and Haven activity" className="mb-4 rounded-xl border border-white/10 p-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-sm font-medium text-zinc-200">Website and Haven activity</h2><button type="button" onClick={load} disabled={busy} className="text-xs text-zinc-400 underline disabled:opacity-40">{busy?'Refreshing…':'Refresh activity'}</button></div>
    <div className="mt-4"><h3 className="text-xs font-medium text-zinc-200">Across the website</h3><p className="mt-1 text-xs leading-relaxed text-zinc-400">Consented first-party analytics · browser estimates. Only visitors accepting optional analytics are included.</p>
      {siteError&&<p role="alert" className="mt-3 text-xs text-amber-200">{siteError}</p>}
      {siteData&&<><dl className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-white/[0.03] p-3"><dt className="text-xs text-zinc-400">Total retained website browser profiles</dt><dd className="mt-2 text-2xl tabular-nums text-zinc-100">{siteData.savedBrowserProfiles.toLocaleString()}</dd></div>
        <div className="rounded-lg bg-white/[0.03] p-3"><dt className="text-xs text-zinc-400">Active website browsers · last 5 minutes</dt><dd className="mt-2 text-2xl tabular-nums text-zinc-100">{siteData.activeBrowserProfiles.toLocaleString()}</dd></div>
      </dl><p className="mt-3 text-xs leading-relaxed text-zinc-500">Visible pages send a heartbeat at most every 2 minutes. Browsers declining analytics are excluded from new measurements; the total includes historical consented profiles. Multiple devices, cleared storage and bots can affect these estimates; these are not unique people or an exact live online count. Inactive profiles expire after 13 months.</p><p className="mt-2 text-[11px] text-zinc-500">Website snapshot: {new Date(siteData.asOf).toLocaleString()}</p></>}
    </div>
    {error&&<p role="alert" className="mt-3 text-xs text-amber-200">{error}{data||siteData?' The last successful snapshots remain visible where available.':''}</p>}
    {!data&&!siteData&&!error&&!siteError&&<p role="status" className="mt-3 text-xs text-zinc-500">Loading saved activity…</p>}
    <div className="mt-5 border-t border-white/10 pt-4"><h3 className="text-xs font-medium text-zinc-200">Haven chat activity</h3><p className="mt-1 text-xs leading-relaxed text-zinc-400">Functional chat records · a separate source. Do not add these counts to website browser profiles.</p>
    {data&&<><dl className="mt-3 grid gap-3 sm:grid-cols-2">
      <div className="rounded-lg bg-white/[0.03] p-3"><dt className="text-xs text-zinc-400">Saved Haven browser identities</dt><dd className="mt-2 text-2xl tabular-nums text-zinc-100">{data.savedBrowserIdentities.toLocaleString()}</dd></div>
      <div className="rounded-lg bg-white/[0.03] p-3"><dt className="text-xs text-zinc-400">Chat browser identities in the last 5 minutes</dt><dd className="mt-2 text-2xl tabular-nums text-zinc-100">{data.recentChatIdentities.toLocaleString()}</dd></div>
    </dl><p className="mt-3 text-xs leading-relaxed text-zinc-500">Recent activity means a saved chat message attempt, including failed attempts. A person can use several browsers or devices; these counts do not identify unique people or prove they are still online.</p><p className="mt-2 text-[11px] text-zinc-500">Haven snapshot: {new Date(data.asOf).toLocaleString()} · Updates when refreshed.</p></>}</div>
  </section>;
}
