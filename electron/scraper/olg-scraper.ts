/**
 * OLG Lottery Results Scraper — Electron BrowserWindow version
 *
 * The OLG site is an SPA — normal fetch() gets empty HTML.
 * We use Electron's BrowserWindow to render the page and extract numbers.
 */

import { BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { initDB, insertDraws, getDraws, clearDraws, getExistingDrawDates } from '../database';
import { loadSettings, saveSettings } from '../settings';
import type { ParsedDraw, ScraperProgress } from './types';

// ---- Constants ----

const PAST_URLS: Record<'649' | 'max', string> = {
  '649': 'https://www.olg.ca/en/lottery/play-lotto-649-encore/past-results.html',
  'max': 'https://www.olg.ca/en/lottery/play-lotto-max-encore/hub.html',
};

// Draws happen: 649 = Wed & Sat, Max = Tue & Fri
function getDrawDays(lottery: '649' | 'max'): number[] {
  return lottery === '649' ? [3, 6] : [2, 5];
}

// Resolve the compiled scraper preload path
const scraperPreloadPath = path.join(__dirname, 'scraper-preload.js');

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: scraperPreloadPath,
    },
  });
  // Spoof a realistic Chrome user-agent so OLG doesn't block us as a bot
  win.webContents.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  );
  // Relay preload console.log to main process for debugging
  win.webContents.on('console-message', (_e, _level, message) => {
    if (message.startsWith('[preload]')) {
      console.log(message);
    }
  });
  return win;
}

interface ScraperResult {
  text?: string;
  error?: string;
}

/**
 * Ask a preload script to extract the rendered page text.
 * Returns a Promise that resolves when the preload script sends back the result.
 */
function extractViaPreload(win: BrowserWindow, date: string): Promise<ScraperResult> {
  return new Promise((resolve) => {
    const channel = `scraper:result:${win.webContents.id}`;

    const handler = (_event: Electron.IpcMainEvent, result: ScraperResult) => {
      resolve(result);
    };

    ipcMain.once(channel, handler);

    // The preload relays its result to our per-window channel
    win.webContents.send('scraper:extract', date, channel);
  });
}

// ---- Parsing ----

function parse649Text(text: string): ParsedDraw | null {
  const clean = text.replace(/\s+/g, ' ').trim();

  // Match "PAST RESULTS WEDNESDAY, JUNE 3, 2026" or "WINNING NUMBERS WEDNESDAY, JUNE 10, 2026"
  const dateMatch = clean.match(/(?:WINNING\s*NUMBERS|PAST\s*RESULTS)\s+(\w+DAY),\s*(\w+)\s*(\d{1,2}),\s*(\d{4})/i);
  if (!dateMatch) return null;

  const dateStr = parseDate(dateMatch[0]);
  const afterMatch = clean.substring(dateMatch.index! + dateMatch[0].length);

  const bonusMatch = afterMatch.match(/Bonus\s*(\d{2})/i);
  const bonus = bonusMatch ? parseInt(bonusMatch[1], 10) : 0;
  const beforeBonus = bonusMatch ? afterMatch.substring(0, bonusMatch.index) : afterMatch;
  const allNumbers = beforeBonus.match(/\b(\d{2})\b/g) || [];
  const numbers = allNumbers.slice(0, 6).map(n => parseInt(n, 10));

  if (numbers.length < 6) return null;

  const goldBallMatch = clean.match(/(\d{8}-\d{2})/);
  const goldBall = goldBallMatch ? goldBallMatch[1] : null;

  // Encore: prefer dedicated element appended by extractor; fallback to regex
  const encoreDirect = clean.match(/ENCORE_NUMBER:(\d{7})/);
  const encoreMatch = encoreDirect ? encoreDirect[1] : clean.match(/(?:ENCORE|Encore).*?(\d{7})/is)?.[1];
  const encore = encoreMatch || '0000000';

  return { lottery: '649', drawDate: dateStr, numbers: numbers.slice(0, 6), bonus, encore, goldBall };
}

