import React, { useState } from 'react';
import { Panel } from '../layout/Panel';

interface WaterChemistryProps {
  waste: number;
  food: number;
  temperature: number;
  ambientWaste: number;
  ammonia: number;
  nitrite: number;
  nitrate: number;
  aob: number;
  nob: number;
}

/** Q10 temperature coefficient (rate doubles every 10°C) */
const Q10 = 2.0;
/** Reference temperature for decay rate (°C) */
const REFERENCE_TEMP = 25.0;
/** Base decay rate at reference temperature (fraction per hour) */
const BASE_DECAY_RATE = 0.05;

// Nitrogen cycle thresholds for color coding
const AMMONIA_STRESS = 0.02;
const AMMONIA_DANGER = 0.1;

const NITRITE_STRESS = 0.1;
const NITRITE_DANGER = 1;

const NITRATE_SAFE = 20;
const NITRATE_STRESS = 40;
const NITRATE_DANGER = 80;

type StatusLevel = 'safe' | 'stress' | 'danger';

/**
 * Calculate temperature factor for decay rate using Q10 coefficient.
 */
function getTemperatureFactor(temperature: number): number {
  const tempDiff = temperature - REFERENCE_TEMP;
  return Math.pow(Q10, tempDiff / 10.0);
}

/**
 * Calculate current decay rate (g/hour) based on food and temperature.
 */
function getCurrentDecayRate(food: number, temperature: number): number {
  if (food <= 0) return 0;
  const tempFactor = getTemperatureFactor(temperature);
  return food * BASE_DECAY_RATE * tempFactor;
}

/**
 * Get status level for ammonia.
 */
function getAmmoniaStatus(value: number): StatusLevel {
  if (value > AMMONIA_DANGER) return 'danger';
  if (value > AMMONIA_STRESS) return 'stress';
  return 'safe';
}

/**
 * Get status level for nitrite.
 */
function getNitriteStatus(value: number): StatusLevel {
  if (value > NITRITE_DANGER) return 'danger';
  if (value > NITRITE_STRESS) return 'stress';
  return 'safe';
}

/**
 * Get status level for nitrate.
 */
function getNitrateStatus(value: number): StatusLevel {
  if (value > NITRATE_DANGER) return 'danger';
  if (value > NITRATE_STRESS) return 'stress';
  if (value > NITRATE_SAFE) return 'stress';
  return 'safe';
}

/**
 * Get CSS classes for status indicator.
 */
function getStatusClasses(status: StatusLevel): string {
  switch (status) {
    case 'danger':
      return 'bg-red-500';
    case 'stress':
      return 'bg-yellow-500';
    case 'safe':
      return 'bg-green-500';
  }
}

/**
 * Format bacteria population for display.
 */
function formatBacteria(value: number): string {
  if (value === 0) return '0';
  if (value < 0.001) return value.toExponential(1);
  if (value < 1) return value.toFixed(3);
  if (value < 100) return value.toFixed(2);
  if (value < 10000) return value.toFixed(0);
  return `${(value / 1000).toFixed(1)}k`;
}

interface ChemicalRowProps {
  label: string;
  value: number;
  unit: string;
  precision: number;
  status: StatusLevel;
}

