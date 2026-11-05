import * as Sentry from '@sentry/react';

export function privateErrorEvent(event) {
  return {event_id:event.event_id,timestamp:event.timestamp,platform:'javascript',level:'error',
    exception:{values:(event.exception?.values||[]).map(item=>({type:'ApplicationError',value:'Application rendering failed',
      stacktrace:{frames:(item.stacktrace?.frames||[]).map(frame=>({filename:frame.filename?.split(/[?#]/)[0],lineno:frame.lineno,colno:frame.colno,function:frame.function}))}}))}};
}
export const sentryEnabled=Boolean(import.meta.env.VITE_SENTRY_DSN);
export const privateDataCollection={userInfo:false,cookies:false,httpHeaders:false,httpBodies:[],urlQueryParams:false,graphQL:{document:false,variables:false},genAI:{inputs:false,outputs:false},mcp:{inputs:false,outputs:false},databaseQueryData:false,queues:false,stackFrameVariables:false,frameContextLines:0};
if(sentryEnabled)Sentry.init({dsn:import.meta.env.VITE_SENTRY_DSN,dataCollection:privateDataCollection,defaultIntegrations:false,
  tracesSampleRate:0,maxBreadcrumbs:0,beforeSend:privateErrorEvent});
export function capturePageFailure(error){if(sentryEnabled)Sentry.captureException(error);}
if(sentryEnabled&&typeof window!=='undefined'){
  window.addEventListener('error',event=>capturePageFailure(event.error instanceof Error?event.error:new Error('Unhandled browser operation')));
  window.addEventListener('unhandledrejection',event=>capturePageFailure(event.reason instanceof Error?event.reason:new Error('Unhandled asynchronous operation')));
}
export {Sentry};
