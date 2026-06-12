/**
 * EndlessRunner — self-training loop that repeats scrape+analyze
 * with hold-out validation to provide real objective feedback.
 * Supports pause, resume, and stop via AbortController + semaphore.
 */

import { getDraws, saveJob } from './database';
import { loadSettings } from './settings';
import { scrapeResults } from './scraper/olg-scraper';
import { analyze } from './ai/analyzer';
import { splitDraws, scorePrediction } from './ai/index';
import { initTrainingLog, logToFile, getLogFilePath } from './logging';
import type { MatchScore, RefinementContext } from './ai';
import type { Prediction, ScrapingProgress } from './preload';

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

const ENDLESS_DELAY_MS = 2000; // brief pause between runs

export class EndlessRunner {
  private abortController: AbortController | null = null;
  private isPaused = false;
  private pauseResolve: (() => void) | null = null;
  private isStopped = false;
  private runNumber = 0;
  private hasReportedComplete = false;
  private stoppedResolve: (() => void) | null = null;
  private stoppedPromise: Promise<void> | null = null;

  // Exploration tracking
  private triedCombos = new Set<string>();
  private bestPrediction: Prediction | null = null;
  private bestMatchRate = 0;
  private bestRunNumber = 0;
  private lastMatchScore: MatchScore | null = null;

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
    this.triedCombos = new Set<string>();
    this.bestPrediction = null;
    this.bestMatchRate = 0;
    this.bestRunNumber = 0;
    this.lastMatchScore = null;

    // Create a promise that resolves when this run finishes
    this.stoppedPromise = new Promise<void>((resolve) => { this.stoppedResolve = resolve; });

    // Forward external abort to our internal controller
    if (signal) {
      signal.addEventListener('abort', () => this.stop());
    }

    const settings = loadSettings();
    const confidenceTarget = settings.endlessConfidenceTarget ?? 0.4;
    let lastPrediction: { mainNumbers: number[]; bonus: number; confidence: number; reasoning: string; encore: string } | undefined;

    // Init logging (creates text file in userData/training-logs/)
    const logPath = initTrainingLog(`${lotteryType}`);
    logToFile(`[__TRAINING_LOG] EndlessRunner started — lottery: ${lotteryType}, confidence target: ${confidenceTarget}`);

    try {
      while (!this.isStopped) {
        // ---- Pause gate ----
        if (this.isPaused) {
          onProgress({ runNumber: this.runNumber, confidence: 0, drawCount: 0, status: 'paused' });
          await new Promise<void>((resolve) => { this.pauseResolve = resolve; });
          if (this.isStopped) break;
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
          logFilePath: logPath,
        });

        try {
          // ---- Phase 1: Scrape (first run only) ----
          if (this.runNumber === 1) {
            await scrapeResults(
              lotteryType,
              settings.scraperConcurrency || 12,
              0,
              onScrapingProgress,
              this.abortController?.signal,
              settings.scrapeDepthYears ?? 1,
            );

            if (this.isStopped) break;
          }

          // ---- Check cancel ----
          if (this.isStopped) break;

          // ---- Phase 2: Split data into train/validation ----
          const allDraws = getDraws(lotteryType);
          if (allDraws.length === 0) {
            onProgress({
              runNumber: this.runNumber,
              confidence: 0,
              drawCount: 0,
              status: 'running',
              error: 'No draw data available',
              logFilePath: logPath,
            });
            break;
          }

          const { training, validation } = splitDraws(allDraws);
          const valNumbers = Array.from(
            new Set(validation.flatMap((d) => d.numbers)),
          );

          logToFile(
            `[__TRAINING_LOG] splitDraws: ${allDraws.length} total → ` +
            `${training.length} training + ${validation.length} validation ` +
            `(val date range: ${validation[0]?.drawDate || 'none'} → ${validation[validation.length - 1]?.drawDate || 'none'})`,
          );
          logToFile(
            `[__TRAINING_LOG] computeStatistics: using ${training.length} training draws ` +
            `(oldest: ${training[0]?.drawDate}, newest: ${training[training.length - 1]?.drawDate})`,
          );
          logToFile(
            `[__TRAINING_LOG] Held-out validation numbers: [${valNumbers.join(', ')}]`,
          );

          // Notify UI to transition to analysis phase
          onScrapingProgress({
            current: allDraws.length,
            total: allDraws.length,
            message: `Starting analysis for run #${this.runNumber} (${training.length} train / ${validation.length} val draws)...`,
          });

          // ---- Phase 3: Analyze with refinement context ----
          const refinementCtx: RefinementContext | undefined = lastPrediction
            ? {
                matchScore: this.lastMatchScore ?? { mainMatches: 0, bonusMatches: 0, matchedNumbers: [], bestSingleDraw: null, totalValidationDraws: validation.length },
                bestMatchRate: this.bestMatchRate,
                bestRunNumber: this.bestRunNumber,
                triedCount: this.triedCombos.size,
                validationNumbers: valNumbers,
              }
            : undefined;

          logToFile(
            `[__TRAINING_LOG] analyze call: run=${this.runNumber}, ` +
            `isRefinement=${!!lastPrediction}, trainedCombos=${this.triedCombos.size}`,
          );

          const prediction = await analyze(
            lotteryType,
            training, // <<< TRAINING DRAWS ONLY — not all draws
            settings,
            onAnalysisText,
            this.abortController?.signal,
            lastPrediction,
            refinementCtx,
          );

          if (this.isStopped) break;

          // ---- Phase 4: Score against validation draws ----
          const comboKey = [...prediction.mainNumbers].sort((a, b) => a - b).join(',');

          // Check for duplicate combos
          if (this.triedCombos.has(comboKey)) {
            logToFile(
              `[__TRAINING_LOG] DUPLICATE COMBO BLOCKED: [${comboKey}] (already seen on a previous run)`,
            );
            // Skip this run — don't count it, try again
            this.runNumber--;
            await new Promise<void>((resolve) => setTimeout(resolve, 500));
            continue;
          }
          this.triedCombos.add(comboKey);

          const matchScore = scorePrediction(
            prediction.mainNumbers,
            prediction.bonus,
            validation,
          );

          // Store real score for NEXT iteration's refinement context
          this.lastMatchScore = matchScore;

          logToFile(
            `[__TRAINING_LOG] scorePrediction: [${prediction.mainNumbers.join(',')}] ` +
            `best single-draw: ${matchScore.mainMatches}/${prediction.mainNumbers.length} ` +
            `(draw ${matchScore.bestSingleDraw ?? 'N/A'}) ` +
            `matched [${matchScore.matchedNumbers.join(',') || 'none'}] ` +
            `(bonus: ${matchScore.bonusMatches === 1 ? 'HIT' : 'miss'})`,
          );

          // Track best by match rate
          if (matchScore.mainMatches > this.bestMatchRate) {
            this.bestMatchRate = matchScore.mainMatches;
            this.bestPrediction = prediction;
            this.bestRunNumber = this.runNumber;
            logToFile(
              `[__TRAINING_LOG] NEW BEST: run #${this.runNumber} matched ` +
              `${this.bestMatchRate}/${prediction.mainNumbers.length} ` +
              `(prev best: ${this.bestMatchRate}/${prediction.mainNumbers.length})`,
            );
          }

          // Store for next iteration's refinement
          lastPrediction = {
            mainNumbers: prediction.mainNumbers,
            bonus: prediction.bonus,
            confidence: prediction.confidence,
            reasoning: prediction.reasoning,
            encore: prediction.encore,
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
              matchRate: matchScore.mainMatches,
              bestMatchRate: this.bestMatchRate,
              bestRunNumber: this.bestRunNumber,
              logFilePath: logPath,
            });
          }

