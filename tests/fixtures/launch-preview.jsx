// Local browser fixture only. Uses synthetic values and never invokes Supabase.
import {createRoot} from 'react-dom/client';
import AdminSecurityPanel from '../../src/components/admin/AdminSecurityPanel';
import {RateLimitsPanel} from '../../src/components/admin/AdminOperationsPanels';
import AdminGuide from '../../src/components/admin/AdminGuide';
import '../../src/index.css';
let settings={id:true,chat_enabled:true,scoring_enabled:true,...Object.fromEntries(['visitor','review','network','global'].flatMap(prefix=>[[prefix+'_daily_calls',1000],[prefix+'_daily_tokens',100000000]]))};
const request=async payload=>payload.action==='settings'?{ok:true,settings}:payload.action==='audit'?{ok:true,events:[]}:payload.action==='limits'?{ok:true,limits:[{id:'public:synthetic-hash-only',reason:'public',identity_type:'Hashed network or device',reset_at:new Date(Date.now()+600000).toISOString(),requests:5}]}:payload.action==='updateSettings'?(settings={...settings,...payload.settings},{ok:true,settings}):{ok:true};
createRoot(document.getElementById('root')).render(<main className="admin-workspace mx-auto max-w-5xl space-y-8 p-5 text-zinc-100"><h1 className="text-2xl">Synthetic admin controls check</h1><AdminGuide onNavigate={section=>document.getElementById('preview-destination').textContent='Selected section: '+section}/><p id="preview-destination" role="status">Choose a guide link to check its destination.</p><AdminSecurityPanel onRequest={request} onAuthLost={()=>{}}/><RateLimitsPanel onRequest={request} onAuthLost={()=>{}}/></main>);
