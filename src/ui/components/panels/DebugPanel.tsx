import React, { useState } from 'react';
import { ChevronDown, ChevronRight, RotateCcw, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { useConfig } from '../../hooks/useConfig';
import {
  type TunableConfig,
  configRange,
  decayConfigMeta,
  nitrogenCycleConfigMeta,
  gasExchangeConfigMeta,
  temperatureConfigMeta,
  evaporationConfigMeta,
  algaeVitalityConfigMeta,
  opticsConfigMeta,
  phConfigMeta,
  plantsConfigMeta,
  nutrientsConfigMeta,
} from '../../../simulation/config/index.js';

interface ConfigInputProps {
  label: string;
  path: string;
  value: number;
  onChange: (value: number) => void;
  step: number;
  unit: string;
  isModified: boolean;
}

function ConfigInput({
  label,
  path,
  value,
  onChange,
  step,
  unit,
  isModified,
}: ConfigInputProps): React.JSX.Element {
  const range = configRange(path);
  const [localValue, setLocalValue] = useState(String(value));

  React.useEffect(() => {
    setLocalValue(String(value));
  }, [value]);

  // Typing walks through states the range refuses — "0.0" on the way to
  // "0.05" — so an out-of-range value holds the field without reaching the
  // config, and blur settles it rather than clamping mid-keystroke.
  const handleChange: React.ChangeEventHandler<globalThis.HTMLInputElement> = (e) => {
    setLocalValue(e.target.value);
    const parsed = parseFloat(e.target.value);
    if (!Number.isFinite(parsed)) return;
    if (range && (parsed < range.min || parsed > range.max)) return;
    onChange(parsed);
  };

  const handleBlur = (): void => {
    const parsed = parseFloat(localValue);
    if (!Number.isFinite(parsed)) {
      setLocalValue(String(value));
      return;
    }
    if (!range) return;
    const clamped = Math.min(range.max, Math.max(range.min, parsed));
    if (clamped === parsed) return;
    setLocalValue(String(clamped));
    onChange(clamped);
  };

  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <label
        htmlFor={path}
        className={`text-xs ${isModified ? 'text-yellow-400' : 'text-gray-400'}`}
      >
        {label}
        {unit && <span className="text-gray-500 ml-1">({unit})</span>}
      </label>
      <input
        id={path}
        type="number"
        value={localValue}
        onChange={handleChange}
        onBlur={handleBlur}
        step={step}
        min={range?.min}
        max={range?.max}
        className={`w-24 px-2 py-1 text-xs text-right rounded border ${
          isModified
            ? 'bg-yellow-400/10 border-yellow-400/30 text-yellow-400'
            : 'bg-background border-border text-gray-200'
        } focus:outline-none focus:ring-1 focus:ring-accent-blue`}
      />
    </div>
  );
}

interface ConfigSectionProps {
  title: string;
  isExpanded: boolean;
  onToggle: () => void;
  onReset: () => void;
  isModified: boolean;
  children: React.ReactNode;
}

function ConfigSection({
  title,
  isExpanded,
  onToggle,
  onReset,
  isModified,
  children,
}: ConfigSectionProps): React.JSX.Element {
  return (
    <div className="border-b border-border last:border-b-0">
      <div
        className="flex items-center justify-between py-2 cursor-pointer hover:bg-background/50"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-500" />
          )}
          <span className={`text-sm font-medium ${isModified ? 'text-yellow-400' : 'text-gray-300'}`}>
            {title}
          </span>
          {isModified && <span className="w-2 h-2 rounded-full bg-yellow-400" />}
        </div>
        <Button
          variant="secondary"
          className="text-xs px-2 py-0.5"
          onClick={(e) => {
            e.stopPropagation();
            onReset();
          }}
          disabled={!isModified}
        >
          Reset
        </Button>
      </div>
      {isExpanded && <div className="pb-2 pl-6">{children}</div>}
    </div>
  );
}

