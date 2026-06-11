// Type declarations for the Electron renderer process

import type {
  Prediction,
  Draw,
  AppSettings,
  ScrapingProgress,
} from './preload';

declare global {
  interface Window {
    winbigAPI: {
      scrapeAndAnalyze: (lotteryType: '649' | 'max') => Promise<Prediction>;
      getDrawHistory: (lotteryType: '649' | 'max', limit?: number) => Promise<Draw[]>;
      getSettings: () => Promise<AppSettings>;
      saveSettings: (settings: AppSettings) => Promise<void>;
      testAiConnection: (
        provider: 'lmstudio' | 'deepseek',
        config: Record<string, string>
      ) => Promise<{ success: boolean; message: string }>;
      onProgress: (
        callback: (progress: ScrapingProgress) => void
      ) => () => void;
      clearDraws: (lotteryType: '649' | 'max') => Promise<void>;
    };
  }
}

export {};
