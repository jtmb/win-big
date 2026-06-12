/**
 * Prompt templates for lottery number prediction.
 * Two variants: one for Lotto 6/49, one for Lotto Max.
 */

import type { DrawStatistics, MatchScore } from './provider';

/** Context for the refinement prompt with real validation scores */
export interface RefinementContext {
  matchScore: MatchScore;
  bestMatchRate: number;
  bestRunNumber: number;
  triedCount: number;
  validationNumbers: number[];
}

export function build649Prompt(stats: DrawStatistics): string {
  const freqTop = topN(stats.numberFrequency, 15);
  const freqBottom = bottomN(stats.numberFrequency, 15);
  const bonusTop = topN(stats.bonusFrequency, 10);
  const coldNumbers = topNBy(stats.numberDaysSince, 10, true); // highest days-since
  const hotNumbers = Object.entries(stats.numberHotStreaks)
    .filter(([, streak]) => streak >= 3)
    .map(([num]) => num);

  const encoreSummary = stats.encoreDigitFrequency
    .map((pos, i) => `  Position ${i + 1}: ${topN(pos, 3).join(', ')}`)
    .join('\n');

  const recentLines = stats.recentDraws.map(d =>
    `${d.drawDate}: [${d.numbers.join(', ')}] Bonus:${d.bonus} Encore:${d.encore}${d.goldBall ? ' Gold:' + d.goldBall : ''}`
  ).join('\n');

  return `You are a lottery number analyst. Analyze the following statistical data from Lotto 6/49 draws and predict the next most likely winning numbers.

GAME RULES:
- Main draw: Pick 6 unique numbers from 1 to 49.
- Bonus number: 1 number from 1-49 (distinct from main numbers).
- Gold Ball: A separate 8-digit ticket number with a 2-digit suffix (format: NNNNNNNN-NN).
- Encore: A 7-digit number (0000000 to 9999999).

STATISTICS (${stats.totalDraws} draws analyzed):
- Most frequent main numbers: ${freqTop.join(', ')}
- Least frequent main numbers: ${freqBottom.join(', ')}
- Most frequent bonus numbers: ${bonusTop.join(', ')}
- Coldest numbers (longest since last appearance): ${coldNumbers.join(', ')}
- Numbers on hot streaks (>=3 consecutive draws): ${hotNumbers.length > 0 ? hotNumbers.join(', ') : 'none'}

ENCORE DIGIT FREQUENCY (most common digits per position):
${encoreSummary}

RECENT DRAWS (last 10):
${recentLines}

Based on the frequency patterns, hot/cold streaks, and recent trends, predict the most likely winning numbers for the next Lotto 6/49 draw.

Return ONLY valid JSON. No markdown, no explanation outside the JSON. Format:
{
  "mainNumbers": [num1, num2, num3, num4, num5, num6],
  "bonus": number,
  "encore": "7digitstring",
  "goldBall": "8digitstring-NN or null",
  "confidence": number between 0 and 1,
  "reasoning": "brief explanation of your analysis"
}`;
}

export function buildMaxPrompt(stats: DrawStatistics): string {
  const freqTop = topN(stats.numberFrequency, 15);
  const freqBottom = bottomN(stats.numberFrequency, 15);
  const bonusTop = topN(stats.bonusFrequency, 10);
  const coldNumbers = topNBy(stats.numberDaysSince, 10, true);
  const hotNumbers = Object.entries(stats.numberHotStreaks)
    .filter(([, streak]) => streak >= 3)
    .map(([num]) => num);

  const encoreSummary = stats.encoreDigitFrequency
    .map((pos, i) => `  Position ${i + 1}: ${topN(pos, 3).join(', ')}`)
    .join('\n');

  const recentLines = stats.recentDraws.map(d =>
    `${d.drawDate}: [${d.numbers.join(', ')}] Bonus:${d.bonus} Encore:${d.encore}`
  ).join('\n');

  return `You are a lottery number analyst. Analyze the following statistical data from Lotto Max draws and predict the next most likely winning numbers.

GAME RULES:
- Main draw: Pick 7 unique numbers from 1 to 50.
- Bonus number: 1 number from 1-50 (distinct from main numbers).
- Encore: A 7-digit number (0000000 to 9999999).

STATISTICS (${stats.totalDraws} draws analyzed):
- Most frequent main numbers: ${freqTop.join(', ')}
- Least frequent main numbers: ${freqBottom.join(', ')}
- Most frequent bonus numbers: ${bonusTop.join(', ')}
- Coldest numbers (longest since last appearance): ${coldNumbers.join(', ')}
- Numbers on hot streaks (>=3 consecutive draws): ${hotNumbers.length > 0 ? hotNumbers.join(', ') : 'none'}

ENCORE DIGIT FREQUENCY (most common digits per position):
${encoreSummary}

RECENT DRAWS (last 10):
${recentLines}

Based on the frequency patterns, hot/cold streaks, and recent trends, predict the most likely winning numbers for the next Lotto Max draw.

Return ONLY valid JSON. No markdown, no explanation outside the JSON. Format:
{
  "mainNumbers": [num1, num2, num3, num4, num5, num6, num7],
  "bonus": number,
  "encore": "7digitstring",
  "goldBall": null,
  "confidence": number between 0 and 1,
  "reasoning": "brief explanation of your analysis"
}`;
}

