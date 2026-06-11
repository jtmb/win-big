'use client';

// Type-safe wrapper around the Electron preload API.
// In the renderer, window.winbigAPI is exposed via contextBridge.

import type { Prediction, Draw, AppSettings, ScrapingProgress, JobRecord, EndlessProgress } from './types';

declare global {
  interface Window {
    winbigAPI?: {
      scrapeAndAnalyze: (lotteryType: '649' | 'max', testMode?: number) => Promise<Prediction>;
      getDrawHistory: (lotteryType: '649' | 'max', limit?: number) => Promise<Draw[]>;
      getSettings: () => Promise<AppSettings>;
      saveSettings: (settings: AppSettings) => Promise<void>;
      testAiConnection: (provider: 'lmstudio' | 'openai', config: Record<string, string>) => Promise<{ success: boolean; message: string }>;
      fetchLmStudioModels: (baseUrl: string) => Promise<{ id: string }[]>;
      onProgress: (callback: (progress: ScrapingProgress) => void) => () => void;
      onAnalysisProgress: (callback: (text: string) => void) => () => void;
      clearDraws: (lotteryType: '649' | 'max') => Promise<void>;
      cancelJob: () => Promise<void>;
      getJobHistory: (lottery?: '649' | 'max') => Promise<JobRecord[]>;
      getLatestDrawDate: (lottery: '649' | 'max') => Promise<string | null>;
      clearAllData: () => Promise<void>;
      getDbStats: () => Promise<{ draws: number; jobs: number }>;
      endlessStart: (lotteryType: '649' | 'max') => Promise<void>;
      endlessPause: () => Promise<void>;
      endlessResume: () => Promise<void>;
      endlessStop: () => Promise<void>;
      onEndlessProgress: (callback: (evt: EndlessProgress) => void) => () => void;
    };
  }
}

function getAPI() {
  if (typeof window === 'undefined') return null;
  return window.winbigAPI ?? null;
}

export async function scrapeAndAnalyze(lotteryType: '649' | 'max', testMode?: number): Promise<Prediction> {
  const api = getAPI();
  if (!api) throw new Error('Electron API not available');
  return api.scrapeAndAnalyze(lotteryType, testMode);
}

export async function getDrawHistory(lotteryType: '649' | 'max', limit?: number): Promise<Draw[]> {
  const api = getAPI();
  if (!api) return [];
  return api.getDrawHistory(lotteryType, limit);
}

export async function getSettings(): Promise<AppSettings> {
  const api = getAPI();
  if (!api) {
    return {
      aiProvider: 'lmstudio',
      scraperConcurrency: 6,
      scrapeDepthYears: 2,
      endlessConfidenceTarget: 0.9,
      lmstudio: { baseUrl: 'http://192.168.0.13:1234/v1', model: '' },
      openai: { baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o' },
    };
  }
  return api.getSettings();
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const api = getAPI();
  if (!api) return;
  return api.saveSettings(settings);
}

export async function testAiConnection(provider: 'lmstudio' | 'openai', config: Record<string, string>): Promise<{ success: boolean; message: string }> {
  const api = getAPI();
  if (!api) return { success: false, message: 'Electron API not available' };
  return api.testAiConnection(provider, config);
}

export async function fetchLmStudioModels(baseUrl: string): Promise<{ id: string }[]> {
  const api = getAPI();
  if (api) return api.fetchLmStudioModels(baseUrl);

  // Fallback: proxy through Next.js API route (avoids CORS issues in browser dev mode)
  const res = await fetch(`/api/lmstudio-models?baseUrl=${encodeURIComponent(baseUrl)}`);
  if (!res.ok) {
    const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error((errData as { error: string }).error || `HTTP ${res.status}`);
  }
  const data = await res.json() as { data?: { id: string }[] };
  return (data.data || []).map((m: { id: string }) => ({ id: m.id }));
}

export function onProgress(callback: (progress: ScrapingProgress) => void): () => void {
  const api = getAPI();
  if (!api) return () => {};
  return api.onProgress(callback);
}

export function onAnalysisProgress(callback: (text: string) => void): () => void {
  const api = getAPI();
  if (!api) return () => {};
  return api.onAnalysisProgress(callback);
}

export async function clearDraws(lotteryType: '649' | 'max'): Promise<void> {
  const api = getAPI();
  if (!api) return;
  return api.clearDraws(lotteryType);
}

export async function clearAllData(): Promise<void> {
  const api = getAPI();
  if (!api) throw new Error('Electron API not available — cannot clear database');
  return api.clearAllData();
}

export async function getDbStats(): Promise<{ draws: number; jobs: number }> {
  const api = getAPI();
  if (!api) return { draws: 0, jobs: 0 };
  return api.getDbStats();
}

export async function cancelJob(): Promise<void> {
  const api = getAPI();
  if (!api) return;
  return api.cancelJob();
}

export async function getJobHistory(lottery?: '649' | 'max'): Promise<JobRecord[]> {
  const api = getAPI();
  if (!api) return [];
  return api.getJobHistory(lottery);
}

export async function getLatestDrawDate(lottery: '649' | 'max'): Promise<string | null> {
  const api = getAPI();
  if (!api) return null;
  return api.getLatestDrawDate(lottery);
}

export async function endlessStart(lotteryType: '649' | 'max'): Promise<void> {
  const api = getAPI();
  if (!api) throw new Error('Electron API not available');
  return api.endlessStart(lotteryType);
}

export async function endlessPause(): Promise<void> {
  const api = getAPI();
  if (!api) throw new Error('Electron API not available');
  return api.endlessPause();
}

export async function endlessResume(): Promise<void> {
  const api = getAPI();
  if (!api) throw new Error('Electron API not available');
  return api.endlessResume();
}

export async function endlessStop(): Promise<void> {
  const api = getAPI();
  if (!api) throw new Error('Electron API not available');
  return api.endlessStop();
}

export function onEndlessProgress(callback: (evt: EndlessProgress) => void): () => void {
  const api = getAPI();
  if (!api) return () => {};
  return api.onEndlessProgress(callback);
}

export async function exportEndlessRuns(runs: EndlessProgress[], lotteryType: '649' | 'max'): Promise<{ success: boolean; reason?: string; filePath?: string }> {
  const api = getAPI();
  if (!api) return { success: false, reason: 'Electron API not available' };
  return api.exportEndlessRuns(runs, lotteryType);
}
