import {useEffect,useRef} from 'react';
const layers=[];
// Shared by nested dialogs. Only the top layer handles keys or redirects focus.
export function mountDialogFocus(panel,onClose,doc=document){
  if(!panel)return()=>{};
  const previous=doc.activeElement,layer={panel};layers.push(layer);
  const top=()=>layers.at(-1)===layer;
  const items=()=>[...panel.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),summary,[tabindex]:not([tabindex="-1"])')]
    .filter(item=>!item.matches?.(':disabled,[aria-disabled="true"]')&&!item.closest('[hidden],[inert],[aria-hidden="true"]')&&item.getClientRects().length>0);
  const focusFirst=()=>{(items()[0]||panel).focus({preventScroll:true});};
  const key=event=>{
    if(!top())return;
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose?.();return;}
    if(event.key!=='Tab')return;
    const list=items(),first=list[0],last=list.at(-1),active=doc.activeElement;
    if(!first){event.preventDefault();panel.focus({preventScroll:true});return;}
    if(event.shiftKey&&(active===first||active===panel||!panel.contains(active))){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&(active===last||active===panel||!panel.contains(active))){event.preventDefault();first.focus();}
    event.stopPropagation();
  };
  const keepInside=()=>{if(top()&&!panel.contains(doc.activeElement))focusFirst();};
  doc.addEventListener('keydown',key,true);doc.addEventListener('focusin',keepInside,true);
  focusFirst();
  return()=>{
    const wasTop=top();layers.splice(layers.indexOf(layer),1);
    doc.removeEventListener('keydown',key,true);doc.removeEventListener('focusin',keepInside,true);
    if(wasTop&&previous?.isConnected&&(!layers.length||layers.at(-1).panel.contains(previous)))previous.focus({preventScroll:true});
  };
}
export function useDialogFocus(open,ref,onClose){
  const close=useRef(onClose);
  useEffect(()=>{close.current=onClose;},[onClose]);
  useEffect(()=>open?mountDialogFocus(ref.current,()=>close.current?.()):undefined,[open,ref]);
}
