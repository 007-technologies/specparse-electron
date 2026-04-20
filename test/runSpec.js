#!/usr/bin/env node
/**
 * test/runSpec.js — SpecParse headless test harness
 *
 * Runs the full pipeline (pdfParser → aiExtractor → excelBuilder) on a spec PDF
 * WITHOUT launching the Electron UI. Produces:
 *   - test/output/<spec-name>.xlsx  (the generated submittal log)
 *   - test/output/<spec-name>.json  (machine-readable results for accuracy analysis)
 *   - A pass/fail summary printed to stdout
 *
 * Usage:
 *   node test/runSpec.js <path-to-spec.pdf>
 *
 * Uses the API key from $ANTHROPIC_API_KEY or .api-key at repo root.
 * Exit code: 0 on success, 1 on failure.
 */
const fs = require('fs');
const path = require('path');
const { extractSections } = require('../src/pdfParser');
const { extractAllSubmittals } = require('../src/aiExtractor');
const { buildExcel } = require('../src/excelBuilder');

const projectRoot = path.resolve(__dirname, '..');
const outputDir = path.join(projectRoot, 'test', 'output');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

function getApiKey() {
  if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim()) {
    return process.env.ANTHROPIC_API_KEY.trim();
  }
  const keyFile = path.join(projectRoot, '.api-key');
  if (fs.existsSync(keyFile)) {
    return fs.readFileSync(keyFile, 'utf8').trim();
  }
  return '';
}

function fmt(n) { return String(n).padStart(4); }