export function DebugPanel(): React.JSX.Element | null {
  const {
    config,
    updateConfig,
    resetConfig,
    resetSection,
    isValueModified,
    isSectionModified,
    isAnyModified,
    isDebugPanelOpen,
    setDebugPanelOpen,
  } = useConfig();

  const [expandedSections, setExpandedSections] = useState<Set<keyof TunableConfig>>(
    new Set(['decay'])
  );

  if (!isDebugPanelOpen) {
    return null;
  }

  const toggleSection = (section: keyof TunableConfig): void => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  return (
    <div className="fixed right-4 top-20 w-80 max-h-[calc(100vh-6rem)] bg-panel rounded-lg border border-border shadow-xl z-50 flex flex-col">
      <div className="flex items-center justify-between p-3 border-b border-border">
        <h3 className="text-sm font-semibold text-gray-300">Debug: Simulation Constants</h3>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            className="text-xs px-2 py-0.5 flex items-center gap-1"
            onClick={resetConfig}
            disabled={!isAnyModified}
          >
            <RotateCcw className="w-3 h-3" />
            Reset All
          </Button>
          <button
            onClick={() => setDebugPanelOpen(false)}
            className="p-1 text-gray-500 hover:text-gray-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="overflow-y-auto flex-1 p-2">
        {/* Decay Section */}
        <ConfigSection
          title="Decay"
          isExpanded={expandedSections.has('decay')}
          onToggle={() => toggleSection('decay')}
          onReset={() => resetSection('decay')}
          isModified={isSectionModified('decay')}
        >
          {decayConfigMeta.map((meta) => (
            <ConfigInput
              key={meta.key}
              label={meta.label}
              path={`decay.${meta.key}`}
              value={config.decay[meta.key]}
              onChange={(value) => updateConfig('decay', meta.key, value)}
              step={meta.step}
              unit={meta.unit}
              isModified={isValueModified('decay', meta.key)}
            />
          ))}
        </ConfigSection>

        {/* Nitrogen Cycle Section */}
        <ConfigSection
          title="Nitrogen Cycle"
          isExpanded={expandedSections.has('nitrogenCycle')}
          onToggle={() => toggleSection('nitrogenCycle')}
          onReset={() => resetSection('nitrogenCycle')}
          isModified={isSectionModified('nitrogenCycle')}
        >
          {nitrogenCycleConfigMeta.map((meta) => (
            <ConfigInput
              key={meta.key}
              label={meta.label}
              path={`nitrogenCycle.${meta.key}`}
              value={config.nitrogenCycle[meta.key]}
              onChange={(value) => updateConfig('nitrogenCycle', meta.key, value)}
              step={meta.step}
              unit={meta.unit}
              isModified={isValueModified('nitrogenCycle', meta.key)}
            />
          ))}
        </ConfigSection>

        {/* Gas Exchange Section */}
        <ConfigSection
          title="Gas Exchange"
          isExpanded={expandedSections.has('gasExchange')}
          onToggle={() => toggleSection('gasExchange')}
          onReset={() => resetSection('gasExchange')}
          isModified={isSectionModified('gasExchange')}
        >
          {gasExchangeConfigMeta.map((meta) => (
            <ConfigInput
              key={meta.key}
              label={meta.label}
              path={`gasExchange.${meta.key}`}
              value={config.gasExchange[meta.key]}
              onChange={(value) => updateConfig('gasExchange', meta.key, value)}
              step={meta.step}
              unit={meta.unit}
              isModified={isValueModified('gasExchange', meta.key)}
            />
          ))}
        </ConfigSection>

        {/* Temperature Section */}
        <ConfigSection
          title="Temperature"
          isExpanded={expandedSections.has('temperature')}
          onToggle={() => toggleSection('temperature')}
          onReset={() => resetSection('temperature')}
          isModified={isSectionModified('temperature')}
        >
          {temperatureConfigMeta.map((meta) => (
            <ConfigInput
              key={meta.key}
              label={meta.label}
              path={`temperature.${meta.key}`}
              value={config.temperature[meta.key]}
              onChange={(value) => updateConfig('temperature', meta.key, value)}
              step={meta.step}
              unit={meta.unit}
              isModified={isValueModified('temperature', meta.key)}
            />
          ))}
        </ConfigSection>

        {/* Evaporation Section */}
        <ConfigSection
          title="Evaporation"
          isExpanded={expandedSections.has('evaporation')}
          onToggle={() => toggleSection('evaporation')}
          onReset={() => resetSection('evaporation')}
          isModified={isSectionModified('evaporation')}
        >
          {evaporationConfigMeta.map((meta) => (
            <ConfigInput
              key={meta.key}
              label={meta.label}
              path={`evaporation.${meta.key}`}
              value={config.evaporation[meta.key]}
              onChange={(value) => updateConfig('evaporation', meta.key, value)}
              step={meta.step}
              unit={meta.unit}
              isModified={isValueModified('evaporation', meta.key)}
            />
          ))}
        </ConfigSection>

        {/* Algae Section */}
        <ConfigSection
          title="Algae"
          isExpanded={expandedSections.has('algae')}
          onToggle={() => toggleSection('algae')}
          onReset={() => resetSection('algae')}
          isModified={isSectionModified('algae')}
        >
          {algaeVitalityConfigMeta.map((meta) => (
            <ConfigInput
              key={meta.key}
              label={meta.label}
              path={`algae.${meta.key}`}
              value={config.algae[meta.key]}
              onChange={(value) => updateConfig('algae', meta.key, value)}
              step={meta.step}
              unit={meta.unit}
              isModified={isValueModified('algae', meta.key)}
            />
          ))}
        </ConfigSection>

        {/* Water Optics Section */}
        <ConfigSection
          title="Water Optics"
          isExpanded={expandedSections.has('optics')}
          onToggle={() => toggleSection('optics')}
          onReset={() => resetSection('optics')}
          isModified={isSectionModified('optics')}
        >
          {opticsConfigMeta.map((meta) => (
            <ConfigInput
              key={meta.key}
              label={meta.label}
              path={`optics.${meta.key}`}
              value={config.optics[meta.key]}
              onChange={(value) => updateConfig('optics', meta.key, value)}
              step={meta.step}
              unit={meta.unit}
              isModified={isValueModified('optics', meta.key)}
            />
          ))}
        </ConfigSection>

        {/* pH Section */}
        <ConfigSection
          title="pH Drift"
          isExpanded={expandedSections.has('ph')}
          onToggle={() => toggleSection('ph')}
          onReset={() => resetSection('ph')}
          isModified={isSectionModified('ph')}
        >
          {phConfigMeta.map((meta) => (
            <ConfigInput
              key={meta.key}
              label={meta.label}
              path={`ph.${meta.key}`}
              value={config.ph[meta.key]}
              onChange={(value) => updateConfig('ph', meta.key, value)}
              step={meta.step}
              unit={meta.unit}
              isModified={isValueModified('ph', meta.key)}
            />
          ))}
        </ConfigSection>

        {/* Plants Section */}
        <ConfigSection
          title="Plants"
          isExpanded={expandedSections.has('plants')}
          onToggle={() => toggleSection('plants')}
          onReset={() => resetSection('plants')}
          isModified={isSectionModified('plants')}
        >
          {plantsConfigMeta.map((meta) => (
            <ConfigInput
              key={meta.key}
              label={meta.label}
              path={`plants.${meta.key}`}
              value={config.plants[meta.key]}
              onChange={(value) => updateConfig('plants', meta.key, value)}
              step={meta.step}
              unit={meta.unit}
              isModified={isValueModified('plants', meta.key)}
            />
          ))}
        </ConfigSection>

        {/* Nutrients Section */}
        <ConfigSection
          title="Nutrients"
          isExpanded={expandedSections.has('nutrients')}
          onToggle={() => toggleSection('nutrients')}
          onReset={() => resetSection('nutrients')}
          isModified={isSectionModified('nutrients')}
        >
          {nutrientsConfigMeta.map((meta) => (
            <ConfigInput
              key={meta.key}
              label={meta.label}
              path={`nutrients.${meta.key}`}
              value={config.nutrients[meta.key] as number}
              onChange={(value) => updateConfig('nutrients', meta.key, value)}
              step={meta.step}
              unit={meta.unit}
              isModified={isValueModified('nutrients', meta.key)}
            />
          ))}
        </ConfigSection>
      </div>
    </div>
  );
}
