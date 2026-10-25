/**
 * dsh-tab-status-light — browser half.
 *
 * Recolors the whale inside the browser-tab favicon from Client session status.
 * The tab keeps its own background: only the glyph's fill changes.
 *
 *   idle    — restore the shipped favicon untouched (原色)
 *   running — DSH's assistant event violet: a session is generating / waiting
 *             for the model's reply (待回复、生成中). The color is the
 *             Trajectory `.assistantVioletBright` mix
 *             (brand 60% + error-secondary 40%), deliberately NOT the DeepSeek
 *             logo blue so the status stays distinguishable from the brand.
 *   reply   — `--dsw-alias-state-warn-primary`: a question or approval waits
 *             for you. This is the `warning` tone of the host's StateDot
 *             (等待回答/等待批准).
 *   done    — `--dsw-alias-state-success-primary`: output finished while you
 *             were away. This is the `done` tone of the host's StateDot.
 *             Opening that Session (it becomes the main view) acknowledges it
 *             immediately, and any interaction with the page clears the local
 *             "finished while away" reminder — the tab never stays green after
 *             you have looked at the session.
 *
 * Colors are read from the live theme (CSS custom properties resolved through
 * a probe element), so light/dark and custom themes apply automatically; when a
 * token is missing the shipped palette value is used as a fallback.
 *
 * Several states can be active at the same time (e.g. one Session runs while
 * another has an unread completion, or a question waits while the main view
 * finished). The glyph then paints one vertical color band per state, left to
 * right in `STATE_PRIORITY` order: reply (amber) → running (violet) → done
 * (green). White/original only exists when no state is active.
 *
 * Data source: the `useSessionStatus` root selector hook that
 * `@deepseek-ai/dsh-client-ui-session` exposes to every root-scope slot. That
 * snapshot already folds `running`, `pendingInteraction` and `completionUnread`
 * per session, so this module adds no polling and no session-log folding.
 *
 * Only top-level, user-openable Sessions drive the tab. Subagent / Agent-Teams
 * teammate Sessions are filtered out: the sidebar never opens them as a normal
 * view, so their "unread completion" could otherwise pin the tab green forever.
 *
 * The browser-tab icon is document-level chrome, not slot content, so no React
 * element is rendered: a null-rendering occupant of `shell.overlay` owns a tiny
 * controller whose effects (a) swap the `link[rel~="icon"]` elements while a
 * state is active and (b) restore the originals on idle or unmount. No DOM
 * outside <head> is touched and no Harness Client package is imported.
 */

