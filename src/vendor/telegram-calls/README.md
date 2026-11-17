# Telegram Web A call transport
Vendored from https://github.com/Ajaxy/telegram-tt/tree/293ede7b20390d04934f4beee6304c3560bbb5d6/src (GPL-3.0; full license alongside).
Local adaptations: WebCrypto hash/AES-CTR boundary, app-owned live DSP microphone clones, speaker control, standalone types and disabled diagnostics.
DH parameter/public-value validation, commitment and fingerprint verification, authenticated signaling and replay window are preserved.
Do not log call keys or decrypted signaling. This source must remain available when distributing the web bundle.
