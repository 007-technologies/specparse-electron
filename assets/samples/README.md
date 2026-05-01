# Sample specs

Drop a curated CSI MasterFormat construction spec PDF here as
**`sample-spec.pdf`**. When SpecParse launches and finds this file
(resolved at `assets/samples/sample-spec.pdf`), the upload screen
surfaces a "Try with a sample spec" affordance under the dropzone —
letting Spencer demo SpecParse to other PMs without making them bring
their own spec.

## Sizing guidance

The whole `assets/samples/` directory is bundled with the installer (see
`package.json` → `build.files: ["assets/**/*"]`). Keep the sample under
**12 MB** — full project manuals can be 50+ MB and the installer is
already heavy. A trimmed Division-by-Division excerpt is a better demo
than a full manual anyway: extraction completes faster and the user gets
to see the review screen sooner.

## Suggested content

- Multi-division coverage (03, 05, 07, 08, 09 minimum) so the dictionary
  + AI fallback paths both fire visibly.
- Real-world spec language, not stripped-down boilerplate. Procore-bound
  customers want to see how their actual specs translate to submittal logs.
- Recent enough to reflect current MasterFormat conventions (post-2004
  six-digit numbers preferred).

## Telemetry

The standard `submittals_generated` event fires when the user runs an
analysis on the sample, with `metadata.fileName: "sample-spec.pdf"` —
filter the admin dashboard for sample-driven analyses by that filename.
