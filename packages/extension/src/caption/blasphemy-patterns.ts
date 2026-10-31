/**
 * Blasphemy pattern matcher -- TypeScript port.
 *
 * Direct port of packages/ai-pipeline/src/blasphemy/pattern_matcher.py
 * and catholic_taxonomy.py for in-browser real-time caption monitoring.
 *
 * Two-pass detection:
 *   Pass 1: Unambiguous patterns (always blasphemous, zero false positives)
 *   Pass 2: Context-dependent patterns (flagged, filtered at higher threshold only)
 */

export interface BlasphemyMatch {
  text: string;
  start: number;       // character offset
  end: number;         // character offset
  category: string;    // e.g. "blasphemy.gods_name"
  severity: number;    // 1-3
  needsMlReview: boolean;
}

interface PatternEntry {
  regex: RegExp;
  category: string;
  severity: number;
  needsMlReview: boolean;
}

// ========================================
// SPELLINGS
// ========================================

// Masked spellings count too: subtitle files often print J*sus, Ch**st or G-d
// while the audio still says the whole word.
const MASK = String.raw`[*_#@\-]`;
// Elongated and accented forms, dialect and minced forms, and masked forms.
const JESUS = String.raw`(?:j[eé3]+s+[uú]+s+|[jg](?:e+|ay|ai|ea)[sbz]{1,2}[uai]s|j(?:${MASK}{1,3}us|e${MASK}us|${MASK}sus))`;
const CHRIST = String.raw`(?:ch(?:r+[iy]+|i+r+|r+)s+t+|ch(?:${MASK}{1,3}st|r${MASK}{1,2}st|${MASK}{1,2}ist))`;
const MARY = String.raw`mar(?:y|ia|ía|ie|ry)`;
const JOSEPH = String.raw`jos(?:eph|é|e)`;
// Between the names of an oath: "Jesus, Mary and Joseph" / "Jesus Mary n' Joseph"
const SEP = String.raw`(?:,\s*|\s+)(?:(?:and|&|an'|n'|y)\s+)?`;

// "damn" and its forms, spelled out or self-censored (d*mn). Only ever used
// behind a form of "God", so the lenient ending cannot catch a dam or a Damn Yankee.
const DAMN = String.raw`d[a*_#@\-]m+n*(?:ed(?:est)?|ing|it|est|dest|able)?`;
// God, in the spellings that sit in front of "damn"
const GOD = String.raw`(?:g[o0]d+'?s?|gawd|gad)`;
// Between the two halves: a space, a hyphen or a comma
const GAP = String.raw`[-\s,]{0,3}`;

const rx = (source: string): RegExp => new RegExp(source, 'gi');

// ========================================
// UNAMBIGUOUS PATTERNS (always blasphemous)
// ========================================

