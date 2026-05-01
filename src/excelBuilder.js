/**
 * SpecParse — Excel output builder
 *
 * Output format matches Procore's official Submittals Import Template,
 * column-for-column. Drag the resulting .xlsx into Procore → Submittals →
 * Imports and it should map automatically (no field mapping step required).
 *
 * Source of truth for column names + order (verified 2026-04-30):
 *   https://support.procore.com/products/procore-imports/submittals/tutorials/prepare-submittals-for-import-to-the-procore-imports-app
 *
 * Procore's rules (DO NOT VIOLATE):
 *   - Do NOT delete or move columns. The importer is position-based.
 *   - Date format must be MM/DD/YYYY regardless of project settings.
 *   - "Submittal Number" + "Submittal Manager" are the only fields required
 *     for a successful import. SpecParse fills Submittal Number; the user
 *     fills Submittal Manager before importing.
 *   - The last 4 columns (Required On-Site Date, Lead Time, Design Team
 *     Review Time, Internal Review Time) are only meaningful when the
 *     project has Submittal Schedule Calculations enabled. Including them
 *     blank is harmless when the feature is off.
 *
 * What SpecParse fills automatically (extracted from spec PDF):
 *   - Submittal Spec Section Number  ← sub.specSection
 *   - Submittal Number               ← sub.submittalNumber
 *   - Submittal Title                ← sub.title
 *   - Description                    ← sub.description
 *   - Submittal Type                 ← sub.type
 *
 * What the user fills before importing:
 *   - Submittal Manager (REQUIRED by Procore for import to succeed)
 *   - Anything else they want pre-populated (Status, Location, dates, etc.)
 */

const ExcelJS = require('exceljs');

// Procore Submittals Import Template — exact column order. Do not reorder.
const HEADERS = [
  'Package Title',
  'Package Spec Section Number',
  'Package Spec Section Description',
  'Package Number',
  'Submittal Title',
  'Submittal Spec Section Number',
  'Submittal Spec Section Description',
  'Submittal Number',
  'Description',
  'Submittal Manager',
  'Submittal Status',
  'Submittal Type',
  'Location',
  'Received Date',
  'Issue Date',
  'Submit By Date',
  'Responsible Contractor Name',
  // Optional — only used when Submittal Schedule Calculations is enabled.
  // Including blank to match the template exactly.
  'Required On-Site Date',
  'Lead Time',
  'Design Team Review Time',
  'Internal Review Time',
];

// Column widths roughly tuned for readable display in Excel + Procore preview.
const COL_WIDTHS = [
  30, 22, 38, 16,    // Package columns
  56, 22, 38, 16,    // Submittal core
  64, 24, 18, 22, 20, 14, 14, 16, 32,  // Description through Responsible Contractor
  18, 12, 22, 22,    // Optional schedule columns
];

async function buildExcel(submittals, outputPath, projectName) {
  const wb = new ExcelJS.Workbook();
  // Procore's importer reads the first sheet. Name it the project so audit-trail
  // copies stay legible.
  const sheetName = (projectName || 'Submittals').slice(0, 31);
  const ws = wb.addWorksheet(sheetName);

  // Header row — matches Procore template exactly.
  const headerRow = ws.addRow(HEADERS);
  headerRow.eachCell((cell) => {
    cell.font = { name: 'Arial', bold: true, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } };
    cell.alignment = { horizontal: 'left', vertical: 'middle' };
  });
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  // Data rows. Position-mapped to Procore's columns. Empty strings for
  // fields the user fills in.
  for (const sub of submittals) {
    // Split "03200 - Concrete Reinforcement" → ["03200", "Concrete Reinforcement"]
    // so Procore's Number and Description columns get clean values.
    // Falls back to the raw string in Number if no " - " separator is found.
    const { specNumber, specDescription } = splitSpecSection(sub.specSection);
    const row = [
      '',                        // Package Title
      '',                        // Package Spec Section Number
      '',                        // Package Spec Section Description
      '',                        // Package Number
      sub.title || '',           // Submittal Title
      specNumber,                // Submittal Spec Section Number
      specDescription,           // Submittal Spec Section Description
      sub.submittalNumber || '', // Submittal Number
      sub.description || '',     // Description
      '',                        // Submittal Manager (USER MUST FILL — required by Procore)
      '',                        // Submittal Status
      sub.type || '',            // Submittal Type
      '',                        // Location
      '',                        // Received Date
      '',                        // Issue Date
      '',                        // Submit By Date
      '',                        // Responsible Contractor Name
      '',                        // Required On-Site Date (optional)
      '',                        // Lead Time (optional)
      '',                        // Design Team Review Time (optional)
      '',                        // Internal Review Time (optional)
    ];
    const r = ws.addRow(row);
    r.eachCell({ includeEmpty: false }, (cell) => {
      cell.font = { name: 'Arial', size: 10 };
      cell.alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
    });
  }

  // Set column widths.
  ws.columns.forEach((col, i) => {
    col.width = COL_WIDTHS[i] || 14;
  });

  await wb.xlsx.writeFile(outputPath);
  return outputPath;
}

/**
 * Split SpecParse's "XXXXX - Description" specSection format into Procore's
 * two columns. Handles common variations:
 *   "03200 - Concrete Reinforcement"     → { specNumber: "03200", specDescription: "Concrete Reinforcement" }
 *   "03 20 00 - Concrete Reinforcement"  → { specNumber: "03 20 00", specDescription: "Concrete Reinforcement" }
 *   "03200"                              → { specNumber: "03200", specDescription: "" }
 *   ""                                   → { specNumber: "", specDescription: "" }
 */
function splitSpecSection(raw) {
  const s = String(raw || '').trim();
  if (!s) return { specNumber: '', specDescription: '' };
  // Split on the first " - " (with surrounding whitespace tolerant of variants)
  const m = s.match(/^(.+?)\s+-\s+(.+)$/);
  if (m) {
    return { specNumber: m[1].trim(), specDescription: m[2].trim() };
  }
  // No separator — assume the whole thing is the section number.
  return { specNumber: s, specDescription: '' };
}

module.exports = { buildExcel };
