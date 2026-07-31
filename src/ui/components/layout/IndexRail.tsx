import React from 'react';
import { ChevronRight } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import type { DailySchedule } from '../../../simulation/index.js';
import { useUnits } from '../../hooks/useUnits';
import { SECTIONS, formatMeter, type MicroMeter, type NavFigure, type SectionId } from '../../nav';
import type { Status, SpeedPreset } from '../../run';
import { Pill, statusText, type PillVariant } from '../run/elements';
import { TimelineCard } from './TimelineCard';

const METER_FILL: Record<Status, string> = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  alert: 'bg-alert',
  neutral: 'bg-ink-3',
};

const PILL_VARIANT: Record<Status, PillVariant> = {
  ok: 'ok',
  warn: 'warn',
  alert: 'alert',
  neutral: 'neutral',
};

function MicroMeters({ meters }: { meters: MicroMeter[] }): React.JSX.Element {
  const { displayTemp } = useUnits();
  return (
    <div className="flex gap-1">
      {meters.map((meter) => (
        <div key={meter.key} className="flex min-w-0 flex-1 flex-col items-center gap-0.5">
          <span
            className={`font-mono text-[9.5px] font-semibold leading-none ${meter.status === 'neutral' ? 'text-ink' : statusText(meter.status)}`}
          >
            {formatMeter(meter, displayTemp)}
          </span>
          <span
            className={`relative h-[26px] w-2.5 rounded-badge bg-track ${meter.status === 'alert' ? 'ring-1 ring-alert' : ''}`}
          >
            <span
              className={`absolute inset-x-0 bottom-0 rounded-b-badge ${METER_FILL[meter.status]}`}
              style={{ height: `${meter.fill * 100}%` }}
            />
          </span>
          <span className="text-[8px] font-semibold uppercase tracking-[0.04em] text-ink-3">
            {meter.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function DeviceDots({ dots }: { dots: boolean[] }): React.JSX.Element {
  return (
    <div aria-hidden className="flex items-center gap-[3px]">
      {dots.map((on, i) => (
        <span
          key={i}
          className={`h-1.5 w-1.5 rounded-full ${on ? 'bg-ok' : 'border border-ink-3'}`}
        />
      ))}
    </div>
  );
}

function NavRow({
  to,
  label,
  figure,
  onNavigate,
}: {
  to: string;
  label: string;
  figure: NavFigure;
  onNavigate: () => void;
}): React.JSX.Element {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      onClick={onNavigate}
      className={({ isActive }) =>
        `flex min-h-[68px] flex-1 flex-col justify-center gap-1 overflow-hidden rounded-control border-b border-hairline px-2 py-2 last:border-b-0 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus ${
          isActive
            ? 'bg-surface-2 shadow-[inset_2px_0_0_var(--accent)]'
            : 'hover:bg-surface-2'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span className="flex items-center gap-1.5">
            <span className="min-w-0 truncate text-[14.5px] font-semibold leading-none tracking-[-0.005em]">
              {label}
            </span>
            {figure.pill && (
              <Pill variant={PILL_VARIANT[figure.pill.status]}>{figure.pill.text}</Pill>
            )}
            {!isActive && <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0 text-ink-3" />}
          </span>
          {figure.dots && <DeviceDots dots={figure.dots} />}
          {figure.meters && <MicroMeters meters={figure.meters} />}
          {figure.lines.map((line, i) => (
            <span key={i} className="truncate font-mono text-[11px] leading-snug text-ink-2">
              {line}
            </span>
          ))}
        </>
      )}
    </NavLink>
  );
}

interface IndexRailProps {
  figures: Record<SectionId, NavFigure>;
  tick: number;
  isPlaying: boolean;
  speed: SpeedPreset;
  lightSchedule: DailySchedule;
  lightOn: boolean;
  onPlayPause: () => void;
  onStep: () => void;
  onSpeedChange: (speed: SpeedPreset) => void;
  /** Dismisses the drawer once a row is followed (mobile only). */
  onNavigate: () => void;
  /** The Actions trigger, docked at the foot wherever the rail stands. */
  footer?: React.ReactNode;
}

/** The figures are the point: the rail is meant to answer most questions without a visit. */
export function IndexRail({
  figures,
  onNavigate,
  footer,
  ...timeline
}: IndexRailProps): React.JSX.Element {
  return (
    <div className="flex min-h-0 w-[264px] shrink-0 flex-col gap-3">
      <TimelineCard {...timeline} />
      <nav
        aria-label="Sections"
        className="flex min-h-0 flex-1 flex-col overflow-y-auto rounded-card border border-hairline bg-surface p-1.5"
      >
        {SECTIONS.map((section) => (
          <NavRow
            key={section.id}
            to={section.path}
            label={section.label}
            figure={figures[section.id]}
            onNavigate={onNavigate}
          />
        ))}
      </nav>
      {footer}
    </div>
  );
}
