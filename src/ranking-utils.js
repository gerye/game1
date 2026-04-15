import { deepClone as clone } from "./utils.js";

function createRankingRecord(code, randomSeed = 0) {
  return {
    code,
    points: 0,
    oppPoints: 0,
    oppOppPoints: 0,
    hadBye: false,
    byeRounds: [],
    opponents: [],
    results: [],
    swissWins: 0,
    swissLosses: 0,
    randomSeed
  };
}

function getSortTuple(record) {
  return [
    Number(record?.points || 0),
    Number(record?.oppPoints || 0),
    Number(record?.oppOppPoints || 0)
  ];
}

function compareTuples(left = [], right = []) {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const diff = Number(right[index] || 0) - Number(left[index] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function sortCodesByStanding(codes = [], records = {}, randomOrder = {}) {
  return [...codes].sort((leftCode, rightCode) => {
    const left = records[leftCode] || createRankingRecord(leftCode);
    const right = records[rightCode] || createRankingRecord(rightCode);
    const tupleDiff = compareTuples(getSortTuple(left), getSortTuple(right));
    if (tupleDiff !== 0) return tupleDiff;
    const randomDiff = Number(randomOrder[leftCode] ?? left.randomSeed ?? 0) - Number(randomOrder[rightCode] ?? right.randomSeed ?? 0);
    if (randomDiff !== 0) return randomDiff;
    return String(leftCode).localeCompare(String(rightCode));
  });
}

function havePlayed(records = {}, leftCode = "", rightCode = "") {
  return Boolean(records[leftCode]?.opponents?.includes(rightCode));
}

function getSwissRoundCount(participantCount) {
  if (participantCount <= 64) return 9;
  return 10;
}

function chooseByeCode(sortedCodes = [], records = {}, roundNumber = 1) {
  if (sortedCodes.length % 2 === 0) return "";
  if (roundNumber === 1) {
    return sortedCodes[Math.floor(Math.random() * sortedCodes.length)] || "";
  }
  for (let index = sortedCodes.length - 1; index >= 0; index -= 1) {
    const code = sortedCodes[index];
    if (!records[code]?.hadBye) return code;
  }
  return sortedCodes[sortedCodes.length - 1] || "";
}

function refreshRandomOrder(state) {
  const shuffled = [...(state.participantCodes || [])]
    .map((code) => ({ code, sortKey: Math.random() }))
    .sort((left, right) => left.sortKey - right.sortKey)
    .map((item) => item.code);
  state.randomOrder = Object.fromEntries(shuffled.map((code, index) => [code, index]));
}

function buildSwissPairings(sortedCodes = [], records = {}, roundNumber = 1) {
  const working = [...sortedCodes];
  const pairings = [];
  const byeCode = chooseByeCode(working, records, roundNumber);
  if (byeCode) {
    const byeIndex = working.indexOf(byeCode);
    if (byeIndex >= 0) working.splice(byeIndex, 1);
    pairings.push({
      id: `swiss-${roundNumber}-bye-${byeCode}`,
      leftCode: byeCode,
      rightCode: "",
      winnerCode: byeCode,
      byeCode,
      resultLabel: "轮空"
    });
  }

  while (working.length > 0) {
    const leftCode = working.shift();
    if (!leftCode) break;
    if (working.length === 0) {
      pairings.push({
        id: `swiss-${roundNumber}-bye-${leftCode}`,
        leftCode,
        rightCode: "",
        winnerCode: leftCode,
        byeCode: leftCode,
        resultLabel: "轮空"
      });
      break;
    }

    const defaultOpponent = working[0];
    const targetPoints = records[defaultOpponent]?.points ?? 0;
    const chosenIndex = working.findIndex((candidateCode) =>
      (records[candidateCode]?.points ?? 0) === targetPoints &&
      !havePlayed(records, leftCode, candidateCode)
    );
    const rightCode = working.splice(chosenIndex >= 0 ? chosenIndex : 0, 1)[0];
    pairings.push({
      id: `swiss-${roundNumber}-${leftCode}-${rightCode}`,
      leftCode,
      rightCode,
      winnerCode: "",
      byeCode: "",
      resultLabel: ""
    });
  }

  return pairings;
}

function createRoundSnapshot(roundNumber, pairings = [], orderCodes = []) {
  return {
    roundNumber,
    name: `第${roundNumber}轮`,
    pairings,
    orderCodes: [...orderCodes],
    finalRows: null,
    completed: pairings.every((pairing) => pairing.winnerCode)
  };
}

function applyBye(records, code, roundNumber) {
  const record = records[code];
  if (!record) return;
  record.points += 1;
  record.hadBye = true;
  record.byeRounds.push(roundNumber);
  record.swissWins += 1;
  record.results.push({ roundNumber, opponentCode: "", outcome: "bye" });
}

function applyMatch(records, leftCode, rightCode, winnerCode, roundNumber) {
  const loserCode = winnerCode === leftCode ? rightCode : leftCode;
  const winner = records[winnerCode];
  const loser = records[loserCode];
  if (!winner || !loser) return;
  winner.points += 1;
  winner.swissWins += 1;
  loser.swissLosses += 1;
  winner.opponents.push(loserCode);
  loser.opponents.push(winnerCode);
  winner.results.push({ roundNumber, opponentCode: loserCode, outcome: "win" });
  loser.results.push({ roundNumber, opponentCode: winnerCode, outcome: "loss" });
}

function getRoundByNumber(state, roundNumber) {
  return (state.rounds || []).find((round) => round.roundNumber === roundNumber) || null;
}

function normalizePairings(round) {
  return (round?.pairings || []).map((pairing) => {
    if (pairing.byeCode) {
      return {
        ...pairing,
        winnerCode: pairing.byeCode,
        resultLabel: "轮空"
      };
    }
    if (!pairing.winnerCode) return { ...pairing, resultLabel: pairing.resultLabel || "" };
    return {
      ...pairing,
      loserCode: pairing.winnerCode === pairing.leftCode ? pairing.rightCode : pairing.leftCode,
      resultLabel: pairing.winnerCode === pairing.leftCode ? "左赢" : "右赢"
    };
  });
}

function getPairingOpponent(pairings = [], code = "") {
  const pairing = pairings.find((item) => item.leftCode === code || item.rightCode === code || item.byeCode === code);
  if (!pairing) return { opponentCode: "", outcome: "" };
  if (pairing.byeCode === code) return { opponentCode: "", outcome: "轮空" };
  const opponentCode = pairing.leftCode === code ? pairing.rightCode : pairing.leftCode;
  if (!pairing.winnerCode) return { opponentCode, outcome: "待战" };
  return {
    opponentCode,
    outcome: pairing.winnerCode === code ? "胜" : "负"
  };
}

function buildRoundRowsFromOrder(state, round) {
  const records = state?.records || {};
  const orderCodes = round?.orderCodes?.length
    ? round.orderCodes
    : sortCodesByStanding(state?.participantCodes || [], records, state?.randomOrder || {});
  return orderCodes.map((code, index) => {
    const record = records[code] || createRankingRecord(code);
    const pairing = getPairingOpponent(round?.pairings || [], code);
    return {
      rank: index + 1,
      code,
      points: Number(record.points || 0),
      oppPoints: Number(record.oppPoints || 0),
      oppOppPoints: Number(record.oppOppPoints || 0),
      swissWins: Number(record.swissWins || 0),
      swissLosses: Number(record.swissLosses || 0),
      opponentCode: pairing.opponentCode,
      outcome: pairing.outcome
    };
  });
}

function freezeRoundRows(state, round) {
  if (!round || round.finalRows?.length) return;
  round.finalRows = clone(buildRoundRowsFromOrder(state, round));
}

function updateTiebreakers(state) {
  const records = state.records || {};
  const rounds = state.rounds || [];
  Object.values(records).forEach((record) => {
    let oppPoints = 0;
    let oppOppPoints = 0;
    record.opponents.forEach((opponentCode) => {
      const opponent = records[opponentCode];
      if (!opponent) return;
      oppPoints += Number(opponent.points || 0);
      oppOppPoints += Number(opponent.oppPoints || 0);
    });
    record.byeRounds.forEach((roundNumber) => {
      oppPoints += roundNumber / 2;
    });
    record.oppPoints = Number(oppPoints.toFixed(1));
    record.oppOppPoints = Number(oppOppPoints.toFixed(1));
  });
  rounds.forEach((round) => {
    round.completed = (round.pairings || []).every((pairing) => pairing.winnerCode);
    if (round.completed) freezeRoundRows(state, round);
  });
}

function buildKnockoutRounds(seedCodes = []) {
  const [s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11, s12] = seedCodes;
  return [
    {
      name: "12进8",
      matches: [
        { id: "playin-1", seedLabel: "#5 vs #12", leftCode: s5 || "", rightCode: s12 || "", winnerCode: "" },
        { id: "playin-2", seedLabel: "#6 vs #11", leftCode: s6 || "", rightCode: s11 || "", winnerCode: "" },
        { id: "playin-3", seedLabel: "#7 vs #10", leftCode: s7 || "", rightCode: s10 || "", winnerCode: "" },
        { id: "playin-4", seedLabel: "#8 vs #9", leftCode: s8 || "", rightCode: s9 || "", winnerCode: "" }
      ]
    },
    {
      name: "8强",
      matches: [
        { id: "qf-1", seedLabel: "#1 vs #8/9", leftCode: s1 || "", rightCode: "", winnerCode: "" },
        { id: "qf-2", seedLabel: "#4 vs #5/12", leftCode: s4 || "", rightCode: "", winnerCode: "" },
        { id: "qf-3", seedLabel: "#3 vs #6/11", leftCode: s3 || "", rightCode: "", winnerCode: "" },
        { id: "qf-4", seedLabel: "#2 vs #7/10", leftCode: s2 || "", rightCode: "", winnerCode: "" }
      ]
    },
    {
      name: "半决赛",
      matches: [
        { id: "sf-1", seedLabel: "上半区", leftCode: "", rightCode: "", winnerCode: "" },
        { id: "sf-2", seedLabel: "下半区", leftCode: "", rightCode: "", winnerCode: "" }
      ]
    },
    {
      name: "决赛",
      matches: [
        { id: "final", seedLabel: "决赛席位", leftCode: "", rightCode: "", winnerCode: "" }
      ]
    }
  ];
}

function advanceKnockoutWinner(rounds = [], roundIndex = 0, matchIndex = 0, winnerCode = "") {
  const nextRound = rounds[roundIndex + 1];
  if (!nextRound) return;
  if (roundIndex === 0) {
    if (matchIndex === 0) nextRound.matches[1].rightCode = winnerCode;
    if (matchIndex === 1) nextRound.matches[2].rightCode = winnerCode;
    if (matchIndex === 2) nextRound.matches[3].rightCode = winnerCode;
    if (matchIndex === 3) nextRound.matches[0].rightCode = winnerCode;
    return;
  }
  if (roundIndex === 1) {
    if (matchIndex < 2) nextRound.matches[0][matchIndex === 0 ? "leftCode" : "rightCode"] = winnerCode;
    if (matchIndex >= 2) nextRound.matches[1][matchIndex === 2 ? "leftCode" : "rightCode"] = winnerCode;
    return;
  }
  if (roundIndex === 2) {
    nextRound.matches[0][matchIndex === 0 ? "leftCode" : "rightCode"] = winnerCode;
  }
}

function settleKnockoutByes(rounds = []) {
  rounds.forEach((round, roundIndex) => {
    round.matches.forEach((match, matchIndex) => {
      if (match.winnerCode || !match.leftCode || !match.rightCode) return;
      if (match.leftCode && !match.rightCode) {
        match.winnerCode = match.leftCode;
        advanceKnockoutWinner(rounds, roundIndex, matchIndex, match.leftCode);
      } else if (!match.leftCode && match.rightCode) {
        match.winnerCode = match.rightCode;
        advanceKnockoutWinner(rounds, roundIndex, matchIndex, match.rightCode);
      }
    });
  });
}

export function buildRankingState(entries, championRewardSpec, runnerUpRewardSpec, { shuffleValues, formatMatchName }) {
  const participantCodes = entries.map((entry) => entry.base.code);
  const shuffledCodes = shuffleValues([...participantCodes]);
  const randomOrder = Object.fromEntries(shuffledCodes.map((code, index) => [code, index]));
  const records = Object.fromEntries(
    participantCodes.map((code) => [code, createRankingRecord(code, randomOrder[code] || 0)])
  );
  const swissRounds = getSwissRoundCount(participantCodes.length);
  const firstPairings = buildSwissPairings(shuffledCodes, records, 1);
  firstPairings.forEach((pairing) => {
    if (pairing.byeCode) applyBye(records, pairing.byeCode, 1);
  });
  const rounds = [createRoundSnapshot(1, normalizePairings({ pairings: firstPairings }), shuffledCodes)];
  const logs = firstPairings
    .filter((pairing) => pairing.byeCode)
    .map((pairing) => `[轮空] ${formatMatchName(pairing.byeCode)} 在第 1 轮轮空，直接积 1 分。`);

  const state = {
    type: "ranking",
    participantCodes,
    randomOrder,
    records,
    swissRoundCount: swissRounds,
    rounds,
    currentRoundIndex: 0,
    currentPairingIndex: 0,
    currentMatch: null,
    currentPhase: "swiss",
    championCode: "",
    runnerUpCode: "",
    topTwelveCodes: [],
    knockout: null,
    rewards: {
      championSpec: championRewardSpec,
      runnerUpSpec: runnerUpRewardSpec
    },
    lastMatchResult: null,
    logs
  };
  updateTiebreakers(state);
  return state;
}

export function getRankingStandings(state) {
  const records = state?.records || {};
  const sortedCodes = sortCodesByStanding(state?.participantCodes || [], records, state?.randomOrder || {});
  return sortedCodes.map((code, index) => ({
    rank: index + 1,
    code,
    ...clone(records[code] || createRankingRecord(code))
  }));
}

export function getRankingRoundRows(state, roundNumber) {
  const round = getRoundByNumber(state, roundNumber);
  if (!round) return [];
  if (round.finalRows?.length) return clone(round.finalRows);
  return buildRoundRowsFromOrder(state, round);
}

export function getNextRankingMatch(state) {
  if (!state) return null;
  if (state.currentPhase === "swiss") {
    for (const round of state.rounds || []) {
      for (let matchIndex = 0; matchIndex < round.pairings.length; matchIndex += 1) {
        const pairing = round.pairings[matchIndex];
        if (!pairing.winnerCode && pairing.leftCode && pairing.rightCode) {
          return {
            phase: "swiss",
            roundNumber: round.roundNumber,
            roundIndex: round.roundNumber - 1,
            matchIndex,
            ...pairing
          };
        }
      }
    }
    return null;
  }
  const rounds = state.knockout?.rounds || [];
  for (let roundIndex = 0; roundIndex < rounds.length; roundIndex += 1) {
    for (let matchIndex = 0; matchIndex < rounds[roundIndex].matches.length; matchIndex += 1) {
      const match = rounds[roundIndex].matches[matchIndex];
      if (!match.winnerCode && match.leftCode && match.rightCode) {
        return {
          phase: "knockout",
          roundIndex,
          matchIndex,
          roundName: rounds[roundIndex].name,
          ...match
        };
      }
    }
  }
  return null;
}

export function recordRankingBattleWinner(state, descriptor, winnerCode) {
  if (!state || !descriptor || !winnerCode) return state;
  if (descriptor.phase === "swiss") {
    const round = getRoundByNumber(state, descriptor.roundNumber);
    const pairing = round?.pairings?.[descriptor.matchIndex];
    if (!pairing || pairing.winnerCode) return state;
    pairing.winnerCode = winnerCode;
    pairing.loserCode = winnerCode === pairing.leftCode ? pairing.rightCode : pairing.leftCode;
    pairing.resultLabel = winnerCode === pairing.leftCode ? "宸﹁儨" : "鍙宠儨";
    applyMatch(state.records, pairing.leftCode, pairing.rightCode, winnerCode, descriptor.roundNumber);
    updateTiebreakers(state);
    return state;
  }
  const rounds = state.knockout?.rounds || [];
  const match = rounds[descriptor.roundIndex]?.matches?.[descriptor.matchIndex];
  if (!match || match.winnerCode) return state;
  match.winnerCode = winnerCode;
  advanceKnockoutWinner(rounds, descriptor.roundIndex, descriptor.matchIndex, winnerCode);
  settleKnockoutByes(rounds);
  return state;
}

export function canGenerateNextRankingRound(state) {
  if (!state || state.currentPhase !== "swiss") return false;
  const currentRound = state.rounds[state.rounds.length - 1];
  return Boolean(currentRound?.completed) && state.rounds.length < state.swissRoundCount;
}

export function generateNextRankingRound(state) {
  if (!canGenerateNextRankingRound(state)) return state;
  refreshRandomOrder(state);
  const standings = getRankingStandings(state);
  const sortedCodes = standings.map((item) => item.code);
  const roundNumber = state.rounds.length + 1;
  const pairings = buildSwissPairings(sortedCodes, state.records, roundNumber);
  pairings.forEach((pairing) => {
    if (pairing.byeCode) applyBye(state.records, pairing.byeCode, roundNumber);
  });
  state.rounds.push(createRoundSnapshot(roundNumber, normalizePairings({ pairings }), sortedCodes));
  updateTiebreakers(state);
  state.logs.push(`[排位] 已生成第 ${roundNumber} 轮对阵表。`);
  return state;
}

export function canEnterRankingKnockout(state) {
  return Boolean(state) &&
    state.currentPhase === "swiss" &&
    state.rounds.length >= state.swissRoundCount &&
    state.rounds.every((round) => round.completed);
}

export function enterRankingKnockout(state) {
  if (!canEnterRankingKnockout(state)) return state;
  refreshRandomOrder(state);
  const topTwelveCodes = getRankingStandings(state).slice(0, 12).map((item) => item.code);
  state.topTwelveCodes = [...topTwelveCodes];
  state.knockout = {
    seeds: [...topTwelveCodes],
    rounds: buildKnockoutRounds(topTwelveCodes)
  };
  settleKnockoutByes(state.knockout.rounds);
  state.currentPhase = "knockout";
  state.logs.push("[排位] 瑞士轮结束，前 12 强进入淘汰赛阶段。");
  return state;
}

export function getRankingKnockoutPreview(state) {
  if (!state) return [];
  if (state.knockout?.rounds?.length) return clone(state.knockout.rounds);
  const topTwelveCodes = getRankingStandings(state).slice(0, 12).map((item) => item.code);
  return buildKnockoutRounds(topTwelveCodes);
}

export function isRankingFinished(state) {
  return Boolean(state?.knockout?.rounds?.[3]?.matches?.[0]?.winnerCode);
}

export function finalizeRanking(state) {
  if (!isRankingFinished(state)) return state;
  const finalMatch = state.knockout.rounds[3].matches[0];
  state.championCode = finalMatch.winnerCode;
  state.runnerUpCode = finalMatch.leftCode === finalMatch.winnerCode ? finalMatch.rightCode : finalMatch.leftCode;
  return state;
}

export function getRankingFinalPlacementMap(state) {
  if (!state) return {};
  const standings = getRankingStandings(state);
  const standingIndex = new Map(standings.map((item, index) => [item.code, index]));
  const placements = {};
  const assignOrderedPlaces = (codes = [], startPlace = 1) => {
    [...codes]
      .filter(Boolean)
      .sort((left, right) => (standingIndex.get(left) ?? Infinity) - (standingIndex.get(right) ?? Infinity))
      .forEach((code, index) => {
        placements[code] = startPlace + index;
      });
  };

  const finalMatch = state.knockout?.rounds?.[3]?.matches?.[0];
  if (finalMatch?.winnerCode) {
    const championCode = finalMatch.winnerCode;
    const runnerUpCode = finalMatch.leftCode === championCode ? finalMatch.rightCode : finalMatch.leftCode;
    if (championCode) placements[championCode] = 1;
    if (runnerUpCode) placements[runnerUpCode] = 2;
  }

  const semifinalLosers = (state.knockout?.rounds?.[2]?.matches || [])
    .map((match) => match.winnerCode ? (match.leftCode === match.winnerCode ? match.rightCode : match.leftCode) : "")
    .filter(Boolean);
  assignOrderedPlaces(semifinalLosers, 3);

  const quarterfinalLosers = (state.knockout?.rounds?.[1]?.matches || [])
    .map((match) => match.winnerCode ? (match.leftCode === match.winnerCode ? match.rightCode : match.leftCode) : "")
    .filter(Boolean);
  assignOrderedPlaces(quarterfinalLosers, 5);

  const playInLosers = (state.knockout?.rounds?.[0]?.matches || [])
    .map((match) => match.winnerCode ? (match.leftCode === match.winnerCode ? match.rightCode : match.leftCode) : "")
    .filter(Boolean);
  assignOrderedPlaces(playInLosers, 9);

  let nextPlace = 13;
  const topTwelve = new Set(state.topTwelveCodes || []);
  standings.forEach((item) => {
    if (placements[item.code]) return;
    if (!topTwelve.has(item.code)) {
      placements[item.code] = nextPlace;
      nextPlace += 1;
    }
  });

  return placements;
}
