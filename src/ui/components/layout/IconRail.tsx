import React from 'react';
import { Fish, LayoutGrid, LineChart, Droplets, Plug, Settings, MoreHorizontal } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { MORE_IDS, SECTIONS, TAB_IDS, type NeedTone, type SectionDef, type SectionId } from '../../nav';
import { DRAWER_TOGGLE } from '../ui/Drawer';

const ICON: Record<SectionId, typeof Fish> = {
  overview: LayoutGrid,
  water: Droplets,
  life: Fish,
  gear: Plug,
  history: LineChart,
  setup: Settings,
};

const ITEM =
  'relative flex flex-col items-center gap-1 rounded-control py-2 text-[10px] leading-3 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent';

function tone(active: boolean): string {
  return active ? 'bg-accent-tint text-accent' : 'text-ink-2 hover:text-ink';
}

function Dot({ tone, className = '' }: { tone: NeedTone; className?: string }): React.JSX.Element {
  return (
    <span
      aria-hidden
      className={`h-1.5 w-1.5 rounded-full ${tone === 'alert' ? 'bg-alert' : 'bg-warn'} ${className}`}
    />
  );
}

function Item({
  section,
  alert,
  onNavigate,
}: {
  section: SectionDef;
  alert: NeedTone | undefined;
  onNavigate?: () => void;
}): React.JSX.Element {
  const Glyph = ICON[section.id];
  return (
    <NavLink
      to={section.path}
      end={section.path === '/'}
      onClick={onNavigate}
      className={({ isActive }) => `${ITEM} ${tone(isActive)}`}
    >
      <span className="relative">
        <Glyph className="h-5 w-5" />
        {alert && <Dot tone={alert} className="absolute -right-1 -top-0.5" />}
      </span>
      {section.label}
    </NavLink>
  );
}

interface NavProps {
  /** Sections with an engine alert standing against them, in its tone. */
  alerts: ReadonlyMap<SectionId, NeedTone>;
}

/**
 * Six fixed items, no figures, never scrolls — a nav you can read without
 * reading it. The only live thing on it is the dot that says a section has
 * something to answer.
 */
export function IconRail({ alerts }: NavProps): React.JSX.Element {
  return (
    <nav
      aria-label="Sections"
      className="flex w-14 shrink-0 flex-col gap-0.5 overflow-hidden border-r border-hairline p-1.5"
    >
      {SECTIONS.map((section) => (
        <Item key={section.id} section={section} alert={alerts.get(section.id)} />
      ))}
    </nav>
  );
}

/** The rail on a phone: four tabs and the two that didn't fit, behind More. */
export function TabBar({
  alerts,
  moreOpen,
  onMore,
}: NavProps & { moreOpen: boolean; onMore: () => void }): React.JSX.Element {
  const moreAlert = MORE_IDS.map((id) => alerts.get(id)).find(Boolean);
  return (
    <nav
      aria-label="Sections"
      className="grid shrink-0 grid-cols-5 gap-0.5 border-t border-hairline px-1.5 pb-[env(safe-area-inset-bottom)] pt-1.5"
    >
      {SECTIONS.filter((s) => TAB_IDS.includes(s.id)).map((section) => (
        <Item key={section.id} section={section} alert={alerts.get(section.id)} />
      ))}
      <button
        type="button"
        onClick={onMore}
        aria-expanded={moreOpen}
        className={`${ITEM} ${tone(moreOpen)}`}
        {...DRAWER_TOGGLE}
      >
        <span className="relative">
          <MoreHorizontal className="h-5 w-5" />
          {moreAlert && <Dot tone={moreAlert} className="absolute -right-1 -top-0.5" />}
        </span>
        More
      </button>
    </nav>
  );
}

/** The two sections that live behind More, as rows for its sheet. */
export function MoreSections({
  alerts,
  onNavigate,
}: NavProps & { onNavigate: () => void }): React.JSX.Element {
  return (
    <div className="flex flex-col p-1.5">
      {SECTIONS.filter((s) => MORE_IDS.includes(s.id)).map((section) => {
        const Glyph = ICON[section.id];
        const alert = alerts.get(section.id);
        return (
          <NavLink
            key={section.id}
            to={section.path}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex h-11 items-center gap-3 rounded-control px-3 text-[14px] transition-colors ${
                isActive ? 'bg-accent-tint text-accent' : 'text-ink hover:bg-surface-2'
              }`
            }
          >
            <Glyph className="h-5 w-5 text-ink-2" />
            {section.label}
            {alert && <Dot tone={alert} />}
          </NavLink>
        );
      })}
    </div>
  );
}
