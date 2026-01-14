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
  surface: number;
  water: number;
}

/** Q10 temperature coefficient (rate doubles every 10°C) */
const Q10 = 2.0;
/** Reference temperature for decay rate (°C) */
const REFERENCE_TEMP = 25.0;
/** Base decay rate at reference temperature (fraction per hour) */
const BASE_DECAY_RATE = 0.05;
/** Waste conversion rate to ammonia */
const WASTE_CONVERSION_RATE = 0.3;
/** Bacteria processing rate (ppm per unit per tick) */
const BACTERIA_PROCESSING_RATE = 0.000002;
/** Max bacteria per cm² surface */
const BACTERIA_PER_CM2 = 0.01;

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
 * Get color class for ammonia level.
 */
function getAmmoniaColor(ammonia: number): string {
  if (ammonia === 0) return 'text-green-400';
  if (ammonia <= 0.02) return 'text-green-400';
  if (ammonia <= 0.05) return 'text-yellow-400';
  if (ammonia <= 0.1) return 'text-orange-400';
  return 'text-red-400';
}

/**
 * Get color class for nitrite level.
 */
function getNitriteColor(nitrite: number): string {
  if (nitrite === 0) return 'text-green-400';
  if (nitrite <= 0.1) return 'text-green-400';
  if (nitrite <= 0.5) return 'text-yellow-400';
  if (nitrite <= 1.0) return 'text-orange-400';
  return 'text-red-400';
}

/**
 * Get color class for nitrate level.
 */
function getNitrateColor(nitrate: number): string {
  if (nitrate < 20) return 'text-green-400';
  if (nitrate <= 40) return 'text-yellow-400';
  if (nitrate <= 80) return 'text-orange-400';
  return 'text-red-400';
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
  surface,
  water,
}: WaterChemistryProps): React.JSX.Element {
  const [isWasteExpanded, setIsWasteExpanded] = useState(false);
  const [isNitrogenExpanded, setIsNitrogenExpanded] = useState(false);

  const decayRate = getCurrentDecayRate(food, temperature);
  const totalRate = decayRate + ambientWaste;
  const tempFactor = getTemperatureFactor(temperature);

  // Calculate nitrogen cycle rates
  const wasteToAmmoniaRate = waste * WASTE_CONVERSION_RATE * (1 / water);
  const ammoniaToNitriteRate = aob * BACTERIA_PROCESSING_RATE;
  const nitriteToNitrateRate = nob * BACTERIA_PROCESSING_RATE;
  const maxBacteria = surface * BACTERIA_PER_CM2;

  return (
    <Panel title="Water Chemistry">
      <div className="space-y-3">
        {/* Nitrogen Cycle Parameters */}
        <div>
          <button
            onClick={() => setIsNitrogenExpanded(!isNitrogenExpanded)}
            className="w-full flex items-center justify-between hover:bg-gray-700/50 rounded px-1 py-0.5 -mx-1 transition-colors"
          >
            <span className="text-sm text-gray-300 flex items-center gap-1">
              <span
                className={`text-xs transition-transform ${isNitrogenExpanded ? 'rotate-90' : ''}`}
              >
                ▶
              </span>
              Nitrogen Cycle
            </span>
          </button>

          {/* Always show key parameters */}
          <div className="mt-2 space-y-1">
            {/* Ammonia */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Ammonia (NH₃)</span>
              <span className={`text-sm font-medium ${getAmmoniaColor(ammonia)}`}>
                {ammonia.toFixed(3)} ppm
              </span>
            </div>

            {/* Nitrite */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Nitrite (NO₂)</span>
              <span className={`text-sm font-medium ${getNitriteColor(nitrite)}`}>
                {nitrite.toFixed(3)} ppm
              </span>
            </div>

            {/* Nitrate */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Nitrate (NO₃)</span>
              <span className={`text-sm font-medium ${getNitrateColor(nitrate)}`}>
                {nitrate.toFixed(1)} ppm
              </span>
            </div>
          </div>

          {/* Expanded bacteria details */}
          {isNitrogenExpanded && (
            <div className="mt-2 ml-4 pl-2 border-l border-gray-600 space-y-2">
              {/* Bacteria populations */}
              <div className="text-xs text-gray-400 font-medium mt-2">Bacteria</div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">AOB (ammonia→nitrite)</span>
                <span className="text-xs text-gray-300">
                  {Math.round(aob)} / {Math.round(maxBacteria)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">NOB (nitrite→nitrate)</span>
                <span className="text-xs text-gray-300">
                  {Math.round(nob)} / {Math.round(maxBacteria)}
                </span>
              </div>

              {/* Conversion rates */}
              <div className="text-xs text-gray-400 font-medium mt-2 pt-2 border-t border-gray-700">
                Conversion Rates (per hour)
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Waste → Ammonia</span>
                <span className="text-xs text-gray-300">
                  {wasteToAmmoniaRate > 0 ? `+${wasteToAmmoniaRate.toFixed(4)} ppm` : '0 ppm'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Ammonia → Nitrite</span>
                <span className="text-xs text-gray-300">
                  {aob > 0 ? `${Math.min(ammoniaToNitriteRate, ammonia).toFixed(4)} ppm` : '0 ppm'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Nitrite → Nitrate</span>
                <span className="text-xs text-gray-300">
                  {nob > 0 ? `${Math.min(nitriteToNitrateRate, nitrite).toFixed(4)} ppm` : '0 ppm'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Waste - clickable to expand */}
        <div>
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
                Production rate: {totalRate.toFixed(3)} g/hr
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
                    {ambientWaste.toFixed(3)} g/hr
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