window.__ModuleLoader__.load({
  id: 'dsh-tab-status-light',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Root slot this entry occupies; a null-rendering entry is enough. */
    const SLOT = 'shell.overlay';
    const ENTRY_ID = 'tab-status-light';
    const ORDER = 40;

    /**
     * The color DSH itself gives each state, as theme tokens plus the shipped
     * palette value used when those tokens are absent. Tokens are resolved at
     * runtime, so light/dark themes and token overrides are honored.
     *
     * `running` deliberately uses DSH's **assistant event color** (violet) from
     * the Trajectory palette — `color-mix(brand 60%, error-secondary 40%)`, the
     * `.assistantVioletBright` event label — not the DeepSeek logo blue, so the
     * tab status stays distinguishable from the brand mark itself.
     */
    const STATUS_COLOR_SPECS = Object.freeze({
      running: {
        css:
          'color-mix(in srgb, ' +
          'var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6) 60%, ' +
          'var(--dsw-alias-state-error-secondary, #f25a5a))',
        fallback: '#886bae',
      },
      /* StateDot `warning`: 等待回答 / 等待批准. */
      reply: { token: '--dsw-alias-state-warn-primary', fallback: '#f59e0b' },
      /* StateDot `done`: 输出结束（未读完成）. */
      done: { token: '--dsw-alias-state-success-primary', fallback: '#22c55e' },
    });

    /**
     * Let the browser evaluate one CSS color expression (var()/color-mix())
     * through a hidden probe, which is the only way to get a concrete color.
     * @param {string} cssColor - any CSS color value.
     * @param {string} fallback - literal color returned when evaluation fails.
     * @returns {string} a resolved CSS color.
     */
    function probeColor(cssColor, fallback) {
      try {
        if (typeof document === 'undefined' || document.body === null) return fallback;
        const probe = document.createElement('span');
        probe.style.color = cssColor;
        probe.style.display = 'none';
        document.body.appendChild(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return typeof color === 'string' && color.length > 0 ? color : fallback;
      } catch (error) {
        return fallback;
      }
    }

    /**
     * Resolve one status color spec to a concrete color.
     * @param {{ token?: string, css?: string, fallback: string }} spec - color source.
     * @returns {string} a resolved CSS color.
     */
    function resolveStatusColor(spec) {
      if (typeof spec.css === 'string') {
        try {
          if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function') return spec.fallback;
          if (!CSS.supports('color', spec.css)) return spec.fallback;
        } catch (error) {
          return spec.fallback;
        }
        return probeColor(spec.css, spec.fallback);
      }
      return probeColor('var(' + spec.token + ', ' + spec.fallback + ')', spec.fallback);
    }

    /** Theme revision: bumped on `theme/change` so icons rebuild with new colors. */
    let colorEpoch = 0;
    const colorEpochListeners = new Set();

    /**
     * @param {() => void} listener - called after the resolved theme colors changed.
     * @returns {() => void} unsubscribe.
     */
    function subscribeColorEpoch(listener) {
      colorEpochListeners.add(listener);
      return () => {
        colorEpochListeners.delete(listener);
      };
    }

    /** Drop cached icon data URIs and re-render with the new theme colors. */
    function bumpColorEpoch() {
      colorEpoch += 1;
      iconCache.clear();
      for (const listener of colorEpochListeners) listener();
    }

    /**
     * DeepSeek whale glyph, taken from the shipped `favicon.svg` of
     * `@deepseek-ai/dsh-web-frontend` (MIT). Only the fill color changes: the
     * silhouette stays the product mark and the tab background stays the
     * browser's own (no badge behind the glyph).
     */
    const WHALE_PATH = 'M48.8354 10.0479C48.3232 9.79199 48.1025 10.2798 47.8032 10.5278C47.7007 10.6079 47.6143 10.7119 47.5273 10.8076C46.7793 11.624 45.9048 12.1597 44.7622 12.0957C43.0923 12 41.666 12.5356 40.4058 13.8398C40.1377 12.2319 39.2476 11.272 37.8926 10.6558C37.1836 10.3359 36.4668 10.0156 35.9702 9.31982C35.6235 8.82373 35.5293 8.27197 35.356 7.72754C35.2456 7.3999 35.1353 7.06396 34.7651 7.00781C34.3633 6.94385 34.2056 7.2876 34.0479 7.57568C33.418 8.75195 33.1733 10.0479 33.1973 11.3599C33.2524 14.312 34.4736 16.6641 36.8999 18.3359C37.1758 18.5278 37.2466 18.7197 37.1597 19C36.9946 19.5757 36.7974 20.1357 36.624 20.7119C36.5137 21.0801 36.3486 21.1597 35.9624 21C34.6309 20.4321 33.481 19.5918 32.4644 18.5757C30.7393 16.8721 29.1792 14.9917 27.2334 13.52C26.7764 13.1758 26.3193 12.856 25.8467 12.5518C23.8618 10.584 26.1069 8.96777 26.627 8.77588C27.1704 8.57568 26.8159 7.8877 25.0591 7.896C23.3022 7.90381 21.6953 8.50391 19.647 9.30371C19.3477 9.42383 19.0322 9.51172 18.7095 9.58398C16.8501 9.22363 14.9199 9.14355 12.9033 9.37598C9.10596 9.80762 6.07275 11.6396 3.84326 14.7681C1.16455 18.5278 0.53418 22.7998 1.30664 27.2559C2.11768 31.9521 4.46582 35.8398 8.07373 38.8799C11.8159 42.0322 16.1255 43.5762 21.041 43.2803C24.0269 43.104 27.3516 42.6963 31.1016 39.4561C32.0469 39.936 33.0396 40.1279 34.686 40.272C35.9546 40.3921 37.1758 40.208 38.1211 40.0078C39.6021 39.688 39.4995 38.2881 38.9639 38.0322C34.623 35.9678 35.5762 36.8081 34.71 36.1279C36.9155 33.4639 40.2402 30.6958 41.54 21.728C41.6426 21.0161 41.5557 20.5679 41.54 19.9917C41.5322 19.6396 41.6108 19.5039 42.0049 19.4639C43.0923 19.3359 44.1479 19.0317 45.1167 18.4878C47.9292 16.9199 49.064 14.3438 49.3315 11.2559C49.3711 10.7837 49.3237 10.2959 48.8354 10.0479ZM24.3262 37.8398C20.1196 34.4639 18.0791 33.3521 17.2358 33.3999C16.4482 33.4482 16.5898 34.3682 16.7632 34.9678C16.9443 35.5601 17.1812 35.9683 17.5117 36.4878C17.7402 36.832 17.8979 37.3442 17.2832 37.728C15.9282 38.584 13.5728 37.4399 13.4624 37.3838C10.7207 35.7358 8.42822 33.5601 6.81348 30.584C5.25342 27.7197 4.34766 24.6479 4.19775 21.3677C4.1582 20.5757 4.38672 20.2959 5.15869 20.1519C6.17529 19.96 7.22314 19.9199 8.23926 20.0718C12.5327 20.7119 16.1885 22.6719 19.2529 25.7759C21.002 27.5439 22.3252 29.6558 23.6885 31.7202C25.1377 33.9121 26.6978 36 28.6831 37.7119C29.3843 38.312 29.9434 38.7681 30.479 39.104C28.8643 39.2881 26.1699 39.3281 24.3262 37.8398ZM26.3433 24.6001C26.3433 24.248 26.6191 23.9678 26.9658 23.9678C27.0444 23.9678 27.1152 23.9839 27.1782 24.0078C27.2651 24.04 27.3438 24.0879 27.4067 24.1602C27.5171 24.272 27.5801 24.4321 27.5801 24.6001C27.5801 24.9521 27.3042 25.2319 26.9575 25.2319C26.6108 25.2319 26.3433 24.9521 26.3433 24.6001ZM32.6064 27.8799C32.2046 28.0479 31.8027 28.1919 31.4165 28.208C30.8179 28.2397 30.1641 27.9922 29.8096 27.688C29.2583 27.2158 28.8643 26.9521 28.6987 26.1279C28.6279 25.7759 28.6675 25.2319 28.7305 24.9199C28.8721 24.248 28.7144 23.8159 28.2495 23.4238C27.8716 23.104 27.3911 23.0161 26.8633 23.0161C26.666 23.0161 26.4849 22.9277 26.3511 22.856C26.1304 22.7441 25.9492 22.4639 26.1226 22.1201C26.1777 22.0078 26.4458 21.7358 26.5088 21.688C27.2256 21.272 28.0527 21.4077 28.8169 21.7197C29.5259 22.0161 30.0615 22.5601 30.834 23.3281C31.6216 24.2559 31.7632 24.5117 32.2124 25.208C32.5669 25.752 32.8901 26.312 33.1104 26.9521C33.2446 27.3521 33.0713 27.6802 32.6064 27.8799Z';

    /* ------------------------------------------------------------------ */
    /* Pure status helpers (mirrored by test/logic.test.mjs)               */
    /* ------------------------------------------------------------------ */

    /* TESTABLE:BEGIN */
    /** Display order of concurrent states; the favicon paints bands left→right. */
    const STATE_PRIORITY = Object.freeze(['reply', 'running', 'done']);

    /**
     * Fold the per-session status snapshot into the states that are active right
     * now, in display order. Several Sessions (or one Session that both runs and
     * has an unread completion) can make several states active at once; the
     * favicon then paints one color band per state.
     *
     * `completionUnread` is ignored for the Session currently shown in the main
     * view: opening a finished Session is the acknowledgement itself, so the
     * tab must not stay green after the user clicks that Session (the host can
     * clear its own unread a tick later; the tab should not lag behind).
     *
     * Only Sessions in `visibleIds` are considered. Subagent / Agent-Teams
     * teammate Sessions are excluded: the sidebar never lets the user open them
     * as a normal view, so their unread completion would otherwise pin the tab
     * green forever.
     * @param statusSnapshot - `SessionStatusSnapshot`, a Map-like of SessionId to
     *   `{ running?: boolean, pendingInteraction?: unknown, completionUnread?: boolean }`.
     * @param {string} [mainSessionId] - Session the user is viewing right now.
     * @param {Set<string>} [visibleIds] - user-visible (top-level) Session ids; omitted counts every row.
     * @returns {Array<'reply'|'running'|'done'>} active states, display order.
     */
    function deriveStates(statusSnapshot, mainSessionId, visibleIds) {
      if (statusSnapshot === undefined || statusSnapshot === null) return [];
      const entries = typeof statusSnapshot.entries === 'function' ? statusSnapshot.entries() : [];
      const scopeKnown = visibleIds !== undefined && visibleIds !== null && typeof visibleIds.has === 'function';
      let running = false;
      let reply = false;
      let finished = false;
      for (const [sessionId, status] of entries) {
        if (status === undefined || status === null) continue;
        if (scopeKnown && sessionId !== mainSessionId && !visibleIds.has(sessionId)) continue;
        /* A pending question pauses its own Session, and the host keeps that
         * Session's `running` true while the Turn waits for the answer. That
         * run is already represented by `reply`, so it must not light the
         * "running" state as well — otherwise one question paints two bands.
         * Genuine runs in OTHER Sessions still count. */
        const pending = status.pendingInteraction !== undefined && status.pendingInteraction !== null;
        if (pending) reply = true;
        if (!pending && status.running === true) running = true;
        if (status.completionUnread === true && sessionId !== mainSessionId) finished = true;
      }
      const states = [];
      if (reply) states.push('reply');
      if (running) states.push('running');
      if (finished) states.push('done');
      return states;
    }

    /**
     * Resolve what the tab should watch from the Session catalog: the Session
     * the user is viewing (the one retained by the main view, same rule as the
     * shell's DocumentTitle) plus the set of top-level, user-openable Sessions.
     * Subagent / Agent-Teams teammate Sessions (`origin === 'subagent'`) are
     * left out of the visible set; the main-view Session is always included so
     * opening even a child Session reports its own activity.
     * @param {object} sessionsState - `SessionListState` from `useSessions`.
     * @returns {{ mainSessionId: string|undefined, visibleIds: Set<string> }} scope.
     */
    function sessionScope(sessionsState) {
      const scope = { mainSessionId: undefined, visibleIds: new Set() };
      if (sessionsState === undefined || sessionsState === null || sessionsState.byId === undefined) return scope;
      for (const [id, session] of Object.entries(sessionsState.byId)) {
        if (session === undefined || session === null) continue;
        const retainedBy = session.retainedBy;
        if (retainedBy !== undefined && retainedBy !== null && (retainedBy.mainView ?? 0) > 0) scope.mainSessionId = session.id;
        if (session.origin === 'subagent') continue;
        scope.visibleIds.add(id);
      }
      if (scope.mainSessionId !== undefined) scope.visibleIds.add(scope.mainSessionId);
      return scope;
    }

    /**
     * Add the local "finished while the tab was in the background" reminder.
     * The flag covers the Session that owns the main view (the Client status
     * source does not mark that Session's completion as unread). It only turns
     * the idle glyph green: when any logged state is active, that state already
     * explains the tab, and a paused question is not a finished output.
     * @param {Array<'reply'|'running'|'done'>} states - states from `deriveStates`.
     * @param {boolean} finishedWhileAway - whether a run ended while the tab was not focused.
     * @returns {Array<'reply'|'running'|'done'>} states the favicon paints.
     */
    function resolveStates(states, finishedWhileAway) {
      if (states.length > 0) return states;
      return finishedWhileAway === true ? ['done'] : states;
    }

    /**
     * Stable cache/effect key for a state list; `idle` when nothing is active.
     * @param {Array<'reply'|'running'|'done'>} states - active states.
     * @returns {string} e.g. `idle`, `running`, `reply+done`.
     */
    function statesKey(states) {
      return states.length === 0 ? 'idle' : states.join('+');
    }

    /**
     * Parse a `statesKey` back into the known states (unknown segments dropped).
     * @param {string} key - key from `statesKey`.
     * @returns {Array<'reply'|'running'|'done'>} active states.
     */
    function parseStatesKey(key) {
      if (typeof key !== 'string' || key.length === 0 || key === 'idle') return [];
      return key.split('+').filter((state) => STATE_PRIORITY.includes(state));
    }
    /* TESTABLE:END */

    /* ------------------------------------------------------------------ */
    /* Favicon artwork                                                     */
    /* ------------------------------------------------------------------ */

    /* TESTABLE-ART:BEGIN */
    /**
     * Favicon SVG markup: the whale alone, painted with one or more colors.
     * One color fills the whole glyph; several colors split it into equal
     * vertical bands (left→right in state display order). There is deliberately
     * no background rect — the tab keeps its own background and only the glyph
     * is painted.
     * @param {string[]} colors - CSS colors, one per active state.
     * @param {string} whalePath - SVG path data of the whale silhouette.
     * @returns {string} standalone SVG markup.
     */
    function iconSvgMarkup(colors, whalePath) {
      const bands = Array.isArray(colors) ? colors.filter((color) => typeof color === 'string' && color.length > 0) : [];
      if (bands.length <= 1) {
        const color = bands.length === 1 ? bands[0] : 'currentColor';
        return (
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50">' +
          '<path d="' +
          whalePath +
          '" fill="' +
          color +
          '"/></svg>'
        );
      }
      const bandWidth = 50 / bands.length;
      let rects = '';
      for (let index = 0; index < bands.length; index += 1) {
        rects +=
          '<rect x="' +
          index * bandWidth +
          '" y="0" width="' +
          bandWidth +
          '" height="50" fill="' +
          bands[index] +
          '"/>';
      }
      return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50">' +
        '<defs><clipPath id="dsh-tab-status-whale"><path d="' +
        whalePath +
        '"/></clipPath></defs>' +
        '<g clip-path="url(#dsh-tab-status-whale)">' +
        rects +
        '</g></svg>'
      );
    }
    /* TESTABLE-ART:END */

    /**
     * SVG data URI fallback (used when a canvas is unavailable).
     * @param {string[]} colors - CSS colors, one per active state.
     * @returns {string} data URI.
     */
    function svgDataUrl(colors) {
      return 'data:image/svg+xml,' + encodeURIComponent(iconSvgMarkup(colors, WHALE_PATH));
    }

    /**
     * Rasterize the recolored whale with Canvas so the favicon is a PNG (works
     * in every browser that supports data-URI icons, including ones with weak
     * SVG favicon support). The canvas stays transparent apart from the glyph.
     * @param {string[]} colors - CSS colors, one per active state.
     * @returns {string|null} PNG data URI, or null when canvas is unavailable.
     */
    function rasterDataUrl(colors) {
      if (typeof document === 'undefined' || typeof Path2D !== 'function') return null;
      if (!Array.isArray(colors) || colors.length === 0) return null;
      const canvas = document.createElement('canvas');
      const size = 64;
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext('2d');
      if (context === null) return null;
      context.save();
      /* The whale path is authored in a 50×50 viewBox. */
      context.scale(size / 50, size / 50);
      const whale = new Path2D(WHALE_PATH);
      if (colors.length === 1) {
        context.fillStyle = colors[0];
        context.fill(whale);
      } else {
        context.clip(whale);
        const bandWidth = 50 / colors.length;
        for (let index = 0; index < colors.length; index += 1) {
          context.fillStyle = colors[index];
          /* Small overlap closes seams between adjacent bands. */
          context.fillRect(index * bandWidth, 0, bandWidth + 0.35, 50);
        }
      }
      context.restore();
      return canvas.toDataURL('image/png');
    }

    /** Cached icon URLs per state key; invalidated when the theme changes. */
    const iconCache = new Map();

    /**
     * Resolve the data URI for one state key. Each active state's color comes
     * from the live theme token DSH uses for that state (see
     * `STATUS_COLOR_SPECS`); concurrent states become color bands.
     * @param {string} modeKey - key from `statesKey`, or `idle`.
     * @returns {string} icon data URI.
     */
    function iconUrlFor(modeKey) {
      const cached = iconCache.get(modeKey);
      if (cached !== undefined) return cached;
      const colors = parseStatesKey(modeKey)
        .map((state) => STATUS_COLOR_SPECS[state])
        .filter((spec) => spec !== undefined)
        .map((spec) => resolveStatusColor(spec));
      let url = null;
      try {
        url = rasterDataUrl(colors);
      } catch (error) {
        url = null;
      }
      if (url === null) url = svgDataUrl(colors);
      iconCache.set(modeKey, url);
      return url;
    }

    /* ------------------------------------------------------------------ */
    /* Document <head> icon controller                                     */
    /* ------------------------------------------------------------------ */

    /* TESTABLE-DOM:BEGIN */
    /** Marks the one link this plugin owns, so it is never mistaken for a page icon. */
    const OWNED_ATTRIBUTE = 'data-dsh-tab-status-light';

    /** Shipped page icons, used only to heal a page whose original links are gone. */
    const SHIPPED_ICON_LINKS = Object.freeze([
      { href: './favicon-dark.svg', media: '(prefers-color-scheme: dark)' },
      { href: './favicon.svg', media: '(prefers-color-scheme: light)' },
    ]);

    /**
     * Detach captured icon links; each item keeps its original parent and next
     * sibling so `restoreIconLinks` can put it back exactly where it was.
     * @param {Array<{ link: Element, parent: Node | null, next: Node | null }>} items - captured links.
     */
    function detachIconLinks(items) {
      for (const item of items) {
        if (item.link.parentNode !== null) item.link.parentNode.removeChild(item.link);
      }
    }

    /**
     * Put captured icon links back. Restore in reverse order: a captured link's
     * recorded `next` is usually the next captured (still detached) link, so
     * that link must be a child of the parent again before it can serve as a
     * valid insertion reference — otherwise the DOM throws NotFoundError.
     * A reference that is no longer a child is dropped, and a failed insertion
     * falls back to appending to <head>, so a cleanup path never throws.
     * @param {Node} head - document head; fallback container and reference owner.
     * @param {Array<{ link: Element, parent: Node | null, next: Node | null }>} items - captured links.
     */
    function restoreIconLinks(head, items) {
      for (let index = items.length - 1; index >= 0; index -= 1) {
        const item = items[index];
        if (item.link.parentNode !== null) continue;
        const parent = item.parent !== null ? item.parent : head;
        const reference = item.next !== null && item.next.parentNode === parent ? item.next : null;
        try {
          parent.insertBefore(item.link, reference);
        } catch (error) {
          head.appendChild(item.link);
        }
      }
    }

    /**
     * Take over the page's icon links for later restoration. A healthy page has
     * the shipped light/dark pair; when it has none (an older generation of this
     * plugin crashed mid-swap and detached them), recreate the shipped relative
     * links so the tab never stays on the browser's default icon. This plugin's
     * own managed link is ignored.
     * @param {HTMLHeadElement} head - document head.
     * @param {() => HTMLLinkElement} createLink - link element factory (document.createElement in the browser).
     * @returns {Array<{ link: Element, parent: Node | null, next: Node | null }>} items to restore.
     */
    function captureIconLinks(head, createLink) {
      const collect = () =>
        Array.from(head.querySelectorAll('link[rel~="icon"]'))
          .filter((link) => !link.hasAttribute(OWNED_ATTRIBUTE))
          .map((link) => ({ link, parent: link.parentNode, next: link.nextSibling }));
      const found = collect();
      if (found.length > 0) return found;
      for (const definition of SHIPPED_ICON_LINKS) {
        const link = createLink();
        link.rel = 'icon';
        link.type = 'image/svg+xml';
        link.media = definition.media;
        link.href = definition.href;
        head.appendChild(link);
      }
      return collect();
    }
    /* TESTABLE-DOM:END */

    /**
     * Owns the document favicon while this plugin is mounted. The original
     * `link[rel~="icon"]` elements are captured once and restored verbatim
     * (attributes and position untouched), so the shipped light/dark icons come
     * back when the tab is idle or the plugin unloads.
     * @returns {{ set: (mode: string) => void, dispose: () => void }} controller.
     */
    function createFaviconController() {
      const head = document.head;
      const originals = captureIconLinks(head, () => document.createElement('link'));
      let managed = null;

      return {
        /**
         * @param {string} modeKey - `idle`, or a `statesKey` such as `reply`, `running`, `reply+done`.
         */
        set(modeKey) {
          if (modeKey === 'idle') {
            if (managed !== null && managed.parentNode !== null) managed.parentNode.removeChild(managed);
            restoreIconLinks(head, originals);
            return;
          }
          detachIconLinks(originals);
          const url = iconUrlFor(modeKey);
          if (managed === null) {
            managed = document.createElement('link');
            managed.rel = 'icon';
            managed.setAttribute(OWNED_ATTRIBUTE, '');
          }
          managed.type = url.startsWith('data:image/svg') ? 'image/svg+xml' : 'image/png';
          managed.href = url;
          if (managed.parentNode === null) head.appendChild(managed);
        },
        dispose() {
          if (managed !== null && managed.parentNode !== null) managed.parentNode.removeChild(managed);
          managed = null;
          restoreIconLinks(head, originals);
        },
      };
    }

    /* ------------------------------------------------------------------ */
    /* Slot component                                                      */
    /* ------------------------------------------------------------------ */

    /**
     * Entry component: guards the standard hook before the implementation
     * component calls any hooks, so a composition without the Session adapter
     * degrades to "does nothing" instead of throwing in the slot.
     * @param {object} props - slot standard props.
     * @returns {object|null} null; this entry renders no visible content.
     */
    function TabStatusLight(props) {
      const useSessionStatus = props !== null && typeof props === 'object' ? props.useSessionStatus : undefined;
      const useSessions = props !== null && typeof props === 'object' ? props.useSessions : undefined;
      if (typeof useSessionStatus !== 'function' || typeof useSessions !== 'function') return null;
      return h(TabStatusLightRuntime, { useSessionStatus, useSessions });
    }

    /**
     * Subscribe to theme-driven color revisions (light/dark switches, token
     * overrides), so an already-active icon is rebuilt with the new colors.
     * @returns {number} current color epoch; changes force a re-render.
     */
    function useColorEpoch() {
      const [epoch, setEpoch] = React.useState(colorEpoch);
      React.useEffect(() => {
        setEpoch(colorEpoch);
        return subscribeColorEpoch(() => setEpoch(colorEpoch));
      }, []);
      return epoch;
    }

    /**
     * Null-rendering implementation: reads the session status and owns the
     * document favicon through effects.
     * @param {{ useSessionStatus: (selector: Function) => string, useSessions: (selector: Function) => string|undefined }} props
     *   slot standard hooks.
     * @returns {null} no rendered content.
     */
    function TabStatusLightRuntime(props) {
      const selectScope = React.useCallback((state) => sessionScope(state), []);
      const scope = props.useSessions(selectScope);
      const mainSessionId = scope.mainSessionId;
      const visibleIds = scope.visibleIds;
      const selectStates = React.useCallback(
        (snapshot) => statesKey(deriveStates(snapshot, mainSessionId, visibleIds)),
        [mainSessionId, visibleIds],
      );
      /* Selector result is a stable primitive key such as `idle` or `reply+done`. */
      const rawStatesKey = props.useSessionStatus(selectStates);
      const [finishedWhileAway, setFinishedWhileAway] = React.useState(false);
      const previousRunning = React.useRef(false);
      const controller = React.useRef(null);
      const colorEpochValue = useColorEpoch();


      React.useEffect(() => {
        /* A head/factory failure must only degrade the feature, never blank the
         * slot entry through an error boundary. */
        try {
          controller.current = createFaviconController();
        } catch (error) {
          controller.current = null;
        }
        return () => {
          try {
            if (controller.current !== null) controller.current.dispose();
          } catch (error) {
            /* Restoring the page head is best-effort during teardown. */
          }
          controller.current = null;
        };
      }, []);

      React.useEffect(() => {
        /* Only a real run counts as in-flight: a pending question is a pause, so
         * a cancelled/timed-out question must not fake a "finished" green. */
        const running = parseStatesKey(rawStatesKey).includes('running');
        const wasRunning = previousRunning.current;
        previousRunning.current = running;
        if (running) {
          setFinishedWhileAway(false);
          return;
        }
        if (wasRunning && (document.visibilityState === 'hidden' || document.hasFocus() === false)) {
          setFinishedWhileAway(true);
        }
      }, [rawStatesKey]);

      React.useEffect(() => {
        /* Acknowledge the "finished" reminder on any sign that the user is
         * back and looking: the tab became visible, the window got focus, or
         * they interacted with the page. Window focus alone is not enough —
         * focus can already sit in browser chrome without firing it — and
         * waiting for a visibility change would leave a stale green icon. */
        const clear = () => setFinishedWhileAway(false);
        const clearWhenVisible = () => {
          if (document.visibilityState === 'visible') clear();
        };
        document.addEventListener('visibilitychange', clearWhenVisible);
        window.addEventListener('focus', clear);
        document.addEventListener('pointerdown', clear, true);
        document.addEventListener('keydown', clear, true);
        document.addEventListener('focusin', clear, true);
        return () => {
          document.removeEventListener('visibilitychange', clearWhenVisible);
          window.removeEventListener('focus', clear);
          document.removeEventListener('pointerdown', clear, true);
          document.removeEventListener('keydown', clear, true);
          document.removeEventListener('focusin', clear, true);
        };
      }, []);

      React.useEffect(() => {
        /* Switching Sessions is itself an acknowledgement of the old green. */
        setFinishedWhileAway(false);
      }, [mainSessionId]);

      /* Concurrent states paint color bands left→right in STATE_PRIORITY order. */
      const activeStates = resolveStates(parseStatesKey(rawStatesKey), finishedWhileAway);
      const modeKey = statesKey(activeStates);
      React.useEffect(() => {
        const active = controller.current;
        if (active === null) return;
        try {
          active.set(modeKey);
        } catch (error) {
          /* Leave the page's current icon alone if one swap fails. */
        }
      }, [modeKey, colorEpochValue]);

      return null;
    }

    return {
      inject: ['slots'],
      /**
       * @param {object} ctx - Client Cordis context.
       */
      apply(ctx) {
        /* Theme tokens drive the whale color; rebuild the icon after a switch. */
        ctx.effect(
          () => ctx.on('theme/change', () => bumpColorEpoch()),
          'tab-status-light: theme colours',
        );
        ctx.slots.inject(SLOT, () =>
          ctx.slots.register({ name: SLOT, id: ENTRY_ID, order: ORDER }, TabStatusLight),
        );
      },
    };
  },
});
