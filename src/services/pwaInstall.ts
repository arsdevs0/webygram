let installEvent:any;
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installEvent=event;window.dispatchEvent(new Event('webygram-install-ready'));});
window.addEventListener('appinstalled',()=>{installEvent=undefined;window.dispatchEvent(new Event('webygram-install-ready'));});
export function isInstalled(){return matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || Boolean((navigator as any).standalone);}
export async function installWebygram(){if(isInstalled())return 'Webygram is already installed';if(installEvent){const event=installEvent;installEvent=undefined;await event.prompt();const result=await event.userChoice;return result.outcome==='accepted'?'Installing Webygram…':'Install cancelled';}return /iPhone|iPad|iPod/.test(navigator.userAgent)?'Tap Share, then Add to Home Screen to install Webygram.':'Open your browser menu and choose Install app or Add to Home screen.';}
export async function initializePwa(){if(navigator.serviceWorker && window.isSecureContext)await navigator.serviceWorker.register('/telegram-sw.js',{scope:'/'}).catch(()=>{});}
