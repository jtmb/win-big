import { ipcMain } from 'electron';
import { initDB, getDraws, clearDraws } from './database';
import { loadSettings, saveSettings } from './settings';
import { scrapeResults } from './scraper/olg-scraper';
import { analyze } from './ai/analyzer';
import { testConnection } from './ai/index';
import { Draw, AppSettings, ScrapingProgress, Prediction } from './preload';

let currentAbortController: AbortController | null = null;

export async function registerIpcHandlers(): Promise<void> {
  await initDB(); // Ensure DB is ready before any handler uses it

  // Cancel the currently running job
  ipcMain.handle('cancel-job', async () => {
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
        const draws = await scrapeResults(lotteryType, settings.scraperConcurrency || 12, testMode || 0, send, abortController.signal);
        drawsCount = draws.length;
        send({
          current: drawsCount,
          total: drawsCount,
          message: `Scraped ${drawsCount} draws. Starting analysis...`,
        });
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
}
