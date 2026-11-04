export function subscribeAdminNotifications(client,token,{onArrival,onStatus}) {
  let stopped=false,channel;
  Promise.resolve(client.realtime.setAuth(token)).then(()=>{
    if(stopped)return;
    channel=client.channel('admin-arrivals').on('postgres_changes',{event:'INSERT',schema:'public',table:'admin_live_notifications'},event=>{
      if(!stopped&&['support','booking'].includes(event.new?.kind))onArrival(event.new.kind);
    }).subscribe(status=>{if(!stopped)onStatus(status==='SUBSCRIBED'?'Live updates connected':status==='CHANNEL_ERROR'||status==='TIMED_OUT'?'Live updates unavailable. Use Refresh.':'Connecting live updates…');});
  }).catch(()=>{if(!stopped)onStatus('Live updates unavailable. Use Refresh.');});
  return()=>{stopped=true;if(channel)void client.removeChannel(channel);};
}
