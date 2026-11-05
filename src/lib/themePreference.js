export function readInitialTheme(browser=globalThis.window){
  if(!browser)return 'dark';
  try{const value=browser.localStorage?.getItem('tmh_theme');if(value==='dark'||value==='light')return value;}catch{/* Storage can be blocked while the site remains usable. */}
  try{return browser.matchMedia?.('(prefers-color-scheme: dark)').matches?'dark':'light';}catch{return 'dark';}
}
export function saveTheme(theme,browser=globalThis.window){
  try{browser?.localStorage?.setItem('tmh_theme',theme);}catch{/* A display preference must never block the application. */}
}
