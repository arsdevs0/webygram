const PASSCODE_STORAGE_KEY = 'tgplus_passcode_lock_v1';
const LOCK_STATE_KEY = 'tgplus_passcode_is_locked_v1';

interface StoredPasscodeConfig {
  salt: string;
  hash: string;
  autoLockMinutes: number; // 0 = manual only, 1, 5, 15
}

async function sha256Hex(input: string): Promise<string> {
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    const encoded = new TextEncoder().encode(input);
    const digest = await window.crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Fallback deterministic hash if SubtleCrypto is unavailable in non-secure context
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  return (
    ((h1 >>> 0).toString(16).padStart(8, '0')) +
    ((h2 >>> 0).toString(16).padStart(8, '0'))
  );
}

function readConfig(): StoredPasscodeConfig | null {
  try {
    const raw = localStorage.getItem(PASSCODE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredPasscodeConfig;
    if (parsed && typeof parsed.hash === 'string' && typeof parsed.salt === 'string') {
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

class PasscodeService {
  private listeners: Set<() => void> = new Set();

  public subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private notify() {
    this.listeners.forEach((fn) => fn());
  }

  public hasPasscode(): boolean {
    return readConfig() !== null;
  }

  public getAutoLockMinutes(): number {
    return readConfig()?.autoLockMinutes ?? 5;
  }

  public setAutoLockMinutes(minutes: number): void {
    const cfg = readConfig();
    if (!cfg) return;
    cfg.autoLockMinutes = minutes;
    localStorage.setItem(PASSCODE_STORAGE_KEY, JSON.stringify(cfg));
    this.notify();
  }

  public async setPasscode(pin: string, autoLockMinutes: number = 5): Promise<void> {
    const trimmed = pin.trim();
    if (trimmed.length < 4) {
      throw new Error('Passcode must be at least 4 characters or digits.');
    }
    const salt = Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
    const hash = await sha256Hex(`${salt}:${trimmed}`);
    const config: StoredPasscodeConfig = { salt, hash, autoLockMinutes };
    localStorage.setItem(PASSCODE_STORAGE_KEY, JSON.stringify(config));
    localStorage.setItem(LOCK_STATE_KEY, '0');
    this.notify();
  }

  public removePasscode(): void {
    localStorage.removeItem(PASSCODE_STORAGE_KEY);
    localStorage.removeItem(LOCK_STATE_KEY);
    this.notify();
  }

  public async verifyPasscode(pin: string): Promise<boolean> {
    const cfg = readConfig();
    if (!cfg) return true;
    const candidate = await sha256Hex(`${cfg.salt}:${pin.trim()}`);
    return candidate === cfg.hash;
  }

  public isLocked(): boolean {
    if (!this.hasPasscode()) return false;
    return localStorage.getItem(LOCK_STATE_KEY) === '1';
  }

  public lockNow(): void {
    if (!this.hasPasscode()) return;
    localStorage.setItem(LOCK_STATE_KEY, '1');
    this.notify();
  }

  public async unlockWithPass(pin: string): Promise<boolean> {
    const valid = await this.verifyPasscode(pin);
    if (valid) {
      localStorage.setItem(LOCK_STATE_KEY, '0');
      this.notify();
    }
    return valid;
  }
}

export const passcodeService = new PasscodeService();
