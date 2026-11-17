/** Retry only our own media endpoints; data/blob and signed remote URLs stay valid. */
export function mediaRetrySource(source:string,retry:number):string {
  if(!retry)return source;
  try{const url=new URL(source,globalThis.location?.href || 'http://localhost');
    if(!/^https?:$/.test(url.protocol) || !/^\/api\/tg\/(?:avatar|media)\//.test(url.pathname) || (globalThis.location && url.origin!==location.origin))return source;
    url.searchParams.set('r',String(retry));return source.startsWith('/')?url.pathname+url.search+url.hash:url.href;
  }catch{return source;}
}
