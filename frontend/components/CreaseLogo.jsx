export default function CreaseLogo({ variant = 'full', size = 'medium', className = '' }) {
  const classes = ['crease-logo', `crease-logo-${variant}`, `crease-logo-${size}`, className]
    .filter(Boolean)
    .join(' ');
  return (
    <span className={classes} aria-hidden="true">
      <img src="/icons/crease-app-icon-v2.svg" alt="" width="34" height="34" />
      {variant === 'full' && (
        <span className="crease-logo-word">
          crease<span>.</span>
        </span>
      )}
    </span>
  );
}
