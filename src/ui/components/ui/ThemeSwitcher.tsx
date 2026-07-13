import React, { useEffect, useRef, useState } from 'react';
import { Sun, Moon, Monitor, ChevronDown, Check } from 'lucide-react';
import { useTheme, type ThemeMode } from '../../hooks/useTheme';
import { Button } from './Button';

interface ThemeOption {
  mode: ThemeMode;
  icon: React.ReactNode;
  label: string;
}

const themeOptions: ThemeOption[] = [
  { mode: 'system', icon: <Monitor className="w-3.5 h-3.5" />, label: 'System' },
  { mode: 'light', icon: <Sun className="w-3.5 h-3.5" />, label: 'Day' },
  { mode: 'dark', icon: <Moon className="w-3.5 h-3.5" />, label: 'Night' },
];

export function ThemeSwitcher(): React.JSX.Element {
  const { mode, setMode } = useTheme();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const current = themeOptions.find((option) => option.mode === mode) ?? themeOptions[0];

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent): void => {
      if (!containerRef.current?.contains(event.target as HTMLElement)) {
        setOpen(false);
      }
    };
    globalThis.document.addEventListener('pointerdown', handlePointerDown);
    return (): void => {
      globalThis.document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const activeIndex = themeOptions.findIndex((option) => option.mode === mode);
    itemRefs.current[activeIndex >= 0 ? activeIndex : 0]?.focus();
  }, [open, mode]);

  const focusTrigger = (): void => {
    containerRef.current
      ?.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')
      ?.focus();
  };

  const closeAndReturnFocus = (): void => {
    setOpen(false);
    focusTrigger();
  };

  const handleSelect = (next: ThemeMode): void => {
    setMode(next);
    closeAndReturnFocus();
  };

  const handleMenuKeyDown = (event: React.KeyboardEvent): void => {
    const focused = itemRefs.current.findIndex((el) => el === globalThis.document.activeElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      closeAndReturnFocus();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      itemRefs.current[(focused + 1) % themeOptions.length]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      itemRefs.current[(focused - 1 + themeOptions.length) % themeOptions.length]?.focus();
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <Button
        onClick={() => setOpen((value) => !value)}
        variant="primary"
        active={open}
        className="text-xs px-2 py-1.5 flex items-center gap-1"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Theme: ${current.label}`}
        title={`Theme: ${current.label}`}
      >
        {current.icon}
        <ChevronDown
          className={`w-3 h-3 transition-transform duration-100 ${open ? 'rotate-180' : ''}`}
        />
      </Button>

      {open && (
        <div
          role="menu"
          aria-label="Theme"
          onKeyDown={handleMenuKeyDown}
          className="absolute right-0 mt-1 z-20 min-w-[8rem] rounded border border-border bg-panel py-1 shadow-lg"
        >
          {themeOptions.map((option, index) => {
            const isActive = option.mode === mode;
            return (
              <button
                key={option.mode}
                ref={(el) => {
                  itemRefs.current[index] = el;
                }}
                role="menuitemradio"
                aria-checked={isActive}
                onClick={() => handleSelect(option.mode)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors focus:outline-none focus:bg-border ${
                  isActive ? 'text-accent-blue' : 'text-gray-300 hover:bg-border hover:text-gray-100'
                }`}
              >
                {option.icon}
                <span className="flex-1 text-left">{option.label}</span>
                {isActive && <Check className="w-3.5 h-3.5" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
