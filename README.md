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

Browser/device Back and Escape close the current menu or panel, then return from the chat to the list. At the root, isolated, rapid double and repeated Back presses stay in the app. The mobile bar has Chats, Contacts, Settings and Profile. The supplied Telegram mobile reference defines one layout in Light and Dark, with subtle glass on floating navigation, chat headers and composer. Existing saved alternate appearances migrate to this design; privacy and media preferences survive.

## Appearance and audio

The new Telegram-inspired light/dark design is the default. Existing mod preferences remain available. Appearance reset restores this default.

Native **private Telegram calls** use Telegram's DH key exchange, verified fingerprints, encrypted signaling and WebRTC media. Voice effects process the microphone on the user's device before sending it to the other caller. Presets can be changed during a call or recording. Group-call transport remains unsupported.

The **AI Woman** preset uses [LLVC](https://github.com/KoeAI/LLVC) neural voice conversion locally, with one trained feminine target voice. Its optimized FP32 ONNX model preserves the network weights and avoids expensive context scatter writes. Selecting this optional preset downloads about 26 MB of model/runtime assets; normal startup and lightweight presets do not load them. Model caching is optional browser storage. No audio is uploaded to an AI service.

Inference runs in a dedicated Worker, with a single WASM thread that does not need SharedArrayBuffer or WebGPU. A measured device speed check must pass before AI activation. A bounded two-chunk playout buffer absorbs jitter; if inference stalls, the same call/recording output switches to lightweight effects and displays that fallback. The worker is released when AI is disabled or another preset is chosen. This does not promise realtime AI performance on every phone or a voice indistinguishable from a person.

Other presets use lightweight pitch, independent formant shaping, speech calibration, consonant preservation and dynamics. Fine-tuning switches from the fixed neural target to the custom lightweight effects preset. The studio provides a local audition recording so users can hear the actual result.

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

Images and avatar fetches wait until near the viewport; retries preserve embedded/blob/signed URLs. Offscreen animated-video previews pause. Default light/dark surfaces use Telegram colors, and semantic foregrounds keep controls readable in both supported modes. Notifications and Sounds now has independent, saved message-alert and app-sound switches; individual chat mute also suppresses incoming alerts.

Active group/channel voice chats show a live or scheduled banner and participant info, refreshed while the app is visible. Joining group calls still requires native Telegram; this banner does not implement the group-call transport.

Lightweight voice processing locks bins to actual spectral peaks, crossfades consonants in the complex spectrum and uses gentler EQ. Unvoiced audio is regression-tested for waveform preservation. The optional LLVC preset adds actual local neural conversion with device-speed gating and worker-based buffering.

The stress test covers long lists/histories, touch scrolling, group/channel arrows, album forwarding, shared-media playback/opening, gallery navigation, both supported Telegram modes, saved alert controls and repeated Back protection. It uses simulated Telegram RPCs and actual browser rendering, media decode and WebRTC; device/account checks remain separate.

## Telegram reference update

Profiles use centered photos, rounded actions, segmented shared-history tabs and a four-column media grid. Shared Groups and Add Contact use authenticated Telegram RPCs; Polls open the original chat message and GIFs have their own tab. The profile options menu closes before the underlying profile on Back.

Run `node scripts/test-telegram-reference.mjs <path-to-playwright/index.mjs>` to capture and check the light/dark mobile reference screens, subtle glass, shared-group pagination, contact actions, polls and GIFs. These use simulated Telegram responses; live device/account verification remains separate.

Run `node scripts/test-neural-voice.mjs` and `node scripts/test-recording-receipts.mjs` with the same `PLAYWRIGHT_MODULE` for neural output, local recordings, download caching, mobile layout, worker-stall fallback and timed-media receipt checks. These use simulated Telegram RPCs; they do not establish real account delivery or voice naturalness on a physical phone.
