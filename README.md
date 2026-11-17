# Webygram

Telegram web client with the new Telegram-inspired layout in light and dark themes, mobile navigation, chat/media search, local vault, deleted-message history, voice tools and native private calls.

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

Browser/device Back and Escape close the current menu or panel, then return from the chat to the list. At the root, one Back keeps the app open and prompts for a quick second press. Two root Back presses within 700 ms can leave the app; closing a chat/panel does not count toward exit. The mobile bar has Chats, Contacts, Settings and You; the account sheet, grouped settings and pill folders use the requested new layout in both themes. Flow themes remain selectable.

## Appearance and audio

The new Telegram-inspired light/dark design is the default. Existing mod preferences remain available. Appearance reset restores this default.

Native **private Telegram calls** use Telegram's DH key exchange, verified fingerprints, encrypted signaling and WebRTC media. Voice effects process the microphone on the user's device before sending it to the other caller. Presets can be changed during a call or recording. Group-call transport remains unsupported.

Local effects combine pitch, independent formant shaping, speech calibration, consonant preservation and dynamics. They do not install a neural voice model or guarantee an indistinguishable human voice on every mobile. RVC/Seed-VC GitHub options were reviewed; realtime local neural conversion depends on device/model support and cannot be promised across all phones. See [w-okada](https://github.com/w-okada/voice-changer), [Seed-VC](https://github.com/Plachtaa/seed-vc), [browser RVC runtime](https://github.com/moyue23/rvc-web-runtime) and [RVC WebGPU](https://github.com/ouor/rvc-webgpu).

Use HTTPS and allow the microphone; camera permission is required for video. Keep the browser awake. Mobile browsers can suspend audio in the background or when the screen locks. Speaker controls playback; browser support determines physical earpiece/output routing. Voice notes are encoded to OGG/Opus locally; unsupported conversion falls back to an audio attachment using its actual format. Failed sends retain the recording for playback, Retry or Discard.

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

## Mobile UI and audio regressions

With a locally installed Playwright module and Chrome, run:

```powershell
$env:PLAYWRIGHT_MODULE = 'absolute/path/to/playwright/index.mjs'
node scripts/test-telegram-ui.mjs
node scripts/test-telegram-audio.mjs
node scripts/test-telegram-stress.mjs
```

The UI test covers forwarding, Back, retries, both themes and mobile layouts.
The audio test uses two real browser WebRTC peers with simulated Telegram RPCs
and a synthetic microphone. It verifies matching fingerprints, bidirectional
audio, live effects, mute, repeated calls, video negotiation, recording/retry/cancel
and the actual Opus worker. These are local tests; a call to a signed-in native
Telegram mobile client still needs device/account verification.

## Scroll, media and voice update

The compose pencil opens a searchable contact picker with New Group/New Channel actions. Archive stays directly accessible above the chat list. Each list owns its scroll viewport. The latest-message arrow stays outside message content; layout changes keep a chat at the latest message until the user scrolls away.

Telegram album IDs survive serialization, rendering, preview and forwarding. Chat profiles share Media, Files, Links, Music and Voice tabs with pagination, retry feedback and open/play/download actions. The viewer supports previous/next buttons, horizontal swipes and keyboard arrows. Profile photos open in the viewer, and personal shared media uses its own source chat.

Images and avatar fetches wait until near the viewport; retries preserve embedded/blob/signed URLs. Offscreen animated-video previews pause. Default light/dark surfaces use Telegram colors, and semantic foregrounds keep controls readable across selectable palettes. Notifications and Sounds now has independent, saved message-alert and app-sound switches; individual chat mute also suppresses incoming alerts.

Active group/channel voice chats show a live or scheduled banner and participant info, refreshed while the app is visible. Joining group calls still requires native Telegram; this banner does not implement the group-call transport.

Local voice processing now locks bins to actual spectral peaks, crossfades consonants in the complex spectrum and uses gentler EQ. Unvoiced audio is regression-tested for waveform preservation. GitHub realtime AI projects such as [w-okada](https://github.com/w-okada/voice-changer/blob/master/README_en.md) use a separate conversion server/high-performance runtime; that is not bundled into this mobile-local build.

The stress test covers long lists/histories, touch scrolling, group/channel arrows, album forwarding, shared-media playback/opening, gallery navigation, every selectable palette, saved alert controls and browser exit timing. It uses simulated Telegram RPCs and actual browser rendering, media decode and WebRTC; device/account checks remain separate.
