'use client';
import { useEffect, useRef } from 'react';
import { X, ArrowRight } from 'lucide-react';
export function Button({ children, secondary, danger, ...props }) {
  return (
    <button
      className={`button ${secondary ? 'secondary' : ''} ${danger ? 'danger' : ''}`}
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
      <div className="empty-icon">✦</div>
      <h2>{title}</h2>
      <p>{children}</p>
      {href && (
        <a className="button" href={href}>
          {action}
          <ArrowRight size={17} />
        </a>
      )}
    </div>
  );
}
export function Sheet({ title, children, close }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    d.showModal();
    return () => d.close();
  }, []);
  return (
    <dialog ref={ref} onCancel={close} className="sheet">
      <div className="sheet-heading">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="Close" onClick={close}>
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export const playerLabel = (p) => ({ id: p.id, name: `${p.name} · ${p.id.slice(0, 6)}` });
