export const COLOR_COUNT_OPTIONS = [
  { value: 1, label: "1" },
  { value: 1.5, label: "1.5" },
  { value: 2, label: "2" },
  { value: 2.5, label: "2.5" },
  { value: 3, label: "3" },
  { value: 3.5, label: "3+" }
];

export const COMPLEXITY_LABELS = [
  "\u7b80\u6613",
  "\u57fa\u7840",
  "\u590d\u6742",
  "\u7e41\u590d"
];

export const SYMMETRY_LABELS = [
  "\u65e0\u5bf9\u79f0",
  "\u89c4\u6574",
  "\u57fa\u7840\u5bf9\u79f0",
  "\u534e\u4e3d\u5bf9\u79f0"
];

const COMPLEXITY_RAW_VALUES = [15, 40, 70, 92];
const SYMMETRY_RAW_VALUES = [18, 48, 72, 92];

const POTENTIAL_RULE_TABLE = {
  1: [{ max: 6, grade: "E" }],
  1.5: [
    { max: 1, grade: "E" },
    { max: 4, grade: "D" },
    { max: 6, grade: "C" }
  ],
  2: [
    { max: 1, grade: "D" },
    { max: 3, grade: "C" },
    { max: 4, grade: "B" },
    { max: 5, grade: "A" },
    { max: 6, grade: "S" }
  ],
  2.5: [
    { max: 0, grade: "B" },
    { max: 2, grade: "A" },
    { max: 5, grade: "S" },
    { max: 6, grade: "SS" }
  ],
  3: [
    { max: 2, grade: "S" },
    { max: 5, grade: "SS" },
    { max: 6, grade: "SSS" }
  ],
  3.5: [
    { max: 3, grade: "SS" },
    { max: 6, grade: "SSS" }
  ]
};

export const POTENTIAL_SCORE_RANGE_BY_GRADE = {
  E: [30, 115],
  D: [116, 189],
  C: [190, 299],
  B: [300, 429],
  A: [430, 579],
  S: [580, 719],
  SS: [720, 879],
  SSS: [880, 1000]
};

export function normalizeColorBand(value = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return COLOR_COUNT_OPTIONS.reduce(
    (best, option) =>
      Math.abs(option.value - numeric) < Math.abs(best.value - numeric) ? option : best,
    COLOR_COUNT_OPTIONS[0]
  ).value;
}

export function getColorBandLabel(value = 1) {
  return COLOR_COUNT_OPTIONS.find((option) => option.value === normalizeColorBand(value))?.label || "1";
}

export function clampTier(value = 0) {
  return Math.max(0, Math.min(3, Math.round(Number(value) || 0)));
}

export function getComplexityTierLabel(tier = 0) {
  return COMPLEXITY_LABELS[clampTier(tier)] || COMPLEXITY_LABELS[0];
}

export function getSymmetryTierLabel(tier = 0) {
  return SYMMETRY_LABELS[clampTier(tier)] || SYMMETRY_LABELS[0];
}

export function buildManualMetrics({ colorCountScore = 2, complexityTier = 1, symmetryTier = 1 } = {}) {
  const normalizedColorBand = normalizeColorBand(colorCountScore);
  const safeComplexityTier = clampTier(complexityTier);
  const safeSymmetryTier = clampTier(symmetryTier);
  return {
    colorCountScore: normalizedColorBand,
    mainColorCount: normalizedColorBand >= 3 ? 3 : normalizedColorBand >= 2 ? 2 : 1,
    patternComplexityTier: safeComplexityTier,
    patternComplexity: COMPLEXITY_RAW_VALUES[safeComplexityTier],
    patternSymmetryTier: safeSymmetryTier,
    patternSymmetry: SYMMETRY_RAW_VALUES[safeSymmetryTier],
    manualEdited: true
  };
}

export function mapPotentialGrade(colorBand, tierTotal) {
  const rules = POTENTIAL_RULE_TABLE[normalizeColorBand(colorBand)] || POTENTIAL_RULE_TABLE[1];
  const safeTotal = Math.max(0, Math.min(6, Math.round(Number(tierTotal) || 0)));
  const matched = rules.find((rule) => safeTotal <= rule.max);
  return matched?.grade || rules[rules.length - 1]?.grade || "E";
}
