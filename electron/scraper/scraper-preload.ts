/**
 * Scraper Preload — runs inside each scraper BrowserWindow.
 * Has full DOM access (bypasses CSP). Communicates with main process via IPC.
 */
import { ipcRenderer } from 'electron';

const POLL_INTERVAL_MS = 400;
const POLL_TIMEOUT_MS = 10000;

interface ScraperResponse {
  text?: string;
  error?: string;
}

ipcRenderer.on('scraper:extract', async (_event, date: string, replyChannel: string) => {
  const send = (payload: ScraperResponse) => ipcRenderer.send(replyChannel, payload);
  try {
    console.log(`[preload] ====== Starting extraction for date: ${date} ======`);

    // ---- Snapshot current page text BEFORE setting date ----
    const bodyBefore = document.body.innerText || '';

    // ---- Set date via native setter + events ----
    const input = document.getElementById('winning-numbers-calendar-picker-startDate');
    if (!input) {
      console.log('[preload] ❌ date-picker input not found');
      send({ error: 'date-picker input not found' });
      return;
    }
    console.log('[preload] ✓ Found date-picker input');

    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, date);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    console.log(`[preload] ✓ Set date value to "${date}", fired input/change events`);

    // ---- Click APPLY button ----
    const btns = document.querySelectorAll('button');
    let clicked = false;
    for (let i = 0; i < btns.length; i++) {
      if ((btns[i].textContent || '').trim().toUpperCase() === 'APPLY') {
        btns[i].click();
        clicked = true;
        console.log('[preload] ✓ Clicked APPLY button');
        break;
      }
    }
    if (!clicked) {
      console.log('[preload] ❌ APPLY button not found');
      send({ error: 'APPLY button not found' });
      return;
    }

    // ---- Poll until page content changes or timeout ----
    console.log('[preload] Polling for content change...');
    const startTime = Date.now();
    let contentChanged = false;
    while (Date.now() - startTime < POLL_TIMEOUT_MS) {
      await sleep(POLL_INTERVAL_MS);
      const bodyNow = document.body.innerText || '';
      if (bodyNow !== bodyBefore && bodyNow.length > 100) {
        contentChanged = true;
        console.log(`[preload] ✓ Content changed after ${Date.now() - startTime}ms`);
        break;
      }
    }
    if (!contentChanged) {
      // Check if OLG rejected the date (out of 1-year lookback window)
      const bodyText = document.body.innerText || '';
      const olgErrorMatch = bodyText.match(/enter date on or after\s+(\d{4}-\d{2}-\d{2})/i);
      if (olgErrorMatch) {
        const cutoffDate = olgErrorMatch[1];
        console.log(`[preload] ⚠ OLG rejected date ${date} — cutoff is ${cutoffDate}`);
        send({ error: `OLG date out of range (cutoff: ${cutoffDate})` });
        return;
      }
      // Page didn't change but no explicit OLG error — may be a slow load; extract anyway
      console.log(`[preload] ⚠ Content did NOT change after ${POLL_TIMEOUT_MS}ms — extracting anyway`);
    }

    // ---- Extract text ----
    let el = document.querySelector('.winning-numbers-past-results');
    if (!el) {
      const ws = document.querySelector('[class*="winning"]');
      el = ws || document.body;
    }
    console.log(`[preload] Extracting from: ${el === document.body ? 'document.body' : el.className || el.tagName}`);

    const encoreEl = document.querySelector('.encore-number');
    const encore = encoreEl ? encoreEl.textContent!.trim() : '';
    const text = (el as HTMLElement).innerText + '\nENCORE_NUMBER:' + encore;

    const textLen = text.length;
    console.log(`[preload] ✓ Extracted ${textLen} chars, encore="${encore}"`);
    console.log(`[preload] ====== Done: ${date} ======`);

    send({ text });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[preload] ❌ Exception: ${msg}`);
    send({ error: msg });
  }
});

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
