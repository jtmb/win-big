import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

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

const api = {
  scrapeAndAnalyze: (lotteryType: '649' | 'max', testMode?: number): Promise<Prediction> =>
    ipcRenderer.invoke('scrape-and-analyze', lotteryType, testMode),

  getDrawHistory: (lotteryType: '649' | 'max', limit?: number): Promise<Draw[]> =>
    ipcRenderer.invoke('get-draw-history', lotteryType, limit),

  getSettings: (): Promise<AppSettings> =>
    ipcRenderer.invoke('get-settings'),

  saveSettings: (settings: AppSettings): Promise<void> =>
    ipcRenderer.invoke('save-settings', settings),

  testAiConnection: (provider: 'lmstudio' | 'openai', config: Record<string, string>): Promise<{ success: boolean; message: string }> =>
    ipcRenderer.invoke('test-ai-connection', provider, config),

  fetchLmStudioModels: (baseUrl: string): Promise<{ id: string }[]> =>
    ipcRenderer.invoke('fetch-lmstudio-models', baseUrl),

  onProgress: (callback: (progress: ScrapingProgress) => void) => {
    const handler = (_event: IpcRendererEvent, progress: ScrapingProgress) => callback(progress);
    ipcRenderer.on('scraping-progress', handler);
    return () => {
      ipcRenderer.removeListener('scraping-progress', handler);
    };
  },

  onAnalysisProgress: (callback: (text: string) => void) => {
    const handler = (_event: IpcRendererEvent, text: string) => callback(text);
    ipcRenderer.on('analysis-progress', handler);
    return () => {
      ipcRenderer.removeListener('analysis-progress', handler);
    };
  },

  clearDraws: (lotteryType: '649' | 'max'): Promise<void> =>
    ipcRenderer.invoke('clear-draws', lotteryType),

  cancelJob: (): Promise<void> =>
    ipcRenderer.invoke('cancel-job'),

  getJobHistory: (lottery?: '649' | 'max'): Promise<JobRecord[]> =>
    ipcRenderer.invoke('get-job-history', lottery),

  getLatestDrawDate: (lottery: '649' | 'max'): Promise<string | null> =>
    ipcRenderer.invoke('get-latest-draw-date', lottery),

  clearAllData: (): Promise<void> =>
    ipcRenderer.invoke('clear-all-data'),

  getDbStats: (): Promise<{ draws: number; jobs: number }> =>
    ipcRenderer.invoke('get-db-stats'),
};

contextBridge.exposeInMainWorld('winbigAPI', api);

export type WinBigAPI = typeof api;
