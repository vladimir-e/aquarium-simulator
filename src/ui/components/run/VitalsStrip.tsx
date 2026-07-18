import React from 'react';
import type { SimulationState } from '../../../simulation/index.js';
import { getPpm } from '../../../simulation/resources/index.js';
import { useUnits } from '../../hooks/useUnits';
import type { RunSnapshot } from '../../run/history';
import { classifyVital, type VitalClassification, type VitalKey } from '../../run/vitals';
import { Pill, Sparkline, statusText } from './elements';

interface VitalSpec {
  key: VitalKey;
  label: string;
  unit: string;
  value: string;
  /** Canonical value fed to the classifier (ppm, mg/L, °C, %). */
  classifyValue: number;
  series: number[];
}

function VitalTile({ spec }: { spec: VitalSpec }): React.JSX.Element {
  const cls: VitalClassification = classifyVital(spec.key, spec.classifyValue);
  const border =
    cls.status === 'alert'
      ? 'border-alert'
      : cls.status === 'warn'
        ? 'border-warn'
        : 'border-hairline';
  const number =
    cls.status === 'alert' ? 'text-alert' : cls.status === 'warn' ? 'text-warn' : 'text-ink';

  return (
    <div className={`flex flex-col gap-2 rounded-card border bg-surface px-3 py-3 ${border}`}>
      <div className="flex items-start justify-between gap-1">
        <span className="text-[12px] font-medium uppercase tracking-[0.06em] text-ink-3">
          {spec.label}
        </span>
        {cls.pill === 'HIGH' && <Pill variant="alert">HIGH</Pill>}
        {cls.pill === 'LOW' && <Pill variant="warn">LOW</Pill>}
      </div>
      <div className="flex items-baseline gap-1">
        <span className={`font-mono text-[30px] font-medium leading-none tabular-nums ${number}`}>
          {spec.value}
        </span>
        {spec.unit && <span className="text-[12px] text-ink-3">{spec.unit}</span>}
      </div>
      <div className={statusText(cls.status)}>
        <Sparkline values={spec.series} />
      </div>
    </div>
  );
}

export function VitalsStrip({
  state,
  history,
}: {
  state: SimulationState;
  history: RunSnapshot[];
}): React.JSX.Element {
  const { displayTemp, tempUnit } = useUnits();
  const r = state.resources;
  const water = r.water;
  const capacity = state.tank.capacity;
  const ammoniaPpm = getPpm(r.ammonia, water);
  const nitritePpm = getPpm(r.nitrite, water);
  const nitratePpm = getPpm(r.nitrate, water);
  const waterPct = capacity > 0 ? (water / capacity) * 100 : 0;

  const specs: VitalSpec[] = [
    { key: 'ammonia', label: 'NH₃', unit: 'ppm', value: ammoniaPpm.toFixed(3), classifyValue: ammoniaPpm, series: history.map((s) => s.ammonia) },
    { key: 'nitrite', label: 'NO₂', unit: 'ppm', value: nitritePpm.toFixed(3), classifyValue: nitritePpm, series: history.map((s) => s.nitrite) },
    { key: 'nitrate', label: 'NO₃', unit: 'ppm', value: nitratePpm.toFixed(1), classifyValue: nitratePpm, series: history.map((s) => s.nitrate) },
    { key: 'ph', label: 'pH', unit: '', value: r.ph.toFixed(2), classifyValue: r.ph, series: history.map((s) => s.ph) },
    { key: 'oxygen', label: 'O₂', unit: 'mg/L', value: r.oxygen.toFixed(1), classifyValue: r.oxygen, series: history.map((s) => s.oxygen) },
    { key: 'co2', label: 'CO₂', unit: 'mg/L', value: r.co2.toFixed(1), classifyValue: r.co2, series: history.map((s) => s.co2) },
    { key: 'temperature', label: 'Temp', unit: tempUnit, value: displayTemp(r.temperature).toFixed(1), classifyValue: r.temperature, series: history.map((s) => s.temperature) },
    { key: 'water', label: 'Water', unit: '%', value: Math.round(waterPct).toString(), classifyValue: waterPct, series: history.map((s) => s.waterPct) },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8 lg:gap-3">
      {specs.map((spec) => (
        <VitalTile key={spec.key} spec={spec} />
      ))}
    </div>
  );
}
