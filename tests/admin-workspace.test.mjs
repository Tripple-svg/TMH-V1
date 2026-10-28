import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import * as workspace from '../src/lib/adminWorkspace.js';
import * as publicInfo from '../src/lib/tmhPublicInfo.js';

test('team inquiries are separate from support in both old and upgraded API responses', () => {
  const regular={id:'support',service_id:null}, team={id:'team',service_id:'team-inquiry'};
  assert.deepEqual(workspace.splitSupportSessions([regular,team]),{support:[regular],team:[team]});
  assert.deepEqual(workspace.splitSupportSessions([regular],[team]),{support:[regular],team:[team]});
});
test('agency queue uses Lagos dates, excludes closed follow-ups and canceled bookings, and counts actual pending mail', () => {
  const now=Date.parse('2026-10-26T23:30:00Z');
  assert.equal(workspace.lagosDate(now),'2026-10-27');
  const stats=workspace.workspaceMetrics({now,leads:[{lead_temperature:'Hot',welcome_email_sent:false},{lead_temperature:'Hot',followup_status:'closed',welcome_email_sent:true}],purchases:[{thankyou_sent:false},{thankyou_sent:true}],
    inquiries:[{inquiry_status:'reviewing',inquiry_next_followup_on:'2026-10-27'},{inquiry_status:'closed',inquiry_next_followup_on:'2026-10-20'},{inquiry_status:'new',inquiry_owner:'Francis'}],
    bookings:[{status:'confirmed',start_time:'2026-10-28T12:00:00Z'},{status:'canceled',start_time:'2026-10-28T12:00:00Z'}]});
  assert.deepEqual(stats,{openInquiries:2,unassignedInquiries:1,dueInquiries:1,hotLeads:1,purchaseEmails:1,reviewEmails:1,upcomingBookings:1});
});
test('CSV export neutralizes formulas in untrusted cells and preserves quotes and line breaks', () => {
  for(const value of ['=HYPERLINK("https://evil.example")','+SUM(1,2)','-1+2','@SUM(1,2)','\t=1+1']) assert.ok(workspace.csvCell(value).startsWith('"\''));
  assert.equal(workspace.csvCell('Normal "brand"\nNotes'),'"Normal ""brand""\nNotes"');
  assert.equal(workspace.csvCell(9639),'"9639"');
});

function workflow(onSave) {
  const states=[],refs=[],changes=[];let cursor=0,refCursor=0;
  const session={id:'team',inquiry_status:'new',inquiry_revision:0,inquiry_notes:''};
  const react={useState(initial){const index=cursor++;if(!(index in states))states[index]=typeof initial==='function'?initial():initial;return[states[index],value=>{states[index]=typeof value==='function'?value(states[index]):value;}];},useRef(initial){return refs[refCursor++]||=( {current:initial} );}};
  const context={module:{exports:{}},require:name=>name==='react'?react:name.includes('tmhPublicInfo')?publicInfo:workspace,React:{createElement:(type,props,...children)=>({type,props:{...props,children}})}};
  vm.runInNewContext(transformSync(readFileSync(new URL('../src/components/admin/InquiryWorkflow.jsx',import.meta.url),'utf8'),{loader:'jsx',format:'cjs'}).code,context);
  const render=()=>{cursor=refCursor=0;const tree=context.module.exports.default({session,onSave,onSessionChange:value=>changes.push(value)});const nodes=[];const walk=node=>{if(Array.isArray(node))return node.forEach(walk);if(!node||typeof node!=='object')return;nodes.push(node);walk(node.props.children);};walk(tree);return nodes;};
  return {render,changes};
}
test('inquiry conflict keeps the draft until an explicit reload, then uses the new revision',async()=>{
  const calls=[];const saved={id:'team',inquiry_revision:2,inquiry_status:'contacted',inquiry_owner:'Paschal',inquiry_notes:'Server note'};
  const ui=workflow(async payload=>{calls.push(payload);return calls.length===1?{ok:false,code:'conflict',error:'Another team member updated it.',session:saved}:{ok:true,session:{...saved,inquiry_revision:3}};});
  ui.render().find(node=>node.type==='textarea').props.onChange({target:{value:'My unsaved next action'}});
  await ui.render().find(node=>node.type==='form').props.onSubmit({preventDefault(){}});
  let tree=ui.render();assert.equal(tree.find(node=>node.type==='textarea').props.value,'My unsaved next action');assert.equal(ui.changes.length,0);
  tree.find(node=>node.type==='button'&&node.props.children[0]==='Reload saved details').props.onClick();
  tree=ui.render();assert.equal(tree.find(node=>node.type==='textarea').props.value,'Server note');
  await tree.find(node=>node.type==='form').props.onSubmit({preventDefault(){}});
  assert.equal(calls[1].expectedRevision,2);assert.equal(ui.changes.at(-1).inquiry_revision,3);
});
