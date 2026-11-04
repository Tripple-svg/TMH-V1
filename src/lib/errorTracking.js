import * as Sentry from '@sentry/react';

export function privateErrorEvent(event) {
  return {event_id:event.event_id,timestamp:event.timestamp,platform:'javascript',level:'error',
    exception:{values:(event.exception?.values||[]).map(item=>({type:'ApplicationError',value:'Application rendering failed',
      stacktrace:{frames:(item.stacktrace?.frames||[]).map(frame=>({filename:frame.filename?.split(/[?#]/)[0],lineno:frame.lineno,colno:frame.colno,function:frame.function}))}}))}};
}
export const sentryEnabled=Boolean(import.meta.env.VITE_SENTRY_DSN);
if(sentryEnabled)Sentry.init({dsn:import.meta.env.VITE_SENTRY_DSN,sendDefaultPii:false,defaultIntegrations:false,
  tracesSampleRate:0,maxBreadcrumbs:0,beforeSend:privateErrorEvent});
export function capturePageFailure(error){if(sentryEnabled)Sentry.captureException(error);}
export {Sentry};
