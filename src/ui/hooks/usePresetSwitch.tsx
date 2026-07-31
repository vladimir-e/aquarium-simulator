import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { presetName, type PresetId } from '../presets.js';
import { presetRestoreMessage, presetSwitchMessage } from '../build/index.js';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';

export interface PresetSwitch {
  current: PresetId;
  /** Ask to load a preset. Asking for the loaded one is restoring its defaults. */
  request: (id: PresetId) => void;
}

const PresetSwitchContext = createContext<PresetSwitch | null>(null);

/**
 * The preset selector sits in the chrome row and the preset picker sits in the
 * Scenario section; both come through here, so a switch is confirmed once, in
 * one wording, wherever it was asked for.
 */
export function PresetSwitchProvider({
  current,
  onLoad,
  children,
}: {
  current: PresetId;
  onLoad: (id: PresetId) => void;
  children: React.ReactNode;
}): React.JSX.Element {
  const [pending, setPending] = useState<PresetId | null>(null);
  const request = useCallback((id: PresetId) => setPending(id), []);
  const value = useMemo<PresetSwitch>(() => ({ current, request }), [current, request]);

  const restoring = pending !== null && pending === current;
  const name = pending === null ? '' : presetName(pending);

  return (
    <PresetSwitchContext.Provider value={value}>
      {children}
      <ConfirmDialog
        isOpen={pending !== null}
        title={restoring ? 'Restore defaults?' : 'Switch preset?'}
        message={restoring ? presetRestoreMessage(name) : presetSwitchMessage(name)}
        confirmLabel={restoring ? 'Restore' : 'Switch'}
        onConfirm={() => {
          if (pending !== null) onLoad(pending);
          setPending(null);
        }}
        onCancel={() => setPending(null)}
      />
    </PresetSwitchContext.Provider>
  );
}

export function usePresetSwitch(): PresetSwitch {
  const value = useContext(PresetSwitchContext);
  if (!value) {
    throw new Error('usePresetSwitch must be used inside a PresetSwitchProvider');
  }
  return value;
}
