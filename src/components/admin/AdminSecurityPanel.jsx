import {useCallback,useEffect,useRef,useState} from 'react';

const LIMITS=[['visitor','Guest device'],['review','Saved review'],['network','Network'],['global','All traffic']];
export default function AdminSecurityPanel({onRequest,onAuthLost}){
  const [settings,setSettings]=useState(null),[draft,setDraft]=useState(null),[events,setEvents]=useState([]),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const revision=useRef(0);
  const request=useCallback(async payload=>{try{const result=await onRequest(payload);if(result.code==='unauthorised')onAuthLost();return result;}catch{return {ok:false,error:'Could not connect. Please retry.'};}},[onRequest,onAuthLost]);
  const load=useCallback(async()=>{
    const current=++revision.current;setBusy(true);setError('');
    const [config,audit]=await Promise.all([request({action:'settings'}),request({action:'audit'})]);
    if(current!==revision.current)return;
    if(config.ok){setSettings(config.settings);setDraft(config.settings);}else setError(config.error||'Could not load AI settings.');
    if(audit.ok)setEvents(audit.events);else setError(audit.error||'Could not load the audit log.');setBusy(false);
  },[request]);
  useEffect(()=>{const current=revision;const task=setTimeout(()=>void load(),0);return()=>{clearTimeout(task);current.current++;};},[load]);
  const save=async event=>{
    event.preventDefault();if(busy||!draft||!settings)return;setBusy(true);setError('');setMessage('');
    const changes=Object.fromEntries(Object.entries(draft).filter(([key,value])=>key!=='updated_at'&&key!=='id'&&value!==settings[key]));
    if(!Object.keys(changes).length){setBusy(false);setMessage('Settings are already saved.');return;}
    const result=await request({action:'updateSettings',settings:changes});
    if(result.ok){setSettings(result.settings);setDraft(result.settings);setMessage('AI settings saved. New requests use these limits.');const audit=await request({action:'audit'});if(audit.ok)setEvents(audit.events);}else setError(result.error||'Settings could not be saved.');
    setBusy(false);
  };
  const change=(field,value)=>setDraft(current=>({...current,[field]:value}));
  return <section aria-label="Admin security" className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg text-zinc-100">Security and AI controls</h2><p className="mt-2 max-w-3xl text-xs leading-6 text-zinc-400">Daily limits stop new AI work when any applicable budget is exhausted. Disable chat or scoring to stop new requests for that feature. Requests already running may finish.</p></div><button type="button" onClick={()=>void load()} disabled={busy} className="rounded-lg border border-white/15 px-4 py-2 text-xs disabled:opacity-40">{busy?'Loading…':'Reload saved data'}</button></div>
    {error&&<p role="alert" className="text-sm text-red-300">{error}</p>}{message&&<p role="status" className="text-sm text-emerald-200">{message}</p>}
    {draft&&<form onSubmit={save} className="space-y-4 rounded-xl border border-white/10 p-4"><div className="flex flex-wrap gap-6">{[['chat_enabled','Chat enabled'],['scoring_enabled','Scoring enabled']].map(([field,label])=><label key={field} className="flex items-center gap-3 text-sm text-zinc-200"><input type="checkbox" checked={draft[field]} disabled={busy} onChange={e=>change(field,e.target.checked)}/>{label}</label>)}</div>
      <div className="overflow-x-auto"><table className="w-full min-w-[420px] text-left text-xs"><thead><tr className="text-zinc-400"><th className="py-3">Budget</th><th className="px-2 py-3">Calls per day</th><th className="px-2 py-3">Tokens per day</th></tr></thead><tbody>{LIMITS.map(([prefix,label])=><tr key={prefix}><th className="py-2 font-normal text-zinc-300">{label}</th>{['calls','tokens'].map(unit=><td key={unit} className="px-2 py-2"><input aria-label={`${label} ${unit} per day`} type="number" required min={1} max={unit==='calls'?1000000:1000000000000} step={1} disabled={busy} value={draft[`${prefix}_daily_${unit}`]} onChange={e=>change(`${prefix}_daily_${unit}`,e.target.value===''?'':Number(e.target.value))} className="w-full rounded-lg border border-white/15 bg-zinc-950 p-2 text-zinc-100"/></td>)}</tr>)}</tbody></table></div><button disabled={busy} className="rounded-lg border border-white/20 px-4 py-2.5 text-xs disabled:opacity-40">Save AI controls</button>
    </form>}
    <div><h3 className="text-sm text-zinc-100">Recent admin actions</h3><p className="mt-2 text-xs leading-6 text-zinc-500">Newest 100 recorded actions since the audit migration. Email retries record a request before delivery. The network reference is a keyed hash of the observed address. Older actions are not backfilled.</p><div className="mt-4 space-y-3">{events.length?events.map(item=><article key={item.id} className="rounded-lg border border-white/10 p-3 text-xs leading-6 text-zinc-400"><p className="text-zinc-200">{item.action.replaceAll('_',' ')} · {item.outcome.replaceAll('_',' ')}</p><p>{new Date(item.occurred_at).toLocaleString()}</p><p className="break-all">{item.record_type}: {item.record_id}</p><p className="break-all">Admin: {item.actor_id}</p><p className="break-all">Network hash: {item.network_hash}</p>{item.changed_fields?.length>0&&<p className="break-all">Fields: {item.changed_fields.join(', ')}</p>}</article>):<p className="py-4 text-xs text-zinc-500">No recorded admin actions.</p>}</div></div>
  </section>;
}
