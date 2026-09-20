import { useEffect, useRef } from 'react';
import { useStage } from '../components/layout/AppShell';

/**
 * A module's inspector, declared to the shell for as long as it is open, so
 * the stage carries one drawer: Act, the tunables and the More sheet close it
 * on their way up, and it closes them.
 */
export function useInspector(open: boolean, close: () => void): void {
  const { onInspect } = useStage();
  const closing = useRef(close);
  closing.current = close;

  useEffect(() => {
    if (!open) return;
    return onInspect(() => closing.current());
  }, [open, onInspect]);
}
