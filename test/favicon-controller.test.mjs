import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const here = new URL('.', import.meta.url);
const source = readFileSync(new URL('../client.js', here), 'utf8');

/* Extract and evaluate the <head> link helpers marked in client.js. */
const BEGIN = '/* TESTABLE-DOM:BEGIN */';
const END = '/* TESTABLE-DOM:END */';
const begin = source.indexOf(BEGIN);
const end = source.indexOf(END);
assert.notEqual(begin, -1, 'client.js is missing the TESTABLE-DOM:BEGIN marker');
assert.notEqual(end, -1, 'client.js is missing the TESTABLE-DOM:END marker');
const pure =
  source.slice(begin + BEGIN.length, end) +
  '\n({ detachIconLinks, restoreIconLinks, captureIconLinks, OWNED_ATTRIBUTE, SHIPPED_ICON_LINKS });';
const { detachIconLinks, restoreIconLinks, captureIconLinks, OWNED_ATTRIBUTE, SHIPPED_ICON_LINKS } =
  vm.runInNewContext(pure, {});

/* Minimal DOM faithful to the behaviors that matter here:
 * - insertBefore throws NotFoundError when the reference is not a child;
 * - nextSibling is maintained on every mutation;
 * - querySelectorAll understands the one selector the controller uses. */
class FakeLink {
  constructor(id, rel = 'icon') {
    this.id = id;
    this.rel = rel;
    this.tagName = 'link';
    this.parentNode = null;
    this.nextSibling = null;
    this.attributes = {};
    this.type = '';
    this.media = '';
    this.href = '';
  }
  hasAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name);
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
  toString() {
    return this.id;
  }
}

class FakeParent {
  constructor(label) {
    this.label = label;
    this.childNodes = [];
  }
  relink() {
    for (let index = 0; index < this.childNodes.length; index += 1) {
      const node = this.childNodes[index];
      node.parentNode = this;
      node.nextSibling = index + 1 < this.childNodes.length ? this.childNodes[index + 1] : null;
    }
  }
  insertBefore(node, reference) {
    if (reference !== null && reference.parentNode !== this) {
      const error = new Error(`${this.label}: reference node is not a child (NotFoundError)`);
      error.name = 'NotFoundError';
      throw error;
    }
    if (node.parentNode !== null) node.parentNode.removeChild(node);
    const index = reference === null ? this.childNodes.length : this.childNodes.indexOf(reference);
    this.childNodes.splice(index, 0, node);
    this.relink();
    return node;
  }
  appendChild(node) {
    return this.insertBefore(node, null);
  }
  removeChild(node) {
    const index = this.childNodes.indexOf(node);
    if (index === -1) throw new Error(`${this.label}: removeChild on a non-child`);
    this.childNodes.splice(index, 1);
    node.parentNode = null;
    node.nextSibling = null;
    this.relink();
    return node;
  }
  querySelectorAll(selector) {
    assert.equal(selector, 'link[rel~="icon"]', `unsupported fake selector: ${selector}`);
    return this.childNodes.filter(
      (node) => node.tagName === 'link' && String(node.rel).split(/\s+/).includes('icon'),
    );
  }
  ids() {
    return this.childNodes.map((node) => node.id);
  }
}

/** Link factory handed to captureIconLinks in place of document.createElement. */
let createdCount = 0;
const createLink = () => {
  createdCount += 1;
  return new FakeLink(`created-${createdCount}`);
};

/** Build the shipped page's head: manifest, dark icon, light icon, title. */
function makeHead() {
  const head = new FakeParent('head');
  head.appendChild(new FakeLink('manifest', 'manifest'));
  const dark = new FakeLink('favicon-dark.svg');
  const light = new FakeLink('favicon.svg');
  head.appendChild(dark);
  head.appendChild(light);
  head.appendChild(new FakeLink('title', 'title'));
  return { head, dark, light };
}

/* 1. Capture keeps the real icons and their positions; detach removes both and
 *    leaves the rest of the head intact. */
{
  const { head, dark, light } = makeHead();
  const originals = captureIconLinks(head, createLink);
  assert.equal(originals.length, 2);
  assert.equal(originals[0].next, light, 'captured next must be the light icon');
  assert.equal(originals[1].next.id, 'title', 'captured next of the last icon is the title');

  detachIconLinks(originals);
  assert.deepEqual(head.ids(), ['manifest', 'title']);
  assert.equal(dark.parentNode, null);
  assert.equal(light.parentNode, null);
}

