/**
 * AI Provider interface + shared types
 */

import type { Draw, AppSettings } from '../preload';

export interface AIProvider {
  name: string;
  analyze(draws: Draw[], lotteryType: '649' | 'max'): Promise<AIPrediction>;
}

export interface AIPrediction {
  mainNumbers: number[];
  bonus: number;
  encore: string;
  goldBall: string | null;
  confidence: number;
  reasoning: string;
}

export interface TestResult {
  success: boolean;
  message: string;
}

export interface TrainValSplit {
  training: Draw[];
  validation: Draw[];
}

export interface MatchScore {
  mainMatches: number;
  bonusMatches: number;
  matchedNumbers: number[];
  bestSingleDraw: string | null; // date of the single validation draw that best matched
  totalValidationDraws: number;
}

/**
 * Split draws chronologically into training (~80%) and validation (~20%) sets.
 * The validation set is the most recent draws — simulating "predicting the future."
 * Returns at least 3 validation draws if total >= 15, otherwise 10% validation.
 */
export function splitDraws(draws: Draw[]): TrainValSplit {
  const sorted = [...draws].sort((a, b) => a.drawDate.localeCompare(b.drawDate));
  const total = sorted.length;

  let valSize: number;
  if (total < 10) {
    valSize = 1;
  } else if (total < 30) {
    valSize = Math.max(2, Math.floor(total * 0.15));
  } else {
    valSize = Math.max(5, Math.floor(total * 0.2));
  }

  const validation = sorted.slice(-valSize);
  const training = sorted.slice(0, total - valSize);

  return { training, validation };
}

/**
 * Score a prediction against held-out validation draws.
 * Uses BEST-SINGLE-DRAW scoring: for each validation draw, counts how many
 * of the predicted main numbers appear in THAT draw, then reports the maximum.
 * This is honest — pool-based scoring is trivial since ~45/49 numbers appear
 * across 20 draws. A real win requires matching numbers in the SAME draw.
 * Bonus is scored as 1 if it matches ANY validation draw's bonus.
 */
export function scorePrediction(
  mainNumbers: number[],
  bonus: number,
  validationDraws: Draw[],
): MatchScore {
  let bestMainMatches = 0;
  let bestMatchedNumbers: number[] = [];
  let bestDrawDate: string | null = null;
  let bonusMatches = 0;

  for (const draw of validationDraws) {
    const drawNumSet = new Set(draw.numbers);
    const matched = mainNumbers.filter((n) => drawNumSet.has(n));
    if (matched.length > bestMainMatches) {
      bestMainMatches = matched.length;
      bestMatchedNumbers = matched;
      bestDrawDate = draw.drawDate;
    }
    if (draw.bonus === bonus) bonusMatches = 1;
  }

  return {
    mainMatches: bestMainMatches,
    bonusMatches,
    matchedNumbers: bestMatchedNumbers,
    bestSingleDraw: bestDrawDate,
    totalValidationDraws: validationDraws.length,
  };
}

/**
 * Compute frequency statistics for the draw history.
 * This reduces the payload sent to the AI and fits within smaller context windows.
 * When `drawsOverride` is provided, uses that subset instead of all draws
 * (used in endless training mode for train-only statistics).
 */
export interface DrawStatistics {
  totalDraws: number;
  numberFrequency: Record<number, number>;       // number -> count of appearances
  bonusFrequency: Record<number, number>;
  numberDaysSince: Record<number, number>;        // number -> days since last appearance
  numberHotStreaks: Record<number, number>;       // number -> current consecutive draws appearing
  encoreDigitFrequency: Record<string, number>[]; // Array of 7 objects, each {digit: count}
  goldBallFrequency: Record<string, number>;       // only for 649
  recentDraws: Draw[];                             // last 10 draws for pattern context
}

export function computeStatistics(draws: Draw[], lotteryType: '649' | 'max'): DrawStatistics {
  const maxNumber = lotteryType === '649' ? 49 : 50;
  const totalDraws = draws.length;

  // Initialize counters
  const numberFrequency: Record<number, number> = {};
  const bonusFrequency: Record<number, number> = {};
  const numberLastSeen: Record<number, number> = {}; // draw index
  const numberHotStreaks: Record<number, number> = {};
  const encoreDigitFrequency: Record<string, number>[] = Array.from({ length: 7 }, () => ({}));
  const goldBallFrequency: Record<string, number> = {};

  for (let n = 1; n <= maxNumber; n++) {
    numberFrequency[n] = 0;
    bonusFrequency[n] = 0;
    numberLastSeen[n] = -1;
    numberHotStreaks[n] = 0;
  }

  // Process draws in chronological order (oldest first)
  const sorted = [...draws].sort((a, b) => a.drawDate.localeCompare(b.drawDate));

  for (let i = 0; i < sorted.length; i++) {
    const draw = sorted[i];

    // Number frequency
    for (const num of draw.numbers) {
      numberFrequency[num] = (numberFrequency[num] || 0) + 1;
      numberLastSeen[num] = i;
    }

    // Bonus frequency
    bonusFrequency[draw.bonus] = (bonusFrequency[draw.bonus] || 0) + 1;

    // Encore digit frequency (per position)
    const encoreDigits = draw.encore.padStart(7, '0').split('');
    for (let pos = 0; pos < 7; pos++) {
      const d = encoreDigits[pos];
      encoreDigitFrequency[pos][d] = (encoreDigitFrequency[pos][d] || 0) + 1;
    }

    // Gold ball
    if (draw.goldBall) {
      goldBallFrequency[draw.goldBall] = (goldBallFrequency[draw.goldBall] || 0) + 1;
    }
  }

  // Compute days-since-last-seen for each number
  const numberDaysSince: Record<number, number> = {};
  for (let n = 1; n <= maxNumber; n++) {
    if (numberLastSeen[n] === -1) {
      numberDaysSince[n] = totalDraws * 3; // never seen, approximate
    } else {
      numberDaysSince[n] = totalDraws - numberLastSeen[n] - 1;
    }
  }

  // Compute hot streaks (consecutive appearances from most recent draws)
  for (let n = 1; n <= maxNumber; n++) {
    let streak = 0;
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (sorted[i].numbers.includes(n)) {
        streak++;
      } else {
        break;
      }
    }
    numberHotStreaks[n] = streak;
  }

  return {
    totalDraws,
    numberFrequency,
    bonusFrequency,
    numberDaysSince,
    numberHotStreaks,
    encoreDigitFrequency,
    goldBallFrequency,
    recentDraws: sorted.slice(-10),
  };
}
