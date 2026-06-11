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

/**
 * Compute frequency statistics for the draw history.
 * This reduces the payload sent to the AI and fits within smaller context windows.
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
