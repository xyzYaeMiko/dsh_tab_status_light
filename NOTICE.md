# Third-party artwork notice

## DeepSeek whale glyph

`client.js` embeds the `d` attribute of the whale path from the favicon shipped
inside `@deepseek-ai/dsh-web-frontend@0.2.1-rc.2`
(`dist/favicon.svg` / `dist/favicon-dark.svg`).

- Upstream package: `@deepseek-ai/dsh-web-frontend` (`packages/apps/web` of
  deepseek-harness), license: MIT.
- Reuse here: recolored only. The silhouette is not redrawn or modified; the
  path is filled with the state color and drawn on a transparent canvas (no
  badge or background shape is added).
- The original favicon files are also restored untouched when the tab returns
  to the idle state.

`icon.svg` (the plugin-list icon) is an original composition that reuses the
same whale path from that MIT-licensed favicon, recolored with a diagonal
amber/violet/green hard-stop gradient. Everything else in this package is
original artwork.
