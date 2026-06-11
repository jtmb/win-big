/**
 * OLG Lottery Results Scraper — Electron BrowserWindow version
 *
 * The OLG site is an SPA — normal fetch() gets empty HTML.
 * We use Electron's BrowserWindow to render the page and extract numbers.
 */

import { BrowserWindow } from 'electron';
import { initDB, insertDraws, getDrawCount } from '../database';
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

// ---- BrowserWindow pool helpers ----

const PAGE_WAIT_MS = 6000;    // Time for SPA to render on first load
const DATE_WAIT_MS = 2500;    // Time after APPLY click for SPA to re-render

function createWindow(): BrowserWindow {
  return new BrowserWindow({
    width: 1280,
    height: 900,
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
}

/**
 * Scrape a single date using a fresh BrowserWindow.
 * Loads the page, sets the date via input+APPLY, extracts rendered text.
 */
async function scrapeDate(
  lottery: '649' | 'max',
  date: string,
  parseFn: (text: string) => ParsedDraw | null,
  index: number,
): Promise<ParsedDraw | null> {
  const pastUrl = PAST_URLS[lottery];
  let win: BrowserWindow | null = null;

  try {
    win = createWindow();
    await win.loadURL(pastUrl);
    await new Promise(r => setTimeout(r, PAGE_WAIT_MS));

    // Set date and click APPLY
    const applied = await win.webContents.executeJavaScript(`
      (function() {
        var input = document.getElementById('winning-numbers-calendar-picker-startDate');
        if (!input) return false;
        var setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(input, '${date}');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        var btns = document.querySelectorAll('button');
        for (var i = 0; i < btns.length; i++) {
          if ((btns[i].textContent || '').trim().toUpperCase() === 'APPLY') {
            btns[i].click();
            return true;
          }
        }
        return false;
      })()
    `);

    if (applied) {
      await new Promise(r => setTimeout(r, DATE_WAIT_MS));
    }

    // Extract just the past-results section text
    const text: string = await win.webContents.executeJavaScript(`
      (function() {
        var el = document.querySelector('.winning-numbers-past-results');
        if (el) return el.innerText;
        var ws = document.querySelector('[class*="winning"]');
        return ws ? ws.innerText : document.body.innerText;
      })()
    `);

    return parseFn(text);
  } catch (err) {
    console.warn(`[${index}] Error scraping ${date}:`, err);
    return null;
  } finally {
    if (win && !win.isDestroyed()) win.destroy();
  }
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
  const encoreMatch = clean.match(/(?:ENCORE|Encore).*?(\d{7})/is);
  const encore = encoreMatch ? encoreMatch[1] : '0000000';

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

  const encoreMatch = clean.match(/(?:ENCORE|Encore).*?(\d{7})/is);
  const encore = encoreMatch ? encoreMatch[1] : '0000000';

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
  signal?: AbortSignal
): Promise<ParsedDraw[]> {
  await initDB();

  const existingCount = getDrawCount(lottery);
  const targetDates = generateDrawDates(lottery, 2);
  let neededDates = targetDates.slice(existingCount);
  const poolSize = Math.max(1, Math.min(concurrency, 24)); // clamp 1-24

  // Test mode: only scrape N draws for quick testing
  if (testMode > 0) {
    neededDates = neededDates.slice(0, testMode);
  }

  if (neededDates.length === 0) {
    onProgress?.({ current: targetDates.length, total: targetDates.length, message: 'Database already up to date.' });
    return [];
  }

  const parseFn = lottery === '649' ? parse649Text : parseMaxText;
  const total = neededDates.length;
  const newDraws: ParsedDraw[] = [];
  let completed = 0;

  onProgress?.({ current: 0, total, message: `Starting parallel scrape of ${total} draws (${poolSize} concurrent)...` });

  for (let i = 0; i < total; i += poolSize) {
    // Check for cancellation before each batch
    if (signal?.aborted) {
      onProgress?.({ current: completed, total, message: 'Cancelled by user.' });
      return newDraws;
    }

    const batch = neededDates.slice(i, i + poolSize);

    onProgress?.({
      current: completed,
      total,
      message: `Scraping ${completed + 1}-${Math.min(completed + batch.length, total)} of ${total} in parallel...`,
    });

    const results = await Promise.all(
      batch.map((date, j) => scrapeDate(lottery, date, parseFn, i + j))
    );

    const draws = results.filter((d): d is ParsedDraw => d !== null);
    newDraws.push(...draws);
    completed += batch.length;
  }

  onProgress?.({ current: completed, total, message: `Done scraping. Saving ${newDraws.length} draws...` });

  if (newDraws.length > 0) {
    const inserted = insertDraws(newDraws);
    onProgress?.({ current: inserted, total: newDraws.length, message: `Stored ${inserted} new draws in database.` });
  }

  return newDraws;
}

export function getScrapeProgress(): ScraperProgress | null {
  return null;
}
