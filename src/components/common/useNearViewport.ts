import { useEffect, useState, type RefObject } from 'react';
let observer:IntersectionObserver | undefined;
const listeners=new Map<Element,(visible:boolean)=>void>();
function observe(element:Element,listener:(visible:boolean)=>void){
  observer ||= new IntersectionObserver(entries=>{for(const entry of entries)listeners.get(entry.target)?.(entry.isIntersecting);},{rootMargin:'200px 0px',threshold:0});
  listeners.set(element,listener);observer.observe(element);
  return ()=>{listeners.delete(element);observer?.unobserve(element);};
}
/** Share one observer instead of eagerly queuing every history image and avatar. */
export function useNearViewport(ref:RefObject<HTMLElement|null>,enabled=true,once=true){
  const [near,setNear]=useState(()=>typeof IntersectionObserver==='undefined');
  useEffect(()=>{
    if(!enabled || (once && near) || !ref.current)return;
    if(typeof IntersectionObserver==='undefined'){setNear(true);return;}
    return observe(ref.current,setNear);
  },[ref,enabled,once,near]);
  return near;
}
