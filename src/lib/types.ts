// Shared types used across Electron main process and Next.js renderer.
// Duplicated from electron/preload.ts to avoid cross-directory imports that
// Next.js can't resolve.

export interface ScrapingProgress {
  current: number;
  total: number;
  message: string;
}

export interface Prediction {
  mainNumbers: number[];
  bonus: number;
  encore: string;
  goldBall: string | null;
  confidence: number;
  reasoning: string;
}

export interface Draw {
  id: number;
  lottery: '649' | 'max';
  drawDate: string;
  numbers: number[];
  bonus: number;
  encore: string;
  goldBall: string | null;
  createdAt: string;
}

export interface AppSettings {
  aiProvider: 'lmstudio' | 'openai';
  scraperConcurrency: number;
  lmstudio: {
    baseUrl: string;
    model: string;
  };
  openai: {
    baseUrl: string;
    apiKey: string;
    model: string;
  };
}
