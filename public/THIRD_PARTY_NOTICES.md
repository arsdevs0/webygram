The palette data in `src/themes/flowPalettes.ts` is adapted from
[Flow-Tube/Flow](https://github.com/Flow-Tube/Flow), specifically
`ui/theme/FlowPalettes.kt` and `ThemeCatalog.kt`, retrieved November 15, 2026.
Copyright belongs to the Flow contributors. That data is provided under GPL-3.0;
the license is included in `licenses/Flow-GPL-3.0.txt`.

The web components are adapted to this Telegram client's existing React implementation.
The design uses Flow's solid tonal surfaces, grouped lists, pill navigation,
system typography, and shared semantic color roles. Android-specific services,
YouTube functionality and Flow branding are not included.

Browser OGG/Opus encoding uses `opus-recorder`, including libopus and SpeexDSP.
Its MIT/BSD notices are included in `licenses/Opus-Recorder-LICENSE.md`.

Native private-call encryption, SCTP signaling and WebRTC transport are adapted
from [Telegram Web A](https://github.com/Ajaxy/telegram-tt) at commit
`293ede7b20390d04934f4beee6304c3560bbb5d6` (GPL-3.0).
The full license and source attribution are in `src/vendor/telegram-calls`.
Local changes use WebCrypto, app-owned processed microphone clones, portable
encoding, stable shared audio negotiation and speaker control. Distributions
must retain these sources and license notices under the upstream GPL terms.
