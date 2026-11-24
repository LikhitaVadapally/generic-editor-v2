import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from '../icons';
import { t } from '../i18n/i18n';

/** A short list is quicker to scan than to search, so the box shows only above this many options. */
export const SEARCH_MIN_OPTIONS = 7;

export function filterByName<T extends { name: string }>(options: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  return q ? options.filter((o) => o.name.toLowerCase().includes(q)) : options;
}

/** Checkbox popover for multi-value fields: taxonomy categories (medium, class, subject) and skills. */
const MultiSelect: React.FC<{
  lang: string; label: string; placeholder: string; values: string[]; required?: boolean; disabled?: boolean;
  options: { code: string; name: string }[]; onChange: (v: string[]) => void;
  /** What a value holds: the option's name (taxonomy fields, the default) or its code (skills). */
  valueKey?: 'name' | 'code';
}> = ({ lang, label, placeholder, values, required, disabled, options, onChange, valueKey = 'name' }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const filtered = useMemo(() => filterByName(options, query), [options, query]);
  useEffect(() => {
    if (!open) { setQuery(''); return; }
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  const toggle = (value: string) =>
    onChange(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);
  const nameOf = (v: string) => (valueKey === 'code' ? options.find((o) => o.code === v)?.name ?? v : v);
  const summary = values.length ? values.map(nameOf).join(', ') : placeholder;
  return (
    <div>
      <label className="ce-label-sm">{label}{required && <span className="ce-required-star">*</span>}</label>
      <div className="ce-multi" ref={ref}>
        <button
          type="button"
          className="ce-multi-control"
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
        >
          <span className={`ce-multi-summary${values.length ? '' : ' is-placeholder'}`}>{summary}</span>
          <span className="ce-select-chevron"><ChevronDown size={12} /></span>
        </button>
        {open && (
          <div className="ce-multi-panel">
            {options.length === 0 ? (
              <div className="ce-multi-empty">{placeholder}</div>
            ) : (
              <>
                {options.length >= SEARCH_MIN_OPTIONS && (
                  <input
                    type="text"
                    className="ce-multi-search"
                    autoFocus
                    value={query}
                    placeholder={t(lang, 'SEARCH_OPTIONS')}
                    aria-label={t(lang, 'SEARCH_OPTIONS')}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                )}
                {filtered.length === 0 && <div className="ce-multi-empty">{t(lang, 'NO_MATCHES')}</div>}
                {filtered.map((o) => (
                  <label key={o.code} className="ce-multi-opt">
                    <input type="checkbox" checked={values.includes(o[valueKey])} onChange={() => toggle(o[valueKey])} />
                    <span>{o.name}</span>
                  </label>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MultiSelect;