          // ---- Report iteration result ----
          onProgress({
            runNumber: this.runNumber,
            confidence: prediction.confidence,
            drawCount: allDraws.length,
            status: 'running',
            prediction,
            matchRate: matchScore.mainMatches,
            bestMatchRate: this.bestMatchRate,
            bestRunNumber: this.bestRunNumber,
            logFilePath: logPath,
          });

          // Brief pause between iterations
          await new Promise<void>((resolve) => setTimeout(resolve, ENDLESS_DELAY_MS));

        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logToFile(`[__TRAINING_LOG] ERROR run #${this.runNumber}: ${msg}`);
          if (this.isStopped) break;

          onProgress({
            runNumber: this.runNumber,
            confidence: 0,
            drawCount: 0,
            status: 'running',
            error: msg,
            logFilePath: logPath,
          });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logToFile(`[__TRAINING_LOG] FATAL: ${msg}`);
      onProgress({
        runNumber: this.runNumber,
        confidence: 0,
        drawCount: 0,
        status: 'stopped',
        error: msg,
        logFilePath: logPath,
      });
    }

    logToFile(`[__TRAINING_LOG] EndlessRunner finished. Best: run #${this.bestRunNumber} matched ${this.bestMatchRate}/${lotteryType === '649' ? 6 : 7}. Tried ${this.triedCombos.size} unique combos.`);

    // Always emit a final stopped/completed event so the renderer knows we're done
    onProgress({
      runNumber: this.runNumber,
      confidence: 0,
      drawCount: 0,
      status: 'stopped',
      logFilePath: logPath,
    });

    this.abortController = null;
    this.stoppedResolve?.();
    this.stoppedResolve = null;
  }

  pause(): void {
    this.isPaused = true;
    logToFile('[__TRAINING_LOG] Paused');
  }

  resume(): void {
    this.isPaused = false;
    logToFile('[__TRAINING_LOG] Resumed');
    if (this.pauseResolve) {
      this.pauseResolve();
      this.pauseResolve = null;
    }
  }

  async stop(): Promise<void> {
    this.isStopped = true;
    logToFile('[__TRAINING_LOG] Stop requested');
    if (this.pauseResolve) {
      this.pauseResolve();
      this.pauseResolve = null;
    }
    if (this.abortController) {
      this.abortController.abort();
    }
    // Wait for the start() loop to fully exit (fires final stopped event)
    if (this.stoppedPromise) {
      await this.stoppedPromise;
    }
  }
}
