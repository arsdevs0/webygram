import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const PROFILE_COOKIE = 'tgplus_browser';
const hash = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const validToken = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export interface BrowserProfile { id: string; dataDir: string; markerHash: string; legacy: boolean }

/** Opaque browser credentials select an isolated backend, never a shared default session. */
export class BrowserProfiles {
  readonly directory: string;
  readonly root: string;
  constructor(root: string) {
    this.root = root;
    this.directory = path.join(root, '.tgplus-browser-profiles');
    fs.mkdirSync(this.directory, { recursive: true });
  }
  token(cookie = ''): string | undefined {
    const value = cookie.split(';').map(s => s.trim()).find(s => s.startsWith(PROFILE_COOKIE + '='))?.slice(PROFILE_COOKIE.length + 1);
    return validToken(value) ? value : undefined;
  }
  read(token: string | undefined): BrowserProfile | undefined {
    if (!validToken(token)) return;
    const id = hash(token);
    try {
      const record = JSON.parse(fs.readFileSync(path.join(this.directory, id, 'profile.json'), 'utf8'));
      if (!validToken(record.markerHash)) return;
      const legacy = record.legacy === true && fs.readFileSync(path.join(this.directory, 'legacy-owner'), 'utf8') === id;
      return { id, markerHash: record.markerHash, legacy, dataDir: legacy ? this.root : path.join(this.directory, id, 'data') };
    } catch { return; }
  }
  private matchesLegacy(session: unknown): boolean {
    if (typeof session !== 'string' || !session || session.length > 10000) return false;
    for (const name of ['.tgplus-session.json', '.tgplus-vault/.tgplus-session.bak.json']) {
      try {
        const saved = JSON.parse(fs.readFileSync(path.join(this.root, name), 'utf8'));
        if (typeof saved.sessionString === 'string' && hash(saved.sessionString) === hash(session)) return true;
      } catch { /* Try the session backup. */ }
    }
    return false;
  }
  open(cookie: string | undefined, marker: unknown, legacySession?: unknown) {
    const token = this.token(cookie);
    const existing = this.read(token);
    if (existing && validToken(marker) && hash(marker) === existing.markerHash) return { profile: existing, token: token!, marker, migrated: existing.legacy };
    const nextToken = crypto.randomBytes(32).toString('hex');
    const nextMarker = crypto.randomBytes(32).toString('hex');
    const id = hash(nextToken);
    let legacy = false;
    // Only the browser that already holds this exact Telegram credential may adopt it.
    if (this.matchesLegacy(legacySession)) {
      try { fs.writeFileSync(path.join(this.directory, 'legacy-owner'), id, { flag: 'wx', mode: 0o600 }); legacy = true; } catch { /* Already assigned to another browser. */ }
    }
    const folder = path.join(this.directory, id);
    fs.mkdirSync(path.join(folder, 'data'), { recursive: true });
    fs.writeFileSync(path.join(folder, 'profile.json'), JSON.stringify({ markerHash: hash(nextMarker), legacy }), { mode: 0o600 });
    return { profile: this.read(nextToken)!, token: nextToken, marker: nextMarker, migrated: legacy };
  }
}
