// Types for the morning digest (plan.md § 1). Every part of § 2 builds against this file.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One row per job, from one night's run log.
export type DigestRow = {
  job: string;
  owner: string | null; // null in the log; the view shows it as `—`
  runs: number; // lines for this job
  retries: number; // lines with status `retry`
  lastStatus: RunStatus; // from the latest line, in file order
  lastError: string | null; // from the latest line; null when it has no `error`
  firstAt: string; // `at` of the first line, as written in the log (offset kept)
  lastAt: string; // `at` of the last line, as written in the log (offset kept)
};

// One night: rows sorted by job name, plus the count of lines that did not parse.
export type DigestNight = {
  night: string;
  rows: DigestRow[];
  badLines: number;
};

// readNight(runsDir, night) reads `<runsDir>/<night>.jsonl`.
// - null when the file does not exist.
// - An empty file gives rows: [] and badLines: 0.
// - A line that is not valid JSON, or lacks `at`, `job` or a known `status`, counts in
//   badLines and is otherwise ignored. Nothing throws for bad content.
export type ReadNight = (runsDir: string, night: string) => DigestNight | null;
