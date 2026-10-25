import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const here = new URL('.', import.meta.url);
const source = readFileSync(new URL('../client.js', here), 'utf8');

/* 1. Extract and evaluate the pure status helpers marked in client.js. */
const BEGIN = '/* TESTABLE:BEGIN */';
const END = '/* TESTABLE:END */';
const begin = source.indexOf(BEGIN);
const end = source.indexOf(END);
assert.notEqual(begin, -1, 'client.js is missing the TESTABLE:BEGIN marker');
assert.notEqual(end, -1, 'client.js is missing the TESTABLE:END marker');
const pure =
  source.slice(begin + BEGIN.length, end) +
  '\n({ deriveStates, sessionScope, resolveStates, statesKey, parseStatesKey, STATE_PRIORITY });';
const { deriveStates, sessionScope, resolveStates, statesKey, parseStatesKey, STATE_PRIORITY } =
  vm.runInNewContext(pure, {});

/* Arrays created inside the vm have a different realm prototype; copy them out
 * before deep-comparing against local literals. */
const statesOf = (...args) => Array.from(deriveStates(...args));
const resolvedOf = (states, away) => Array.from(resolveStates(states, away));
const parsedOf = (key) => Array.from(parseStatesKey(key));

/** Build one per-session status row with explicit defaults. */
const row = (over = {}) => ({
  running: undefined,
  pendingInteraction: undefined,
  completionUnread: false,
  ...over,
});

/* 2. deriveStates: concurrent facts become concurrent states, in display order. */
assert.deepEqual(statesOf(undefined), [], 'undefined snapshot is idle');
assert.deepEqual(statesOf(null), [], 'null snapshot is idle');
assert.deepEqual(statesOf(new Map()), [], 'empty snapshot is idle');
assert.deepEqual(statesOf(new Map([['s1', row()]])), [], 'plain idle session is idle');
assert.deepEqual(
  statesOf(new Map([['s1', row({ running: true })]])),
  ['running'],
  'running session is running',
);
assert.deepEqual(
  statesOf(new Map([['s1', row({ running: false, completionUnread: true })]])),
  ['done'],
  'unread completion is done',
);
assert.deepEqual(
  statesOf(new Map([['s1', row({ pendingInteraction: { key: 'q1', kind: 'question', sessionId: 's1' } })]])),
  ['reply'],
  'pending interaction is reply',
);
assert.deepEqual(
  statesOf(
    new Map([
      ['s1', row({ running: true })],
      ['s2', row({ pendingInteraction: { key: 'q1', kind: 'approval', sessionId: 's2' } })],
    ]),
  ),
  ['reply', 'running'],
  'a pending question and a running session coexist as two states',
);
assert.deepEqual(
  statesOf(
    new Map([
      ['s1', row({ running: true, pendingInteraction: { key: 'q1', kind: 'question', sessionId: 's1' } })],
    ]),
  ),
  ['reply'],
  'a Session waiting for an answer reports only reply, never reply+running',
);
assert.deepEqual(
  statesOf(
    new Map([
      ['s1', row({ running: true, pendingInteraction: { key: 'q1', kind: 'question', sessionId: 's1' } })],
      ['s2', row({ running: true })],
    ]),
  ),
  ['reply', 'running'],
  'a genuinely running other Session still adds the running state',
);
assert.deepEqual(
  statesOf(
    new Map([
      ['s1', row({ pendingInteraction: { key: 'a', kind: 'approval', sessionId: 's1' }, running: true })],
      ['s2', row({ pendingInteraction: { key: 'q', kind: 'question', sessionId: 's2' }, running: true })],
    ]),
  ),
  ['reply'],
  'several paused Sessions still report reply only',
);
assert.deepEqual(
  statesOf(
    new Map([
      ['s1', row({ completionUnread: true })],
      ['s2', row({ running: true })],
      ['s3', row({ pendingInteraction: { key: 'q1', kind: 'question', sessionId: 's3' } })],
    ]),
  ),
  ['reply', 'running', 'done'],
  'reply + running + done coexist in display order',
);
assert.deepEqual(statesOf(new Map([['s1', undefined]])), [], 'undefined rows are ignored');
assert.deepEqual(
  statesOf(new Map([['s1', row({ running: true })], ['s2', row({ running: true })]])),
  ['running'],
  'several running sessions still report one running state',
);
assert.deepEqual(Array.from(STATE_PRIORITY), ['reply', 'running', 'done'], 'band order is reply → running → done');

/* 2b. Opening the finished Session acknowledges its unread completion; other
 *     Sessions' unread completions still count. */
assert.deepEqual(
  statesOf(new Map([['s1', row({ completionUnread: true })]]), 's1'),
  [],
  'unread completion of the main-view Session is treated as read',
);
assert.deepEqual(
  statesOf(new Map([['s1', row({ completionUnread: true })]]), 's2'),
  ['done'],
  'unread completion of another Session still shows done',
);
assert.deepEqual(
  statesOf(
    new Map([
      ['s1', row({ completionUnread: true })],
      ['s2', row({ completionUnread: true })],
    ]),
    's2',
  ),
  ['done'],
  'another Session keeps the reminder alive while the main-view one is read',
);
assert.deepEqual(
  statesOf(new Map([['s1', row({ running: true })]]), 's1'),
  ['running'],
  'the main-view Session still reports its own run',
);
assert.deepEqual(
  statesOf(
    new Map([['s1', row({ pendingInteraction: { key: 'q1', kind: 'question', sessionId: 's1' } })]]),
    's1',
  ),
  ['reply'],
  'the main-view Session still reports a pending interaction',
);

