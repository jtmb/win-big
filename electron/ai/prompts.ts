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