function parseMaxText(text: string): ParsedDraw | null {
  const clean = text.replace(/\s+/g, ' ').trim();

  // MAX page has "Most Recent" and "Past Results" tabs.
  // We need the date AFTER "Past Results" tab, following the pattern:
  // "...Past Results Tuesday, June 09, 2026 06 07 11 12 36 46 50 Bonus 24..."
  const dateMatch = clean.match(/Past\s+Results\s+(\w+DAY),\s*(\w+)\s*(\d{1,2}),\s*(\d{4})/i);
  if (!dateMatch) return null;

  const dateStr = parseDate(dateMatch[0]);
  const afterMatch = clean.substring(dateMatch.index! + dateMatch[0].length);

  const bonusMatch = afterMatch.match(/Bonus\s*(\d{2})/i);
  const bonus = bonusMatch ? parseInt(bonusMatch[1], 10) : 0;
  const beforeBonus = bonusMatch ? afterMatch.substring(0, bonusMatch.index) : afterMatch;
  const allNumbers = beforeBonus.match(/\b(\d{2})\b/g) || [];
  const numbers = allNumbers
    .filter(n => { const v = parseInt(n, 10); return v >= 1 && v <= 50; })
    .slice(0, 7)
    .map(n => parseInt(n, 10));

  if (numbers.length < 7) return null;

  // Encore: prefer dedicated element appended by extractor; fallback to regex
  const encoreDirect = clean.match(/ENCORE_NUMBER:(\d{7})/);
  const encoreMatch = encoreDirect ? encoreDirect[1] : clean.match(/(?:ENCORE|Encore).*?(\d{7})/is)?.[1];
  const encore = encoreMatch || '0000000';

  return { lottery: 'max', drawDate: dateStr, numbers: numbers.slice(0, 7), bonus, encore, goldBall: null };
}

function parseDate(text: string): string {
  const months: Record<string, string> = {
    january: '01', february: '02', march: '03', april: '04',
    may: '05', june: '06', july: '07', august: '08',
    september: '09', october: '10', november: '11', december: '12',
    jan: '01', feb: '02', mar: '03', apr: '04', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  };
  const match = text.match(/(\w+)\s+(\d{1,2}),?\s*(\d{4})/i);
  if (!match) return new Date().toISOString().split('T')[0];
  const month = months[match[1].toLowerCase()] || '01';
  return `${match[3]}-${month}-${match[2].padStart(2, '0')}`;
}

// ---- Date Generation ----

