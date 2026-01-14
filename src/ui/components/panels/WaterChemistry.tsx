import React, { useState } from 'react';
import { Panel } from '../layout/Panel';

interface WaterChemistryProps {
  waste: number;
  food: number;
  temperature: number;
  ambientWaste: number;
  // Nitrogen cycle values (in grams)
  ammonia: number;
  nitrite: number;
  nitrate: number;
  // Tank volume for ppm conversion
  waterLevel: number;
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

/**
 * Convert grams to ppm for display.
 */
function gramsToPpm(grams: number, liters: number): number {
  if (liters <= 0) return 0;
  return (grams / liters) * 1000;
}

/**
 * Get color class based on ammonia level (ppm).
 * Green: 0, Yellow: >0.02, Red: >0.1
 */
function getAmmoniaColor(ppm: number): string {
  if (ppm > 0.1) return 'text-red-400';
  if (ppm > 0.02) return 'text-yellow-400';
  return 'text-green-400';
}

/**
 * Get background color class based on ammonia level (ppm).
 */
function getAmmoniaBgColor(ppm: number): string {
  if (ppm > 0.1) return 'bg-red-500/20';
  if (ppm > 0.02) return 'bg-yellow-500/20';
  return 'bg-green-500/20';
}

/**
 * Get color class based on nitrite level (ppm).
 * Green: 0, Yellow: >0.1, Red: >1
 */
function getNitriteColor(ppm: number): string {
  if (ppm > 1) return 'text-red-400';
  if (ppm > 0.1) return 'text-yellow-400';
  return 'text-green-400';
}

/**
 * Get background color class based on nitrite level (ppm).
 */
function getNitriteBgColor(ppm: number): string {
  if (ppm > 1) return 'bg-red-500/20';
  if (ppm > 0.1) return 'bg-yellow-500/20';
  return 'bg-green-500/20';
}

/**
 * Get color class based on nitrate level (ppm).
 * Green: <20, Yellow: 20-80, Red: >80
 */
function getNitrateColor(ppm: number): string {
  if (ppm > 80) return 'text-red-400';
  if (ppm > 20) return 'text-yellow-400';
  return 'text-green-400';
}

/**
 * Get background color class based on nitrate level (ppm).
 */
function getNitrateBgColor(ppm: number): string {
  if (ppm > 80) return 'bg-red-500/20';
  if (ppm > 20) return 'bg-yellow-500/20';
  return 'bg-green-500/20';
}

/**
 * Get status label for ammonia level.
 */
function getAmmoniaStatus(ppm: number): string {
  if (ppm > 0.1) return 'DANGER';
  if (ppm > 0.02) return 'STRESS';
  return 'SAFE';
}

/**
 * Get status label for nitrite level.
 */
function getNitriteStatus(ppm: number): string {
  if (ppm > 1) return 'DANGER';
  if (ppm > 0.1) return 'STRESS';
  return 'SAFE';
}

/**
 * Get status label for nitrate level.
 */
function getNitrateStatus(ppm: number): string {
  if (ppm > 80) return 'DANGER';
  if (ppm > 20) return 'HIGH';
  return 'SAFE';
}

export function WaterChemistry({
  waste,
  food,
  temperature,
  ambientWaste,
  ammonia,
  nitrite,
  nitrate,
  waterLevel,
}: WaterChemistryProps): React.JSX.Element {
  const [isWasteExpanded, setIsWasteExpanded] = useState(false);

  const decayRate = getCurrentDecayRate(food, temperature);
  const totalRate = decayRate + ambientWaste;
  const tempFactor = getTemperatureFactor(temperature);

  // Convert nitrogen values to ppm for display
  const ammoniaPpm = gramsToPpm(ammonia, waterLevel);
  const nitritePpm = gramsToPpm(nitrite, waterLevel);
  const nitratePpm = gramsToPpm(nitrate, waterLevel);

  return (
    <Panel title="Water Chemistry">
      <div className="space-y-3">
        {/* Nitrogen Cycle Section */}
        <div className="space-y-2">
          <div className="text-xs text-gray-400 font-medium uppercase tracking-wider">
            Nitrogen Cycle
          </div>

          {/* Ammonia (NH3) */}
          <div className={`flex items-center justify-between rounded px-2 py-1.5 ${getAmmoniaBgColor(ammoniaPpm)}`}>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-300">NH₃</span>
              <span className="text-xs text-gray-500">Ammonia</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-medium ${getAmmoniaColor(ammoniaPpm)}`}>
                {ammoniaPpm < 0.001 ? '0.000' : ammoniaPpm.toFixed(3)} ppm
              </span>
              <span className={`text-xs px-1.5 py-0.5 rounded ${getAmmoniaBgColor(ammoniaPpm)} ${getAmmoniaColor(ammoniaPpm)}`}>
                {getAmmoniaStatus(ammoniaPpm)}
              </span>
            </div>
          </div>

          {/* Nitrite (NO2) */}
          <div className={`flex items-center justify-between rounded px-2 py-1.5 ${getNitriteBgColor(nitritePpm)}`}>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-300">NO₂</span>
              <span className="text-xs text-gray-500">Nitrite</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-medium ${getNitriteColor(nitritePpm)}`}>
                {nitritePpm < 0.01 ? '0.00' : nitritePpm.toFixed(2)} ppm
              </span>
              <span className={`text-xs px-1.5 py-0.5 rounded ${getNitriteBgColor(nitritePpm)} ${getNitriteColor(nitritePpm)}`}>
                {getNitriteStatus(nitritePpm)}
              </span>
            </div>
          </div>

          {/* Nitrate (NO3) */}
          <div className={`flex items-center justify-between rounded px-2 py-1.5 ${getNitrateBgColor(nitratePpm)}`}>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-300">NO₃</span>
              <span className="text-xs text-gray-500">Nitrate</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-medium ${getNitrateColor(nitratePpm)}`}>
                {nitratePpm < 0.1 ? '0.0' : nitratePpm.toFixed(1)} ppm
              </span>
              <span className={`text-xs px-1.5 py-0.5 rounded ${getNitrateBgColor(nitratePpm)} ${getNitrateColor(nitratePpm)}`}>
                {getNitrateStatus(nitratePpm)}
              </span>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-gray-700" />

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
