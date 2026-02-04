import { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

interface GameShellProps {
  header: ReactNode;
  tank: ReactNode;
  tabs: ReactNode;
  panel: ReactNode;
}

/**
 * GameShell - Main responsive layout container (mobile-first app design)
 *
 * Layout structure:
 * - Header (Timeline)
 * - Tank Canvas (maintains 5:3 aspect ratio for 10-gallon tank)
 * - Tab Pills (left-aligned with container styling)
 * - Panel Content (fills remaining space, scrollable)
 */
function GameShell({ header, tank, tabs, panel }: GameShellProps): React.ReactElement {
  return (
    <div className="flex h-screen flex-col bg-[--color-bg-primary]">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3">
        {header}
      </div>

      {/* Tank Canvas - centered with square aspect ratio */}
      <div className="flex flex-shrink-0 justify-center px-4 pb-3">
        <div className="aspect-square w-full max-w-sm">
          {tank}
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex-shrink-0 px-4 pb-3">
        {tabs}
      </div>

      {/* Panel section - fills remaining space */}
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={panel?.toString()}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: [0, 0, 0.2, 1] }}
            className="flex h-full flex-col px-4 pb-4"
          >
            {panel}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

export default GameShell;
