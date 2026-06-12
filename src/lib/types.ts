// Shared types used across Electron main process and Next.js renderer.
// Duplicated from electron/preload.ts to avoid cross-directory imports that
// Next.js can't resolve.

export interface ScrapingProgress {
  current: number;
  total: number;
  message: string;
  /** Human-readable draw counts (optional; bar uses current/total milestones) */
  drawCurrent?: number;
  drawTotal?: number;
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
  scrapeDepthYears: number;
  endlessConfidenceTarget: number;
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

export interface JobRecord {
  id: number;
  lottery: '649' | 'max';
  drawCount: number;
  prediction: Prediction;
  createdAt: string;
}

export interface EndlessProgress {
  runNumber: number;
  confidence: number;
  drawCount: number;
  status: 'running' | 'paused' | 'stopped' | 'complete';
  prediction?: Prediction;
  error?: string;
  matchRate?: number;
  bestMatchRate?: number;
  bestRunNumber?: number;
  logFilePath?: string;
}
