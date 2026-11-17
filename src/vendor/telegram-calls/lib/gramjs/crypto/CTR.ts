// WebCrypto boundary; the packet format and authenticated key derivation are unchanged.
export class CTR {
  constructor(private key: Uint8Array, private iv: Uint8Array) { if (key.length !== 32 || iv.length !== 16) throw new Error("Invalid AES-CTR key"); }
  private async run(data: Uint8Array, mode: "encrypt" | "decrypt") {
    const key = await crypto.subtle.importKey("raw", new Uint8Array(this.key), "AES-CTR", false, [mode]);
    return new Uint8Array(await crypto.subtle[mode]({ name:"AES-CTR", counter:new Uint8Array(this.iv), length:128 }, key, new Uint8Array(data)));
  }
  encrypt(data: Uint8Array) { return this.run(data, "encrypt"); }
  decrypt(data: Uint8Array) { return this.run(data, "decrypt"); }
}
