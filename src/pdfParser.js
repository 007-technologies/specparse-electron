const fs       = require('fs');
const pdfParse = require('pdf-parse');

const SKIP_SECTIONS = new Set([
  '02220','03055','03100','04930','07190','07260',
  '09311','31360','31364','32765','32841','32890',
]);

const TITLE_FALLBACK = {
  '075423': 'Thermoplastic-Polyolefin Roofing',
  '08360':  'Sectional Overhead Doors',
  '09310':  'Tile',
  '09820':  'Acoustical Insulation',
  '31300':  'Earthwork',
};

// Extract just the SUBMITTALS paragraph from a section — this is the gold
function extractSubmittalsBlock(content) {
  const m = content.match(/(\d+\.\d+\s+SUBMITTALS?\b[\s\S]{0,2000}?)(?=\n\s*\d+\.\d+\s+[A-Z]|\nPART\s+2|\nPART\s+3|$)/i);
  return m ? m[1].trim() : null;
}

async function extractSections(pdfPath) {
  let dataBuffer;
  try {
    dataBuffer = fs.readFileSync(pdfPath);
  } catch (err) {
    throw new Error('Could not read the PDF file at "' + pdfPath + '". It may have been moved or deleted.');
  }

  let data;
  try {
    data = await pdfParse(dataBuffer);
  } catch (err) {
    // pdf-parse errors on: encrypted PDFs, corrupt files, unusual encodings
    const msg = (err && err.message) || '';
    if (/password|encrypt/i.test(msg)) {
      throw new Error('This PDF is password-protected. Please remove the password and try again.');
    }
    throw new Error('The PDF could not be parsed. It may be corrupt or in an unusual format. (' + msg.slice(0, 120) + ')');
  }

  const text = data.text || '';

  // Scanned PDFs produce little or no extractable text. Typical spec books have 100+
  // pages and tens of thousands of characters. If we have almost nothing, tell the user.
  if (text.trim().length < 1000) {
    throw new Error('This PDF contains very little text — it may be a scanned document (image-based). SpecParse needs a text-based PDF. Try running OCR on the file first.');
  }

  // Match both "SECTION 042111" and "SECTION 04 21 11" formats
  const pattern = /SECTION\s+(\d{5,6}|\d{2}\s\d{2}\s\d{2})\s*[-\u2013\u2014]?\s*\n/g;
  const matches = [];
  let m;
  while ((m = pattern.exec(text)) !== null) {
    const num = m[1].replace(/\s/g, '');
    matches.push({ index: m.index, num });
  }

  if (matches.length === 0) {
    throw new Error('No spec sections were found in this PDF. Make sure this is a CSI MasterFormat specification book (sections titled like "SECTION 075423 - Thermoplastic-Polyolefin Roofing").');
  }

  const sections = [];
  const seen     = new Set();

  for (let i = 0; i < matches.length; i++) {
    const { index, num } = matches[i];
    if (num.startsWith('00')) continue;
    if (SKIP_SECTIONS.has(num))   continue;
    if (seen.has(num))             continue;
    seen.add(num);

    const end     = i + 1 < matches.length ? matches[i+1].index : text.length;
    const content = text.slice(index, end);
    const lines   = content.split('\n');

    let title = TITLE_FALLBACK[num] || '';
    if (!title) {
      for (let j = 1; j < Math.min(12, lines.length); j++) {
        const cleaned = lines[j]
          .replace(/^[\s\-\u2013\u2014]+|[\s\-\u2013\u2014]+$/g, '')
          .trim();
        if (
          cleaned.length > 4 &&
          !/^(PART|SASC|Phoenix|Discount|Page|\d+\.\d+)/i.test(cleaned) &&
          !/^[0-9.]+\s+(GENERAL|QUALITY|SUMMARY|SCOPE)/i.test(cleaned)
        ) {
          title = toTitleCase(cleaned);
          break;
        }
      }
    }

    title = title || num;

    // Extract submittals block specifically — much more accurate than raw text
    const submittalsBlock = extractSubmittalsBlock(content);

    sections.push({
      num,
      title,
      content:         content.slice(0, 4000),      // full context for query bar
      submittalsBlock: submittalsBlock || '',         // targeted for AI extraction
      isDiv01:         num.startsWith('01'),
    });
  }

  return sections;
}

function toTitleCase(str) {
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

module.exports = { extractSections };
