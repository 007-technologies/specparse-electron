# SpecParse — User Guide

**For end users — 2026-04-22**

SpecParse converts CSI MasterFormat construction specifications into
Procore-compatible 32-column submittal logs in under two minutes.
This guide walks through the workflow end-to-end.

---

## Before you start

**You'll need:**
- SpecParse installed on your Mac or Windows computer (see
  `INSTALLATION.md`)
- A construction specification PDF (a "project manual" or spec book)
- An internet connection (for the AI-powered extraction steps)

**You won't need:**
- A user account or login — SpecParse runs entirely on your computer
- Procore access to start — Procore only matters at the export step

---

## Workflow

### 1. Launch SpecParse

Double-click the SpecParse icon in your Applications folder (Mac)
or Start menu / desktop (Windows). The app opens with a splash
screen, then lands on the main upload view.

### 2. Upload your spec

Click **Upload Spec PDF** or drag your spec PDF onto the drop zone.

SpecParse reads the PDF and shows a "Processing…" progress bar. Two
passes run:

- **Pass 1 (Hardcoded dictionary):** Matches ~55 common MasterFormat
  sections (Division 03–33 standard sections) against a curated
  dictionary. Zero AI cost, 100% accurate on these sections.
- **Pass 2 (AI extraction):** For unknown or customized sections,
  Claude Haiku identifies submittals with a strict system prompt:
  only items the Architect must formally review and stamp (Product
  Data / Shop Drawings / Samples). Excludes test reports,
  certifications, warranties, and permits.

**Typical processing time:**
- 50-page spec: ~30 seconds
- 200-page spec: ~1 minute
- 500-page spec: ~2 minutes

### 3. Review the extracted submittals

Once processing completes, the Review screen shows the submittal log
as a scrollable table.

**For each row:**
- **Section badge** — spec section number (e.g., "07610")
- **Submittal number** — auto-assigned sequential number within the
  section (e.g., "SD-1")
- **Title** — short description of the submittal
- **Description** — extracted from the spec's SUBMITTALS paragraph

**What you can do on the review screen:**
- **Edit a title or description** — click the text; it becomes
  editable
- **Toggle a row** — check/uncheck to include/exclude from export
- **Drag to reorder** — grab a row and drag to rearrange
- **Add a row manually** — click **+ Add Row** at the bottom of a
  section to add a submittal SpecParse missed
- **Delete a row** — hover and click the × icon

Spend 5–10 minutes reviewing. Aim for "looks right" rather than
pixel-perfect; this is a living log that evolves during the project.

### 4. Use the Query Bar (optional but powerful)

At the top of the Review screen is a question bar powered by Claude.
Ask any question about the spec or the extracted log:

- *"What are the lead times for storefront?"*
- *"Which sections require delegated design?"*
- *"Summarize the fastener requirements for sheet metal roofing"*
- *"Is there anything about welding in the metals sections?"*

Answers are pulled from the spec text in context. Great for
pre-bid meetings, submittal log reviews, and clarifying scope
questions.

### 5. Export to Excel

Click **Export to Excel** in the top-right. SpecParse generates a
32-column Procore-compatible submittal log as an `.xlsx` file.

The file is auto-named:
`[ProjectName]_SubmittalLog_[MMDDYYYY].xlsx`

Columns include: Spec Section, Spec Section Description, Submittal
Number, Description, Type, Issue Date, Received Date, Sent to
Architect, Received from Architect, Sent to Subcontractor, Returned
from Subcontractor, Required On-Site Date, Lead Time (weeks), etc.
Your ordering and edits are preserved.

Import into Procore via Procore's standard submittal log import.

### 6. Save the project (optional)

Before closing the app, click **Save Project** in the top-right.
This saves the full review table + query-bar history to SpecParse's
local storage. Reopening the project later restores your work
without re-processing the PDF.

Saved projects appear on the splash screen under "Recent Projects"
the next time you launch.

---

## Tips

**Best results:**
- Spec must be a text-based PDF, not a scanned image. If SpecParse
  shows "very little text detected," your PDF is scanned — run it
  through OCR first (Preview → Tools → Export as PDF).
- Specifications formatted as "CSI MasterFormat" (three-part spec
  format) work best. Custom project-manual layouts may extract less
  accurately.
- Division 00 sections are intentionally skipped (bidding,
  contracting, general requirements — not submittal-producing).

**Common issues:**
- *"Invalid API key."* — SpecParse needs an Anthropic API key (baked
  into the build). If you see this, email Reed.
- *"Too many requests."* — You've hit the API rate limit. Wait 30
  seconds and try again.
- *"Password-protected PDF."* — SpecParse can't open encrypted PDFs.
  Remove the password using Preview (Mac) or Adobe Acrobat.

**Don't:**
- Don't expect 100% accuracy on the first run. Plan to spend 5–10
  minutes reviewing, same as you would for any automated extraction.
- Don't use the query bar to make engineering decisions — it's a
  research tool, not a substitute for professional review.

---

## Keyboard shortcuts

- `Cmd/Ctrl + S` — Save project
- `Cmd/Ctrl + E` — Export to Excel
- `Cmd/Ctrl + K` — Focus the query bar
- `Cmd/Ctrl + N` — New project (clears current)
- `Cmd/Ctrl + O` — Open recent project

---

## Getting help

Questions, bugs, feature requests: `support@007technologies.com`

Expected response time: within 1 business day.
