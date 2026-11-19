import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createServer, preview } from 'vite';
const modulePath = process.env.PLAYWRIGHT_MODULE || process.argv[2];
if (!modulePath) throw new Error('Set PLAYWRIGHT_MODULE to the installed playwright/index.mjs path.');
const { chromium } = await import(pathToFileURL(modulePath).href);
fs.mkdirSync('.local/chrome-test-temp', { recursive: true });
process.env.TEMP = process.env.TMP = path.resolve('.local/chrome-test-temp');
process.env.VITE_DIRECT_TELEGRAM = 'false';
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
const origin = 'http://127.0.0.1:' + server.httpServer.address().port;
const url = origin + '/tests/ui/telegramExperience.html?stress&delayMessages';
const browser = await chromium.launch({ headless:true, executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const errors = [], checks = [], limits = [];
let production, persistent;
try {
 const context = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await context.route('**/api/**',route=>{
   if (route.request().url().includes('/avatar/')) return route.fulfill({contentType:'image/gif',body:Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64')});
   return route.fulfill({json:{contacts:[],profile:{id:'me',firstName:'Tester'},media:[]}});
 });
 const page = await context.newPage(); page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/tests/ui/navigationLauncher.html'); await page.goto(url,{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'New message',exact:true}).waitFor();
 const back = async (pause=80) => { await page.evaluate(()=>history.back());await page.waitForTimeout(pause);assert.equal(page.url(),url); };
 const row=page.locator('.tg-chat-row').filter({hasText:'Alice'}).first();
 console.log('Checking touch selection and delayed refresh');
 const normal=await row.evaluate(el=>getComputedStyle(el).backgroundColor);
 await row.tap();await page.locator('#msg-1').waitFor();
 assert.equal(await page.evaluate(()=>window.__chatLoads.filter(x=>x.id==='alice').length),1,'Chat opened with duplicate fetch');
 // Cached content appears while the 1200ms request is still pending.
 assert.ok(await page.evaluate(()=>performance.now()-window.__chatLoads[0].time)<900,'Cached chat waited for the request');
 await back();assert.equal(await row.getAttribute('aria-current'),null);
 assert.equal(await row.evaluate(el=>getComputedStyle(el).backgroundColor),normal,'Touch highlight remained');
 await page.keyboard.press('Tab');await row.focus();assert.equal(await row.evaluate(el=>el.matches(':focus-visible')),true,'Keyboard focus lost');
 await row.press('Enter');await page.getByText('Editable message',{exact:true}).dblclick();await page.getByText('1 Selected',{exact:true}).waitFor();
 await back();assert.equal(await page.getByText('1 Selected',{exact:true}).count(),0);assert.equal(await page.locator('#msg-2').isVisible(),true);await back();
 checks.push('cached chat opens before delayed refresh; one fetch; no persistent touch/current highlight; keyboard focus and message double-click selection preserved');
 console.log('Checking archive gesture');
 const list=page.locator('.tg-dialog-list').first(), shell=page.locator('.tg-archive-entry-shell').first();
 assert.equal(await shell.getAttribute('data-visible'),'false');
 const pull=async(distance,steps=8,cancel=false)=>{
  const point=await list.evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.left+100,y:r.top+70};});
  await list.evaluate(el=>el.scrollTop=0);
  const cdp=await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
  for(let i=1;i<=steps;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:point.x,y:point.y+distance*i/steps}]});await page.waitForTimeout(10);}
  await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});await cdp.detach();
 };
 await pull(65);await page.waitForTimeout(280);assert.equal(await shell.getAttribute('data-visible'),'false');
 await pull(145,8,true);assert.equal(await shell.getAttribute('data-visible'),'false');
 await page.waitForTimeout(500);
 const commits=await page.evaluate(()=>window.__appCommits);
 await pull(145,20);assert.equal(await shell.getAttribute('data-visible'),'true');
 assert.ok(await page.evaluate(()=>window.__appCommits)-commits<12,'Pull rerendered the entire chat list every move');
 await page.waitForTimeout(300);assert.ok(await shell.evaluate(el=>el.getBoundingClientRect().height)>50);
 await page.screenshot({path:'.local/archive-reveal-mobile.png'});
 await list.evaluate(el=>el.scrollTop=200);await page.waitForTimeout(300);assert.equal(await shell.getAttribute('data-visible'),'false');
 assert.ok(await shell.evaluate(el=>el.getBoundingClientRect().height)<2);
 await page.emulateMedia({reducedMotion:'reduce'});assert.ok(await shell.evaluate(el=>parseFloat(getComputedStyle(el).transitionDuration))<0.001);await page.emulateMedia({reducedMotion:'no-preference'});
 checks.push('real touch pull threshold/cancel, animated reveal/collapse, bounded React commits, reduced motion');
 await list.evaluate(el=>el.scrollTop=0);await page.getByRole('button',{name:'New message',exact:true}).tap();
 await back();assert.equal(page.url(),url);
 for(const delay of [450,80,450,80,450,450])await back(delay);
 checks.push('modal Back, double Back, isolated repeated Back stay in app');
 const mobileNav=page.getByRole('navigation',{name:'Mobile navigation'});
 await mobileNav.getByRole('button',{name:'Settings',exact:true}).tap();await page.locator('.tg-settings-home').waitFor();
 await page.evaluate(()=>{const event=new Event('beforeinstallprompt',{cancelable:true});event.prompt=async()=>{throw Error('native install failed');};event.userChoice=Promise.resolve({outcome:'dismissed'});window.dispatchEvent(event);});
 await page.getByRole('button',{name:'Install Webygram',exact:true}).click();await page.getByText(/The browser could not install Webygram/).waitFor();
 await page.evaluate(()=>window.dispatchEvent(new Event('appinstalled')));await page.getByRole('button',{name:'Install Webygram',exact:true}).waitFor({state:'hidden'});assert.equal(await page.getByRole('button',{name:'Install Webygram',exact:true}).count(),0);
 await back();checks.push('native install rejection is handled; installed event removes install button');
 // Verify browser history navigation actually traverses the unguarded control page.
 console.log('Checking native browser Back');
 const native=await browser.newPage();await native.goto(origin+'/tests/ui/navigationLauncher.html');await native.goto(origin+'/tests/ui/navigationLauncher.html?control');await native.locator('#previous').click();
 await native.goBack({waitUntil:'domcontentloaded'});await native.waitForTimeout(200);
 assert.equal(native.url(),origin+'/tests/ui/navigationLauncher.html','Browser history navigation did not run');
 await native.goto(url,{waitUntil:'domcontentloaded'});await native.getByRole('button',{name:'New message',exact:true}).waitFor();
 await native.locator('.tg-chat-row').filter({hasText:'Alice'}).first().click();await native.locator('#msg-1').waitFor();
 await native.goBack({waitUntil:'domcontentloaded'});await native.waitForTimeout(180);assert.equal(native.url(),url);assert.equal(await native.locator('#msg-1').isVisible(),false);
 for(let i=0;i<5;i++){await native.goBack({waitUntil:'domcontentloaded'});await native.waitForTimeout(450);assert.equal(native.url(),url);}
 checks.push('Chrome history navigation closes chat and survives repeated ordinary Back');
 // Deliberate multi-entry history jumps are controlled by the browser; cross-document
 // traversals are not cancellable in Chrome. Record the limit instead of promising a trap.
 await native.evaluate(()=>history.go(-2));await native.waitForTimeout(160);
 if (native.url() !== url) limits.push('Chrome allows an explicit history-menu jump past the same-document Back guard');
 await native.close();
 // The HTML bootstrap protects while the actual entry module is blocked by a slow network.
 console.log('Checking bootstrap Back');
 const boot=await browser.newPage();await boot.goto(origin+'/tests/ui/navigationLauncher.html');
 let release;const pending=new Promise(resolve=>release=resolve);
 await boot.route('**/src/main.tsx',async route=>{await pending;await route.continue();});
 await boot.goto(origin,{waitUntil:'commit'});await boot.waitForFunction(()=>history.state?.__webygramBack);
 await boot.evaluate(()=>document.body.innerHTML='<button id="boot-touch">Loading…</button>');await boot.locator('#boot-touch').click();
 await boot.goBack({waitUntil:'commit'});await boot.waitForTimeout(100);assert.equal(boot.url(),origin+'/');
 release();await boot.close();checks.push('Back protected while startup module is downloading');
 // Deliberate rapid-four exit is a separate policy from ordinary Back.
 for(let i=0;i<4;i++){await page.evaluate(()=>history.back());await page.waitForTimeout(65);}
 await page.waitForTimeout(150);assert.equal(page.url(),origin+'/tests/ui/navigationLauncher.html');checks.push('four rapid root presses deliberately exit');
 console.log('Checking production installability');
 production=await preview({preview:{host:'127.0.0.1',port:0},logLevel:'error'});
 const prodOrigin='http://127.0.0.1:'+production.httpServer.address().port;
 persistent=await chromium.launchPersistentContext('.local/pwa-check-'+Date.now(),{headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const prodPage=await persistent.newPage();
 await prodPage.route('**/api/**',route=>route.fulfill({json:{}}));
 await prodPage.goto(prodOrigin,{waitUntil:'domcontentloaded'});
 await prodPage.waitForFunction(()=>navigator.serviceWorker.controller !== null);
 const cdp=await persistent.newCDPSession(prodPage);await cdp.send('Page.enable');
 const manifest=await cdp.send('Page.getAppManifest');assert.deepEqual(manifest.errors,[]);
 const install=await cdp.send('Page.getInstallabilityErrors');assert.deepEqual(install.installabilityErrors,[]);
 const files=await prodPage.evaluate(async()=>{const cache=await caches.open('webygram-shell-v2');return (await cache.keys()).map(x=>new URL(x.url).pathname);});
 for(const file of ['/', '/icons/icon-192.png','/icons/icon-512.png','/manifest.webmanifest'])assert.ok(files.includes(file),'Missing install file '+file);
 await persistent.setOffline(true);await prodPage.reload({waitUntil:'domcontentloaded'});assert.equal(await prodPage.title(),'Webygram — Telegram Web Client');
 checks.push('normal Chrome production installability passes; first-visit launch/icons cached; offline launch HTML available');
 fs.writeFileSync('.local/navigation-install-results.json',JSON.stringify({passed:true,checks,errors,limits},null,2));assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,checks,limits},null,2));
} finally {
 if(persistent)await persistent.close();if(production)await new Promise(resolve=>production.httpServer.close(resolve));await browser.close();await server.close();
}
