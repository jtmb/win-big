import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import type { AppSettings } from './preload';

const DEFAULT_SETTINGS: AppSettings = {
  aiProvider: 'lmstudio',
  scraperConcurrency: 6,
  scrapeDepthYears: 2,
  endlessConfidenceTarget: 0.9,
  lmstudio: {
    baseUrl: 'http://192.168.0.13:1234/v1',
    model: '',
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o',
  },
};

function getSettingsPath(): string {
  return path.join(app.getPath('userData'), 'winbig-settings.json');
}

export function loadSettings(): AppSettings {
  const filePath = getSettingsPath();
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      const merged: any = { ...DEFAULT_SETTINGS, ...parsed };
      // Migrate old 'deepseek' key to 'openai'
      if (merged.deepseek && !parsed.openai) {
        merged.openai = {
          baseUrl: 'https://api.openai.com/v1',
          apiKey: merged.deepseek.apiKey || '',
          model: merged.deepseek.model || 'gpt-4o',
        };
        delete merged.deepseek;
        saveSettings(merged);
      }
      return merged;
    }
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(settings: AppSettings): void {
  const filePath = getSettingsPath();
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save settings:', err);
    throw new Error('Could not save settings');
  }
}
