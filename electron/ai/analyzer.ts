/**
 * AI Analyzer — orchestrates the prediction pipeline.
 * 1. Computes statistics from draw history
 * 2. Builds a prompt with frequency data
 * 3. Sends to the configured AI provider (LM Studio or DeepSeek)
 * 4. Parses and validates the response
 */

import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions/completions';
import type { Draw, AppSettings, Prediction } from '../preload';
import { computeStatistics, build649Prompt, buildMaxPrompt, build649RefinementPrompt, buildMaxRefinementPrompt } from './index';

/**
 * Run the full analysis pipeline for a lottery type.
 */
export async function analyze(
  lotteryType: '649' | 'max',
  draws: Draw[],
  settings: AppSettings,
  onProgress?: (msg: string) => void,
  signal?: AbortSignal,
  previousPrediction?: { mainNumbers: number[]; bonus: number; confidence: number; reasoning: string },
): Promise<Prediction> {
  const stats = computeStatistics(draws, lotteryType);
  const prompt = lotteryType === '649' ? build649Prompt(stats) : buildMaxPrompt(stats);
  const maxNumber = lotteryType === '649' ? 49 : 50;
  const mainCount = lotteryType === '649' ? 6 : 7;

  // Build messages — multi-turn refinement if we have previous prediction
  const sysMsg = 'You are a precise lottery number analyst. Always return ONLY valid JSON. No markdown, no extra text.';
  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: sysMsg },
    { role: 'user', content: prompt },
  ];

  if (previousPrediction) {
    const { assistantMsg, refinementMsg } =
      lotteryType === '649'
        ? build649RefinementPrompt(stats, previousPrediction)
        : buildMaxRefinementPrompt(stats, previousPrediction);
    messages.push({ role: 'assistant', content: assistantMsg });
    messages.push({ role: 'user', content: refinementMsg });
  }

  const isRefinement = !!previousPrediction;

  // Determine which provider to use
  const isLmStudio = settings.aiProvider === 'lmstudio';
  const providerConfig = isLmStudio ? settings.lmstudio : settings.openai;

  const client = new OpenAI({
    baseURL: isLmStudio ? settings.lmstudio.baseUrl : settings.openai.baseUrl,
    apiKey: isLmStudio ? 'not-needed' : settings.openai.apiKey,
    timeout: 120000,
  });

  const model = providerConfig.model || (isLmStudio ? '' : 'gpt-4o');

  // Try up to 2 times (retry once on parse failure)
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      let reasoningContent = '';
      let answerContent = '';

      const stream = await client.chat.completions.create({
        model,
        messages,
        temperature: isRefinement ? 0.25 : 0.3,
        max_tokens: 8192,
        stream: true,
        ...(signal ? { signal } : {}),
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta as Record<string, string | null | undefined>;
        const r = delta?.reasoning_content || '';
        const c = delta?.content || '';
        if (r) reasoningContent += r;
        if (c) answerContent += c;
        // Show EVERYTHING to the user (reasoning + answer) as it streams
        if (r || c) {
          onProgress?.(reasoningContent + answerContent);
        }
      }

      // Parse from answerContent (preferred) or the last {…} block in the full text
      const raw = (answerContent || reasoningContent).trim();
      if (raw) onProgress?.(raw);

      const prediction = parseResponse(answerContent || reasoningContent, maxNumber, mainCount, lotteryType);

      if (prediction) {
        return prediction;
      }

      // If we got content but parsing failed, log & retry
      if (!raw) {
        throw new Error('LLM returned empty response');
      }
    } catch (err) {
      if (attempt === 1) {
        throw new Error(`AI analysis failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      // Retry on first failure
    }
  }

  throw new Error('AI analysis failed after retries');
}

/**
 * Parse the AI response JSON, with validation and robust repair for truncation.
 */
function parseResponse(
  raw: string,
  maxNumber: number,
  mainCount: number,
  lotteryType: '649' | 'max'
): Prediction | null {
  let json = raw.trim();
  if (!json) return null;

  // Strategy 1: extract from markdown code fences (```json ... ```)
  const fenceMatch = json.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    json = fenceMatch[1].trim();
  }

  // Strategy 2: find ALL {…} blocks; try each from LAST to FIRST.
  //             Qwen puts reasoning (with {set} notation) early, JSON answer at end.
  const braceBlocks = [...json.matchAll(/\{[\s\S]*?\}/g)].map(m => m[0]);

  const candidates = fenceMatch
    ? [json]                               // if we extracted from fences, only try that
    : braceBlocks.length > 0
      ? braceBlocks.reverse()              // last block first (most likely the answer)
      : [json];                            // nothing matched, try whole string

  // Also try the raw string as a fallback
  const toTry = [...new Set([...candidates, raw])];

  // Try each candidate with repair; return the first valid prediction
  for (const candidate of toTry) {
    let repaired = candidate;

    // ---- Robust JSON repair for LLM truncation ----

    // 1. Close unclosed strings: if the last quote is unmatched
    const quoteCount = (repaired.match(/"/g) || []).length;
    if (quoteCount % 2 !== 0) {
      repaired += '"';
    }

    // 2. Close all unclosed arrays/objects (count opener vs closer)
    const openBraces = (repaired.match(/\{/g) || []).length;
    const closeBraces = (repaired.match(/\}/g) || []).length;
    const openBrackets = (repaired.match(/\[/g) || []).length;
    const closeBrackets = (repaired.match(/\]/g) || []).length;

    // Remove trailing comma (common truncation artifact: {"x": [1, 2,)
    repaired = repaired.replace(/,\s*$/, '');

    // Close arrays first, then objects
    if (openBrackets > closeBrackets) {
      repaired += ']'.repeat(openBrackets - closeBrackets);
    }
    if (openBraces > closeBraces) {
      const lastKey = repaired.match(/"([^"]+)"\s*:\s*$/);
      if (lastKey) {
        repaired += 'null';
      }
      repaired += '}'.repeat(openBraces - closeBraces);
    }

    // Log the repaired JSON for debugging
    console.log('[AI Analyzer] Repaired JSON:', repaired.substring(0, 500));

    try {
      const parsed = JSON.parse(repaired);

      // Validate main numbers
      const mainNumbers: number[] = parsed.mainNumbers || [];
      if (mainNumbers.length !== mainCount) {
        console.warn(`Expected ${mainCount} main numbers, got ${mainNumbers.length} — trying next candidate`);
        continue;
      }
      for (const n of mainNumbers) {
        if (typeof n !== 'number' || n < 1 || n > maxNumber) {
          console.warn(`Invalid main number: ${n} — trying next candidate`);
          continue;
        }
      }
      // Check for duplicates
      if (new Set(mainNumbers).size !== mainNumbers.length) {
        console.warn('Duplicate main numbers detected — trying next candidate');
        continue;
      }

      // Validate bonus
      const bonus = Number(parsed.bonus);
      if (isNaN(bonus) || bonus < 1 || bonus > maxNumber) {
        console.warn(`Invalid bonus: ${parsed.bonus} — trying next candidate`);
        continue;
      }
      if (mainNumbers.includes(bonus)) {
        console.warn('Bonus number matches a main number — trying next candidate');
        continue;
      }

      // Validate encore
      const encore = String(parsed.encore || '0').padStart(7, '0').slice(0, 7);
      if (!/^\d{7}$/.test(encore)) {
        console.warn(`Invalid encore: ${encore} — trying next candidate`);
        continue;
      }

      // Validate gold ball (649 only)
      const goldBall = lotteryType === '649' ? (parsed.goldBall || null) : null;
      if (lotteryType === '649' && goldBall && !/^\d{8}-\d{2}$/.test(String(goldBall))) {
        console.warn(`Invalid gold ball: ${goldBall}`);
        // Non-fatal: set to null, still accept
      }

      const confidence = Math.min(1, Math.max(0, Number(parsed.confidence) || 0.5));
      const reasoning = String(parsed.reasoning || 'No reasoning provided.');

      return {
        mainNumbers,
        bonus,
        encore,
        goldBall: lotteryType === '649' ? (goldBall ? String(goldBall) : null) : null,
        confidence,
        reasoning,
      };
    } catch (err) {
      console.warn('Failed to parse candidate — trying next:', (err as Error).message?.slice(0, 80));
      // continue to next candidate
    }
  }

  return null;
}
