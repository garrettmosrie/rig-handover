import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestNight, DigestRow, ReadNight, RunStatus } from './types.js';

type RunLine = { at: string; job: string; status: RunStatus; owner: string | null; error: string | null };

const STATUSES: ReadonlySet<string> = new Set<RunStatus>(['ok', 'retry', 'fail']);

// Parse at the edge: a line is a run only if it is a JSON object with the required fields.
export function parseLine(line: string): RunLine | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
  const { at, job, status, owner, error } = o;
  if (typeof at !== 'string' || typeof job !== 'string') return null;
  if (typeof status !== 'string' || !STATUSES.has(status)) return null;
  if (owner !== null && owner !== undefined && typeof owner !== 'string') return null;
  if (error !== undefined && typeof error !== 'string') return null;
  return { at, job, status: status as RunStatus, owner: owner ?? null, error: error ?? null };
}

export const readNight: ReadNight = (runsDir, night): DigestNight | null => {
  const path = join(runsDir, `${night}.jsonl`);
  if (!existsSync(path)) return null;

  const rows = new Map<string, DigestRow>();
  let badLines = 0;
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim();
    if (line === '') continue;
    const run = parseLine(line);
    if (run === null) {
      badLines += 1;
      continue;
    }
    const row = rows.get(run.job);
    if (row === undefined) {
      rows.set(run.job, {
        job: run.job,
        owner: run.owner,
        runs: 1,
        retries: run.status === 'retry' ? 1 : 0,
        lastStatus: run.status,
        lastError: run.error,
        firstAt: run.at,
        lastAt: run.at,
      });
      continue;
    }
    row.runs += 1;
    if (run.status === 'retry') row.retries += 1;
    row.lastStatus = run.status;
    row.lastError = run.error;
    row.lastAt = run.at;
    if (row.owner === null) row.owner = run.owner;
  }

  return {
    night,
    rows: [...rows.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0)),
    badLines,
  };
};
