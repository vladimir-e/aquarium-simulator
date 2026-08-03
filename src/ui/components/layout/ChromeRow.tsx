import React from 'react';
import { Github, Menu, Settings } from 'lucide-react';
import type { LogEntry } from '../../../simulation/index.js';
import { latestLog } from '../../run';
import { useConfig } from '../../hooks/useConfig';
import { usePresetSwitch } from '../../hooks/usePresetSwitch';
import { PRESETS, type PresetId } from '../../../simulation/presets.js';
import { Select } from '../ui/Select';
import { ThemeToggle } from '../ui/ThemeToggle';

const REPO_URL = 'https://github.com/vladimir-e/aquarium-simulator';

const UTILITY =
  'flex h-8 w-8 shrink-0 items-center justify-center rounded-control border border-hairline text-ink-2 transition-colors hover:border-hairline-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

function Ticker({ logs }: { logs: LogEntry[] }): React.JSX.Element {
  const latest = latestLog(logs);
  return (
    <p
      aria-live="polite"
      className="hidden min-w-0 flex-1 items-baseline gap-2 font-mono text-[12px] leading-none md:flex"
    >
      {latest ? (
        <>
          <span className="shrink-0 text-ink-3">T{latest.tick}</span>
          <span className="shrink-0 text-ink-3">[{latest.source}]</span>
          <span
            className={`truncate ${latest.severity === 'warning' ? 'text-alert-text' : 'text-ink-2'}`}
          >
            {latest.message}
          </span>
        </>
      ) : (
        <span className="text-ink-3">No events yet.</span>
      )}
    </p>
  );
}

interface ChromeRowProps {
  logs: LogEntry[];
  /** Null once the rail stands beside the stage — there is no drawer to open. */
  onOpenIndex: (() => void) | null;
}

/**
 * The top band: identity, scenario, the latest event, and utilities. No verbs —
 * husbandry lives behind the Actions trigger, construction in each section's
 * own header.
 */
export function ChromeRow({ logs, onOpenIndex }: ChromeRowProps): React.JSX.Element {
  const { isDebugPanelOpen, toggleDebugPanel, isAnyModified } = useConfig();
  const { current, request } = usePresetSwitch();

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-hairline-2 bg-surface px-3">
      {onOpenIndex && (
        <button type="button" onClick={onOpenIndex} aria-label="Open index" className={UTILITY}>
          <Menu className="h-4 w-4" />
        </button>
      )}

      <span className="shrink-0 text-[15px] font-semibold tracking-[0.05em] text-accent">AQ·SIM</span>

      <Select
        ariaLabel="Scenario preset"
        value={current}
        onChange={(v) => request(v as PresetId)}
        options={PRESETS.map((preset) => ({ value: preset.id, label: preset.name }))}
        className="max-w-[9rem] shrink-0"
        selectClassName="truncate"
      />

      <Ticker logs={logs} />

      <div className="ml-auto flex shrink-0 items-center gap-2 md:ml-0">
        <ThemeToggle />
        {/* Named, not an icon: the mark is the credibility on an open-source demo. */}
        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          aria-label="Source on GitHub"
          title="Source on GitHub"
          className={`${UTILITY} w-auto gap-1.5 px-2.5 text-[13px] font-medium`}
        >
          <Github className="h-4 w-4" />
          <span className="hidden sm:inline">GitHub</span>
        </a>
        <button
          type="button"
          onClick={toggleDebugPanel}
          aria-label="Debug constants"
          aria-pressed={isDebugPanelOpen}
          title="Debug: simulation constants"
          className={`relative ${UTILITY} ${isDebugPanelOpen ? 'text-ink' : ''}`}
        >
          <Settings className="h-4 w-4" />
          {isAnyModified && (
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-warn" />
          )}
        </button>
      </div>
    </header>
  );
}
