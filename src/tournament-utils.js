export function buildTournamentState(entries, championRewardSpec, runnerUpRewardSpec, {
  shuffleValues,
  formatMatchName
}) {
  const participantCodes = shuffleValues(entries.map((entry) => entry.base.code));
  let bracketSize = 1;
  while (bracketSize < participantCodes.length) bracketSize *= 2;
  const roundsCount = Math.max(1, Math.log2(bracketSize));
  const rounds = Array.from({ length: roundsCount }, (_, roundIndex) => ({
    name: roundsCount - roundIndex === 1 ? "决赛" : `第${roundIndex + 1}轮`,
    matches: Array.from({ length: bracketSize / (2 ** (roundIndex + 1)) }, (_, matchIndex) => ({
      id: `round-${roundIndex}-match-${matchIndex}`,
      leftCode: "",
      rightCode: "",
      winnerCode: "",
      byeCode: ""
    }))
  }));

  const byes = bracketSize - participantCodes.length;
  const firstRoundPairs = [];
  const queue = [...participantCodes];
  for (let index = 0; index < byes; index += 1) {
    const code = queue.shift();
    if (!code) break;
    firstRoundPairs.push({ leftCode: code, rightCode: "", winnerCode: code, byeCode: code });
  }
  while (queue.length > 0) {
    firstRoundPairs.push({
      leftCode: queue.shift() || "",
      rightCode: queue.shift() || "",
      winnerCode: "",
      byeCode: ""
    });
  }

  const shuffledPairs = shuffleValues(firstRoundPairs);
  rounds[0].matches.forEach((match, index) => {
    const seed = shuffledPairs[index] || {};
    match.leftCode = seed.leftCode || "";
    match.rightCode = seed.rightCode || "";
    match.winnerCode = seed.winnerCode || "";
    match.byeCode = seed.byeCode || "";
  });

  rounds[0].matches.forEach((match, matchIndex) => {
    if (match.winnerCode) {
      advanceTournamentWinner(rounds, 0, matchIndex, match.winnerCode);
    }
  });

  return {
    participantCodes,
    rounds,
    rewards: {
      championSpec: championRewardSpec,
      runnerUpSpec: runnerUpRewardSpec
    },
    currentRoundIndex: 0,
    currentMatchIndex: 0,
    currentMatch: null,
    lastMatchResult: null,
    championCode: "",
    runnerUpCode: "",
    logs: rounds[0].matches
      .filter((match) => match.byeCode)
      .map((match) => `[轮空] ${formatMatchName(match.byeCode)} 首轮轮空，直接晋级。`)
  };
}

export function advanceTournamentWinner(rounds, roundIndex, matchIndex, winnerCode) {
  const match = rounds[roundIndex]?.matches[matchIndex];
  if (!match) return;
  match.winnerCode = winnerCode;
  if (roundIndex >= rounds.length - 1) return;
  const nextMatch = rounds[roundIndex + 1].matches[Math.floor(matchIndex / 2)];
  if (matchIndex % 2 === 0) nextMatch.leftCode = winnerCode;
  else nextMatch.rightCode = winnerCode;
}

export function getNextTournamentMatch(rounds = []) {
  for (let roundIndex = 0; roundIndex < rounds.length; roundIndex += 1) {
    for (let matchIndex = 0; matchIndex < rounds[roundIndex].matches.length; matchIndex += 1) {
      const match = rounds[roundIndex].matches[matchIndex];
      if (!match.winnerCode && match.leftCode && match.rightCode) {
        return { ...match, roundIndex, matchIndex };
      }
    }
  }
  return null;
}
