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
 * - Tank Canvas (square, max 40% of viewport height)
 * - Tab Pills (scrollable)
 * - Panel Content (fills remaining space, scrollable)
 */
function GameShell({ header, tank, tabs, panel }: GameShellProps): React.ReactElement {
  return (
    <div className="flex h-screen flex-col bg-[--color-bg-primary]">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-2">
        {header}
      </div>

      {/* Tank Canvas - square, constrained by height */}
      <div className="flex flex-shrink-0 justify-center px-4 pb-2">
        <div className="aspect-square h-[min(40vh,300px)] max-w-full">
          {tank}
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex-shrink-0 px-4 pb-2">
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
