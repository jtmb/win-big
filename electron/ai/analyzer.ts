/**
 * AI Analyzer — orchestrates the prediction pipeline.
 * 1. Computes statistics from draw history
 * 2. Builds a prompt with frequency data
 * 3. Sends to the configured AI provider (LM Studio or DeepSeek)
 * 4. Parses and validates the response
 */

import OpenAI from 'openai';
import type { Draw, AppSettings, Prediction } from '../preload';
import { computeStatistics, build649Prompt, buildMaxPrompt } from './index';

/**
 * Run the full analysis pipeline for a lottery type.
 */
export async function analyze(
  lotteryType: '649' | 'max',
  draws: Draw[],
  settings: AppSettings,
  onProgress?: (msg: string) => void,
  signal?: AbortSignal
): Promise<Prediction> {
  const stats = computeStatistics(draws, lotteryType);
  const prompt = lotteryType === '649' ? build649Prompt(stats) : buildMaxPrompt(stats);
  const maxNumber = lotteryType === '649' ? 49 : 50;
  const mainCount = lotteryType === '649' ? 6 : 7;

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
      let fullContent = '';

      const stream = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: 'You are a precise lottery number analyst. Always return ONLY valid JSON. No markdown, no extra text.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 8192,
        stream: true,
        ...(signal ? { signal } : {}),
      });

      for await (const chunk of stream) {
        // Qwen reasoning models put output in reasoning_content; standard models use content
        const delta = chunk.choices[0]?.delta as Record<string, string | null | undefined>;
        const text = delta?.content || delta?.reasoning_content || '';
        if (text) {
          fullContent += text;
          // Send accumulated text so the UI shows AI thinking in real time
          onProgress?.(fullContent);
        }
      }

      const raw = fullContent.trim();

      // Report final text in case onProgress wasn't called (empty stream)
      if (raw) {
        onProgress?.(raw);
      }

      const prediction = parseResponse(raw, maxNumber, mainCount, lotteryType);

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
  // Try to extract JSON from the response (in case AI wraps it in markdown or extra text)
  let json = raw
    .replace(/```(?:json)?\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  // Extract the outermost JSON object
  const jsonMatch = json.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    json = jsonMatch[0];
  }

  // ---- Robust JSON repair for LM Studio truncation ----

  // 1. Close unclosed strings: if the last quote is unmatched
  const quoteCount = (json.match(/"/g) || []).length;
  if (quoteCount % 2 !== 0) {
    json += '"';
  }

  // 2. Close all unclosed arrays/objects (count opener vs closer)
  //    Also strip trailing commas before a closing bracket
  const openBraces = (json.match(/\{/g) || []).length;
  const closeBraces = (json.match(/\}/g) || []).length;
  const openBrackets = (json.match(/\[/g) || []).length;
  const closeBrackets = (json.match(/\]/g) || []).length;

  // Remove trailing comma (common truncation artifact: {"x": [1, 2,)
  json = json.replace(/,\s*$/, '');

  // Close arrays first, then objects
  if (openBrackets > closeBrackets) {
    json += ']'.repeat(openBrackets - closeBrackets);
  }
  if (openBraces > closeBraces) {
    // If the last non-whitespace char is a key without value, add a placeholder
    const lastKey = json.match(/"([^"]+)"\s*:\s*$/);
    if (lastKey) {
      json += 'null';
    }
    json += '}'.repeat(openBraces - closeBraces);
  }

  // Log the repaired JSON for debugging
  console.log('[AI Analyzer] Repaired JSON:', json.substring(0, 500));

  try {
    const parsed = JSON.parse(json);

    // Validate main numbers
    const mainNumbers: number[] = parsed.mainNumbers || [];
    if (mainNumbers.length !== mainCount) {
      console.warn(`Expected ${mainCount} main numbers, got ${mainNumbers.length}`);
      return null;
    }
    for (const n of mainNumbers) {
      if (typeof n !== 'number' || n < 1 || n > maxNumber) {
        console.warn(`Invalid main number: ${n}`);
        return null;
      }
    }
    // Check for duplicates
    if (new Set(mainNumbers).size !== mainNumbers.length) {
      console.warn('Duplicate main numbers detected');
      return null;
    }

    // Validate bonus
    const bonus = Number(parsed.bonus);
    if (isNaN(bonus) || bonus < 1 || bonus > maxNumber) {
      console.warn(`Invalid bonus: ${parsed.bonus}`);
      return null;
    }
    if (mainNumbers.includes(bonus)) {
      console.warn('Bonus number matches a main number');
      return null;
    }

    // Validate encore
    const encore = String(parsed.encore || '0').padStart(7, '0').slice(0, 7);
    if (!/^\d{7}$/.test(encore)) {
      console.warn(`Invalid encore: ${encore}`);
      return null;
    }

    // Validate gold ball (649 only)
    const goldBall = lotteryType === '649' ? (parsed.goldBall || null) : null;
    if (lotteryType === '649' && goldBall && !/^\d{8}-\d{2}$/.test(String(goldBall))) {
      console.warn(`Invalid gold ball: ${goldBall}`);
      // Non-fatal: set to null
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
    console.warn('Failed to parse AI response JSON:', err instanceof Error ? err.message : err);
    return null;
  }
}
