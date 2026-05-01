const Anthropic = require('@anthropic-ai/sdk');

// ── Hardcoded rules for known sections (100% accurate, no AI needed) ──
const HARDCODED = {
  '03200': [{ title: 'Concrete Structure - SD', type: 'Shop Drawing', description: 'Reinforcing steel fabrication and placement shop drawings' }],
  '03300': [{ title: 'Concrete Mix Designs', type: 'Product Information', description: 'Mix design submittals for all concrete mixes used on site' }],
  '04066': [
    { title: 'CMU Block & Mortar', type: 'Product Information', description: 'Mortar and masonry grout product data' },
    { title: 'CMU Grout Mix Designs', type: 'Product Information', description: 'Grout mix design submittals' },
  ],
  '04085': [
    { title: 'CMU Samples', type: 'Sample', description: 'Masonry unit color and texture samples' },
    { title: 'CMU Accessories', type: 'Product Information', description: 'Joint reinforcement, anchors, and tie product data' },
  ],
  '04211': [
    { title: 'Brick Samples', type: 'Sample', description: 'Brick unit color and texture samples' },
    { title: 'Brick Unit Masonry', type: 'Product Information', description: 'Brick unit masonry product data' },
  ],
  '04220': [{ title: 'CMU - SD', type: 'Shop Drawing', description: 'Concrete masonry unit layout shop drawings' }],
  '05100': [
    { title: 'Structural Steel - SD', type: 'Shop Drawing', description: 'Structural steel shop and erection drawings showing material grade, camber, holes, and connection details' },
    { title: 'AB & Embed OFA', type: 'Product Information', description: 'Anchor bolt and embedded item owner-furnished drawings' },
  ],
  '05213': [{ title: 'Joist & Decking - SD', type: 'Shop Drawing', description: 'Open-web steel joist shop drawings' }],
  '05310': [{ title: 'Steel Deck - SD', type: 'Shop Drawing', description: 'Steel deck layout and connection shop drawings' }],
  '05410': [
    { title: 'Load-Bearing Metal Stud Framing - SD', type: 'Shop Drawing', description: 'Cold-formed steel load-bearing stud framing shop drawings (delegated design)' },
    { title: 'Load-Bearing Metal Stud Framing', type: 'Product Information', description: 'Cold-formed steel structural stud product data' },
  ],
  '05500': [{ title: 'Metal Fabrications - SD', type: 'Shop Drawing', description: 'Miscellaneous metal fabrications shop drawings' }],
  '05520': [{ title: 'Handrails and Railings - SD', type: 'Shop Drawing', description: 'Handrail and railing shop drawings' }],
  '06100': [{ title: 'Rough Carpentry', type: 'Product Information', description: 'Rough carpentry lumber product data including blocking, nailers, and backing' }],
  '06173': [
    { title: 'Wood Trusses - SD', type: 'Shop Drawing', description: 'Prefabricated wood truss shop drawings with engineering calculations (delegated design)' },
    { title: 'Wood Trusses', type: 'Product Information', description: 'Wood truss lumber grades and connector plate product data' },
  ],
  '06200': [{ title: 'Finish Carpentry', type: 'Product Information', description: 'Finish carpentry trim and lumber product data' }],
  '07210': [{ title: 'Building Insulation', type: 'Product Information', description: 'Building insulation product data' }],
  '07240': [
    { title: 'EIFS', type: 'Product Information', description: 'Exterior insulation and finish system product data' },
    { title: 'EIFS Color Samples', type: 'Sample', description: 'EIFS color and texture samples' },
  ],
  '07241': [
    { title: 'EIFS with Moisture Drainage', type: 'Product Information', description: 'EIFS with moisture drainage product data' },
    { title: 'EIFS Color Samples', type: 'Sample', description: 'EIFS color and texture samples' },
  ],
  '07322': [
    { title: 'Concrete Roofing Tiles', type: 'Product Information', description: 'Concrete roofing tile product data' },
    { title: 'Concrete Roof Tile Samples', type: 'Sample', description: 'Concrete roof tile color samples' },
  ],
  '07421': [
    { title: 'MCM Wall Panels', type: 'Product Information', description: 'Metal composite material wall panel product data' },
    { title: 'MCM Wall Panels - SD', type: 'Shop Drawing', description: 'MCM wall panel shop drawings' },
    { title: 'MCM Wall Panel Samples', type: 'Sample', description: 'Metal composite material color and finish samples' },
  ],
  '07422': [
    { title: 'Corrugated Metal Wall Panels - SD', type: 'Shop Drawing', description: 'Corrugated metal wall panel layout, trim, and flashing shop drawings' },
    { title: 'Corrugated Metal Wall Panels', type: 'Product Information', description: 'Corrugated metal wall panel product data' },
    { title: 'Corrugated Metal Wall Panel Samples', type: 'Sample', description: 'Wall panel color and finish samples' },
  ],
  '075423': [{ title: 'Roofing Submittal Package', type: 'Product Information', description: 'TPO roofing system complete product data package' }],
  '07500': [
    { title: 'Built-Up Asphalt Roofing - SD', type: 'Shop Drawing', description: 'Built-up roofing plans, elevations, sections, flashing details, and attachments to other Work' },
    { title: 'Built-Up Asphalt Roofing', type: 'Product Information', description: 'Built-up asphalt roofing system product data' },
  ],
  '07600': [
    { title: 'Flashing and Sheet Metal', type: 'Product Information', description: 'Flashing and sheet metal product data' },
    { title: 'Sheet Metal Fabrications - SD', type: 'Shop Drawing', description: 'Custom sheet metal fabrication shop drawings' },
  ],
  '07610': [
    { title: 'Sheet Metal Roofing - SD', type: 'Shop Drawing', description: 'Sheet metal roofing panel layout and flashing shop drawings' },
    { title: 'Sheet Metal Roofing', type: 'Product Information', description: 'Sheet metal roofing product data including gauge, finish, and color' },
  ],
  '07611': [
    { title: 'Sheet Metal Awning - SD', type: 'Shop Drawing', description: 'Sheet metal awning layout and connection shop drawings' },
    { title: 'Sheet Metal Awning', type: 'Product Information', description: 'Sheet metal awning product data including gauge and finish' },
  ],
  '07710': [
    { title: 'Perimeter Edge Metal', type: 'Product Information', description: 'Roof perimeter edge metal, fascia, and coping product data' },
    { title: 'Perimeter Edge Metal - SD', type: 'Shop Drawing', description: 'Roof perimeter edge metal flashing shop drawings (SPRI ES-1 compliance)' },
  ],
  '07720': [{ title: 'Roof Accessories', type: 'Product Information', description: 'Roof accessory product data including hatches, vents, curbs, and walkway pads' }],
  '07840': [{ title: 'Firestopping', type: 'Product Information', description: 'Firestopping system product data' }],
  '07900': [{ title: 'Joint Sealers', type: 'Product Information', description: 'Joint sealer product data for all sealant types' }],
  '08100': [
    { title: 'Steel Doors and Frames', type: 'Product Information', description: 'Steel door and frame product data' },
    { title: 'Doors & Hardware', type: 'Product Information', description: 'Door and hardware schedule' },
  ],
  '08330': [{ title: 'Bay & Service Doors - SD', type: 'Shop Drawing', description: 'Coiling door and grille shop drawings' }],
  '08331': [{ title: 'Insulated Coiling Doors - SD', type: 'Shop Drawing', description: 'Insulated coiling door shop drawings' }],
  '08360': [
    { title: 'Sectional Overhead Doors - SD', type: 'Shop Drawing', description: 'Sectional overhead door shop drawings' },
    { title: 'Sectional Overhead Doors', type: 'Product Information', description: 'Sectional overhead door product data' },
  ],
  '08411': [
    { title: 'Aluminum Entrances and Storefronts', type: 'Product Information', description: 'Aluminum entrance and storefront system product data' },
    { title: 'Storefront System Samples', type: 'Sample', description: 'Storefront color and finish samples' },
  ],
  '08630': [{ title: 'Metal-framed Skylights', type: 'Product Information', description: 'Metal-framed skylight product data' }],
  '08710': [{ title: 'Door Hardware Schedule', type: 'Product Information', description: 'Complete door hardware schedule and product data' }],
  '08810': [{ title: 'Glass & Glazing Shop Drawings', type: 'Shop Drawing', description: 'Glass and glazing shop drawings' }],
  '08811': [{ title: 'Insulated Unit Glazing', type: 'Product Information', description: 'Insulated unit glazing product data' }],
  '08870': [{ title: '3M Safety Window Film', type: 'Product Information', description: 'Safety and security window film product data' }],
  '09100': [
    { title: 'Metal Support Assemblies - Interior/Exterior Framing', type: 'Product Information', description: 'Metal stud framing system product data' },
    { title: 'Anchor Bolt & Embed', type: 'Product Information', description: 'Anchor bolt and embedded item plan' },
  ],
  '09220': [
    { title: 'Portland Cement Plaster (Stucco)', type: 'Product Information', description: 'Stucco system product data' },
    { title: 'Stucco Color Samples', type: 'Sample', description: 'Stucco color and finish samples' },
  ],
  '09250': [{ title: 'Gypsum Board Wallboard', type: 'Product Information', description: 'Gypsum board product data' }],
  '09253': [{ title: 'Exterior Gypsum Sheathing', type: 'Product Information', description: 'Exterior gypsum sheathing product data' }],
  '09310': [
    { title: 'Tile', type: 'Product Information', description: 'Ceramic tile product data' },
    { title: 'Tile Samples', type: 'Sample', description: 'Tile color and pattern samples' },
  ],
  '09510': [{ title: 'Acoustical Ceilings', type: 'Product Information', description: 'Acoustical ceiling tile and grid product data' }],
  '09775': [{ title: 'FRP Wall Panels', type: 'Product Information', description: 'FRP wall panel product data' }],
  '09820': [{ title: 'Fiberglass Insulation', type: 'Product Information', description: 'Acoustical insulation product data' }],
  '09900': [{ title: 'Painting', type: 'Product Information', description: 'Paint product data for all coating systems' }],
  '10200': [{ title: 'Louvers', type: 'Product Information', description: 'Louver product data' }],
  '10270': [{ title: 'Wall Protection - Corner Guards', type: 'Product Information', description: 'Corner guard product data' }],
  '10400': [{ title: 'Signage', type: 'Product Information', description: 'Signage product data' }],
  '10520': [{ title: 'Fire Protection Specialties', type: 'Product Information', description: 'Fire extinguisher and cabinet product data' }],
  '10810': [{ title: 'Restroom Accessories', type: 'Product Information', description: 'Restroom accessory product data' }],
  '31300': [{ title: 'Utilities - PD', type: 'Product Information', description: 'Earthwork and utilities product data' }],
  '31362': [{ title: 'Termite Control', type: 'Product Information', description: 'Termite treatment product data' }],
  '32740': [{ title: 'Asphaltic Concrete Paving', type: 'Product Information', description: 'Asphalt paving mix design and product data' }],
  '32774': [{ title: 'Concrete Flatwork', type: 'Product Information', description: 'Exterior concrete flatwork mix design and product data for sidewalks, curbs, and pads' }],
  '32810': [{ title: 'Landscape Irrigation System', type: 'Product Information', description: 'Irrigation system product data' }],
  '32900': [{ title: 'Landscaping', type: 'Product Information', description: 'Plant schedule and landscaping product data' }],
};

