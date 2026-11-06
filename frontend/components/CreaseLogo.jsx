export default function CreaseLogo({ variant = 'full', appearance, size = 'medium', className = '' }) {
  const logoVariant = ['full', 'icon'].includes(variant) ? variant : 'full';
  const logoAppearance = appearance || (['onDark', 'onLight'].includes(variant) ? variant : 'onLight');
  const classes = ['crease-logo', `crease-logo-${logoVariant}`, `crease-logo-${logoAppearance}`, `crease-logo-${size}`, className]
    .filter(Boolean)
    .join(' ');
  return (
    <span className={classes} aria-hidden="true">
      <img src="/icons/crease-app-icon-v2.svg" alt="" width="34" height="34" />
      {logoVariant === 'full' && (
        <span className="crease-logo-word">
          crease<span>.</span>
        </span>
      )}
    </span>
  );
}
