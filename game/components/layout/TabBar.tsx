import { motion } from 'framer-motion';

export type TabId = 'tank' | 'equipment' | 'plants' | 'livestock' | 'actions' | 'logs';

interface Tab {
  id: TabId;
  label: string;
}

const TABS: Tab[] = [
  { id: 'tank', label: 'Tank' },
  { id: 'equipment', label: 'Equipment' },
  { id: 'plants', label: 'Plants' },
  { id: 'livestock', label: 'Livestock' },
  { id: 'actions', label: 'Actions' },
  { id: 'logs', label: 'Logs' },
];

interface TabBarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

/**
 * TabBar - Pill-style tabs with smooth selection animation
 *
 * Features:
 * - Left-aligned pills in a subtle container
 * - Animated background indicator that slides to selected tab
 * - Keyboard accessible (Tab, Enter, Space, Arrow keys)
 * - ARIA attributes for accessibility
 */
function TabBar({ activeTab, onTabChange }: TabBarProps): React.ReactElement {
  const handleKeyDown = (e: React.KeyboardEvent, tabId: TabId): void => {
    const currentIndex = TABS.findIndex((t) => t.id === tabId);
    let newIndex = currentIndex;

    switch (e.key) {
      case 'ArrowLeft':
        newIndex = currentIndex > 0 ? currentIndex - 1 : TABS.length - 1;
        e.preventDefault();
        break;
      case 'ArrowRight':
        newIndex = currentIndex < TABS.length - 1 ? currentIndex + 1 : 0;
        e.preventDefault();
        break;
      case 'Home':
        newIndex = 0;
        e.preventDefault();
        break;
      case 'End':
        newIndex = TABS.length - 1;
        e.preventDefault();
        break;
      default:
        return;
    }

    onTabChange(TABS[newIndex].id);
  };

  return (
    <div className="overflow-x-auto rounded-2xl border border-[--color-border-light] bg-[--color-bg-card] p-1.5 shadow-sm">
      <div
        className="flex gap-1"
        role="tablist"
        aria-label="Panel navigation"
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              onKeyDown={(e) => handleKeyDown(e, tab.id)}
              className={`focus-ring relative flex-shrink-0 rounded-xl px-4 py-2 text-sm font-medium transition-all ${
                isActive
                  ? 'text-[--color-text-inverse]'
                  : 'text-[--color-text-secondary] hover:bg-[--color-bg-secondary] hover:text-[--color-text-primary]'
              }`}
              role="tab"
              aria-selected={isActive}
              aria-controls={`panel-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              type="button"
            >
              {isActive && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute inset-0 rounded-xl bg-[--color-accent-primary] shadow-md"
                  transition={{
                    type: 'spring',
                    stiffness: 400,
                    damping: 30,
                  }}
                />
              )}
              <span className="relative z-10">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default TabBar;