/* 2c. Scope resolution: main view + the user-openable Session set. Subagent /
 *     Agent-Teams teammate Sessions are not user-openable and must stay out. */
const scopeOf = (sessionsState) => {
  const scope = sessionScope(sessionsState);
  return { mainSessionId: scope.mainSessionId, visibleIds: Array.from(scope.visibleIds).sort() };
};
assert.deepEqual(scopeOf(undefined), { mainSessionId: undefined, visibleIds: [] });
assert.deepEqual(scopeOf({ byId: {} }), { mainSessionId: undefined, visibleIds: [] });
assert.deepEqual(
  scopeOf({
    byId: {
      s1: { id: 's1', retainedBy: { sidebar: 1 } },
      s2: { id: 's2', retainedBy: { mainView: 1 } },
      sub: { id: 'sub', origin: 'subagent', parentId: 's1', retainedBy: {} },
    },
  }),
  { mainSessionId: 's2', visibleIds: ['s1', 's2'] },
  'the main view is found and subagent Sessions are excluded from visibility',
);
assert.deepEqual(
  scopeOf({
    byId: {
      child: { id: 'child', origin: 'subagent', parentId: 's1', retainedBy: { mainView: 1 } },
    },
  }),
  { mainSessionId: 'child', visibleIds: ['child'] },
  'a main-view Session is always visible, even when it is a child Session',
);
assert.deepEqual(
  scopeOf({ byId: { s1: { id: 's1' }, s2: null } }),
  { mainSessionId: undefined, visibleIds: ['s1'] },
  'rows without retention still list visible Sessions',
);

/* 2d. Only user-visible Sessions drive the tab: hidden subagent activity (e.g.
 *     a finished teammate) must never pin the favicon violet or green. */
const visible = new Set(['s1', 's2']);
assert.deepEqual(
  statesOf(new Map([['sub', row({ running: true })]])),
  ['running'],
  'without a scope every row counts (back-compat)',
);
assert.deepEqual(
  statesOf(new Map([['sub', row({ running: true })]]), undefined, visible),
  [],
  'a running subagent Session is ignored',
);
assert.deepEqual(
  statesOf(new Map([['sub', row({ completionUnread: true })]]), undefined, visible),
  [],
  'an unread subagent completion is ignored',
);
assert.deepEqual(
  statesOf(new Map([['s2', row({ running: true })]]), 's1', visible),
  ['running'],
  'a visible top-level Session still counts',
);
assert.deepEqual(
  statesOf(
    new Map([
      ['sub', row({ completionUnread: true })],
      ['s2', row({ completionUnread: true })],
    ]),
    's1',
    visible,
  ),
  ['done'],
  'only the visible unread completion counts',
);
assert.deepEqual(
  statesOf(new Map([['child', row({ running: true })]]), 'child', visible),
  ['running'],
  'the main-view Session always counts even outside the visible set',
);

/* 3. resolveStates: the local "finished while away" flag only turns idle green. */
assert.deepEqual(resolvedOf([], false), []);
assert.deepEqual(resolvedOf([], true), ['done']);
assert.deepEqual(resolvedOf(['done'], false), ['done']);
assert.deepEqual(resolvedOf(['done'], true), ['done']);
assert.deepEqual(resolvedOf(['running'], true), ['running'], 'running wins over a stale away flag');
assert.deepEqual(resolvedOf(['reply'], true), ['reply'], 'a paused question is not a finished output');
assert.deepEqual(resolvedOf(['reply', 'running'], false), ['reply', 'running']);

/* 4. State keys round-trip and stay stable for the icon cache/effect. */
assert.equal(statesKey([]), 'idle');
assert.equal(statesKey(['running']), 'running');
assert.equal(statesKey(['reply', 'running', 'done']), 'reply+running+done');
assert.deepEqual(parsedOf('idle'), []);
assert.deepEqual(parsedOf(''), []);
assert.deepEqual(parsedOf('running'), ['running']);
assert.deepEqual(parsedOf('reply+done'), ['reply', 'done']);
assert.deepEqual(parsedOf('bogus+running'), ['running'], 'unknown segments are dropped');

/* 5. Cross-file consistency: loader id == package name, and the whale path
 *    is embedded literally (no placeholder left over). */
const pkg = JSON.parse(readFileSync(new URL('../package.json', here), 'utf8'));
const loaderId = source.match(/window\.__ModuleLoader__\.load\(\{\s*id:\s*'([^']+)'/);
assert.ok(loaderId, 'client.js must register through window.__ModuleLoader__.load');
assert.equal(loaderId[1], pkg.name, 'loader id must equal the package name');
assert.ok(pkg.exports['./client'], 'package.json must export ./client');
assert.equal(pkg.dsh.client.platform, 'web');
assert.equal(pkg.dsh.client.immediately, true);
assert.ok(!source.includes('__WHALE_PATH__'), 'the whale path placeholder must be replaced');
assert.match(source, /const WHALE_PATH = '[A-Za-z0-9.,\- ]+';/, 'the embedded whale path looks malformed');

console.log('logic.test.mjs: all assertions passed');
