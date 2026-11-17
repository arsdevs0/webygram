# Webygram

Telegram web client with Original Telegram appearance and navigation, optional Flow themes, chat/media search, local vault, deleted-message history and voice tools.

## Deploy on Vercel

Upload the **contents of `github-upload`** to the root of a GitHub repository, then import that repository into Vercel. The included `vercel.json` selects Vite, runs `npm run build:web`, and serves `dist`. No separate backend URL or server is needed. See [DEPLOYMENT.md](DEPLOYMENT.md).

The page connects directly to Telegram over secure WebSockets. The service worker routes media requests to the open app tab. `server.ts` is shared source compiled into the browser client; Vercel does not run it as a server.

## Local browser version

Use Node.js 22 or newer:

```sh
npm ci
npm run dev:web
```

For a production preview, run `npm run build:web`, then `npm run preview`. Use HTTPS when hosted; localhost also works for development.

## Login and saved data

Each browser signs in to Telegram independently. The browser stores its session, vault media and metadata locally in IndexedDB; preferences use localStorage. Reloading keeps data while site storage remains available. Clearing site data removes the local login and vault. Telegram cloud chats remain on Telegram. A new domain or different browser requires its own login. Private browsing and storage eviction can remove local data.

Keep one app tab open, connected and awake for local auto-save, anti-delete, auto-forward and similar ongoing work. Closing the app, device sleep, lost connectivity or browser suspension stops that work. Anti-delete can only preserve content the app received/cached; it cannot recover unseen deleted content. Large vaults are limited by browser storage and device memory.

## Forwarding and navigation

Forwarding has a recipient picker and preview with sender-name/caption controls, comments, silent sending and scheduling. Caption removal also hides sender names, as Telegram requires. Partial retries preserve delivered destinations and Telegram random IDs during the same app/engine session.

Browser/device Back and Escape close the current menu or panel, then return from the chat to the list. At the root, Back can leave the app. Original Telegram uses inline search, folder tabs, a main menu and a desktop settings sidebar; Flow navigation remains selectable.

## Appearance and audio

Original Telegram is the default. The previous design rollout is migrated back once while preserving mod preferences. Flow themes remain selectable. Navigation stays available; Appearance reset restores Original Telegram.

Native Telegram call audio transport is **not implemented**. Browser microphone/tab recording and voice effects are separate features and depend on browser permissions/support. Voice notes are encoded to OGG/Opus locally; unsupported input conversion falls back to an audio attachment using its actual format.

## Checks

```sh
npm run lint
npm test
npm run test:browser
npm run build:web
```

`test:browser` compiles and exercises the real browser bundle with simulated platform APIs: engine startup, GramJS upload/download adapters and the actual Opus encoder. It does not sign in to a Telegram account or replace a live signed-in feature check.

## Optional local Node host

The previous gateway remains available with `npm run dev`, or `npm run build` followed by `npm start`. Its private files stay in the workspace and are excluded from GitHub exports. This mode has separate server-side storage and is not the Vercel setup. `npm run test:integration` checks its browser-profile isolation using disposable data.