// ── Sections to skip entirely ──
const SKIP_SECTIONS = new Set([
  '02220','03055','03100','04930','07190','07260',
  '09311','31360','31364','32765','32841','32890',
]);

// HARDCODED keys mix 5-digit (1995 MasterFormat) and 6-digit (2004+) formats.
// Real-world specs vary too, so lookup tolerates both: try exact first, then truncate
// 6→5, then pad 5→6 with a trailing 0 (standard conversion e.g. 05410 ↔ 054100).
function findHardcoded(num) {
  if (!num) return null;
  if (HARDCODED[num]) return HARDCODED[num];
  if (num.length === 6 && HARDCODED[num.slice(0, 5)]) return HARDCODED[num.slice(0, 5)];
  if (num.length === 5 && HARDCODED[num + '0']) return HARDCODED[num + '0'];
  return null;
}

function isSkipped(num) {
  if (!num) return false;
  if (SKIP_SECTIONS.has(num)) return true;
  if (num.length === 6 && SKIP_SECTIONS.has(num.slice(0, 5))) return true;
  if (num.length === 5 && SKIP_SECTIONS.has(num + '0')) return true;
  return false;
}

const SYSTEM_PROMPT = `You are a submittal log expert for a General Contractor on commercial construction projects.
Your job: read a spec section and identify ONLY the submittals that the Architect must formally review and stamp before installation.

SUBMITTAL TYPES (use exactly these strings):
- "Product Information" - manufacturer product data sheets, cut sheets, technical data
- "Shop Drawing" - fabrication/installation drawings prepared by contractor or sub
- "Sample" - physical or color samples for Architect approval

CORRECT EXAMPLES:
SECTION 03300 - Cast-in-Place Concrete -> [{"title":"Concrete Mix Designs","type":"Product Information","description":"Mix design submittals for all concrete mixes"}]
SECTION 05500 - Metal Fabrications -> [{"title":"Metal Fabrications - SD","type":"Shop Drawing","description":"Miscellaneous metal fabrications shop drawings"}]
SECTION 08411 - Aluminum Storefront -> [{"title":"Aluminum Entrances and Storefronts","type":"Product Information","description":"System product data"},{"title":"Storefront Samples","type":"Sample","description":"Color and finish samples"}]
SECTION 09900 - Painting -> [{"title":"Painting","type":"Product Information","description":"Paint product data for all coating systems"}]
SECTION 02300 - Earthwork -> []

INCLUDE:
- Product data / cut sheets / manufacturer technical literature
- Shop drawings for: structural steel, joists, decking, storefronts, stairs, railings, custom millwork, skylights, overhead/coiling doors
- Samples only when Architect must approve a color, texture, or finish

DO NOT INCLUDE:
- Test reports, inspection reports, lab tests
- Certificates of compliance, material certifications, mill certs
- Contractor/installer qualifications, safety data sheets
- Schedules, phasing plans, record documents, as-builts
- Warranties, guarantees, maintenance manuals, permits

RULES:
1. Return 1-3 submittals MAX. Most sections need only 1.
2. If nothing requires formal Architect approval: return []
3. Section number suffixes like -1 or -2 mean subsection - still identify submittals normally.
4. If section mentions delegated design or design-build, include a Shop Drawing for the engineered system.
5. Title format: plain name for product data; add " - SD" suffix for shop drawings.
Return ONLY a valid JSON array. No prose, no explanation.`;

