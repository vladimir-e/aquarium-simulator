import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { SimulationState } from '../../simulation/index.js';
import { presetName, type PresetId } from '../../simulation/presets.js';
import { presetLoadDestroys, presetLoadMessage } from '../build/index.js';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';

export interface PresetSwitch {
  current: PresetId;
  /** Ask to load a preset. Asking for the loaded one starts it over. */
  request: (id: PresetId) => void;
}

const PresetSwitchContext = createContext<PresetSwitch | null>(null);

/**
 * The preset selector sits in the chrome row and the preset picker sits in the
 * Scenario section; both come through here, so a load is confirmed once, in one
 * wording, wherever it was asked for.
 */
export function PresetSwitchProvider({
  current,
  state,
  onLoad,
  children,
}: {
  current: PresetId;
  state: SimulationState;
  onLoad: (id: PresetId) => void;
  children: React.ReactNode;
}): React.JSX.Element {
  const [pending, setPending] = useState<PresetId | null>(null);

  const request = useCallback(
    (id: PresetId) => {
      if (presetLoadDestroys(state)) setPending(id);
      else onLoad(id);
    },
    [state, onLoad]
  );
  const value = useMemo<PresetSwitch>(() => ({ current, request }), [current, request]);

  return (
    <PresetSwitchContext.Provider value={value}>
      {children}
      <ConfirmDialog
        isOpen={pending !== null}
        title="Start a new tank?"
        message={pending === null ? '' : presetLoadMessage(presetName(pending), state)}
        confirmLabel="Start"
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
