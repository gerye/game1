function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeFaction(faction) {
  if (!faction || typeof faction !== "object") {
    return { key: "", name: "", color: "" };
  }
  return {
    key: String(faction.key || ""),
    name: String(faction.name || ""),
    color: String(faction.color || "")
  };
}

function normalizeHistoryEntry(entry = {}) {
  return {
    code: String(entry.code || ""),
    displayName: String(entry.displayName || entry.code || ""),
    potential: String(entry.potential || "E"),
    faction: normalizeFaction(entry.faction)
  };
}

function normalizeHistoryRound(round = {}) {
  return {
    roundNumber: Math.max(1, Math.floor(Number(round.roundNumber || 1))),
    rows: Array.isArray(round.rows) ? clone(round.rows) : []
  };
}

function buildHistoryTitle(index) {
  return `第${index}次排位`;
}

function resolveHistoryTitle(rawTitle, index) {
  const title = String(rawTitle || "").trim();
  if (/^第\d+次排位$/.test(title)) return title;
  return buildHistoryTitle(index);
}

function normalizeHistorySnapshot(snapshot = {}, fallbackIndex = 1) {
  const index = Math.max(1, Math.floor(Number(snapshot.index || fallbackIndex)));
  return {
    index,
    title: resolveHistoryTitle(snapshot.title, index),
    swissRoundCount: Math.max(1, Math.floor(Number(snapshot.swissRoundCount || 1))),
    entriesByCode: Object.fromEntries(
      Object.entries(snapshot.entriesByCode || {})
        .map(([code, entry]) => [String(code), normalizeHistoryEntry({ ...entry, code })])
        .filter(([, entry]) => entry.code)
    ),
    rounds: Array.isArray(snapshot.rounds) ? snapshot.rounds.map((round) => normalizeHistoryRound(round)) : [],
    standings: Array.isArray(snapshot.standings) ? clone(snapshot.standings) : [],
    knockoutRounds: Array.isArray(snapshot.knockoutRounds) ? clone(snapshot.knockoutRounds) : []
  };
}

export function normalizeRankingHistory(raw = []) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((snapshot, index) => normalizeHistorySnapshot(snapshot, index + 1))
    .filter((snapshot) => Object.keys(snapshot.entriesByCode).length > 0);
}

export function createRankingHistorySnapshot({
  ranking,
  index,
  getEntryByCode,
  getRankingRoundRows,
  getRankingStandings,
  getRankingKnockoutPreview
}) {
  const participantCodes = Array.isArray(ranking?.participantCodes) ? ranking.participantCodes : [];
  const entriesByCode = Object.fromEntries(
    participantCodes.map((code) => {
      const entry = getEntryByCode(code);
      return [code, {
        code,
        displayName: entry?.displayName || String(code),
        potential: entry?.build?.potential || "E",
        faction: normalizeFaction(entry?.build?.faction)
      }];
    })
  );
  const swissRoundCount = Math.max(1, Math.floor(Number(ranking?.swissRoundCount || 1)));
  const rounds = Array.from({ length: swissRoundCount }, (_, roundIndex) => ({
    roundNumber: roundIndex + 1,
    rows: clone(getRankingRoundRows(ranking, roundIndex + 1))
  }));
  return normalizeHistorySnapshot({
    index,
    title: buildHistoryTitle(index),
    swissRoundCount,
    entriesByCode,
    rounds,
    standings: clone(getRankingStandings(ranking)),
    knockoutRounds: clone(getRankingKnockoutPreview(ranking))
  }, index);
}

export function getRankingHistoryEntryByCode(snapshot, code = "") {
  const entry = snapshot?.entriesByCode?.[code];
  if (!entry) return null;
  return {
    displayName: entry.displayName,
    build: {
      potential: entry.potential,
      faction: normalizeFaction(entry.faction)
    }
  };
}

export function getRankingHistoryRoundRows(snapshot, roundNumber) {
  const round = (snapshot?.rounds || []).find((item) => Number(item.roundNumber) === Number(roundNumber));
  return round?.rows ? clone(round.rows) : [];
}

export function getRankingHistoryStandings(snapshot) {
  return Array.isArray(snapshot?.standings) ? clone(snapshot.standings) : [];
}

export function getRankingHistoryKnockoutPreview(snapshot) {
  return Array.isArray(snapshot?.knockoutRounds) ? clone(snapshot.knockoutRounds) : [];
}