// Score an AI-extracted submittal as medium or low confidence based on
// the quality of fields Claude returned. Goal: a "low" badge means the
// user should look twice before exporting.
//
// Strong signals (all needed for medium):
//   - Title is non-empty, ≥4 chars, and isn't a bare generic word
//   - Description is non-empty and ≥20 chars (a real sentence's worth)
//   - Type is one of the three standard Procore strings
//
// Anything weaker → low. The threshold is intentionally strict — false
// positives ("flagged but actually fine") are cheap (user just glances
// at a yellow row), but false negatives ("not flagged, actually wrong")
// cost the user trust the first time they catch it.
const STANDARD_TYPES = new Set(['Product Information', 'Shop Drawing', 'Sample']);
const GENERIC_TITLES = new Set([
  'submittal', 'submittals', 'product', 'products', 'shop drawing',
  'shop drawings', 'sample', 'samples', 'data', 'product data',
]);
function scoreAiConfidence(title, description, type) {
  const t = (title || '').toLowerCase().trim();
  const d = (description || '').trim();
  const ty = (type || '').trim();
  if (!t || t.length < 4) return 'low';
  if (GENERIC_TITLES.has(t)) return 'low';
  if (!d || d.length < 20) return 'low';
  if (!STANDARD_TYPES.has(ty)) return 'low';
  return 'medium';
}

