import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BrowserProfiles, PROFILE_COOKIE } from '../src/server/browserProfiles.ts';

function setup(t: any) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'web-browser-profiles-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, profiles: new BrowserProfiles(root) };
}
const cookie = (token: string) => `${PROFILE_COOKIE}=${token}`;

test('two fresh browsers get independent session, media and cache directories', t => {
  const { root, profiles } = setup(t);
  fs.writeFileSync(path.join(root, '.tgplus-session.json'), JSON.stringify({ sessionString: 'existing-private-login' }));
  const a = profiles.open(undefined, undefined);
  const b = profiles.open(undefined, undefined);
  assert.notEqual(a.profile.id, b.profile.id);
  assert.notEqual(a.profile.dataDir, b.profile.dataDir);
  assert.notEqual(a.profile.dataDir, root);
  fs.writeFileSync(path.join(a.profile.dataDir, '.tgplus-session.json'), 'browser A session');
  assert.equal(fs.existsSync(path.join(b.profile.dataDir, '.tgplus-session.json')), false);
  assert.equal(a.migrated, false); assert.equal(b.migrated, false);
});

test('the same cookie and browser marker survive a gateway restart', t => {
  const { root, profiles } = setup(t);
  const a = profiles.open(undefined, undefined);
  const reopened = new BrowserProfiles(root).open(cookie(a.token), a.marker);
  assert.equal(reopened.profile.id, a.profile.id);
  assert.equal(reopened.profile.dataDir, a.profile.dataDir);
});

test('clearing cookies OR local site storage creates a signed-out profile', t => {
  const { profiles } = setup(t);
  const a = profiles.open(undefined, undefined);
  assert.notEqual(profiles.open(undefined, a.marker).profile.id, a.profile.id);
  assert.notEqual(profiles.open(cookie(a.token), undefined).profile.id, a.profile.id);
});

test('only proof of the legacy Telegram session can preserve the existing login and vault', t => {
  const { root, profiles } = setup(t);
  fs.writeFileSync(path.join(root, '.tgplus-session.json'), JSON.stringify({ sessionString: 'existing-private-login' }));
  const visitor = profiles.open(undefined, undefined, 'wrong-login');
  assert.notEqual(visitor.profile.dataDir, root);
  const owner = profiles.open(undefined, undefined, 'existing-private-login');
  assert.equal(owner.profile.dataDir, root);
  assert.equal(owner.migrated, true);
  const duplicate = profiles.open(undefined, undefined, 'existing-private-login');
  assert.notEqual(duplicate.profile.dataDir, root);
  assert.equal(new BrowserProfiles(root).read(owner.token)?.dataDir, root);
  assert.equal(fs.existsSync(path.join(root, '.tgplus-session.json')), true);
});

test('unknown and malformed browser credentials never fall back to the owner session', t => {
  const { profiles } = setup(t);
  for (const token of [undefined, '../.tgplus-session.json', 'x'.repeat(64), 'a'.repeat(64)]) assert.equal(profiles.read(token), undefined);
  assert.equal(profiles.token('unrelated=a; tgplus_browser=../data'), undefined);
});
