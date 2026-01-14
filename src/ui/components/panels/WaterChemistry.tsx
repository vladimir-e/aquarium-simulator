import React, { useState } from 'react';
import { Panel } from '../layout/Panel';
import { WasteResource, FoodResource } from '../../../simulation/resources/index.js';

interface WaterChemistryProps {
  waste: number;
  food: number;
  temperature: number;
  ambientWaste: number;
}

/** Q10 temperature coefficient (rate doubles every 10°C) */
const Q10 = 2.0;
/** Reference temperature for decay rate (°C) */
const REFERENCE_TEMP = 25.0;
/** Base decay rate at reference temperature (fraction per hour) */
const BASE_DECAY_RATE = 0.05;

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

export function WaterChemistry({
  waste,
  food,
  temperature,
  ambientWaste,
}: WaterChemistryProps): React.JSX.Element {
  const [isExpanded, setIsExpanded] = useState(false);

  const decayRate = getCurrentDecayRate(food, temperature);
  const totalRate = decayRate + ambientWaste;
  const tempFactor = getTemperatureFactor(temperature);

  return (
    <Panel title="Water Chemistry">
      <div className="space-y-3">
        {/* Waste - clickable to expand */}
        <div>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full flex items-center justify-between hover:bg-gray-700/50 rounded px-1 py-0.5 -mx-1 transition-colors"
          >
            <span className="text-sm text-gray-300 flex items-center gap-1">
              <span
                className={`text-xs transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              >
                ▶
              </span>
              Waste
            </span>
            <span className="text-sm text-gray-200">{WasteResource.format(waste)}</span>
          </button>

          {/* Expanded breakdown */}
          {isExpanded && (
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
                      {FoodResource.format(food)} food × {(BASE_DECAY_RATE * 100).toFixed(0)}%/hr × {tempFactor.toFixed(2)} temp
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

        <div className="text-xs text-gray-400 italic">
          More parameters coming soon...
        </div>
      </div>
    </Panel>
  );
}
