/**
 * Prompt templates for lottery number prediction.
 * Two variants: one for Lotto 6/49, one for Lotto Max.
 */

import type { DrawStatistics } from './provider';

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
}

function buildRefinementPrompt(stats: DrawStatistics, prev: PreviousPrediction): { assistantMsg: string; refinementMsg: string } {
  const assistantMsg = JSON.stringify({
    mainNumbers: prev.mainNumbers,
    bonus: prev.bonus,
    encore: "0000000",
    goldBall: null,
    confidence: prev.confidence,
    reasoning: prev.reasoning,
  });

  // Build a critique of the previous prediction based on what it actually did
  const prevSet = new Set(prev.mainNumbers);
  const freqSorted = Object.entries(stats.numberFrequency)
    .sort(([, a], [, b]) => b - a)
    .map(([n]) => Number(n));
  const top20 = new Set(freqSorted.slice(0, 20));
  const coldSorted = Object.entries(stats.numberDaysSince)
    .sort(([, a], [, b]) => b - a)
    .map(([n]) => Number(n));
  const coldest10 = new Set(coldSorted.slice(0, 10));
  const hotNums = Object.entries(stats.numberHotStreaks)
    .filter(([, s]) => s >= 2)
    .map(([n]) => Number(n));

  const top20Hits = prev.mainNumbers.filter((n) => top20.has(n)).length;
  const coldHits = prev.mainNumbers.filter((n) => coldest10.has(n)).length;
  const hotHits = prev.mainNumbers.filter((n) => hotNums.includes(n)).length;

  const critique = [
    `Top-20 frequency coverage: ${top20Hits}/6 main numbers.`,
    `Coldest-10 coverage: ${coldHits}/6.`,
    `Hot streak (≥2) coverage: ${hotHits}/6.`,
    prev.mainNumbers.some((n) => prev.bonus === n) ? `Bonus ${prev.bonus} clashes with a main number — invalid.` : '',
  ].filter(Boolean).join(' ');

  const refinementMsg = `That was your previous prediction.

Now CRITICALLY RE-EXAMINE it. Here is an automated quality check:
${critique}

Consider: Are you over-weighting frequency and under-weighting recency? Could a different balance of hot numbers, cold numbers, and mid-frequency numbers produce a more robust prediction? Try a genuinely different combination — don't just tweak one or two numbers. Look for patterns you may have missed in the cold streaks or mid-tier frequencies.

Return ONLY valid JSON with your best honest prediction and a truthful confidence score.`;

  return { assistantMsg, refinementMsg };
}

export function build649RefinementPrompt(stats: DrawStatistics, prev: PreviousPrediction) {
  return buildRefinementPrompt(stats, prev);
}

export function buildMaxRefinementPrompt(stats: DrawStatistics, prev: PreviousPrediction) {
  return buildRefinementPrompt(stats, prev);
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
