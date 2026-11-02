import { readdirSync } from 'node:fs';
import type { RigConfig } from './config.js';
import { readNight } from './digest/index.js';
import { lastBeat, type Beat } from './heartbeat.js';

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  nights: NightSummary[];
};

export type NightSummary = { night: string; ok: number; retry: number; fail: number };

function summarise(runsDir: string, night: string): NightSummary {
  const rows = readNight(runsDir, night)?.rows ?? [];
  return {
    night,
    ok: rows.filter((r) => r.lastStatus === 'ok').length,
    retry: rows.reduce((sum, r) => sum + r.retries, 0),
    fail: rows.filter((r) => r.lastStatus === 'fail').length,
  };
}

// Nights on disk = runs/<YYYY-MM-DD>.jsonl, newest first.
export function nightsOnDisk(runsDir: string): string[] {
  try {
    return readdirSync(runsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

export function readStatus(config: RigConfig): Status {
  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    nights: nightsOnDisk(config.runsDir).map((n) => summarise(config.runsDir, n)),
  };
}
