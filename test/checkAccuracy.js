#!/usr/bin/env node
/**
 * test/checkAccuracy.js — SpecParse accuracy auditor
 *
 * Takes a JSON output file from runSpec.js and flags likely extraction issues
 * by inspecting each section's own SUBMITTALS paragraph vs. what we extracted.
 *
 * Usage:
 *   node test/checkAccuracy.js test/output/<spec>.json
 *
 * Outputs a human-readable report with per-section flags for:
 *   - sections with SUBMITTALS paragraph but no extracted submittals (potential FN)
 *   - sections with no SUBMITTALS paragraph but extracted submittals (potential FP)
 *   - sections where the SUBMITTALS paragraph mentions delegated design / shop drawings
 *     but we didn't extract a Shop Drawing type (critical miss)
 *   - sections where we extracted items that look like excluded types (test reports,
 *     certifications, warranties — critical false positive)
 */
const fs = require('fs');
const path = require('path');

const jsonPath = process.argv[2];
if (!jsonPath || !fs.existsSync(jsonPath)) {
  console.error('Usage: node test/checkAccuracy.js <results.json>');
  process.exit(2);
}
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

// Group submittals by section number
const bySection = {};
data.submittals.forEach(sub => {
  const num = (sub.specSection || '').split(' - ')[0] || '';
  if (!bySection[num]) bySection[num] = [];
  bySection[num].push(sub);
});

// Patterns
const DELEGATED_DESIGN_RE = /delegated[\s-]design|design[\s-]build|professional[\s-]engineer|stamped[\s-]drawings|shop[\s-]drawings/i;
const SHOP_DRAWING_KEYWORDS = /shop\s*draw|fabrication|erection\s*plan|cad|autoCAD|design\s*by/i;
const SAMPLE_KEYWORDS = /sample|color\s*chart|finish\s*sample|mock[\s-]?up/i;
const PRODUCT_DATA_KEYWORDS = /product\s*data|cut\s*sheet|manufacturer.{0,20}(literature|data)|technical\s*data/i;

// Excluded patterns — if we extract one of these it's a FALSE POSITIVE
const EXCLUDED_RE = /test[\s-]report|certificate|warrant|mill\s*cert|qualifications|safety\s*data|record\s*document|maintenance\s*manual|permit|inspection\s*report/i;

const flags = { critical: [], warnings: [], info: [] };
let totalSections = 0, sectionsWithSubmittals = 0;

data.sections.forEach(section => {
  const num = section.num;
  if (/^0[01]/.test(num)) return; // Skip Div 00 and Div 01 general requirements
  totalSections++;

  const extractedItems = bySection[num] || [];
  const block = section.submittalsBlock || '';
  const hasBlock = block.length > 100;

  if (extractedItems.length > 0) sectionsWithSubmittals++;

  // Check 1: SUBMITTALS paragraph mentions shop drawings / delegated design,
  // but we didn't extract a Shop Drawing type.
  if (hasBlock && (SHOP_DRAWING_KEYWORDS.test(block) || DELEGATED_DESIGN_RE.test(block))) {
    const hasSD = extractedItems.some(i => i.type === 'Shop Drawing');
    if (!hasSD && extractedItems.length === 0) {
      flags.critical.push({
        section: num + ' - ' + section.title,
        issue: 'SUBMITTALS paragraph mentions shop drawings / delegated design but NO submittals were extracted',
        blockPreview: block.slice(0, 200).replace(/\s+/g, ' ') + '...',
      });
    } else if (!hasSD) {
      flags.warnings.push({
        section: num + ' - ' + section.title,
        issue: 'SUBMITTALS paragraph mentions shop drawings but we only extracted Product Info/Sample',
        blockPreview: block.slice(0, 200).replace(/\s+/g, ' ') + '...',
      });
    }
  }

  // Check 2: SUBMITTALS paragraph present but nothing extracted
  if (hasBlock && extractedItems.length === 0) {
    // Unless the paragraph is only about excluded types
    if (/product\s*data|shop\s*draw|sample|finish/i.test(block)) {
      flags.warnings.push({
        section: num + ' - ' + section.title,
        issue: 'Section has a SUBMITTALS paragraph mentioning product data / shop drawings / samples, but nothing was extracted',
        blockPreview: block.slice(0, 200).replace(/\s+/g, ' ') + '...',
      });
    }
  }

  // Check 3: Extracted submittals that look like EXCLUDED types (false positives)
  extractedItems.forEach(item => {
    const haystack = [item.title, item.description].join(' ');
    if (EXCLUDED_RE.test(haystack)) {
      flags.critical.push({
        section: num + ' - ' + section.title,
        issue: 'FALSE POSITIVE — extracted an item that matches excluded patterns',
        submittal: item.title + ' / ' + item.type + ' / ' + item.description,
      });
    }
  });

  // Check 4: No submittals block but lots of extracted items (suspicious)
  if (!hasBlock && extractedItems.length >= 3) {
    flags.info.push({
      section: num + ' - ' + section.title,
      issue: 'No SUBMITTALS paragraph detected but 3+ submittals extracted — may be hallucinated',
      count: extractedItems.length,
    });
  }
});

// Report
console.log('╔═════════════════════════════════════════════════════════════');
console.log('║ SpecParse accuracy audit');
console.log('║ Spec: ' + data.pdfName);
console.log('╚═════════════════════════════════════════════════════════════');
console.log('');
console.log('Sections audited:        ' + totalSections);
console.log('Sections with submittals: ' + sectionsWithSubmittals + ' (' + Math.round(sectionsWithSubmittals / totalSections * 100) + '%)');
console.log('Total submittals:        ' + data.submittals.length);
console.log('');

function printFlags(label, list, char) {
  console.log(char + ' ' + label + ' (' + list.length + ')');
  console.log(''.padEnd(60, '-'));
  if (list.length === 0) { console.log('  (none)'); console.log(''); return; }
  list.forEach((f, i) => {
    console.log('  [' + (i + 1) + '] ' + f.section);
    console.log('      ' + f.issue);
    if (f.submittal) console.log('      → ' + f.submittal);
    if (f.blockPreview) console.log('      ¶ ' + f.blockPreview);
    if (f.count) console.log('      Count: ' + f.count);
    console.log('');
  });
}

printFlags('CRITICAL — likely bugs, needs fixing', flags.critical, '🔴');
printFlags('WARNINGS — worth a look', flags.warnings, '🟡');
printFlags('INFO — pattern anomalies', flags.info, '🔵');

const accuracyGrade = flags.critical.length === 0
  ? (flags.warnings.length < 5 ? 'PASS' : 'REVIEW')
  : 'FAIL';

console.log('═════════════════════════════════════════════════════════════');
console.log('VERDICT: ' + accuracyGrade);
console.log('  Critical: ' + flags.critical.length + '   Warnings: ' + flags.warnings.length + '   Info: ' + flags.info.length);
console.log('═════════════════════════════════════════════════════════════');

process.exit(flags.critical.length > 0 ? 1 : 0);
