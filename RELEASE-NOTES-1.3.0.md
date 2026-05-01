# SpecParse v1.3.0 — release notes

**Released:** 2026-04-30
**Audience:** Spencer Haddock, Scott + Reid General Contractors (pilot)
**Auto-update:** Yes — clients on v1.2.0+ will pick this up automatically.

## What's new

### Confidence flags on the review table

Every submittal now carries a confidence score that surfaces as a colored
dot in the new column at the start of each row:

- **Green** — pulled from SpecParse's curated section dictionary.
  ~55 sections that have been verified by hand. 100% accurate.
- **Yellow** — extracted by Claude AI, all fields look clean. Probably
  right but worth a glance before exporting.
- **Red** — extracted by Claude AI but the title/description/type look
  incomplete or generic. Please review carefully.

A summary in the toolbar shows the H/M/L counts at a glance, plus a new
**"Show flagged only"** filter button that hides the green rows so you
can focus on the AI-extracted entries that need attention.

The review subtitle also reports which buckets came back: "47 submittals
found across 32 sections. Everything came from the curated dictionary —
no AI guesses to second-guess." or "47 submittals found, 3 AI-extracted
rows need a closer look (red dot)."

### Division-aware progress messaging

Processing now shows what division SpecParse is currently scanning, not
just the section number. "Scanning Division 09 — Finishes" instead of
"075423 - Thermoplastic-Polyolefin Roofing." Running submittal count
displayed alongside ("47 found · 132 / 219 sections"). Activity log only
emits a line on division transitions so it doesn't flood with one entry
per CSI subsection.

### Sample-spec affordance

If a `assets/samples/sample-spec.pdf` is bundled with the build, the
upload screen surfaces a "Try with a sample spec" link under the dropzone.
Useful for demos to other PMs without making them bring their own spec
PDF on hand.

### First-launch onboarding

New users see a one-time three-step walkthrough (Upload → Process →
Review & Export) on first launch, with a link to the sample spec if
bundled. Suppressed forever after first dismissal via
`localStorage.specparseOnboarded`.

### In-app feedback

New "Feedback" item in the sidebar Tools nav. Opens a modal with category
buttons (Bug / Idea / Praise / Other), free-form textarea, and an
optional reply email. Submissions go straight to Reed's inbox via
`007technologies.com/api/feedback`.

### Settings polish (About modal)

- Customer ID surfaced below the version label so Spencer can see at a
  glance which build he's on (matches what Reed sees in admin telemetry).
- "Check for updates" button — fires the auto-updater immediately rather
  than waiting for the hourly background poll.
- "Send feedback" button — opens the same modal as the sidebar Feedback link.

### Friendlier error messages

Added a `friendlyError()` helper that maps low-level errors to actionable
customer-facing strings. Coverage: Anthropic rate limits, invalid keys,
low credit balance, 5xx server errors; PDF read errors (invalid format,
scanned, encrypted, oversized); network errors; Excel write errors
(permissions, full disk, locked file). Already-friendly messages from
pdfParser/aiExtractor pass through unchanged.

### Telemetry polish

- New `feedback_sent` event fires when feedback is submitted (body never
  logged — only category, length, and whether an email was provided).
- New `sample_spec_loaded` event fires when the bundled sample spec is
  loaded (helps Reed track demo funnel conversion).

## Internal/operational

- `trackEvent` IPC bridge added so the renderer can fire telemetry events
  through the main-side telemetry pipeline. Allow-listed event names with
  metadata size caps to keep payloads small and PII-free.
- New `get-sample-spec` IPC handler resolves `assets/samples/sample-spec.pdf`
  in both packaged and unpackaged builds.
- New `check-for-updates` IPC handler with packaged/unpackaged guard.
- Confidence values persist into saved/restored projects so reopened
  recents still show the original flags.

## Upgrade path

Spencer's v1.2.0 install will auto-update on next launch. No action
required from his end. After update, the new flags + progress messages
should be immediately visible the next time he processes a spec.

## Known limitations

- Sample-spec slot exists but no curated PDF is bundled yet. The "Try
  with a sample spec" affordance stays hidden until one is dropped at
  `assets/samples/sample-spec.pdf` and the build re-runs.
- Recent-projects search input was scoped for v1.3 but deferred — will
  land in v1.4. The existing recents overlay still works, just without
  the search box.

## Files changed

- `package.json` — version bump
- `src/aiExtractor.js` — confidence scoring + scoreAiConfidence export
- `src/excelBuilder.js` — already Procore-compatible from v1.2; unchanged
- `main.js` — sample-spec, feedback, trackEvent, check-for-updates IPCs;
  friendlyError helper; customer ID in get-app-info
- `preload.js` — sendFeedback, getSampleSpec, trackEvent, checkForUpdates
- `renderer/index.html` — confidence column, filter button, sample-spec
  hint, feedback modal, onboarding overlay, About modal additions
- `renderer/renderer.js` — division mapping, confidence display, sample-spec
  loader, feedback modal logic, onboarding overlay logic, recent-search
  prep (deferred), check-updates wiring
- `renderer/style.css` — confidence dot styles, sample-hint styles,
  feedback styles, onboarding styles, About modal additions
- `assets/samples/README.md` — placeholder slot for sample-spec.pdf
