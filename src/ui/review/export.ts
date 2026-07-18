/**
 * Plain-text export of the run log — tab-separated tick / source / severity /
 * message, newest last, so the download reads top-to-bottom like a transcript.
 */

import type { LogEntry } from '../../simulation/index.js';

export const LOG_EXPORT_FILENAME = 'aquarium-run-log.txt';

export function formatLogExport(logs: LogEntry[]): string {
  const header = 'tick\tsource\tseverity\tmessage';
  const rows = logs.map((log) => `${log.tick}\t${log.source}\t${log.severity}\t${log.message}`);
  return [header, ...rows].join('\n');
}