/* 2. Fake-DOM fidelity: restoring forward (the fixed code's exact hazard)
 *    throws NotFoundError because originals[0].next is still detached. */
{
  const { head } = makeHead();
  const originals = captureIconLinks(head, createLink);
  detachIconLinks(originals);
  assert.throws(
    () => head.insertBefore(originals[0].link, originals[1].link),
    /NotFoundError/,
  );
}

/* 3. The regression: detach + restore keeps the original order and never
 *    throws, so the first running -> idle transition cannot blank the entry. */
{
  const { head } = makeHead();
  const originals = captureIconLinks(head, createLink);
  detachIconLinks(originals);
  restoreIconLinks(head, originals);
  assert.deepEqual(head.ids(), ['manifest', 'favicon-dark.svg', 'favicon.svg', 'title']);
  for (const item of originals) assert.equal(item.link.parentNode, head);
}

/* 4. Restore is idempotent (set('idle') followed by dispose() is harmless). */
{
  const { head } = makeHead();
  const originals = captureIconLinks(head, createLink);
  detachIconLinks(originals);
  restoreIconLinks(head, originals);
  restoreIconLinks(head, originals);
  assert.deepEqual(head.ids(), ['manifest', 'favicon-dark.svg', 'favicon.svg', 'title']);
}

/* 5. A single icon link works like the shipped page would with one icon. */
{
  const head = new FakeParent('head');
  head.appendChild(new FakeLink('favicon.svg'));
  head.appendChild(new FakeLink('title', 'title'));
  const originals = captureIconLinks(head, createLink);
  detachIconLinks(originals);
  restoreIconLinks(head, originals);
  assert.deepEqual(head.ids(), ['favicon.svg', 'title']);
}

/* 6. A recorded reference that left the document is dropped instead of passed
 *    to insertBefore (the old code's other failure mode). */
{
  const { head } = makeHead();
  const originals = captureIconLinks(head, createLink);
  detachIconLinks(originals);
  head.removeChild(head.childNodes.find((node) => node.id === 'title'));
  restoreIconLinks(head, originals);
  assert.deepEqual(head.ids(), ['manifest', 'favicon-dark.svg', 'favicon.svg']);
}

/* 7. A captured parent that no longer exists falls back to appendChild. */
{
  const head = new FakeParent('head');
  const items = [{ link: new FakeLink('orphan.svg'), parent: null, next: null }];
  restoreIconLinks(head, items);
  assert.deepEqual(head.ids(), ['orphan.svg']);
  assert.equal(items[0].link.parentNode, head);
}

/* 8. Heal: a head with no icons gets the shipped relative pair back (the
 *    recovery path for a page damaged by an older generation of this plugin). */
{
  const head = new FakeParent('head');
  head.appendChild(new FakeLink('title', 'title'));
  const before = createdCount;
  const originals = captureIconLinks(head, createLink);
  assert.equal(createdCount - before, 2, 'heal must create exactly two links');
  assert.equal(originals.length, 2);
  const [dark, light] = originals.map((item) => item.link);
  assert.equal(dark.href, './favicon-dark.svg', 'heal keeps the shipped relative href');
  assert.equal(light.href, './favicon.svg');
  assert.equal(dark.media, '(prefers-color-scheme: dark)');
  assert.equal(light.media, '(prefers-color-scheme: light)');
  assert.equal(dark.type, 'image/svg+xml');
  assert.equal(SHIPPED_ICON_LINKS.length, 2);
  assert.deepEqual(head.ids(), ['title', 'created-1', 'created-2']);

  /* A healed pair behaves like the real pair: active -> idle restores it. */
  detachIconLinks(originals);
  assert.deepEqual(head.ids(), ['title']);
  restoreIconLinks(head, originals);
  assert.deepEqual(head.ids(), ['title', 'created-1', 'created-2']);
}

/* 9. The plugin's own managed link is never captured as a page icon, and its
 *    presence does not trigger a heal. */
{
  const { head } = makeHead();
  const owned = new FakeLink('managed');
  owned.setAttribute(OWNED_ATTRIBUTE, '');
  head.appendChild(owned);
  const before = createdCount;
  const originals = captureIconLinks(head, createLink);
  assert.equal(createdCount, before, 'no heal when real icons exist');
  assert.equal(originals.length, 2);
  assert.ok(
    originals.every((item) => item.link !== owned),
    'the owned link must be filtered out',
  );
}

