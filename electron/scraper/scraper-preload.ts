/**
 * Scraper Preload — runs inside each scraper BrowserWindow.
 * Has full DOM access (bypasses CSP). Communicates with main process via IPC.
 */
import { ipcRenderer } from 'electron';

const PAGE_WAIT_MS = 6000;
const DATE_WAIT_MS = 2500;

interface ScraperResponse {
  text?: string;
  error?: string;
}

ipcRenderer.on('scraper:extract', async (_event, date: string, replyChannel: string) => {
  const send = (payload: ScraperResponse) => ipcRenderer.send(replyChannel, payload);
  try {
    // Wait for SPA to render
    await sleep(PAGE_WAIT_MS);

    // Set date and click APPLY
    const input = document.getElementById('winning-numbers-calendar-picker-startDate');
    if (!input) {
      send({ error: 'date-picker input not found' });
      return;
    }

    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, date);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));

    const btns = document.querySelectorAll('button');
    for (let i = 0; i < btns.length; i++) {
      if ((btns[i].textContent || '').trim().toUpperCase() === 'APPLY') {
        btns[i].click();
        break;
      }
    }

    await sleep(DATE_WAIT_MS);

    // Extract text
    let el = document.querySelector('.winning-numbers-past-results');
    if (!el) {
      const ws = document.querySelector('[class*="winning"]');
      el = ws || document.body;
    }

    const encoreEl = document.querySelector('.encore-number');
    const encore = encoreEl ? encoreEl.textContent!.trim() : '';
    const text = (el as HTMLElement).innerText + '\nENCORE_NUMBER:' + encore;

    send({ text });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    send({ error: msg });
  }
});

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
