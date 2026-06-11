/**
 * Test AI connection — pings the configured provider to verify connectivity.
 */

import OpenAI from 'openai';
import type { TestResult } from './provider';

export async function testConnection(
  provider: 'lmstudio' | 'openai',
  config: Record<string, string>
): Promise<TestResult> {
  const baseUrl = config.baseUrl || (provider === 'lmstudio' ? 'http://localhost:1234/v1' : 'https://api.openai.com/v1');
  const apiKey = config.apiKey || (provider === 'lmstudio' ? 'not-needed' : '');
  const model = config.model || (provider === 'lmstudio' ? '' : 'gpt-4o');

  try {
    const client = new OpenAI({
      baseURL: baseUrl,
      apiKey: apiKey || 'not-needed',
      timeout: 15000,
    });

    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: 'user', content: 'Reply with exactly: connected' },
      ],
      max_tokens: 10,
      temperature: 0,
    });

    const response = completion.choices[0]?.message?.content?.trim() || '';
    if (response.toLowerCase().includes('connect')) {
      return { success: true, message: `Connected successfully to ${model}` };
    }

    return { success: true, message: `Connected to ${model}. Response received.` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, message: `Connection failed: ${message}` };
  }
}
