import React from 'react';
import type { Mode } from '../../modes/types';

const TABS: { value: Mode; label: string }[] = [
  { value: 'build', label: 'Build' },
  { value: 'run', label: 'Run' },
  { value: 'review', label: 'Review' },
];

interface BottomTabBarProps {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
}

/**
 * Mobile mode switcher: a thumb-reachable bottom bar that replaces the header's
 * segmented control below `sm`. Active tab is a solid fill for at-a-glance
 * clarity; each tab clears the 44px touch target and the home-bar safe area.
 */
export function BottomTabBar({ mode, onModeChange }: BottomTabBarProps): React.JSX.Element {
  return (
    <nav
      aria-label="Mode"
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 border-t border-hairline-2 bg-surface sm:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {TABS.map((tab) => {
        const active = tab.value === mode;
        return (
          <button
            key={tab.value}
            type="button"
            aria-current={active ? 'page' : undefined}
            onClick={() => onModeChange(tab.value)}
            className={`flex h-14 items-center justify-center text-[15px] font-medium transition-colors focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus ${
              active ? 'bg-ink text-surface' : 'text-ink-3 hover:text-ink-2'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