// Categorize an error from the Anthropic SDK into a user-friendly message.
// Returns { message, fatal } — fatal errors (auth/no-internet) should abort the whole run.
function classifyApiError(err) {
  const msg = (err && err.message) || String(err);
  const status = err && (err.status || (err.response && err.response.status));
  if (status === 401 || /invalid|authentication|unauthorized/i.test(msg)) {
    return { message: 'Your Anthropic API key is invalid or expired. Open Settings to update it.', fatal: true };
  }
  if (status === 429 || /rate.?limit|quota/i.test(msg)) {
    return { message: 'API rate limit hit. Wait a minute and try again.', fatal: true };
  }
  if (/ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|network|fetch failed/i.test(msg)) {
    return { message: 'Could not reach Anthropic. Check your internet connection and try again.', fatal: true };
  }
  if (status >= 500) {
    return { message: 'Anthropic server error (' + status + '). Try again in a few minutes.', fatal: false };
  }
  return { message: msg, fatal: false };
}

async function extractAllSubmittals(apiKey, sections, onProgress) {
  const client = new Anthropic({ apiKey });
  const results = [];
  let consecutiveFailures = 0;

  for (let i = 0; i < sections.length; i++) {
    const { num, title, content, submittalsBlock } = sections[i];
    // 4th arg `found` lets the renderer show "47 found so far" while we scan,
    // which makes the wait feel less mechanical when a 200-page spec is grinding.
    if (onProgress) onProgress(i + 1, sections.length, num + ' - ' + title, results.length);

    if (isSkipped(num)) continue;

    // Division 01 = general requirements, administrative (Summary, Allowances,
    // Payment, Coordination, etc.). Per the system prompt's rules these never
    // produce real submittals — but running them through AI wastes API calls
    // since every call returns []. Skip them entirely unless we've explicitly
    // hardcoded one (rare, but possible for e.g. Closeout Submittals section).
    if (num.startsWith('01') && !findHardcoded(num)) continue;

    // Pass 1: hardcoded rules — 100% accurate, no AI cost
    const hcEntries = findHardcoded(num);
    if (hcEntries) {
      hcEntries.forEach(function(item, j) {
        results.push({
          specSection: num + ' - ' + title,
          submittalNumber: num + '-' + (j + 1),
          title: item.title,
          type: item.type,
          description: item.description,
          // Curated dictionary entries — verified by hand. Always high confidence.
          confidence: 'high',
        });
      });
      continue;
    }

    // Pass 2: AI extraction for unknown sections
    // Use targeted submittals block when available — much more accurate than raw text
    const aiInput = (submittalsBlock && submittalsBlock.length > 100)
      ? 'SUBMITTALS PARAGRAPH:\n' + submittalsBlock + '\n\nFULL SECTION (first 2000 chars):\n' + content.slice(0, 2000)
      : content.slice(0, 3000);

    const userMsg = 'SECTION ' + num + ' - ' + title + '\n\n' + aiInput + '\n\nSubmittals (1-3 max, [] if none):';

    try {
      const message = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMsg }],
      });
      const raw = message.content[0].text.trim();
      const match = raw.match(/\[[\s\S]*\]/);
      if (!match) {
        // Haiku returned prose instead of JSON — treat as "no submittals required"
        consecutiveFailures = 0;
        continue;
      }
      let items;
      try {
        items = JSON.parse(match[0]).slice(0, 3);
      } catch (parseErr) {
        // Malformed JSON — count as a soft failure, keep going.
        console.warn('Section ' + num + ': could not parse AI response as JSON, skipping.');
        continue;
      }
      items.forEach(function(item, j) {
        const cleanTitle = (item.title || '').trim();
        const cleanDesc = (item.description || '').trim();
        const cleanType = (item.type || '').trim();
        results.push({
          specSection: num + ' - ' + title,
          submittalNumber: num + '-' + (j + 1),
          title: cleanTitle,
          type: cleanType || 'Product Information',
          description: cleanDesc,
          // AI-extracted entries get medium/low based on whether the model
          // returned clean structured fields. Anything sketchy → low so the
          // user knows to eyeball it before exporting.
          confidence: scoreAiConfidence(cleanTitle, cleanDesc, cleanType),
        });
      });
      consecutiveFailures = 0;
    } catch (err) {
      const cls = classifyApiError(err);
      console.error('Error on ' + num + ':', cls.message);
      if (cls.fatal) {
        // Auth/network/rate-limit errors: bail out immediately with a clear message
        // so the user isn't left waiting for the whole pipeline to fail silently.
        const e = new Error(cls.message);
        e.fatal = true;
        throw e;
      }
      consecutiveFailures++;
      // If we fail 5 times in a row on different sections, something systemic is wrong.
      if (consecutiveFailures >= 5) {
        throw new Error('Multiple API errors in a row (' + consecutiveFailures + '). Last error: ' + cls.message);
      }
    }
  }

  return results;
}

module.exports = { extractAllSubmittals, scoreAiConfidence };
