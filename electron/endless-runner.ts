/**
 * EndlessRunner — self-training loop that repeats scrape+analyze
 * until AI confidence reaches the target threshold (0.90).
 * Supports pause, resume, and stop via AbortController + semaphore.
 */

import { getDraws, saveJob } from './database';
import { loadSettings } from './settings';
import { scrapeResults } from './scraper/olg-scraper';
import { analyze } from './ai/analyzer';
import type { Prediction, ScrapingProgress } from './preload';

export interface EndlessProgress {
  runNumber: number;
  confidence: number;
  drawCount: number;
  status: 'running' | 'paused' | 'stopped' | 'complete';
  prediction?: Prediction;
  error?: string;
}

const ENDLESS_DELAY_MS = 2000; // brief pause between runs

export class EndlessRunner {
  private abortController: AbortController | null = null;
  private isPaused = false;
  private pauseResolve: (() => void) | null = null;
  private isStopped = false;
  private runNumber = 0;
  private hasReportedComplete = false;

  /**
   * Main loop. Runs in the background; communicates with the renderer via
   * the `onProgress` callback, which should use sender.send('endless:event', ...).
   */
  async start(
    lotteryType: '649' | 'max',
    onProgress: (evt: EndlessProgress) => void,
    onAnalysisText: (text: string) => void,
    onScrapingProgress: (progress: ScrapingProgress) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    this.abortController = new AbortController();
    this.isPaused = false;
    this.isStopped = false;
    this.runNumber = 0;
    this.hasReportedComplete = false;

    // Forward external abort to our internal controller
    if (signal) {
      signal.addEventListener('abort', () => this.stop());
    }

    const settings = loadSettings();
    const confidenceTarget = settings.endlessConfidenceTarget ?? 0.9;
    let lastPrediction: { mainNumbers: number[]; bonus: number; confidence: number; reasoning: string } | undefined;

    try {
      while (!this.isStopped) {
        // ---- Pause gate ----
        if (this.isPaused) {
          onProgress({ runNumber: this.runNumber, confidence: 0, drawCount: 0, status: 'paused' });
          await new Promise<void>((resolve) => { this.pauseResolve = resolve; });
          if (this.isStopped) break;
          // Resume
          this.isPaused = false;
          this.pauseResolve = null;
        }

        this.runNumber++;

        // Emit "running" status at start of iteration
        onProgress({
          runNumber: this.runNumber,
          confidence: 0,
          drawCount: 0,
          status: 'running',
        });

        try {
          // ---- Phase 1: Scrape (first run only) ----
          if (this.runNumber === 1) {
            await scrapeResults(
              lotteryType,
              settings.scraperConcurrency || 12,
              0, // not test mode — always full scrape
              onScrapingProgress,
              this.abortController?.signal,
              settings.scrapeDepthYears ?? 2,
            );

            if (this.isStopped) break;
          }

          // ---- Check cancel ----
          if (this.isStopped) break;

          // ---- Phase 2: Load all draws & analyze ----
          const allDraws = getDraws(lotteryType);
          if (allDraws.length === 0) {
            onProgress({
              runNumber: this.runNumber,
              confidence: 0,
              drawCount: 0,
              status: 'running',
              error: 'No draw data available',
            });
            break;
          }

          // Notify UI to transition to analysis phase
          onScrapingProgress({
            current: allDraws.length,
            total: allDraws.length,
            message: `Starting analysis for run #${this.runNumber} (${allDraws.length} draws)...`,
          });

          const prediction = await analyze(
            lotteryType,
            allDraws,
            settings,
            onAnalysisText,
            this.abortController?.signal,
            lastPrediction,
          );

          if (this.isStopped) break;

          // Store for next iteration's refinement
          lastPrediction = {
            mainNumbers: prediction.mainNumbers,
            bonus: prediction.bonus,
            confidence: prediction.confidence,
            reasoning: prediction.reasoning,
          };

          // ---- Save to history ----
          try {
            saveJob(lotteryType, allDraws.length, prediction);
          } catch {
            // non-critical
          }

          // ---- Check confidence ----
          if (prediction.confidence >= confidenceTarget && !this.hasReportedComplete) {
            this.hasReportedComplete = true;
            onProgress({
              runNumber: this.runNumber,
              confidence: prediction.confidence,
              drawCount: allDraws.length,
              status: 'complete',
              prediction,
            });
            // Keep going — don't break. The UI can stop manually.
          }

          // ---- Report iteration result ----
          onProgress({
            runNumber: this.runNumber,
            confidence: prediction.confidence,
            drawCount: allDraws.length,
            status: 'running',
            prediction,
          });

          // Brief pause between iterations — yields back to event loop
          await new Promise<void>((resolve) => setTimeout(resolve, ENDLESS_DELAY_MS));

        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (this.isStopped) break;

          onProgress({
            runNumber: this.runNumber,
            confidence: 0,
            drawCount: 0,
            status: 'running',
            error: msg,
          });
          // Continue to next iteration on error (don't break)
        }
      }
    } catch (err) {
      // Fatal error
      const msg = err instanceof Error ? err.message : String(err);
      onProgress({
        runNumber: this.runNumber,
        confidence: 0,
        drawCount: 0,
        status: 'stopped',
        error: msg,
      });
    }

    // Cleanup
    this.abortController = null;
  }

  pause(): void {
    this.isPaused = true;
  }

  resume(): void {
    this.isPaused = false;
    if (this.pauseResolve) {
      this.pauseResolve();
      this.pauseResolve = null;
    }
  }

  stop(): void {
    this.isStopped = true;
    if (this.pauseResolve) {
      this.pauseResolve();
      this.pauseResolve = null;
    }
    // Abort the controller but DON'T null it — the loop still references it
    if (this.abortController) {
      this.abortController.abort();
    }
  }
}
