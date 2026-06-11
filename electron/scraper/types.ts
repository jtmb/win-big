/** Shared types for the scraper */

export interface ParsedDraw {
  lottery: '649' | 'max';
  drawDate: string;
  numbers: number[];
  bonus: number;
  encore: string;
  goldBall: string | null;
}

export interface ScraperProgress {
  current: number;
  total: number;
  message: string;
  /** Human-readable draw counts (optional; bar uses current/total milestones) */
  drawCurrent?: number;
  drawTotal?: number;
}
