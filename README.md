# SpecParse

> Construction specification PDF → Procore-compatible submittal log, in under 2 minutes.

SpecParse is a macOS / Windows desktop app that reads a CSI MasterFormat construction specification PDF and produces a 32-column Excel submittal log matching Procore's format. Built for Spencer Haddock at Scott + Reid General Contractors.

## What it does

1. **Upload** a spec book PDF.
2. **Parse** — extracts every section (Division 00 skipped), pulls the SUBMITTALS paragraph from each.
3. **Extract submittals** in two passes:
   - **Pass 1 — HARDCODED dictionary.** ~55 common sections (03300 Concrete, 04220 CMU, 07610 Sheet Metal Roofing, 08411 Storefronts, etc.) are matched against a curated dictionary. Zero AI cost, 100% accurate.
   - **Pass 2 — Claude Haiku.** Unknown sections are run through Haiku 4.5 with a strict system prompt: only include items the Architect must formally review and stamp (Product Data / Shop Drawings / Samples). Test reports, certifications, warranties, and permits are explicitly excluded.
4. **Review** — drag-to-reorder table, inline edit titles, toggle rows, add rows manually. Each row shows section badge + submittal number.
5. **Export** — one-click Excel file named `ProjectName_SubmittalLog_MMDDYYYY.xlsx`.
6. **Query bar** — ask Haiku anything about the spec or submittal log. "What are the lead times for storefront?" "Which sections require delegated design?"
7. **Save & Resume** — recent projects list restores the full review table and query bar state without re-processing.

## Tech stack

- Electron 30 (single-window desktop app)
- `pdf-parse` (PDF text extraction)
- `@anthropic-ai/sdk` + Haiku `claude-haiku-4-5-20251001` (extraction + query bar)
- `exceljs` (Excel output)
- `electron-store` (recent projects, submittals, sections)
- Vanilla JS renderer (no framework, CSP-safe)

## Install (Spencer)

You will receive a `.exe` file from Reed. Save it to your Downloads folder, then double-click to install.

On first launch, Windows will show a warning: *"Windows protected your PC — Microsoft Defender SmartScreen prevented an unrecognized app from starting."* This is expected for a private build.

Click **More info** → **Run anyway**. After that, SpecParse launches like any other app.

The API key is baked into this build — no setup required. If something goes wrong, email Reed.

## Install (Reed — dev)

```bash
git clone https://github.com/reedhengleman/specparse-electron.git
cd specparse-electron
npm install
npm start
```

For dev runs, either set your key via the in-app Settings (gear icon on the About overlay) or `export ANTHROPIC_API_KEY=sk-ant-...` before `npm start`.

## Build a distributable

```bash
# One-shot: builds Mac .dmg + Windows .exe, creates private GitHub repo, pushes.
./scripts/build-and-ship.sh
```

Requires: `brew install gh`, `gh auth login`, `brew install --cask wine-stable` (for Windows cross-compile), and `$ANTHROPIC_API_KEY` set in your shell.

Manual alternative:

```bash
npm run build             # Mac + Windows
npm run build:mac         # Mac only (.dmg in release/)
npm run build:win         # Windows only (.exe in release/)
```

The prebuild step (`build/prepare-build.js`) reads `$ANTHROPIC_API_KEY` from env (or `.api-key` file as fallback) and writes it into `src/embeddedConfig.js`, which is bundled into the packaged app. **`src/embeddedConfig.js` is gitignored** — your key never touches the repo.

## Testing

```bash
# Run the full pipeline on a spec PDF, produce Excel + JSON
node test/runSpec.js path/to/spec.pdf

# Audit accuracy of a prior run
node test/checkAccuracy.js test/output/<name>.json
```

`runSpec.js` produces `test/output/<name>.xlsx` + `test/output/<name>.json`. `checkAccuracy.js` flags likely false positives (test reports, certs) and false negatives (missing shop drawings for delegated-design sections).

## Project structure

```
specparse-electron/
├── main.js                   Electron main process + IPC handlers
├── preload.js                Context-bridge between main and renderer
├── renderer/
│   ├── index.html            UI shell (splash → upload → process → review → export)
│   ├── renderer.js           UI logic, query bar, review table
│   └── style.css             Scott + Reid brand theme (#265C30)
├── src/
│   ├── pdfParser.js          PDF → sections + SUBMITTALS paragraphs
│   ├── aiExtractor.js        HARDCODED dict + Haiku fallback
│   ├── excelBuilder.js       Submittals → 32-column Procore .xlsx
│   └── embeddedConfig.js     (gitignored) API key injected at build time
├── build/
│   └── prepare-build.js      Pre-electron-builder hook
├── test/
│   ├── runSpec.js            Headless test harness
│   ├── checkAccuracy.js      Accuracy auditor
│   └── specs/                (gitignored) input PDFs
├── assets/                   Icons (.icns for Mac, .ico for Win)
└── scripts/
    └── build-and-ship.sh     One-shot build + GitHub push
```

## Credits

- Reed Engleman — product, design, implementation
- Claude (Anthropic) — pair-programmed via Cowork
- Scott + Reid General Contractors — domain expertise, brand
- 007 Technologies / Spectre Project — incubator

---
Version 1.0.0