async function main() {
  const pdfPath = process.argv[2];
  if (!pdfPath) {
    console.error('Usage: node test/runSpec.js <path-to-spec.pdf>');
    process.exit(2);
  }
  if (!fs.existsSync(pdfPath)) {
    console.error('File not found: ' + pdfPath);
    process.exit(2);
  }
  const apiKey = getApiKey();
  if (!apiKey) {
    console.error('No API key found. Set ANTHROPIC_API_KEY or create a .api-key file at repo root.');
    process.exit(2);
  }

  const pdfName = path.basename(pdfPath, path.extname(pdfPath));
  const safe = pdfName.replace(/[^a-z0-9_-]/gi, '_');
  const outXlsx = path.join(outputDir, safe + '.xlsx');
  const outJson = path.join(outputDir, safe + '.json');

  console.log('┌─────────────────────────────────────────────────────────');
  console.log('│ SpecParse test run');
  console.log('│ PDF: ' + pdfPath);
  console.log('└─────────────────────────────────────────────────────────');
  console.log('');

  const t0 = Date.now();

  // Phase 1: parse PDF
  console.log('[1/3] Parsing PDF...');
  let sections;
  try {
    sections = await extractSections(pdfPath);
  } catch (err) {
    console.error('  ✗ PDF parse failed: ' + err.message);
    process.exit(1);
  }
  const tParse = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('  ✓ Parsed ' + sections.length + ' sections in ' + tParse + 's');

  // Pre-count how many sections will use HARDCODED vs AI
  const { findHardcoded, isSkipped } = loadAiExtractorInternals();
  let hcCount = 0, aiCount = 0, skipCount = 0;
  sections.forEach(s => {
    if (isSkipped(s.num)) skipCount++;
    else if (findHardcoded(s.num)) hcCount++;
    else aiCount++;
  });
  console.log('  Breakdown: ' + hcCount + ' hardcoded, ' + aiCount + ' will use AI, ' + skipCount + ' skipped');

  // Phase 2: extract submittals
  console.log('');
  console.log('[2/3] Extracting submittals (AI will make ~' + aiCount + ' calls)...');
  const t1 = Date.now();
  let submittals;
  try {
    submittals = await extractAllSubmittals(apiKey, sections, (current, total, title) => {
      if (current % 10 === 0 || current === total) {
        process.stdout.write('  ' + fmt(current) + '/' + total + '  ' + title.slice(0, 60) + '\n');
      }
    });
  } catch (err) {
    console.error('  ✗ AI extraction failed: ' + err.message);
    process.exit(1);
  }
  const tAi = ((Date.now() - t1) / 1000).toFixed(1);
  console.log('  ✓ Generated ' + submittals.length + ' submittals in ' + tAi + 's');

  // Phase 3: write Excel
  console.log('');
  console.log('[3/3] Writing Excel...');
  try {
    await buildExcel(submittals, outXlsx, pdfName);
  } catch (err) {
    console.error('  ✗ Excel build failed: ' + err.message);
    process.exit(1);
  }
  console.log('  ✓ Wrote ' + outXlsx);

  // Serialize results as JSON for downstream accuracy analysis
  const summary = {
    pdfPath,
    pdfName,
    runAt: new Date().toISOString(),
    durationSec: +((Date.now() - t0) / 1000).toFixed(1),
    sectionCount: sections.length,
    hardcodedSections: hcCount,
    aiSections: aiCount,
    skippedSections: skipCount,
    submittalCount: submittals.length,
    sections: sections.map(s => ({
      num: s.num,
      title: s.title,
      hasSubmittalsBlock: !!(s.submittalsBlock && s.submittalsBlock.length > 100),
      submittalsBlock: s.submittalsBlock || '',
      isDiv01: s.isDiv01,
    })),
    submittals,
  };
  fs.writeFileSync(outJson, JSON.stringify(summary, null, 2));

  // Final summary
  console.log('');
  console.log('┌─────────────────────────────────────────────────────────');
  console.log('│ RESULT SUMMARY');
  console.log('│   Sections parsed:    ' + fmt(sections.length));
  console.log('│   HARDCODED matches:  ' + fmt(hcCount));
  console.log('│   AI-extracted:       ' + fmt(aiCount));
  console.log('│   Skipped (Div 00/SKIP_SECTIONS): ' + skipCount);
  console.log('│   Submittals generated: ' + fmt(submittals.length));
  console.log('│   Total time:         ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
  console.log('│');
  console.log('│ Output: ' + outXlsx);
  console.log('│ Data:   ' + outJson);
  console.log('│');
  console.log('│ Next: review the Excel and run `node test/checkAccuracy.js ' + outJson + '`');
  console.log('└─────────────────────────────────────────────────────────');

  // Sanity checks → exit non-zero if something looks wrong
  const warnings = [];
  if (sections.length === 0) warnings.push('No sections parsed — likely a broken PDF');
  if (submittals.length === 0) warnings.push('No submittals generated — pipeline may be broken');
  if (submittals.length > sections.length * 4) warnings.push('Suspiciously many submittals — AI may be hallucinating');
  if (sections.length > 0 && submittals.length / sections.length < 0.3) warnings.push('Very low submittal yield — AI may be rejecting most sections');

  if (warnings.length) {
    console.log('');
    console.log('⚠ WARNINGS:');
    warnings.forEach(w => console.log('   - ' + w));
    process.exit(1);
  }
  process.exit(0);
}

// Pull the helper functions out of aiExtractor without a circular import
function loadAiExtractorInternals() {
  const src = fs.readFileSync(path.join(projectRoot, 'src', 'aiExtractor.js'), 'utf8');
  // eslint-disable-next-line no-new-func
  const hcMatch = src.match(/const HARDCODED = \{[\s\S]*?\n\};/);
  const skipMatch = src.match(/const SKIP_SECTIONS = new Set\(\[[\s\S]*?\]\);/);
  if (!hcMatch || !skipMatch) throw new Error('Could not parse aiExtractor internals');
  const ctx = {};
  // eslint-disable-next-line no-new-func
  new Function('module', hcMatch[0] + '\n' + skipMatch[0] + '\nmodule.HARDCODED=HARDCODED;module.SKIP_SECTIONS=SKIP_SECTIONS;')(ctx);
  function findHardcoded(num) {
    if (!num) return null;
    if (ctx.HARDCODED[num]) return ctx.HARDCODED[num];
    if (num.length === 6 && ctx.HARDCODED[num.slice(0, 5)]) return ctx.HARDCODED[num.slice(0, 5)];
    if (num.length === 5 && ctx.HARDCODED[num + '0']) return ctx.HARDCODED[num + '0'];
    return null;
  }
  function isSkipped(num) {
    if (!num) return false;
    if (ctx.SKIP_SECTIONS.has(num)) return true;
    if (num.length === 6 && ctx.SKIP_SECTIONS.has(num.slice(0, 5))) return true;
    if (num.length === 5 && ctx.SKIP_SECTIONS.has(num + '0')) return true;
    return false;
  }
  return { findHardcoded, isSkipped };
}

main().catch(err => {
  console.error('Fatal error: ' + (err.stack || err.message || err));
  process.exit(1);
});
