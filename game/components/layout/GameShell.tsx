import { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

interface GameShellProps {
  header: ReactNode;
  tank: ReactNode;
  tabs: ReactNode;
  panel: ReactNode;
}

/**
 * GameShell - Main responsive layout container
 *
 * Layout structure (same for mobile and desktop):
 * - Header (Timeline)
 * - Tank Canvas
 * - Tab Pills
 * - Panel Content (scrollable)
 *
 * Responsive behavior:
 * - Mobile (< 1024px): 50% fixed top, 50% scrollable panel, single column cards
 * - Desktop (>= 1024px): 60% fixed top, 40% scrollable panel, multi-column cards
 */
function GameShell({ header, tank, tabs, panel }: GameShellProps): React.ReactElement {
  return (
    <div className="flex h-screen flex-col bg-[--color-bg-primary]">
      {/* Fixed section - header + tank + tabs */}
      <div className="flex h-[50vh] flex-shrink-0 flex-col lg:h-[60vh]">
        {/* Header */}
        <div className="flex-shrink-0 px-4 py-2">
          {header}
        </div>

        {/* Tank Canvas */}
        <div className="min-h-0 flex-1 px-4 pb-2">
          {tank}
        </div>

        {/* Tab Bar */}
        <div className="flex-shrink-0 px-4 pb-2">
          {tabs}
        </div>
      </div>

      {/* Scrollable panel section */}
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto bg-[--color-bg-secondary]">
        <AnimatePresence mode="wait">
          <motion.div
            key={panel?.toString()}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2, ease: [0, 0, 0.2, 1] }}
            className="p-4"
          >
            {panel}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

export default GameShell;
