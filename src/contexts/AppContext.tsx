'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import type { Prediction, AppSettings, ScrapingProgress } from '@/lib/types';

type LotteryType = '649' | 'max';

interface AppState {
  lottery: LotteryType | null;
  setLottery: (lt: LotteryType) => void;
  prediction: Prediction | null;
  setPrediction: (p: Prediction | null) => void;
  isGenerating: boolean;
  setIsGenerating: (v: boolean) => void;
  isAnalysisPhase: boolean;
  setIsAnalysisPhase: (v: boolean) => void;
  activeJobType: LotteryType | null;
  setActiveJobType: (v: LotteryType | null) => void;
  scrapingProgress: ScrapingProgress | null;
  setScrapingProgress: (p: ScrapingProgress | null) => void;
  error: string | null;
  setError: (e: string | null) => void;
  analysisText: string | null;
  setAnalysisText: (t: string | null) => void;
  settings: AppSettings | null;
  setSettings: (s: AppSettings) => void;
  reset: () => void;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [lottery, setLottery] = useState<LotteryType | null>(null);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAnalysisPhase, setIsAnalysisPhase] = useState(false);
  const [activeJobType, setActiveJobType] = useState<LotteryType | null>(null);
  const [scrapingProgress, setScrapingProgress] = useState<ScrapingProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analysisText, setAnalysisText] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  const reset = useCallback(() => {
    setPrediction(null);
    setScrapingProgress(null);
    setError(null);
    setAnalysisText(null);
  }, []);

  return (
    <AppContext.Provider
      value={{
        lottery,
        setLottery,
        prediction,
        setPrediction,
        isGenerating,
        setIsGenerating,
        isAnalysisPhase,
        setIsAnalysisPhase,
        activeJobType,
        setActiveJobType,
        scrapingProgress,
        setScrapingProgress,
        error,
        setError,
        analysisText,
        setAnalysisText,
        settings,
        setSettings,
        reset,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