function ChemicalRow({ label, value, unit, precision, status }: ChemicalRowProps): React.JSX.Element {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-300 flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${getStatusClasses(status)}`} />
        {label}
      </span>
      <span className="text-sm text-gray-200">
        {value.toFixed(precision)} {unit}
      </span>
    </div>
  );
}

export function WaterChemistry({
  waste,
  food,
  temperature,
  ambientWaste,
  ammonia,
  nitrite,
  nitrate,
  aob,
  nob,
}: WaterChemistryProps): React.JSX.Element {
  const [isWasteExpanded, setIsWasteExpanded] = useState(false);
  const [isBacteriaExpanded, setIsBacteriaExpanded] = useState(false);

  const decayRate = getCurrentDecayRate(food, temperature);
  const totalRate = decayRate + ambientWaste;
  const tempFactor = getTemperatureFactor(temperature);

  const ammoniaStatus = getAmmoniaStatus(ammonia);
  const nitriteStatus = getNitriteStatus(nitrite);
  const nitrateStatus = getNitrateStatus(nitrate);

  return (
    <Panel title="Water Chemistry">
      <div className="space-y-3">
        {/* Nitrogen Cycle Parameters */}
        <div className="space-y-2">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-2">
            Nitrogen Cycle
          </div>
          <ChemicalRow
            label="Ammonia (NH3)"
            value={ammonia}
            unit="ppm"
            precision={3}
            status={ammoniaStatus}
          />
          <ChemicalRow
            label="Nitrite (NO2)"
            value={nitrite}
            unit="ppm"
            precision={3}
            status={nitriteStatus}
          />
          <ChemicalRow
            label="Nitrate (NO3)"
            value={nitrate}
            unit="ppm"
            precision={1}
            status={nitrateStatus}
          />
        </div>

        {/* Bacteria - expandable */}
        <div className="pt-2 border-t border-gray-700">
          <button
            onClick={() => setIsBacteriaExpanded(!isBacteriaExpanded)}
            className="w-full flex items-center justify-between hover:bg-gray-700/50 rounded px-1 py-0.5 -mx-1 transition-colors"
          >
            <span className="text-sm text-gray-300 flex items-center gap-1">
              <span
                className={`text-xs transition-transform ${isBacteriaExpanded ? 'rotate-90' : ''}`}
              >
                ▶
              </span>
              Bacteria
            </span>
            <span className="text-xs text-gray-400">
              {aob > 0 || nob > 0 ? 'Active' : 'None'}
            </span>
          </button>

          {isBacteriaExpanded && (
            <div className="mt-2 ml-4 pl-2 border-l border-gray-600 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">AOB (Ammonia → Nitrite)</span>
                <span className="text-xs text-gray-300">{formatBacteria(aob)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">NOB (Nitrite → Nitrate)</span>
                <span className="text-xs text-gray-300">{formatBacteria(nob)}</span>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Bacteria grow on filter media and substrate
              </div>
            </div>
          )}
        </div>

        {/* Waste - expandable */}
        <div className="pt-2 border-t border-gray-700">
          <button
            onClick={() => setIsWasteExpanded(!isWasteExpanded)}
            className="w-full flex items-center justify-between hover:bg-gray-700/50 rounded px-1 py-0.5 -mx-1 transition-colors"
          >
            <span className="text-sm text-gray-300 flex items-center gap-1">
              <span
                className={`text-xs transition-transform ${isWasteExpanded ? 'rotate-90' : ''}`}
              >
                ▶
              </span>
              Waste
            </span>
            <span className="text-sm text-gray-200">{waste.toFixed(2)}g</span>
          </button>

          {/* Expanded breakdown */}
          {isWasteExpanded && (
            <div className="mt-2 ml-4 pl-2 border-l border-gray-600 space-y-2">
              <div className="text-xs text-gray-400 mb-2">
                Production rate: {totalRate.toFixed(4)} g/hr
              </div>

              {/* Decay source */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">Food decay</span>
                  <span className="text-xs text-gray-300">
                    {decayRate.toFixed(3)} g/hr
                  </span>
                </div>
                <div className="text-xs text-gray-500 ml-2">
                  {food > 0 ? (
                    <>
                      {food.toFixed(2)}g food × {(BASE_DECAY_RATE * 100).toFixed(0)}%/hr × {tempFactor.toFixed(2)} temp
                    </>
                  ) : (
                    'No food available'
                  )}
                </div>
              </div>

              {/* Ambient source */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">Ambient</span>
                  <span className="text-xs text-gray-300">
                    {ambientWaste.toFixed(4)} g/hr
                  </span>
                </div>
                <div className="text-xs text-gray-500 ml-2">
                  Dust, debris, organic matter
                </div>
              </div>

              {/* Temperature info */}
              <div className="mt-2 pt-2 border-t border-gray-700">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Temp factor</span>
                  <span className="text-xs text-gray-400">
                    {tempFactor.toFixed(2)}× at {temperature.toFixed(1)}°C
                  </span>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Q10=2: rate doubles per 10°C above 25°C
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}
