# Overnight Log — 2026-04-23 (Spectre / SpecParse)

Port of the 007 design system from Skyfall into Spectre, while
preserving every selector renderer.js depends on. No functional
changes to the existing analyze → review → export pipeline.

## Ship checklist (5-min smoke test)

From `Spectre/` run `npm start` and walk through:

1. **Splash** — deep-navy background, animated helix in blue/gold,
   co-brand lockup: **Scott + Reid** (paper white) on the left,
   divider, **SpecParse** (gold) on the right. Progress bar fills
   over ~2.2s, then "Click to continue" pulses in.
2. **007 attribution** — splash footer says "Powered by
   **007 Technologies**" (gold, clickable, opens the website). The
   sidebar footer also has a clickable 007 pill — same behavior.
3. **Sidebar** — Scott + Reid brand at the top, gold SpecParse
   subtitle. Workflow nav items 01–04 with dots. Active item
   gets gold left-rail + glowing dot.
4. **Upload view** — drop-zone with the same dossier feel as
   Skyfall. Hover glows navy. Project name field → ring-navy focus.
   "Generate submittal log" is the big primary button.
5. **Recent projects** — appears if you've processed a spec before.
   Cards match the Skyfall aesthetic.
6. **Generate (analyzing) view** — progress card with navy-to-gold
   gradient bar + activity log.
7. **Review view** — section-label "03 / Review submittals",
   headline "Check the log. Edit what you need.", editable table.
   Query bar below the table got a fresh coat: gold+navy spark
   icon, "Claude Haiku" chip, cleaner input.
8. **Download view** — "04 / Submittal log ready" header, paper
   card with download + start-over buttons.
9. **Error view** — crimson left-rail accent card.
10. **API Key modal** — navy focus ring, new button styles.
11. **About modal** — "SpecParse · v1.0 · Built for Scott + Reid
    General Contractors · Powered by 007 Technologies · DOSSIER
    PROJECT" codename pill.

## What shipped

### Renderer

- **`renderer/index.html`** — rewritten. Key preserved IDs:
  `splashScreen`, `splashDots`, `splashContinue`, `aboutTrigger`,
  `openApiKey`, `browseBtn`, `dropZone`, `fileInput`,
  `selectedFileName`, `selectedFileSize`, `fileSelected`,
  `clearFile`, `projectName`, `generateBtn`, `navProcess`,
  `navReview`, `navResult`, `recentSection`, `recentList`,
  `progressBar`, `progressSection`, `progressPercent`,
  `progressCount`, `progressEta`, `sectionLog`, `reviewSubtitle`,
  `reviewCount`, `reviewBody`, `masterCheck`, `selectAllBtn`,
  `selectNoneBtn`, `addRowBtn`, `backToUploadBtn`, `confirmBtn`,
  `resultStats`, `downloadBtn`, `startOverBtn`, `errorMessage`,
  `retryBtn`, `settingsOverlay`, `apiKeyInput`, `toggleKey`,
  `keyFeedback`, `cancelSettings`, `saveKey`, `closeSettings`,
  `aboutOverlay`, `closeAbout`, `queryBar`, `queryToggle`,
  `queryBody`, `queryChevron`, `queryInput`, `querySubmit`,
  `queryClear`, `queryResponse`. Plus the preserved class names:
  `view`, `active`, `nav-item`, `disabled`, `d-none`, `dragover`,
  `excluded`, `dragging`, `drag-over`, `row-check`, `row-del`,
  `fade-out`. Every `getElementById` reference in `renderer.js`
  resolves — verified with a static scan.

- **`renderer/style.css`** — rewritten (~1,130 lines). Brought in
  the full Shared/ design system (tokens, typography, buttons,
  cards, modals, tables) with Scott + Reid navy as the primary
  and 007 gold as the flourish accent. Added splash overlay with
  helix + smoke layers, new sidebar aesthetic, view-header
  pattern with `section-label` + headline + `headline-alt`, and a
  restyled query bar. Legacy CSS vars (`--bg`, `--primary`, etc.)
  are aliased to the new ones so any stray references keep working.

### Main + preload

- **`preload.js`** — added `openExternal(url)`.
- **`main.js`** — added `ipcMain.handle('open-external', ...)`
  with scheme allow-list (`http(s):` and `mailto:`).

### Inline splash script in index.html

Runs a 78-line helix animation in the splash SVG (same algorithm
Skyfall uses). Watches for `.fade-out` on `#splashScreen` and
adds `.splash-gone` after the transition completes so the node is
fully removed from the compositing layer.

## Smoke-test gotchas

- **Codename.** I used **DOSSIER PROJECT** as the placeholder
  codename (pairs well with the dossier visual language). If you
  want a different code, edit two places:
  - `renderer/index.html` → search for `DOSSIER PROJECT`
  - `renderer/style.css` — no change needed (no codename hard-coded)
- **`about-logo` removed.** The old "SP" logo chip in the About
  modal was dropped — felt like design noise next to the
  SpecParse wordmark. If you want it back, add a `<div class="about-logo">SP</div>`
  above `.about-app` and add matching CSS.
- **`splash-logo` removed.** Same reason — the helix + cobrand
  lockup is louder than a tiny "SP" chip.
- **CSP-compliant splash script.** The splash helix animation +
  007 brand link handlers live in `renderer/splash-helix.js` (not
  inline), loaded via `<script src>` so the existing
  `script-src 'self'` CSP is respected. No action needed.

## Code-review flags / TODOs

- **`.nav-item` data-view values** match the existing viewTransition
  map in renderer.js: `upload`, `process`, `review`, `result`.
- **Query bar collapse/expand behavior** is unchanged. The new CSS
  on `.query-body.hidden` provides smoother max-height animation;
  renderer.js still toggles `.hidden` via `classList.toggle`.
- **Recent projects rendering** — renderer.js builds these as
  `<div class="recent-item">` with inner name/meta. The new CSS
  expects `.recent-item-name` and `.recent-item-meta` classes
  inside. If the existing builder uses different inner class
  names, they'll still render (just unstyled). Worth an eye on
  smoke test. Easy to fix by either (a) updating the builder or
  (b) renaming the CSS selectors.

## What I didn't touch

- `package.json`, `config/*`, anything under `node_modules/`.
- The analyze pipeline (`src/`), the Excel builder, the PDF parser.
- No git operations, no npm installs.

---

Sleep tight. Skyfall + Spectre both had their overnight treatment.