const UNAMBIGUOUS: PatternEntry[] = [
  // God's Name -- always profane
  // God-damn in every spelling: goddamn, goddamned, god-damnit, God, damn it,
  // godamn, gdamn, g'damn, G*damn, god*mn...
  { regex: rx(String.raw`\b${GOD}${GAP}${DAMN}\b`),             category: 'blasphemy.gods_name',    severity: 3, needsMlReview: false },
  { regex: rx(String.raw`\bgo+d+'?s?${DAMN}\b`),                  category: 'blasphemy.gods_name',    severity: 3, needsMlReview: false },
  { regex: rx(String.raw`\bg[o0]${DAMN}\b`),                      category: 'blasphemy.gods_name',    severity: 3, needsMlReview: false },
  { regex: rx(String.raw`\bg'?d?${DAMN}\b`),                      category: 'blasphemy.gods_name',    severity: 3, needsMlReview: false },
  { regex: rx(String.raw`\bg${MASK}{1,2}d*${DAMN}\b`),            category: 'blasphemy.gods_name',    severity: 3, needsMlReview: false },
  { regex: rx(String.raw`\bg[o0]${MASK}d*${DAMN}\b`),             category: 'blasphemy.gods_name',    severity: 3, needsMlReview: false },
  { regex: rx(String.raw`\bg[o0]d+${GAP}${MASK}{1,3}m+n(?:ed|it|ing)?\b`),
                                                                 category: 'blasphemy.gods_name',    severity: 3, needsMlReview: false },
  { regex: /\bg\.?d\.?\b/gi,            category: 'blasphemy.gods_name',    severity: 2, needsMlReview: false },
  { regex: /\bfor\s+god'?s?\s+sake\b/gi, category: 'blasphemy.gods_name',   severity: 2, needsMlReview: false },

  // The Holy Name -- always profane
  { regex: rx(String.raw`\b${JESUS}\s+h\.?\s+${CHRIST}\b`),                    category: 'blasphemy.jesus_name', severity: 3, needsMlReview: false },
  { regex: rx(String.raw`\b${JESUS}\s+[\w*]*(?:uck|kin)[\w*]*\s+${CHRIST}\b`), category: 'blasphemy.jesus_name', severity: 3, needsMlReview: false },
  { regex: rx(String.raw`\bfor\s+${CHRIST}'?s?\s+sake\b`),                     category: 'blasphemy.jesus_name', severity: 2, needsMlReview: false },
  { regex: rx(String.raw`\bfor\s+${JESUS}'?s?\s+sake\b`),                      category: 'blasphemy.jesus_name', severity: 2, needsMlReview: false },

  // Sacred Mockery -- always profane
  { regex: /\bholy\s+hell\b/gi,          category: 'blasphemy.sacred_mockery', severity: 1, needsMlReview: false },
  { regex: /\bholy\s+sh[i1][t7]\b/gi,   category: 'blasphemy.sacred_mockery', severity: 2, needsMlReview: false },
  { regex: /\bholy\s+crap\b/gi,          category: 'blasphemy.sacred_mockery', severity: 1, needsMlReview: false },
  { regex: /\bholy\s+f\w*\b/gi,          category: 'blasphemy.sacred_mockery', severity: 3, needsMlReview: false },

  // Demonic -- always profane
  { regex: /\bhail\s+satan\b/gi,          category: 'blasphemy.demonic', severity: 3, needsMlReview: false },
  { regex: /\bpraise\s+satan\b/gi,        category: 'blasphemy.demonic', severity: 3, needsMlReview: false },
  { regex: /\bave\s+satanas\b/gi,         category: 'blasphemy.demonic', severity: 3, needsMlReview: false },

  // Spellings and variants of the above
  { regex: rx(String.raw`\b${JESUS}\s+(?!(?:the|our|and|is|was|as|in|of|who|said|has|had|he|his|let)\b)[a-z*]{3,12}\s+${CHRIST}\b`),
                                                    category: 'blasphemy.jesus_name', severity: 2, needsMlReview: false },
  { regex: /\bchris+ake?s?\b/gi,                     category: 'blasphemy.jesus_name', severity: 2, needsMlReview: false },
  { regex: /\bholy\s+(?:moses|moly)\b/gi,            category: 'blasphemy.sacred_mockery', severity: 1, needsMlReview: false },
];

// ========================================
// CONTEXT-DEPENDENT PATTERNS (need ML in full pipeline, rule-based here)
//
// Severity 2 = used as an oath or outcry; active at Moderate and Strict.
// Severity 1 = any mention of the name or title; active at Strict only.
// These can also catch a prayer ("Jesus, Mary and Joseph"), which is why they
// stay out of the Severe setting.
// ========================================

const CONTEXT_DEPENDENT: PatternEntry[] = [
  { regex: /\boh\s+my\s+god\b/gi,         category: 'blasphemy.gods_name',    severity: 2, needsMlReview: true },
  { regex: /\bo\.?m\.?g\.?\b/gi,           category: 'blasphemy.gods_name',    severity: 1, needsMlReview: true },
  { regex: /\boh\s+god\b/gi,              category: 'blasphemy.gods_name',    severity: 1, needsMlReview: true },
  { regex: /\bmy\s+god\b/gi,              category: 'blasphemy.gods_name',    severity: 2, needsMlReview: true },
  { regex: /\bgod\s+almighty\b/gi,        category: 'blasphemy.gods_name',    severity: 2, needsMlReview: true },
  { regex: /\bswear\s+to\s+god\b/gi,      category: 'blasphemy.gods_name',    severity: 2, needsMlReview: true },
  { regex: /\bdear\s+god\b/gi,            category: 'blasphemy.gods_name',    severity: 1, needsMlReview: true },
  { regex: /\bgood\s+god\b/gi,            category: 'blasphemy.gods_name',    severity: 1, needsMlReview: true },
  { regex: /\bgod,?\s+no\b/gi,            category: 'blasphemy.gods_name',    severity: 1, needsMlReview: true },

  // The Holy Name
  { regex: rx(String.raw`\b${JESUS}\s+${CHRIST}\b`),         category: 'blasphemy.jesus_name', severity: 2, needsMlReview: true },
  { regex: rx(String.raw`\b${JESUS}\b(?!\s+(?:${CHRIST}|said|taught|is|was|the|our|loves|wept|prayed|healed|told))`),
                                                              category: 'blasphemy.jesus_name', severity: 1, needsMlReview: true },
  { regex: rx(String.raw`\bsweet\s+${JESUS}\b`),             category: 'blasphemy.jesus_name', severity: 2, needsMlReview: true },
  { regex: rx(String.raw`\b${CHRIST}\b(?!\s+(?:the|is|was|our|said|child|mass|${JESUS}|church))`),
                                                              category: 'blasphemy.jesus_name', severity: 1, needsMlReview: true },
  { regex: rx(String.raw`\bholy\s+${CHRIST}\b`),             category: 'blasphemy.jesus_name', severity: 2, needsMlReview: true },
  // As an outcry: "Oh, Jesus." / "Christ!" / "Jesus." opening a sentence
  { regex: rx(String.raw`\b(?:oh|ah|aw|ay|aye)[,\s]+(?:${JESUS}|${CHRIST})\b`),
                                                              category: 'blasphemy.jesus_name', severity: 2, needsMlReview: true },
  { regex: rx(String.raw`(?<![\w'*])(?:${JESUS}|${CHRIST})(?=\s*!)`),
                                                              category: 'blasphemy.jesus_name', severity: 2, needsMlReview: true },
  { regex: rx(String.raw`(?<=^|[.?!—-]\s*)(?:${JESUS}|${CHRIST})(?=\s*(?:[.?]|$))`),
                                                              category: 'blasphemy.jesus_name', severity: 2, needsMlReview: true },
  // Opening a sentence before a comma: "Jesus, Al, ..." / "Christ, what now?"
  // Nearly always an oath on screen; a prayer said this way is the rare case.
  { regex: rx(String.raw`(?<=^|[.?!—-]\s*)(?:${JESUS}|${CHRIST})(?=\s*,)`),
                                                              category: 'blasphemy.jesus_name', severity: 2, needsMlReview: true },
  { regex: rx(String.raw`\bfor\s+the\s+love\s+of\s+(?:${JESUS}|${CHRIST})\b`),
                                                              category: 'blasphemy.jesus_name', severity: 2, needsMlReview: true },
  { regex: rx(String.raw`\b${CHRIST}\s+(?:almighty|on\s+a\s+(?:bike|cracker|stick|crutch|pogo\s+stick))\b`),
                                                              category: 'blasphemy.jesus_name', severity: 2, needsMlReview: true },
  // Minced forms of the Name are still the Name
  { regex: /\b(?:jaysus|jeezus|jeesus|jeebus|geezus|gee-zus)\b/gi,
                                                              category: 'blasphemy.jesus_name', severity: 2, needsMlReview: true },
  { regex: /\bjeez\b/gi,                                       category: 'blasphemy.jesus_name', severity: 1, needsMlReview: true },

  // Mary, Our Lady, Joseph. "Mary" and "Joseph" alone are ordinary names and
  // are never flagged; only the oaths and the titles are.
  { regex: rx(String.raw`\b${JESUS},?\s+mary,?\s+(?:and|&|an')\s+joseph\b`),
                                                              category: 'blasphemy.holy_family', severity: 2, needsMlReview: true },
  { regex: /\b(?:holy\s+)?mother\s+of\s+god\b/gi,             category: 'blasphemy.holy_family', severity: 2, needsMlReview: true },
  { regex: /\b(?:holy|sweet)\s+(?:mary|joseph)\b/gi,          category: 'blasphemy.holy_family', severity: 2, needsMlReview: true },
  { regex: /\b(?:holy|sweet)\s+(?:mother|virgin)\b(?!\s+(?:church|of\s+god))/gi,
                                                              category: 'blasphemy.holy_family', severity: 2, needsMlReview: true },
  { regex: /\bfor\s+the\s+love\s+of\s+(?:mary|joseph|our\s+lady)\b/gi,
                                                              category: 'blasphemy.holy_family', severity: 2, needsMlReview: true },
  { regex: /\bfor\s+(?:mary|joseph|our\s+lady)'?s?\s+sake\b/gi,
                                                              category: 'blasphemy.holy_family', severity: 2, needsMlReview: true },
  { regex: /\bour\s+lady\b/gi,                                 category: 'blasphemy.holy_family', severity: 1, needsMlReview: true },
  { regex: /\b(?:blessed|holy)\s+(?:mother|virgin)\b/gi,      category: 'blasphemy.holy_family', severity: 1, needsMlReview: true },
  { regex: /\b(?:virgin|mother|blessed)\s+mary\b/gi,          category: 'blasphemy.holy_family', severity: 1, needsMlReview: true },
  { regex: /\bmary\s+(?:and|&)\s+joseph\b/gi,                 category: 'blasphemy.holy_family', severity: 1, needsMlReview: true },

  // The saints, as oaths
  { regex: /\b(?:holy|sweet)\s+(?:st\.?|saint)\s+[a-z]+\b/gi, category: 'blasphemy.saints', severity: 2, needsMlReview: true },
  { regex: /\bholy\s+saints\b/gi,                              category: 'blasphemy.saints', severity: 2, needsMlReview: true },
  { regex: /\bby\s+all\s+the\s+saints\b/gi,                    category: 'blasphemy.saints', severity: 2, needsMlReview: true },
  { regex: /\bsaints\s+(?:preserve|alive|above|protect)\b/gi,  category: 'blasphemy.saints', severity: 2, needsMlReview: true },
  { regex: /\bfor\s+the\s+love\s+of\s+(?:all\s+the\s+)?saints\b/gi,
                                                              category: 'blasphemy.saints', severity: 2, needsMlReview: true },

  // The Holy Family: oaths in several languages, and the title forms
  { regex: rx(String.raw`\b${JESUS}${SEP}(?:${MARY}|${JOSEPH})${SEP}(?:${JOSEPH}|${MARY})\b`),
                                                              category: 'blasphemy.holy_family', severity: 2, needsMlReview: true },
  { regex: rx(String.raw`\b${JESUS},\s*${MARY}\b`),          category: 'blasphemy.holy_family', severity: 2, needsMlReview: true },
  { regex: rx(String.raw`\b${MARY},?\s+mother\s+of\s+(?:god|${JESUS}|${CHRIST})\b`),
                                                              category: 'blasphemy.holy_family', severity: 2, needsMlReview: true },
  { regex: rx(String.raw`\bmother\s+of\s+(?:${JESUS}|${CHRIST})\b`),
                                                              category: 'blasphemy.holy_family', severity: 1, needsMlReview: true },
  { regex: /\bour\s+(?:blessed\s+)?lady\b/gi,                  category: 'blasphemy.holy_family', severity: 1, needsMlReview: true },
  { regex: /\bjoseph\s+(?:and|&)\s+mary\b/gi,                  category: 'blasphemy.holy_family', severity: 1, needsMlReview: true },
  { regex: /\bmadre\s+(?:de\s+dios|m[ií]a)\b/gi,               category: 'blasphemy.holy_family', severity: 2, needsMlReview: true },
  { regex: /\bvirgen\s+(?:santa|sant[ií]sima)\b/gi,            category: 'blasphemy.holy_family', severity: 2, needsMlReview: true },

  // More of the Name: minced, dialect and mild forms
  { regex: rx(String.raw`\b(?:jumping|jumpin'?)\s+${JESUS}\b`), category: 'blasphemy.jesus_name', severity: 2, needsMlReview: true },
  { regex: rx(String.raw`\b${CHRIST}'?s?\s+(?:sake|almighty)\b`), category: 'blasphemy.jesus_name', severity: 2, needsMlReview: true },
  { regex: /\b[jg]ee+z+e?\b(?:\s+louise)?/gi,                  category: 'blasphemy.jesus_name', severity: 1, needsMlReview: true },
  { regex: /\b(?:jeepers(?:\s+creepers)?|jiminy(?:\s+cricket)?|cripes|crikey|criminy|gee\s+whiz)\b/gi,
                                                              category: 'blasphemy.jesus_name', severity: 1, needsMlReview: true },

  // The Lord and God, in spellings the first list missed
  { regex: /\b(?:oh\s+my|my|oh|good)\s+gawd\b/gi,              category: 'blasphemy.gods_name', severity: 1, needsMlReview: true },
  { regex: /\blord\s+almighty\b/gi,                            category: 'blasphemy.gods_name', severity: 2, needsMlReview: true },
  { regex: /\b(?:good|oh)\s+lord\b|\blord\s+have\s+mercy\b|\blordy\b/gi,
                                                              category: 'blasphemy.gods_name', severity: 1, needsMlReview: true },
  { regex: /\bdios\s+m[ií]o\b|\bay,?\s+dios\b/gi,              category: 'blasphemy.gods_name', severity: 1, needsMlReview: true },
];


/**
 * Find all blasphemy matches in a text string.
 *
 * Returns unambiguous matches (always filter) and optionally
 * context-dependent matches (for stricter filtering modes).
 */
export function findBlasphemyMatches(
  text: string,
  includeContextDependent: boolean = false,
): BlasphemyMatch[] {
  const matches: BlasphemyMatch[] = [];

  // Pass 1: Unambiguous (always blasphemous)
  for (const entry of UNAMBIGUOUS) {
    entry.regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = entry.regex.exec(text)) !== null) {
      matches.push({
        text: m[0],
        start: m.index,
        end: m.index + m[0].length,
        category: entry.category,
        severity: entry.severity,
        needsMlReview: false,
      });
    }
  }

  // Pass 2: Context-dependent (optional, for stricter modes). Only an
  // unambiguous hit suppresses these; two context-dependent hits may overlap
  // (a bare name inside a longer oath) and scanText keeps the more severe.
  const unambiguous = matches.slice();
  if (includeContextDependent) {
    for (const entry of CONTEXT_DEPENDENT) {
      entry.regex.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = entry.regex.exec(text)) !== null) {
        // Skip if overlapping with an unambiguous match
        const overlap = unambiguous.some(
          (existing) =>
            existing.start <= m!.index && m!.index < existing.end
            || existing.start < m!.index + m![0].length && m!.index + m![0].length <= existing.end,
        );
        if (overlap) continue;

        matches.push({
          text: m[0],
          start: m.index,
          end: m.index + m[0].length,
          category: entry.category,
          severity: entry.severity,
          needsMlReview: true,
        });
      }
    }
  }

  matches.sort((a, b) => a.start - b.start);
  return matches;
}

/**
 * The lowest and highest severity this sub-category's patterns carry, read
 * from the tables above (never written by hand), so the menu can say which
 * levels reach it.
 */
export function blasphemySeverityRange(category: string): { min: number; max: number } | undefined {
  const sev = [...UNAMBIGUOUS, ...CONTEXT_DEPENDENT].filter((e) => e.category === category).map((e) => e.severity);
  return sev.length ? { min: Math.min(...sev), max: Math.max(...sev) } : undefined;
}

/**
 * Quick check: does this text contain any unambiguous blasphemy?
 * Fastest possible path -- returns on first match.
 */
export function containsUnambiguousBlasphemy(text: string): boolean {
  for (const entry of UNAMBIGUOUS) {
    entry.regex.lastIndex = 0;
    if (entry.regex.test(text)) return true;
  }
  return false;
}