/* 10. Favicon artwork: the whale glyph alone, one or more fill colors.
 *     The tab background must stay the browser's own. */
{
  const ART_BEGIN = '/* TESTABLE-ART:BEGIN */';
  const ART_END = '/* TESTABLE-ART:END */';
  const artBegin = source.indexOf(ART_BEGIN);
  const artEnd = source.indexOf(ART_END);
  assert.notEqual(artBegin, -1, 'client.js is missing the TESTABLE-ART:BEGIN marker');
  assert.notEqual(artEnd, -1, 'client.js is missing the TESTABLE-ART:END marker');
  const artCode =
    source.slice(artBegin + ART_BEGIN.length, artEnd) + '\n({ iconSvgMarkup });';
  const { iconSvgMarkup } = vm.runInNewContext(artCode, {});
  const whale = source.match(/const WHALE_PATH = '([^']+)';/);
  assert.ok(whale, 'client.js must embed the whale path');

  /* One state: the whole whale is that color, no background badge. */
  const single = iconSvgMarkup(['#f59e0b'], whale[1]);
  assert.ok(single.startsWith('<svg') && single.endsWith('</svg>'), 'markup is a standalone SVG');
  assert.ok(!single.includes('<rect'), 'a single color must not paint any rect');
  assert.ok(!single.includes('background'), 'the favicon must not set a background');
  assert.ok(single.includes('fill="#f59e0b"'), 'the whale must use the state color as its fill');
  assert.ok(single.includes(whale[1]), 'the product whale silhouette must be preserved');
  assert.ok(single.includes('viewBox="0 0 50 50"'), 'the path viewBox must match the shipped glyph');

  /* Two states: equal left→right color bands, clipped to the whale. */
  const dual = iconSvgMarkup(['#f59e0b', '#886bae'], whale[1]);
  assert.ok(dual.includes('clip-path="url(#dsh-tab-status-whale)"'), 'bands must be clipped to the whale');
  assert.ok(dual.includes('<clipPath id="dsh-tab-status-whale"><path d="' + whale[1]), 'clip path reuses the whale');
  assert.equal((dual.match(/<rect /g) || []).length, 2, 'two states paint two bands');
  assert.ok(dual.includes('width="25"'), 'two bands split the 50-unit viewBox in half');
  assert.ok(dual.includes('fill="#f59e0b"') && dual.includes('fill="#886bae"'), 'both state colors are used');
  assert.ok(!dual.includes('width="50"'), 'no band may cover the whole glyph');

  /* Three states: left amber, middle violet, right green. */
  const triple = iconSvgMarkup(['#f59e0b', '#886bae', '#22c55e'], whale[1]);
  assert.equal((triple.match(/<rect /g) || []).length, 3, 'three states paint three bands');
  const order = ['#f59e0b', '#886bae', '#22c55e'].map((color) => triple.indexOf('fill="' + color + '"'));
  assert.ok(order[0] < order[1] && order[1] < order[2], 'bands are painted in state display order');
  assert.equal((triple.match(/<path /g) || []).length, 1, 'the whale itself is painted once (as the clip)');
}

/* 11. Colors come from DSH's own state/event palette, not an invented one. */
{
  /* reply / done: the host StateDot warning/done tokens. */
  for (const [state, token] of [
    ['reply', '--dsw-alias-state-warn-primary'],
    ['done', '--dsw-alias-state-success-primary'],
  ]) {
    assert.ok(
      source.includes(`${state}: { token: '${token}'`),
      `${state} must resolve the DSH token ${token}`,
    );
  }
  /* running: the Trajectory assistant event violet, never the logo blue. */
  const runningBlock = source.slice(
    source.indexOf('running: {'),
    source.indexOf('/* StateDot `warning`'),
  );
  assert.ok(
    runningBlock.includes('color-mix(in srgb'),
    'running must use the DSH assistant-violet color-mix',
  );
  assert.ok(
    runningBlock.includes('--dsw-alias-brand-primary-new-colorprimary-new-color') &&
      runningBlock.includes('--dsw-alias-state-error-secondary'),
    'running must mix the brand token with error-secondary, like assistant events do',
  );
  assert.ok(
    !runningBlock.includes('--dsw-alias-label-deep-diving') &&
      !source.includes('--dsw-alias-label-deep-diving'),
    'the running color must not be the logo-adjacent blue',
  );
  for (const retired of ['#3B82F6', '#EF4444', '#3968c4']) {
    assert.ok(!source.includes(retired), `the invented color ${retired} must be gone`);
  }
}

console.log('favicon-controller.test.mjs: all assertions passed');
