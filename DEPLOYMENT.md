# GitHub → Vercel

1. GitHub par new repository banao. `github-upload` folder ke **andar ki saari files** repository root mein upload karo, including `src`, `public`, `scripts`, `package.json`, `package-lock.json`, `server.ts`, `vite.config.ts` and `vercel.json`.
2. Vercel → Add New → Project → us GitHub repository ko Import karo.
3. Framework: **Vite**. Root Directory: **./**. Build Command: **npm run build:web**. Output Directory: **dist**. Node.js: **22.x or newer**.
4. Deploy karo. HTTPS URL kholo aur Telegram QR/phone se login karo.

Separate backend URL, Render account, database server ya Vercel function ki zaroorat nahi hai. Telegram connection browser se direct hota hai. `server.ts` build ke liye source file hai; usko bhi upload karna hai.

Environment variables normally optional hain. Apni Telegram app credentials use karni hon toh Vercel mein `VITE_TELEGRAM_API_ID` aur `VITE_TELEGRAM_API_HASH` set karke redeploy karo. User session, OTP, password ya bot token kabhi `VITE_*` mein mat daalo.

## Dhyan rahe

- App ka ek tab open, awake aur Telegram se connected ho toh local background features run kar sakte hain. Tab band, device sleep ya browser suspension par woh rukenge.
- Login/vault isi browser ki site storage mein save hote hain. Site data clear karne se local login/vault remove honge. Telegram ke cloud chats apni jagah rahenge.
- Private Telegram calls mein native encrypted signaling + WebRTC audio aur local live voice effects integrated hain. Group calls supported nahi hain.
- HTTPS aur mic permission chahiye; video ke liye camera permission. Browser/device sleep par media suspend ho sakti hai. Effects local DSP hain; har mobile par exact human AI conversion ki guarantee nahi hai.
- Signed-in Telegram actions still need a live account check; build/tests alone do not verify every Telegram feature.
- `.env`, `.tgplus*`, `.local`, `node_modules`, `build` aur `dist` upload nahi karne. Export inhe exclude karta hai.

## Local production preview

```sh
npm ci
npm run build:web
npm run preview
```

## Folder dubara banane ke liye

Main workspace mein `npm run package:github` run karo. Script existing `github-upload` ko overwrite nahi karti; purana export pehle rename kar lo.
