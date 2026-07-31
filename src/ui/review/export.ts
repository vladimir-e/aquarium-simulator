/**
 * Plain-text export of the log — tab-separated tick / source / severity /
 * message, newest last, so the download reads top-to-bottom like a transcript.
 * It writes out what the panel is showing: the button sits in the filter
 * cluster, so a download that ignored the filter would not be the same log.
 */

import type { LogEntry } from '../../simulation/index.js';

export const LOG_EXPORT_FILENAME = 'aquarium-run-log.txt';

export function formatLogExport(logs: LogEntry[]): string {
  const header = 'tick\tsource\tseverity\tmessage';
  const rows = logs.map((log) => `${log.tick}\t${log.source}\t${log.severity}\t${log.message}`);
  return [header, ...rows].join('\n');
}