function generateDrawDates(lottery: '649' | 'max', yearsBack: number = 2): string[] {
  const drawDays = getDrawDays(lottery);
  const dates: string[] = [];
  const endDate = new Date();
  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - yearsBack);
  const cursor = new Date(startDate);
  while (cursor <= endDate) {
    if (drawDays.includes(cursor.getDay())) {
      dates.push(cursor.toISOString().split('T')[0]);
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

// ---- Public API ----

export async function scrapeResults(
  lottery: '649' | 'max',
  concurrency: number = 12,
  testMode: number = 0,
  onProgress?: (progress: ScraperProgress) => void,
  signal?: AbortSignal,
  yearsBack: number = 2,
): Promise<ParsedDraw[]> {
  await initDB();

  // Auto-repair: if existing draws have broken Encore data ('0000000'), clear and re-scrape.
  // Guard: only trigger when there ARE draws and at least one has the broken placeholder.
  const sampleDraws = getDraws(lottery, 10);
  if (sampleDraws.length > 0 && sampleDraws.some(d => d.encore === '0000000')) {
    console.warn(`[scraper] Detected broken Encore data — clearing ${sampleDraws.length > 0 ? 'all' : '0'} draws for re-scrape.`);
    clearDraws(lottery);
  }

  // Build a Set of dates already in the DB for O(1) lookup
  const existingDates = getExistingDrawDates(lottery);
  const targetDates = generateDrawDates(lottery, yearsBack);

  // Apply saved OLG cutoff: dates before this are unreachable (OLG's 1-year rolling window).
  // Skip the saved cutoff when DB is empty — we need to re-discover it.
  const settings = loadSettings();
  const savedCutoff = settings.olgCutoffDate?.[lottery];
  if (savedCutoff && existingDates.size > 0) {
    const before = targetDates.length;
    const filtered = targetDates.filter(d => d >= savedCutoff);
    console.log(`[scraper] OLG cutoff ${savedCutoff} — filtered ${before - filtered.length} unreachable dates, ${filtered.length} remain`);
    targetDates.length = 0;
    targetDates.push(...filtered);
  } else if (savedCutoff && existingDates.size === 0) {
    // DB is empty — clear stale cutoff so we re-discover it from scratch
    console.log(`[scraper] DB empty, clearing saved OLG cutoff (was: ${savedCutoff})`);
    if (settings.olgCutoffDate) {
      delete settings.olgCutoffDate[lottery];
      if (Object.keys(settings.olgCutoffDate).length === 0) {
        delete settings.olgCutoffDate;
      }
    }
    saveSettings(settings);
  }

  let neededDates = targetDates.filter(d => !existingDates.has(d));
  const poolSize = Math.max(1, Math.min(concurrency, 24)); // clamp 1-24

  // Test mode: only scrape N draws for quick testing (most recent first)
  if (testMode > 0) {
    neededDates = neededDates.slice(-testMode);
  }

  if (neededDates.length === 0) {
    onProgress?.({ current: targetDates.length, total: targetDates.length, message: 'Database already up to date.' });
    return [];
  }

  const parseFn = lottery === '649' ? parse649Text : parseMaxText;
  const remaining = neededDates.length;
  const totalTarget = targetDates.length;
  const totalMilestones = remaining * 3; // each scrape has 3 phases → smooth bar
  const newDraws: ParsedDraw[] = [];
  let completed = 0;

  // Watcher: track how many phase milestones each in-flight scrape has hit (0–3)
  const inFlight = new Map<number, number>();

  /** Save whatever we've scraped so far (partial persistence on abort). */
  const savePartial = () => {
    if (newDraws.length > 0) {
      const inserted = insertDraws(newDraws);
      console.log(`[scraper] Saved ${inserted} partially-scraped draws so far.`);
    }
  };

  const reportProgress = () => {
    const inflightPhases = [...inFlight.values()].reduce((a, b) => a + b, 0);
    const current = completed * 3 + inflightPhases;
    const drawsDone = Math.min(remaining, Math.floor(current / 3));
    const cachedCount = existingDates.size;
    onProgress?.({ current, total: totalMilestones, drawCurrent: drawsDone, drawTotal: remaining, message: `Scraping ${drawsDone}/${remaining} remaining (${cachedCount + drawsDone}/${totalTarget} total)` });
  };

  // Heartbeat: calls reportProgress every 400ms so the bar + counter never freeze
  const heartbeat = setInterval(reportProgress, 400);

  const cachedCount = existingDates.size;
  onProgress?.({ current: 0, total: totalMilestones, drawCurrent: 0, drawTotal: remaining, message: `Scraping 0/${remaining} remaining (${cachedCount}/${totalTarget} total)...` });

  // ---- Window pool: create once, reuse for all dates ----
  // Creating/destroying BrowserWindows per-date blocks the main thread
  // and causes the Windows busy cursor.
  const pastUrl = PAST_URLS[lottery];
  const windows: BrowserWindow[] = [];
  try {
    // Create all windows up front, yielding after each
    for (let w = 0; w < poolSize; w++) {
      windows.push(createWindow());
      // Yield to the event loop so the OS doesn't see a hung main thread
      await new Promise<void>((r) => setImmediate(r));
    }
    // Navigate all windows to the past-results page (async, non-blocking)
    await Promise.all(windows.map((win) => win.loadURL(pastUrl)));

    // Distribute dates round-robin across the pool
    const queues: string[][] = Array.from({ length: poolSize }, () => []);
    for (let d = 0; d < remaining; d++) {
      queues[d % poolSize].push(neededDates[d]);
    }

    let globalIdx = 0;
    let olgCutoffDate: string | null = null;

    // Each pool worker: processes its queue of dates one by one on the same window
    async function poolWorker(win: BrowserWindow, queue: string[]): Promise<ParsedDraw[]> {
      const results: ParsedDraw[] = [];
      for (const date of queue) {
        if (signal?.aborted) break;
        const idx = globalIdx++;

        inFlight.set(idx, 0);

        const t1 = setTimeout(() => { if (inFlight.has(idx)) inFlight.set(idx, Math.max(1, inFlight.get(idx)!)); }, 1500);
        const t2 = setTimeout(() => { if (inFlight.has(idx)) inFlight.set(idx, Math.max(2, inFlight.get(idx)!)); }, 4000);
        const t3 = setTimeout(() => { if (inFlight.has(idx)) inFlight.set(idx, Math.max(3, inFlight.get(idx)!)); }, 7000);
        reportProgress();

        try {
          const result = await extractViaPreload(win, date);

          clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
          inFlight.set(idx, 3); // extracting
          reportProgress();

          if (result.error) {
            // Check for OLG cutoff errors
            const cutoffMatch = result.error.match(/cutoff:\s*(\d{4}-\d{2}-\d{2})/);
            if (cutoffMatch) {
              if (!olgCutoffDate || cutoffMatch[1] < olgCutoffDate) {
                olgCutoffDate = cutoffMatch[1];
              }
              console.warn(`[${idx}] OLG out of range ${date} (cutoff: ${cutoffMatch[1]})`);
            } else {
              console.warn(`[${idx}] Preload error scraping ${date}:`, result.error);
            }
          } else if (!result.text) {
            console.warn(`[${idx}] No text returned from preload for ${date}`);
          } else {
            const parsed = parseFn(result.text);
            if (parsed) {
              // Guard: verify the parsed draw date actually matches the requested date.
              // When OLG silently rejects a date it shows the default page instead —
              // the parser would see that page's date, not the requested one.
              const parsedDate = new Date(parsed.drawDate);
              const requestedDate = new Date(date);
              const diffDays = Math.abs(parsedDate.getTime() - requestedDate.getTime()) / 86400000;
              if (diffDays > 1) {
                console.warn(`[${idx}] Date mismatch — requested ${date} but parsed ${parsed.drawDate} (diff ${diffDays.toFixed(0)}d), discarding`);
              } else {
                results.push(parsed);
              }
            }
          }
        } catch (err) {
          console.warn(`[${idx}] Error scraping ${date}:`, err);
        } finally {
          clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
          inFlight.delete(idx);
          completed++;
          reportProgress();
        }
      }
      return results;
    }

    // Race the pool against the abort signal
    let abortTimer: ReturnType<typeof setInterval> | null = null;
    const abortPromise = signal
      ? new Promise<never>((_, reject) => {
          abortTimer = setInterval(() => {
            if (signal.aborted) reject(new DOMException('Aborted', 'AbortError'));
          }, 300);
        })
      : new Promise<never>(() => {});

    let allResults: ParsedDraw[][] = [];
    try {
      const workers = windows.map((win, i) => poolWorker(win, queues[i]));
      allResults = await Promise.race([
        Promise.all(workers),
        abortPromise,
      ]);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        for (const [idx] of inFlight) inFlight.delete(idx);
        clearInterval(heartbeat);
        savePartial();
        onProgress?.({ current: completed * 3, total: totalMilestones, drawCurrent: completed, drawTotal: remaining, message: `Cancelled. Saved ${newDraws.length} draws.` });
        return newDraws;
      }
      throw err;
    } finally {
      if (abortTimer) clearInterval(abortTimer);
    }

    for (const r of allResults) {
      newDraws.push(...r);
    }
    savePartial(); // one save after all results collected

    // Persist OLG cutoff so future runs skip unreachable dates
    if (olgCutoffDate) {
      const current = settings.olgCutoffDate || {};
      current[lottery] = olgCutoffDate;
      settings.olgCutoffDate = current;
      saveSettings(settings);
      console.log(`[scraper] Saved OLG cutoff for ${lottery}: ${olgCutoffDate}`);
    }
  } finally {
    // Destroy all pool windows
    for (const win of windows) {
      if (!win.isDestroyed()) win.destroy();
    }
  }

  clearInterval(heartbeat);
  onProgress?.({ current: remaining, total: remaining, drawCurrent: newDraws.length, drawTotal: remaining, message: `Done. ${newDraws.length} new draws scraped (DB: ${cachedCount + newDraws.length}/${totalTarget} total).` });
  return newDraws;
}

export function getScrapeProgress(): ScraperProgress | null {
  return null;
}
