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
    <div
      className="flex items-center justify-center gap-1 rounded-xl bg-[--color-tab-bg] p-1"
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
            className={`focus-ring relative rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? 'text-[--color-tab-text-active]'
                : 'text-[--color-tab-text] hover:text-[--color-text-primary]'
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
                className="absolute inset-0 rounded-lg bg-[--color-tab-active]"
                transition={{
                  type: 'spring',
                  stiffness: 500,
                  damping: 35,
                }}
              />
            )}
            <span className="relative z-10">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default TabBar;
