import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown } from '../icons';

/** Checkbox popover for multi-value taxonomy fields (medium, class, subject). */
const MultiSelect: React.FC<{
  label: string; placeholder: string; values: string[]; required?: boolean; disabled?: boolean;
  options: { code: string; name: string }[]; onChange: (v: string[]) => void;
  /** What a value holds: the option's name (taxonomy fields, the default) or its code (skills). */
  valueKey?: 'name' | 'code';
}> = ({ label, placeholder, values, required, disabled, options, onChange, valueKey = 'name' }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  const toggle = (name: string) =>
    onChange(values.includes(name) ? values.filter((v) => v !== name) : [...values, name]);
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
              options.map((o) => (
                <label key={o.code} className="ce-multi-opt">
                  <input type="checkbox" checked={values.includes(o[valueKey])} onChange={() => toggle(o[valueKey])} />
                  <span>{o.name}</span>
                </label>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MultiSelect;
