import test from 'node:test';
import assert from 'node:assert/strict';
import { recordingFileName } from '../src/utils/recordingMetadata.ts';

test('recording names keep chat name and timestamp, strip path characters, and match the codec', () => {
  const timestamp = Date.UTC(2026, 10, 15, 12, 30);
  assert.equal(recordingFileName('Team / VC: planning?', timestamp, 'audio/mp4'), 'Team VC planning — 2026-11-15T12-30-00-000Z.m4a');
  assert.ok(recordingFileName('हिन्दी कॉल', timestamp, 'audio/webm;codecs=opus').startsWith('हिन्दी कॉल — '));
  assert.ok(recordingFileName('', timestamp, 'audio/ogg').endsWith('.ogg'));
});
