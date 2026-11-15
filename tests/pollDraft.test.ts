import test from 'node:test';
import assert from 'node:assert/strict';
import { preparePollDraft } from '../src/utils/pollDraft.ts';

test('quiz answers retain their identity when blank options are omitted', () => {
  assert.deepEqual(preparePollDraft(['First', ' ', 'Correct'], true, 2, false, ''), { options: ['First', 'Correct'], correctOptionIndex: 1, scheduleDate: undefined });
  assert.throws(() => preparePollDraft(['First', ' ', 'Second'], true, 1, false, ''), /non-empty/);
});
test('invalid scheduled polls cannot silently send immediately', () => {
  const now = Date.parse('2026-11-15T10:00:00Z');
  for (const date of ['', 'invalid', '2026-11-14T10:00:00Z']) assert.throws(() => preparePollDraft(['A', 'B'], false, 0, true, date, now), /future/);
  assert.equal(preparePollDraft(['A', 'B'], false, 0, true, '2026-11-16T10:00:00Z', now).scheduleDate, now / 1000 + 86400);
});
