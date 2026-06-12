/**
 * Training log utility — writes to timestamped text files in the
 * app's userData/training-logs/ directory so the pipeline can be
 * audited after each endless training session.
 */

import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

let logPath: string | null = null;
let logFileName: string | null = null;

/** Call once at the start of a training session to create a fresh log file. */
export function initTrainingLog(sessionLabel?: string): string {
  const logsDir = path.join(app.getPath('userData'), 'training-logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const label = sessionLabel ? `-${sessionLabel}` : '';
  logFileName = `training-log-${ts}${label}.txt`;
  logPath = path.join(logsDir, logFileName);

  const header = [
    '='.repeat(60),
    `  TRAINING LOG — ${new Date().toISOString()}`,
    `  Session: ${sessionLabel || 'unnamed'}`,
    '='.repeat(60),
    '',
  ].join('\n');

  fs.appendFileSync(logPath, header + '\n', 'utf-8');
  console.log(`[TrainingLog] Writing to: ${logPath}`);
  return logPath;
}

/** Append a timestamped message to the log file AND print to console. */
export function logToFile(message: string): void {
  const ts = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
  const line = `[${ts}] ${message}`;
  console.log(line);

  if (!logPath) {
    console.warn('[TrainingLog] Not initialised — message not written to file');
    return;
  }

  try {
    fs.appendFileSync(logPath, line + '\n', 'utf-8');
  } catch (err) {
    console.error('[TrainingLog] Failed to write:', err);
  }
}

/** Return the current log file path (null if not initialised). */
export function getLogFilePath(): string | null {
  return logPath;
}
