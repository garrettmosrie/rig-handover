import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestNight } from '../src/digest/types.js';

const dir = mkdtempSync(join(tmpdir(), 'rig-'));
const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: dir };

const line = (at: string, job: string, status: string, owner: string | null, error?: string) =>
  JSON.stringify({ at, job, status, owner, ...(error ? { error } : {}) });

beforeAll(() => {
  process.env.LANE_MARKER = 'TEST-MARKER';
  writeFileSync(
    join(dir, '2026-02-01.jsonl'),
    [
      line('2026-02-01T01:00:00+01:00', 'alpha/sync', 'retry', 'rook'),
      line('2026-02-01T01:01:00+01:00', 'alpha/sync', 'retry', 'rook'),
      line('2026-02-01T01:02:00+01:00', 'alpha/sync', 'retry', 'rook'),
      line('2026-02-01T01:03:00+01:00', 'alpha/sync', 'ok', 'rook'),
      line('2026-02-01T02:00:00+01:00', 'beta/backup', 'fail', 'ops', 'quota exceeded'),
      line('2026-02-01T03:00:00+01:00', 'gamma/render', 'ok', null),
      '',
    ].join('\n'),
  );
  writeFileSync(join(dir, '2026-02-02.jsonl'), '');
  writeFileSync(
    join(dir, '2026-02-03.jsonl'),
    [line('2026-02-03T01:00:00+01:00', 'alpha/sync', 'ok', 'rook'), 'this is garbage', ''].join('\n'),
  );
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('digest page and JSON', () => {
  it('serves a night with good lines, page and JSON in the same job order', async () => {
    const app = createApp(config);
    const page = await app.request('/digest/2026-02-01');
    const html = await page.text();
    expect(page.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    expect(html).toContain('<h1>digest · 2026-02-01</h1>');
    expect(html).toContain('alpha/sync');
    expect(html).toContain('beta/backup');
    expect(html).toContain('gamma/render');
    expect(html).toContain('—');
    expect(html).toContain('class="warn"');
    expect(html).not.toContain('nothing ran');
    expect(html).not.toContain('did not parse');

    const res = await app.request('/api/digest/2026-02-01');
    expect(res.status).toBe(200);
    const body = (await res.json()) as DigestNight;
    expect(body.night).toBe('2026-02-01');
    expect(body.badLines).toBe(0);
    const jobs = body.rows.map((r) => r.job);
    expect(jobs).toHaveLength(3);
    expect(body.rows.find((r) => r.job === 'gamma/render')!.owner).toBeNull();
    expect(body.rows.find((r) => r.job === 'alpha/sync')).toMatchObject({ retries: 3, lastStatus: 'ok' });
    expect(body.rows.find((r) => r.job === 'beta/backup')).toMatchObject({ lastStatus: 'fail', lastError: 'quota exceeded' });

    // Job names as they appear in the page, in page order.
    const inPage = jobs
      .map((job) => ({ job, at: html.indexOf(job) }))
      .sort((a, b) => a.at - b.at)
      .map((x) => x.job);
    expect(inPage).toEqual(jobs);
  });

  it('answers 404 for a night with no file, page and JSON', async () => {
    const app = createApp(config);
    const page = await app.request('/digest/1999-01-01');
    expect(page.status).toBe(404);
    expect(await page.text()).toContain('no such night');

    const res = await app.request('/api/digest/1999-01-01');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no such night' });
  });

  it('renders the empty night as nothing ran', async () => {
    const app = createApp(config);
    const page = await app.request('/digest/2026-02-02');
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('nothing ran');

    const res = await app.request('/api/digest/2026-02-02');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ night: '2026-02-02', rows: [], badLines: 0 });
  });

  it('counts a bad line under the table and in the JSON', async () => {
    const app = createApp(config);
    const page = await app.request('/digest/2026-02-03');
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('1 line did not parse');

    const res = await app.request('/api/digest/2026-02-03');
    expect(res.status).toBe(200);
    const body = (await res.json()) as DigestNight;
    expect(body.badLines).toBe(1);
    expect(body.rows).toHaveLength(1);
  });
});
