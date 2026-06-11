import { ipcMain, dialog } from 'electron';
import { initDB, getDraws, clearDraws, clearAllData, getDbStats, saveJob, getJobs, getLatestDrawDate } from './database';
import { loadSettings, saveSettings } from './settings';
import { scrapeResults } from './scraper/olg-scraper';
import { analyze } from './ai/analyzer';
import { testConnection } from './ai/index';
import { EndlessRunner } from './endless-runner';
import { Draw, AppSettings, ScrapingProgress, Prediction } from './preload';

let currentAbortController: AbortController | null = null;

export async function registerIpcHandlers(): Promise<void> {
  await initDB(); // Ensure DB is ready before any handler uses it

  // Cancel the currently running job
  ipcMain.handle('cancel-job', async () => {
    if (endlessRunner) {
      endlessRunner.stop();
      endlessRunner = null;
    }
    if (currentAbortController) {
      currentAbortController.abort();
      currentAbortController = null;
    }
  });

  // Scrape + Analyze pipeline (runs in background even if user navigates away)
  ipcMain.handle('scrape-and-analyze', async (_event, lotteryType: '649' | 'max', testMode?: number): Promise<Prediction> => {
    // Use sender's WebContents so progress events work even after navigation
    const sender = _event.sender;
    const send = (progress: ScrapingProgress) => {
      try { sender.send('scraping-progress', progress); } catch { /* renderer may be gone */ }
    };
    const sendAnalysis = (text: string) => {
      try { sender.send('analysis-progress', text); } catch { /* renderer may be gone */ }
    };

    // Create a fresh AbortController for this job
    const abortController = new AbortController();
    currentAbortController = abortController;

    try {
      // Phase 1: Scrape
      let drawsCount = 0;
      const settings = loadSettings();
      try {
        const draws = await scrapeResults(lotteryType, settings.scraperConcurrency || 12, testMode || 0, send, abortController.signal, settings.scrapeDepthYears ?? 2);
        drawsCount = draws.length;
        if (drawsCount > 0) {
          send({
            current: drawsCount,
            total: drawsCount,
            message: `Scraped ${drawsCount} new draws. Starting analysis...`,
          });
        } else {
          send({
            current: 0,
            total: 0,
            message: 'Database already up to date. Skipping scrape, starting analysis...',
          });
        }
      } catch (err) {
        if (abortController.signal.aborted) {
          throw new Error('Job cancelled by user');
        }
        throw new Error(`Scraping failed: ${err instanceof Error ? err.message : String(err)}`);
      }

      // Check cancel before analysis
      if (abortController.signal.aborted) {
        throw new Error('Job cancelled by user');
      }

      // Phase 2: Load from DB & analyze
      const allDraws = getDraws(lotteryType);
      if (allDraws.length === 0) {
        throw new Error('No draw data available after scraping. Cannot analyze.');
      }

      const prediction = await analyze(lotteryType, allDraws, settings, sendAnalysis, abortController.signal);

      // Auto-save successful prediction to job history
      try {
        saveJob(lotteryType, allDraws.length, prediction);
      } catch {
        // Non-critical — don't fail the whole pipeline if save fails
      }

      return prediction;
    } finally {
      if (currentAbortController === abortController) {
        currentAbortController = null;
      }
    }
  });

  // Get draw history
  ipcMain.handle('get-draw-history', async (_event, lotteryType: '649' | 'max', limit?: number): Promise<Draw[]> => {
    return getDraws(lotteryType, limit ?? 200);
  });

  // Settings
  ipcMain.handle('get-settings', async (): Promise<AppSettings> => {
    return loadSettings();
  });

  ipcMain.handle('save-settings', async (_event, settings: AppSettings): Promise<void> => {
    saveSettings(settings);
  });

  // Test AI connection
  ipcMain.handle('test-ai-connection', async (_event, provider: 'lmstudio' | 'openai', config: Record<string, string>) => {
    return testConnection(provider, config);
  });

  // Clear draws
  ipcMain.handle('clear-draws', async (_event, lotteryType: '649' | 'max') => {
    clearDraws(lotteryType);
  });

  // Fetch LM Studio models
  ipcMain.handle('fetch-lmstudio-models', async (_event, baseUrl: string) => {
    const url = baseUrl.replace(/\/+$/, '') + '/models';
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    const data = await res.json() as { data?: { id: string }[] };
    return (data.data || []).map((m: { id: string }) => ({ id: m.id }));
  });

  // Job history
  ipcMain.handle('get-job-history', async (_event, lottery?: '649' | 'max') => {
    return getJobs(lottery);
  });

  // Latest draw date — used by UI to know if DB is current
  ipcMain.handle('get-latest-draw-date', async (_event, lottery: '649' | 'max') => {
    return getLatestDrawDate(lottery);
  });

  // Clear all database data
  ipcMain.handle('clear-all-data', async () => {
    try {
      clearAllData();
      return { success: true };
    } catch (err) {
      console.error('[clear-all-data] Failed to clear database:', err);
      throw err;
    }
  });

  // Get DB stats for settings UI
  ipcMain.handle('get-db-stats', async () => {
    return getDbStats();
  });

  // ===================== Endless Mode =====================
  let endlessRunner: EndlessRunner | null = null;

  ipcMain.handle('endless:start', async (_event, lotteryType: '649' | 'max') => {
    // Stop any existing runner
    if (endlessRunner) {
      endlessRunner.stop();
    }

    const sender = _event.sender;
    const sendProgress = (evt: { runNumber: number; confidence: number; drawCount: number; status: string; prediction?: Prediction; error?: string }) => {
      try { sender.send('endless:event', evt); } catch { /* renderer may be gone */ }
    };
    const sendAnalysis = (text: string) => {
      try { sender.send('analysis-progress', text); } catch { /* renderer may be gone */ }
    };
    const sendScraping = (progress: ScrapingProgress) => {
      try { sender.send('scraping-progress', progress); } catch { /* renderer may be gone */ }
    };

    endlessRunner = new EndlessRunner();

    // Fire-and-forget: the runner sends progress via IPC
    endlessRunner.start(lotteryType, sendProgress, sendAnalysis, sendScraping).finally(() => {
      endlessRunner = null;
    });
  });

  ipcMain.handle('endless:pause', async () => {
    if (endlessRunner) endlessRunner.pause();
  });

  ipcMain.handle('endless:resume', async () => {
    if (endlessRunner) endlessRunner.resume();
  });

  ipcMain.handle('endless:stop', async () => {
    if (endlessRunner) {
      endlessRunner.stop();
      endlessRunner = null;
    }
  });

  // Export endless training runs as Excel
  ipcMain.handle('export-endless-runs', async (_event, runs: Array<{ runNumber: number; confidence: number; drawCount: number; status: string; prediction?: Prediction; error?: string }>, lotteryType: '649' | 'max') => {
    const { default: XLSX } = await import('xlsx');
    const { filePath } = await dialog.showSaveDialog({
      title: 'Export Endless Training Runs',
      defaultPath: `winbig-endless-${lotteryType}-${new Date().toISOString().split('T')[0]}.xlsx`,
      filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }],
    });

    if (!filePath) return { success: false, reason: 'cancelled' };

    const rows = runs.map((r) => ({
      'Run #': r.runNumber,
      'Status': r.status,
      'Confidence %': Math.round(r.confidence * 100),
      'Draw Count': r.drawCount,
      'Main Numbers': r.prediction ? r.prediction.mainNumbers.join(', ') : '',
      'Bonus': r.prediction?.bonus ?? '',
      'Encore': r.prediction?.encore ?? '',
      'Gold Ball': r.prediction?.goldBall ?? '',
      'Reasoning': r.prediction?.reasoning ?? '',
      'Error': r.error ?? '',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    // Set column widths
    ws['!cols'] = [
      { wch: 6 }, { wch: 10 }, { wch: 14 }, { wch: 12 },
      { wch: 22 }, { wch: 7 }, { wch: 10 }, { wch: 18 }, { wch: 50 }, { wch: 30 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Endless Runs');
    XLSX.writeFile(wb, filePath);

    return { success: true, filePath };
  });
}