// ---- Refinement prompts for endless training loop ----

interface PreviousPrediction {
  mainNumbers: number[];
  bonus: number;
  confidence: number;
  reasoning: string;
  encore: string;
}

function buildRefinementPrompt(
  stats: DrawStatistics,
  prev: PreviousPrediction,
  ctx: RefinementContext,
): { assistantMsg: string; refinementMsg: string } {
  const areHeldOutDraws = true; // stylize
  const { matchScore, bestMatchRate, bestRunNumber, triedCount, validationNumbers } = ctx;
  const mainCount = stats.recentDraws[0]?.numbers.length || 6;

  const assistantMsg = JSON.stringify({
    mainNumbers: prev.mainNumbers,
    bonus: prev.bonus,
    encore: prev.encore || '0000000',
    goldBall: null,
    confidence: prev.confidence,
    reasoning: prev.reasoning,
  });

  const matchedStr =
    matchScore.matchedNumbers.length > 0
      ? matchScore.matchedNumbers.join(', ')
      : 'none';
  const missed = prev.mainNumbers.filter((n) => !matchScore.matchedNumbers.includes(n));
  const missedStr = missed.length > 0 ? missed.join(', ') : 'none';

  const valPoolStr =
    validationNumbers.length > 0
      ? validationNumbers.slice(0, 30).join(', ')
      : '(validation set empty — ignore validation feedback this round)';

  const refinementMsg = [
    `That was your previous prediction. Here is how it actually performed against ${matchScore.totalValidationDraws} HELD-OUT validation draws (data you have NOT seen):`,
    '',
    `BEST SINGLE-DRAW MATCH: ${matchScore.mainMatches}/${mainCount} main numbers matched in one draw${matchScore.bestSingleDraw ? ` (draw date: ${matchScore.bestSingleDraw})` : ''}.`,
    `  Matched in that draw: [${matchedStr}]`,
    `  Missed in that draw:  [${missedStr}]`,
    `  Bonus match in any val draw: ${matchScore.bonusMatches === 1 ? 'YES' : 'NO'}`,
    '',
    `IMPORTANT — this is per-draw scoring, not pool coverage. To win, all 6 numbers must appear together in the SAME draw. The pool of numbers across all ${matchScore.totalValidationDraws} validation draws is: [${valPoolStr}]`,
    '',
    triedCount > 1
      ? `TRACK RECORD: Your best prediction so far matched ${bestMatchRate}/${mainCount} (on Run #${bestRunNumber}). You have tried ${triedCount} unique combinations so far.`
      : `This is your first prediction; no best-yet to compare against.`,
    '',
    `YOUR TASK:`,
    `1. Study which of your numbers actually hit the validation draws and which missed.`,
    `2. Use the validation number pool above as a guide — aim for better coverage of those numbers.`,
    `3. Do NOT repeat any prior combination. Try a genuinely different set that covers more of the validation pool.`,
    `4. Your self-reported confidence should HONESTLY reflect how well you think this prediction will perform — NOT be inflated.`,
    '',
    `Return ONLY valid JSON with your best honest prediction and a truthful confidence score.`,
  ].join('\n');

  return { assistantMsg, refinementMsg };
}

export function build649RefinementPrompt(
  stats: DrawStatistics,
  prev: PreviousPrediction,
  ctx: RefinementContext,
) {
  return buildRefinementPrompt(stats, prev, ctx);
}

export function buildMaxRefinementPrompt(
  stats: DrawStatistics,
  prev: PreviousPrediction,
  ctx: RefinementContext,
) {
  return buildRefinementPrompt(stats, prev, ctx);
}

// ---- Helpers ----

function topN(freq: Record<string | number, number>, n: number): string[] {
  return Object.entries(freq)
    .sort(([, a], [, b]) => b - a)
    .slice(0, n)
    .map(([key]) => String(key));
}

function bottomN(freq: Record<string | number, number>, n: number): string[] {
  return Object.entries(freq)
    .sort(([, a], [, b]) => a - b)
    .slice(0, n)
    .map(([key]) => String(key));
}

function topNBy(freq: Record<string | number, number>, n: number, descending: boolean): string[] {
  return Object.entries(freq)
    .sort(([, a], [, b]) => descending ? b - a : a - b)
    .slice(0, n)
    .map(([key]) => String(key));
}
