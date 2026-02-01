import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, type ReactNode } from 'react';
import {
  type UnitSystem,
  formatTemperature,
  formatVolume,
  getTemperatureUnit,
  getVolumeUnit,
  toDisplayTemperature,
  toDisplayVolume,
  toInternalTemperature,
  toInternalVolume,
} from '../utils/units';
import { usePersistence } from '../persistence/index.js';

export type { UnitSystem };

interface UnitsContextValue {
  /** Current unit system (metric or imperial) */
  unitSystem: UnitSystem;
  /** Toggle between metric and imperial */
  toggleUnits: () => void;
  /** Set specific unit system */
  setUnitSystem: (system: UnitSystem) => void;
  /** Format temperature for display (e.g., "25.0°C" or "77.0°F") */
  formatTemp: (celsius: number, precision?: number) => string;
  /** Format volume for display (e.g., "10.0 L" or "2.6 gal") */
  formatVol: (liters: number, precision?: number) => string;
  /** Get temperature unit label ("°C" or "°F") */
  tempUnit: string;
  /** Get volume unit label ("L" or "gal") */
  volUnit: string;
  /** Convert internal Celsius to display value */
  displayTemp: (celsius: number) => number;
  /** Convert internal liters to display value */
  displayVol: (liters: number) => number;
  /** Convert display temperature to internal Celsius */
  internalTemp: (displayValue: number) => number;
  /** Convert display volume to internal liters */
  internalVol: (displayValue: number) => number;
}

const UnitsContext = createContext<UnitsContextValue | null>(null);

interface UnitsProviderProps {
  children: ReactNode;
}

export function UnitsProvider({ children }: UnitsProviderProps): React.JSX.Element {
  const { initialUI, onUIChange } = usePersistence();

  const [unitSystem, setUnitSystemState] = useState<UnitSystem>(initialUI.units);

  // Notify persistence when units change
  useEffect(() => {
    onUIChange({ units: unitSystem });
  }, [unitSystem, onUIChange]);

  const setUnitSystem = useCallback((system: UnitSystem) => {
    setUnitSystemState(system);
  }, []);

  const toggleUnits = useCallback(() => {
    setUnitSystemState((prev) => (prev === 'metric' ? 'imperial' : 'metric'));
  }, []);

  const value = useMemo<UnitsContextValue>(
    () => ({
      unitSystem,
      toggleUnits,
      setUnitSystem,
      formatTemp: (celsius: number, precision?: number): string =>
        formatTemperature(celsius, unitSystem, precision),
      formatVol: (liters: number, precision?: number): string =>
        formatVolume(liters, unitSystem, precision),
      tempUnit: getTemperatureUnit(unitSystem),
      volUnit: getVolumeUnit(unitSystem),
      displayTemp: (celsius: number): number => toDisplayTemperature(celsius, unitSystem),
      displayVol: (liters: number): number => toDisplayVolume(liters, unitSystem),
      internalTemp: (displayValue: number): number => toInternalTemperature(displayValue, unitSystem),
      internalVol: (displayValue: number): number => toInternalVolume(displayValue, unitSystem),
    }),
    [unitSystem, toggleUnits, setUnitSystem]
  );

  return <UnitsContext.Provider value={value}>{children}</UnitsContext.Provider>;
}

/**
 * Hook to access unit system and formatting functions.
 * Must be used within a UnitsProvider.
 */
export function useUnits(): UnitsContextValue {
  const context = useContext(UnitsContext);
  if (!context) {
    throw new Error('useUnits must be used within a UnitsProvider');
  }
  return context;
}
