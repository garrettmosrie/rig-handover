import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/index.js';

describe('readNight', () => {
  it('reads 2026-10-28: 5 jobs, 1 bad line, sorted by job', () => {
    const night = readNight('runs', '2026-10-28');
    expect(night).not.toBeNull();
    expect(night!.night).toBe('2026-10-28');
    expect(night!.badLines).toBe(1);
    expect(night!.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);

    const byJob = Object.fromEntries(night!.rows.map((r) => [r.job, r]));
    expect(byJob['fixtures/refresh']).toMatchObject({
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: null,
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
    expect(byJob['notes/backup']).toMatchObject({ lastStatus: 'fail', lastError: 'quota exceeded' });
    expect(byJob['digest/render']!.owner).toBeNull();
    expect(byJob['lane/sync']).toMatchObject({ runs: 8, retries: 1, lastStatus: 'ok' });
  });

  it('returns null for a night with no file', () => {
    expect(readNight('runs', '1999-01-01')).toBeNull();
  });

  it('returns no rows for an empty file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
    writeFileSync(join(dir, '2026-01-01.jsonl'), '');
    expect(readNight(dir, '2026-01-01')).toEqual({ night: '2026-01-01', rows: [], badLines: 0 });
  });

  it('counts lines that do not parse or lack fields, and keeps going', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
    writeFileSync(
      join(dir, '2026-01-02.jsonl'),
      [
        'not json',
        '{"at":"2026-01-02T01:00:00+01:00","job":"a","status":"bogus","owner":"x"}',
        '{"at":"2026-01-02T02:00:00+01:00","job":"a","status":"fail","owner":"x","error":"boom"}',
        '',
      ].join('\n'),
    );
    const night = readNight(dir, '2026-01-02');
    expect(night!.badLines).toBe(2);
    expect(night!.rows).toEqual([
      {
        job: 'a',
        owner: 'x',
        runs: 1,
        retries: 0,
        lastStatus: 'fail',
        lastError: 'boom',
        firstAt: '2026-01-02T02:00:00+01:00',
        lastAt: '2026-01-02T02:00:00+01:00',
      },
    ]);
  });
});
