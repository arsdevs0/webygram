import assert from 'node:assert/strict';
import test from 'node:test';
import { createBackNavigation } from '../src/utils/backNavigation.ts';
function harness(initial: any = {}) {
  let state = initial;
  const callbacks = new Map<string, (event: any) => void>();
  const pending: Array<() => void> = [];
  let pushes = 0, backs = 0;
  const nav = createBackNavigation({ history: { get state() { return state; }, pushState(next) { state = next; pushes++; }, back() { backs++; } },
    listen(type, callback) { callbacks.set(type, callback); return () => { callbacks.delete(type); }; }, defer(callback) { pending.push(callback); } });
  return { nav, pushes: () => pushes, backs: () => backs,
    pop(next = {}) { state = next; callbacks.get('popstate')?.({ state }); while (pending.length) pending.shift()!(); },
    escape() { let prevented = false, stopped = false; callbacks.get('keydown')?.({ key: 'Escape', defaultPrevented: false, preventDefault() { prevented = true; }, stopImmediatePropagation() { stopped = true; } }); return { prevented, stopped }; } };
}
test('Back closes a nested panel before the chat, then leaves the root unguarded', () => {
  const h = harness(); let room = true, closed = 0;
  h.nav.setFallback(() => { room = false; h.nav.setFallback(undefined); });
  const remove = h.nav.add(() => { closed++; remove(); });
  assert.equal(h.pushes(), 1);
  h.pop(); assert.equal(closed, 1); assert.equal(room, true); assert.equal(h.pushes(), 2);
  h.pop(); assert.equal(room, false); assert.equal(h.pushes(), 2); assert.equal(h.backs(), 0);
});
test('UI close releases the guard without also closing the underlying room', () => {
  const h = harness(); let dismissed = 0;
  h.nav.setFallback(() => { dismissed++; }); h.nav.setFallback(undefined);
  assert.equal(h.backs(), 1); h.pop(); assert.equal(dismissed, 0);
  h.nav.setFallback(() => { dismissed++; }); assert.equal(h.pushes(), 2);
});
test('Escape is consumed once by only the topmost panel', () => {
  const h = harness(); const closed: string[] = [];
  const removeFirst = h.nav.add(() => { closed.push('first'); removeFirst(); });
  const removeSecond = h.nav.add(() => { closed.push('second'); removeSecond(); });
  assert.deepEqual(h.escape(), { prevented: true, stopped: true }); assert.deepEqual(closed, ['second']);
  h.escape(); assert.deepEqual(closed, ['second', 'first']); assert.equal(h.backs(), 1);
});
test('opening a new panel while guard removal is pending is rearmed after the pop', () => {
  const h = harness(); const remove = h.nav.add(() => {}); remove();
  let dismissed = false; h.nav.add(() => { dismissed = true; });
  h.pop(); assert.equal(dismissed, false); assert.equal(h.pushes(), 2);
});
test('a busy surface consumes Back while staying open, and reload reuses the guard', () => {
  const h = harness({ __webygramBack: true, existingState: 3 }); h.nav.add(() => {});
  assert.equal(h.pushes(), 0); h.pop(); assert.equal(h.pushes(), 1);
  h.nav.dispose(); assert.deepEqual(h.escape(), { prevented: false, stopped: false });
});
