import React, { useState } from 'react';
import { Panel } from '../layout/Panel';
import { useConfig } from '../../hooks/useConfig';
import { getTemperatureFactor } from '../../../simulation/systems/decay';
import { getPpm } from '../../../simulation/resources';

interface WaterChemistryProps {
  waste: number;
  food: number;
  temperature: number;
  ammonia: number; // Mass in mg
  nitrite: number; // Mass in mg
  nitrate: number; // Mass in mg
  oxygen: number; // Concentration in mg/L
  co2: number; // Concentration in mg/L
  ph: number; // pH value (0-14 scale)
  aob: number;
  nob: number;
  surface: number;
  water: number;
}

/**
 * Calculate current decay rate (g/hour) based on food and temperature.
 */
function getCurrentDecayRate(
  food: number,
  temperature: number,
  baseDecayRate: number,
  decayConfig: { q10: number; referenceTemp: number }
): number {
  if (food <= 0) return 0;
  const tempFactor = getTemperatureFactor(temperature, decayConfig);
  return food * baseDecayRate * tempFactor;
}

function getAmmoniaColor(ammoniaPpm: number): string {
  if (ammoniaPpm === 0) return 'text-green-400';
  if (ammoniaPpm <= 0.02) return 'text-green-400';
  if (ammoniaPpm <= 0.05) return 'text-yellow-400';
  if (ammoniaPpm <= 0.1) return 'text-orange-400';
  return 'text-red-400';
}

function getNitriteColor(nitritePpm: number): string {
  if (nitritePpm === 0) return 'text-green-400';
  if (nitritePpm <= 0.1) return 'text-green-400';
  if (nitritePpm <= 0.5) return 'text-yellow-400';
  if (nitritePpm <= 1.0) return 'text-orange-400';
  return 'text-red-400';
}

function getNitrateColor(nitratePpm: number): string {
  if (nitratePpm < 20) return 'text-green-400';
  if (nitratePpm <= 40) return 'text-yellow-400';
  if (nitratePpm <= 80) return 'text-orange-400';
  return 'text-red-400';
}

/**
 * Get O2 color based on concentration (mg/L).
 * Green (> 6): healthy, Yellow (4-6): stressed, Red (< 4): critical
 */
function getOxygenColor(oxygenMgL: number): string {
  if (oxygenMgL >= 6) return 'text-green-400';
  if (oxygenMgL >= 4) return 'text-yellow-400';
  return 'text-red-400';
}

/**
 * Get CO2 color using drop checker spectrum.
 * Blue (< 10): low CO2, Green (10-30): optimal, Yellow (> 30): high/harmful
 */
function getCo2Color(co2MgL: number): string {
  if (co2MgL < 10) return 'text-blue-400';
  if (co2MgL <= 30) return 'text-green-400';
  return 'text-yellow-400';
}

/**
 * Get pH color based on value.
 * Blue (< 6.5): acidic, Green (6.5-7.5): neutral/ideal, Purple (> 7.5): alkaline
 */
function getPhColor(ph: number): string {
  if (ph < 6.5) return 'text-blue-400';
  if (ph <= 7.5) return 'text-green-400';
  return 'text-purple-400';
}

export function WaterChemistry({
  waste,
  food,
  temperature,
  ammonia, // mg
  nitrite, // mg
  nitrate, // mg
  oxygen, // mg/L
  co2, // mg/L
  ph, // pH value
  aob,
  nob,
  surface,
  water,
}: WaterChemistryProps): React.JSX.Element {
  const [isWasteExpanded, setIsWasteExpanded] = useState(false);
  const [isNitrogenExpanded, setIsNitrogenExpanded] = useState(false);
  const { config } = useConfig();

  // Extract config values
  const { decay: decayConfig, nitrogenCycle: ncConfig } = config;

  const decayRate = getCurrentDecayRate(food, temperature, decayConfig.baseDecayRate, decayConfig);
  const totalRate = decayRate + decayConfig.ambientWaste;
  const tempFactor = getTemperatureFactor(temperature, decayConfig);

  // Derive ppm from mass for display
  const ammoniaPpm = getPpm(ammonia, water);
  const nitritePpm = getPpm(nitrite, water);
  const nitratePpm = getPpm(nitrate, water);

  // Calculate nitrogen cycle rates (as ppm for display)
  // Waste -> Ammonia produces mg, convert to ppm for display
  const wasteToAmmoniaMassRate = waste * ncConfig.wasteConversionRate * ncConfig.wasteToAmmoniaRatio;
  const wasteToAmmoniaPpmRate = water > 0 ? wasteToAmmoniaMassRate / water : 0;
  // Bacteria processing (ppm per tick, rate is still expressed as ppm processed)
  const ammoniaToNitritePpmRate = aob * ncConfig.bacteriaProcessingRate;
  const nitriteToNitratePpmRate = nob * ncConfig.bacteriaProcessingRate;
  const maxBacteria = surface * ncConfig.bacteriaPerCm2;

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
              <span className={`text-sm font-medium ${getAmmoniaColor(ammoniaPpm)}`}>
                {ammoniaPpm.toFixed(3)} ppm
              </span>
            </div>

            {/* Nitrite */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Nitrite (NO₂)</span>
              <span className={`text-sm font-medium ${getNitriteColor(nitritePpm)}`}>
                {nitritePpm.toFixed(3)} ppm
              </span>
            </div>

            {/* Nitrate */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Nitrate (NO₃)</span>
              <span className={`text-sm font-medium ${getNitrateColor(nitratePpm)}`}>
                {nitratePpm.toFixed(1)} ppm
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
                  {wasteToAmmoniaPpmRate > 0 ? `+${wasteToAmmoniaPpmRate.toFixed(4)} ppm` : '0 ppm'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Ammonia → Nitrite</span>
                <span className="text-xs text-gray-300">
                  {aob > 0 ? `${Math.min(ammoniaToNitritePpmRate, ammoniaPpm).toFixed(4)} ppm` : '0 ppm'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Nitrite → Nitrate</span>
                <span className="text-xs text-gray-300">
                  {nob > 0 ? `${Math.min(nitriteToNitratePpmRate, nitritePpm).toFixed(4)} ppm` : '0 ppm'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Dissolved Gases */}
        <div>
          <div className="text-sm text-gray-300 mb-2">Dissolved Gases</div>
          <div className="space-y-1">
            {/* Oxygen */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Oxygen (O₂)</span>
              <span className={`text-sm font-medium ${getOxygenColor(oxygen)}`}>
                {oxygen.toFixed(1)} mg/L
              </span>
            </div>

            {/* CO2 */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">CO₂</span>
              <span className={`text-sm font-medium ${getCo2Color(co2)}`}>
                {co2.toFixed(1)} mg/L
              </span>
            </div>
          </div>
        </div>

        {/* pH */}
        <div>
          <div className="text-sm text-gray-300 mb-2">pH</div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">Current pH</span>
            <span className={`text-sm font-medium ${getPhColor(ph)}`}>
              {ph.toFixed(2)}
            </span>
          </div>
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
                      {food.toFixed(2)}g food × {(decayConfig.baseDecayRate * 100).toFixed(0)}%/hr × {tempFactor.toFixed(2)} temp
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
                    {decayConfig.ambientWaste.toFixed(3)} g/hr
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
