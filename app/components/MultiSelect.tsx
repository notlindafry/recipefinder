"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  label: string;
  options: readonly string[];
  selected: string[];
  onChange: (next: string[]) => void;
}

export default function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle(opt: string) {
    if (selected.includes(opt)) {
      onChange(selected.filter((s) => s !== opt));
    } else {
      onChange([...selected, opt]);
    }
  }

  const summary =
    selected.length === 0
      ? label
      : selected.length === 1
        ? selected[0]
        : `${selected.length} selected`;

  return (
    <div className="ms" ref={ref}>
      <button
        type="button"
        className={`ms-trigger${selected.length ? " ms-active" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="ms-summary">{summary}</span>
        <span className="ms-caret" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div className="ms-panel" role="listbox" aria-multiselectable="true">
          {options.map((opt) => {
            const checked = selected.includes(opt);
            return (
              <button
                type="button"
                key={opt}
                role="option"
                aria-selected={checked}
                className={`ms-option${checked ? " ms-checked" : ""}`}
                onClick={() => toggle(opt)}
              >
                <span className="ms-box" aria-hidden>
                  {checked ? "✓" : ""}
                </span>
                <span>{opt}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
