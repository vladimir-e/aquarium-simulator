import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import { countModified, type TunableConfig } from '../../../simulation/config/index.js';
import { searchTunables, tunableSections, type TunableField } from '../../build/tunables.js';
import { useConfig } from '../../hooks/useConfig';
import { Drawer } from '../ui/Drawer';
import { FieldRow } from '../ui/FieldRow';
import { VerbButton } from '../ui/VerbButton';

/** Says a value stands off stock — beside the field, and on its section. */
function ModifiedDot({ on }: { on: boolean }): React.JSX.Element {
  return (
    <span
      aria-hidden
      className={`h-1.5 w-1.5 shrink-0 rounded-full ${on ? 'bg-accent' : 'bg-transparent'}`}
    />
  );
}

/**
 * One constant. Typing walks through states the range refuses — "0.0" on the
 * way to "0.05" — so an out-of-range value holds the field without reaching
 * the config, and blur settles it rather than clamping mid-keystroke.
 */
function Field({
  field,
  onChange,
}: {
  field: TunableField;
  onChange: (value: number) => void;
}): React.JSX.Element {
  const { range } = field;
  const [draft, setDraft] = useState(String(field.value));

  React.useEffect(() => setDraft(String(field.value)), [field.value]);

  const onInput: React.ChangeEventHandler<globalThis.HTMLInputElement> = (e) => {
    setDraft(e.target.value);
    const parsed = parseFloat(e.target.value);
    if (!Number.isFinite(parsed)) return;
    if (range && (parsed < range.min || parsed > range.max)) return;
    onChange(parsed);
  };

  const onBlur = (): void => {
    const parsed = parseFloat(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(String(field.value));
      return;
    }
    if (!range) return;
    const settled = Math.min(range.max, Math.max(range.min, parsed));
    if (settled === parsed) return;
    setDraft(String(settled));
    onChange(settled);
  };

  return (
    <FieldRow
      label={
        <span className="flex items-center gap-1.5">
          <ModifiedDot on={field.modified} />
          <label htmlFor={field.path} className="text-ink-2">
            {field.label}
          </label>
          {field.unit && <span className="text-[11px] text-ink-3">{field.unit}</span>}
        </span>
      }
    >
      <input
        id={field.path}
        type="number"
        value={draft}
        onChange={onInput}
        onBlur={onBlur}
        step={field.step}
        min={range?.min}
        max={range?.max}
        className={`w-24 rounded-control border bg-surface-2 px-2 py-1 text-right font-mono text-[12px] tabular-nums focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${
          field.modified ? 'border-accent text-accent' : 'border-hairline text-ink'
        }`}
      />
    </FieldRow>
  );
}

/**
 * Every constant the engine runs on, over the stage rather than in place of
 * it: a search across the whole set, the config layer's own sections under
 * it, and the chart a constant moves still ticking behind the drawer.
 */
export function TunablesDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): React.JSX.Element {
  const { config, setTunable, resetSection, resetAll } = useConfig();
  const [query, setQuery] = useState('');

  const sections = useMemo(() => tunableSections(config), [config]);
  const shown = useMemo(() => searchTunables(sections, query), [sections, query]);
  const modified = countModified(config);

  const [opened, setOpened] = useState<ReadonlySet<keyof TunableConfig>>(
    () => new Set(sections.filter((section) => section.modified > 0).map((section) => section.key))
  );

  const toggle = (key: keyof TunableConfig): void =>
    setOpened((was) => {
      const next = new Set(was);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Tunables"
      meta={
        modified > 0 && (
          <span className="shrink-0 text-[12px] tabular-nums text-accent">{modified} modified</span>
        )
      }
    >
      <div className="flex min-h-full flex-col">
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-hairline bg-surface px-3 py-2">
          <Search aria-hidden className="h-3.5 w-3.5 shrink-0 text-ink-3" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search constants"
            placeholder="Search constants"
            className="w-full bg-transparent text-[13px] text-ink placeholder:text-ink-3 focus:outline-none"
          />
        </div>

        <div className="px-3">
          {shown.map((section) => {
            const isOpen = opened.has(section.key) || query.trim() !== '';
            const Chevron = isOpen ? ChevronDown : ChevronRight;
            return (
              <section key={section.key} className="border-t border-hairline first:border-t-0">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggle(section.key)}
                    aria-expanded={isOpen}
                    className="flex min-w-0 flex-1 items-center gap-1.5 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                  >
                    <Chevron aria-hidden className="h-3.5 w-3.5 shrink-0 text-ink-3" />
                    <h3 className="truncate text-[13px] font-medium">{section.label}</h3>
                    {section.modified > 0 && (
                      <span className="flex items-center gap-1 text-[11px] tabular-nums text-accent">
                        <ModifiedDot on />
                        {section.modified}
                      </span>
                    )}
                  </button>
                  {section.modified > 0 && (
                    <VerbButton label="Reset" onClick={() => resetSection(section.key)} />
                  )}
                </div>

                {isOpen && (
                  <div className="pb-1 pl-5">
                    {section.fields.map((field) => (
                      <Field
                        key={field.path}
                        field={field}
                        onChange={(value) => setTunable(field.path, value)}
                      />
                    ))}
                    {section.groups.map((group) => (
                      <div key={group.label} className="border-t border-hairline pt-1">
                        <h4 className="py-1 text-[12px] text-ink-3">{group.label}</h4>
                        {group.fields.map((field) => (
                          <Field
                            key={field.path}
                            field={field}
                            onChange={(value) => setTunable(field.path, value)}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}

          {shown.length === 0 && (
            <p className="py-6 text-center text-[13px] text-ink-3">
              No constant is called that.
            </p>
          )}
        </div>

        <div className="mt-auto flex items-center gap-2 border-t border-hairline px-3 py-2">
          <p className="min-w-0 flex-1 text-[12px] leading-[1.45] text-ink-3">
            A change takes on the next tick.
          </p>
          {modified > 0 && <VerbButton label="Reset all" onClick={resetAll} />}
        </div>
      </div>
    </Drawer>
  );
}
