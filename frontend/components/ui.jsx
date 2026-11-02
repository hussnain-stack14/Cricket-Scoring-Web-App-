'use client';
import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowRight, CircleDot } from 'lucide-react';
export function Button({ children, secondary, danger, compact, ...props }) {
  return (
    <button
      className={`button ${secondary ? 'secondary' : ''} ${danger ? 'danger' : ''} ${compact ? 'compact' : ''}`}
      {...props}
    >
      {children}
    </button>
  );
}
export function Field({ label, children, ...props }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children || <input {...props} />}
    </label>
  );
}
export function Select({ label, options, ...props }) {
  return (
    <Field label={label}>
      <select {...props}>
        <option value="">Select…</option>
        {options.map((o) => (
          <option key={o.id ?? o} value={o.id ?? o}>
            {o.name ?? o}
          </option>
        ))}
      </select>
    </Field>
  );
}
export function Avatar({ name }) {
  return (
    <span className="avatar">
      {name
        .split(/\s+/)
        .slice(0, 2)
        .map((s) => s[0])
        .join('')
        .toUpperCase()}
    </span>
  );
}
export function Empty({ title, children, href, action }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <CircleDot size={24} aria-hidden="true" />
      </div>
      <h2>{title}</h2>
      <p>{children}</p>
      {href && (
        <Link className="button" href={href}>
          {action}
          <ArrowRight size={17} />
        </Link>
      )}
    </div>
  );
}
export function Sheet({ title, children, close }) {
  const titleId = useId();
  const ref = useRef(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  useEffect(() => {
    if (!mounted) return undefined;
    const d = ref.current;
    if (!d?.open) d?.showModal();
    return () => {
      if (d?.open) d.close();
    };
  }, [mounted]);
  if (!mounted) return null;
  return createPortal(
    <dialog
      aria-modal="true"
      aria-labelledby={titleId}
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      className="sheet"
    >
      <div className="sheet-heading">
        <h2 id={titleId}>{title}</h2>
        <button className="icon-button" aria-label="Close" onClick={close}>
          <X />
        </button>
      </div>
      {children}
    </dialog>,
    document.body,
  );
}
export const playerLabel = (p) => ({ id: p.id, name: p.name });

// Automatic activation follows the WAI-ARIA tabs keyboard pattern.
export function Tabs({ items, value, onChange, id = 'tabs', label = 'Views' }) {
  return (
    <div className="tabs accessible-tabs" role="tablist" aria-label={label}>
      {items.map((item, index) => (
        <button
          type="button"
          role="tab"
          id={id + '-' + item}
          aria-controls={id + '-panel'}
          aria-selected={value === item}
          tabIndex={value === item ? 0 : -1}
          className={value === item ? 'active' : ''}
          key={item}
          onClick={() => onChange(item)}
          onKeyDown={(e) => {
            let next;
            if (e.key === 'ArrowRight') next = (index + 1) % items.length;
            else if (e.key === 'ArrowLeft') next = (index + items.length - 1) % items.length;
            else if (e.key === 'Home') next = 0;
            else if (e.key === 'End') next = items.length - 1;
            if (next !== undefined) {
              e.preventDefault();
              onChange(items[next]);
              e.currentTarget.parentElement.children[next].focus();
            }
          }}
        >
          {item}
        </button>
      ))}
    </div>
  );
}
