/**
 * Standalone AI test — runs the analyzer directly with sample draw data.
 * Usage: npx ts-node -P electron/tsconfig.json electron/test-ai.ts
 */
import { analyze } from './ai/analyzer';
import type { Draw, AppSettings } from './preload';

// Don't use loadSettings() — needs Electron's app.getPath()
const SETTINGS: AppSettings = {
  aiProvider: 'lmstudio',
  scraperConcurrency: 6,
  scrapeDepthYears: 1,
  endlessConfidenceTarget: 0.4,
  lmstudio: {
    baseUrl: 'http://192.168.0.13:1234/v1',
    model: '',
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o',
  },
};

const FAKE_DRAWS: Draw[] = [
  { id: 1, lottery: '649', drawDate: '2026-06-10', numbers: [5, 12, 23, 34, 41, 49], bonus: 1, encore: '0000000', goldBall: '49172406-10', createdAt: '' },
  { id: 2, lottery: '649', drawDate: '2026-06-06', numbers: [9, 15, 28, 33, 39, 44], bonus: 17, encore: '0000000', goldBall: '12345678-05', createdAt: '' },
  { id: 3, lottery: '649', drawDate: '2026-06-03', numbers: [3, 18, 22, 30, 38, 45], bonus: 49, encore: '0000000', goldBall: '98765432-01', createdAt: '' },
  { id: 4, lottery: '649', drawDate: '2026-05-31', numbers: [7, 14, 21, 28, 35, 49], bonus: 9, encore: '1200000', goldBall: '11111111-99', createdAt: '' },
  { id: 5, lottery: '649', drawDate: '2026-05-27', numbers: [1, 16, 25, 33, 44, 46], bonus: 5, encore: '0000000', goldBall: null, createdAt: '' },
  { id: 6, lottery: '649', drawDate: '2026-05-24', numbers: [8, 17, 29, 38, 45, 49], bonus: 15, encore: '0000000', goldBall: '22222222-07', createdAt: '' },
  { id: 7, lottery: '649', drawDate: '2026-05-21', numbers: [5, 9, 17, 21, 28, 30], bonus: 46, encore: '0000000', goldBall: null, createdAt: '' },
  { id: 8, lottery: '649', drawDate: '2026-05-17', numbers: [12, 18, 24, 29, 32, 49], bonus: 10, encore: '0000000', goldBall: '33333333-02', createdAt: '' },
  { id: 9, lottery: '649', drawDate: '2026-05-14', numbers: [4, 15, 26, 33, 39, 44], bonus: 28, encore: '0000000', goldBall: null, createdAt: '' },
  { id: 10, lottery: '649', drawDate: '2026-05-10', numbers: [9, 11, 27, 35, 44, 49], bonus: 8, encore: '0000000', goldBall: '44444444-03', createdAt: '' },
];

async function main() {
  console.log('Provider:', SETTINGS.aiProvider);
  console.log('Model:', SETTINGS.lmstudio.model || '(auto-detect)');
  console.log('Base URL:', SETTINGS.lmstudio.baseUrl);
  console.log('---');

  try {
    const result = await analyze(
      '649',
      FAKE_DRAWS,
      SETTINGS,
      (text) => {
        // Print the latest 200 chars of streaming text
        process.stdout.write('\r' + text.slice(-200).replace(/\n/g, ' '));
      }
    );

    console.log('\n\n=== SUCCESS ===');
    console.log('Main:', result.mainNumbers);
    console.log('Bonus:', result.bonus);
    console.log('Encore:', result.encore);
    console.log('Gold Ball:', result.goldBall);
    console.log('Confidence:', result.confidence);
    console.log('Reasoning:', result.reasoning?.slice(0, 300));
  } catch (err) {
    console.error('\n\n=== FAILED ===');
    console.error(err);
  }
}

main();
