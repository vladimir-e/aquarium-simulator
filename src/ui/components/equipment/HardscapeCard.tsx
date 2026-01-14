import React from 'react';
import { Mountain, Circle, TreeDeciduous, Sparkles } from 'lucide-react';
import {
  getHardscapeName,
  getHardscapeSurface,
  getHardscapePHEffect,
  type HardscapeType,
  type HardscapeItem,
} from '../../../simulation/index.js';

export type { HardscapeType, HardscapeItem };

export interface HardscapeState {
  items: HardscapeItem[];
}

interface HardscapeCardProps {
  hardscape: HardscapeState;
  usedSlots: number;
  totalSlots: number;
  onAddItem: (type: HardscapeType) => void;
  onRemoveItem: (id: string) => void;
}

interface HardscapeTypeConfig {
  type: HardscapeType;
  icon: React.ReactNode;
  color: string;
  hoverColor: string;
}

const HARDSCAPE_CONFIGS: HardscapeTypeConfig[] = [
  {
    type: 'neutral_rock',
    icon: <Circle className="w-4 h-4" />,
    color: 'text-gray-400',
    hoverColor: 'hover:text-gray-200 hover:bg-gray-700',
  },
  {
    type: 'calcite_rock',
    icon: <Circle className="w-4 h-4" />,
    color: 'text-blue-400',
    hoverColor: 'hover:text-blue-300 hover:bg-blue-900/30',
  },
  {
    type: 'driftwood',
    icon: <TreeDeciduous className="w-4 h-4" />,
    color: 'text-amber-600',
    hoverColor: 'hover:text-amber-500 hover:bg-amber-900/30',
  },
  {
    type: 'plastic_decoration',
    icon: <Sparkles className="w-4 h-4" />,
    color: 'text-pink-400',
    hoverColor: 'hover:text-pink-300 hover:bg-pink-900/30',
  },
];

function formatNumber(num: number): string {
  return num.toLocaleString();
}

export function HardscapeCard({
  hardscape,
  usedSlots,
  totalSlots,
  onAddItem,
  onRemoveItem,
}: HardscapeCardProps): React.JSX.Element {
  const canAddMore = usedSlots < totalSlots;

  return (
    <div className="bg-panel rounded-lg border border-border p-4 w-[220px] flex-shrink-0 self-stretch flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <Mountain className="w-4 h-4 text-gray-400" />
        <h4 className="text-sm font-medium text-gray-200">Hardscape</h4>
      </div>

      <div className="space-y-3 flex-1">
        {/* Icon buttons to add hardscape */}
        <div className="flex gap-1">
          {HARDSCAPE_CONFIGS.map((config) => (
            <button
              key={config.type}
              onClick={() => onAddItem(config.type)}
              disabled={!canAddMore}
              className={`p-2 rounded transition-colors ${config.color} ${config.hoverColor} disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent`}
              title={`Add ${getHardscapeName(config.type)}`}
            >
              {config.icon}
            </button>
          ))}
        </div>

        {/* Items list with slot counter */}
        <div className="border-t border-border pt-2">
          <div className="text-xs text-gray-500 mb-2">
            {usedSlots}/{totalSlots} slots
          </div>

          {hardscape.items.length > 0 ? (
            <div className="space-y-1">
              {hardscape.items.map((item) => {
                const config = HARDSCAPE_CONFIGS.find((c) => c.type === item.type);
                const phEffect = getHardscapePHEffect(item.type);
                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-2 text-xs bg-border/30 p-2 rounded group"
                  >
                    <span className={config?.color}>{config?.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-gray-300 truncate">{getHardscapeName(item.type)}</div>
                      <div className="text-gray-500">
                        {formatNumber(getHardscapeSurface(item.type))} cm²
                        {phEffect && <span className="ml-1">· {phEffect}</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => onRemoveItem(item.id)}
                      className="text-gray-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                      title="Remove"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-xs text-gray-600 italic">Click icons above to add</div>
          )}
        </div>
      </div>
    </div>
  );
}
