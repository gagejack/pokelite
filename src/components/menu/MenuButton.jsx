// One main-menu bar. Both the mobile column and the desktop stack render
// through this, so the two layouts can never drift apart visually.
export default function MenuButton({ def, dark, style }) {
  const borderStyle = dark ? '2px solid #121212' : '2px solid #2e2e2e'
  const shadowStyle = dark ? '-2.5px 4.3px 0 0 #121212' : '-2.5px 4.3px 0 0 #2e2e2e'
  // Hard (0 blur) inner bevel to match the pixel-art styling, appended after
  // the drop shadow so both render.
  const bevel = `${shadowStyle}, inset 2px 2px 0 0 rgba(255,255,255,0.35), inset -2px -2px 0 0 rgba(0,0,0,0.3)`

  // The Daily bar animates its box-shadow via --btn-shadow (index.css), which
  // would otherwise replace the bevel outright.
  const usesGlow = def.className?.includes('daily-glow')

  return (
    <button
      // Explicit type: inside a <form> (LoginForm) an unset type defaults to
      // "submit", which would make every secondary bar submit the form.
      type={def.type ?? 'button'}
      onClick={def.onClick}
      disabled={def.disabled}
      aria-busy={def.ariaBusy || undefined}
      className={`hover:scale-105 active:scale-95 transition-transform duration-150 disabled:opacity-50 disabled:hover:scale-100${def.className ? ` ${def.className}` : ''}`}
      style={{
        width: '320px', maxWidth: '100%', height: '40px',
        background: def.background,
        border: borderStyle,
        ...(usesGlow ? { '--btn-shadow': bevel } : { boxShadow: bevel }),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        // `relative` so a badge can be positioned against this bar. The badge
        // is taken OUT of flow rather than sharing the row via space-between:
        // that made SHOP the one bar whose label sat left of every other bar's,
        // and a label's position shouldn't depend on whether it happens to
        // carry a readout.
        position: 'relative',
        padding: def.badge ? '0 14px' : undefined,
        ...style,
      }}
    >
      <span style={{ fontSize: def.fontSize, color: def.color, letterSpacing: '2px', fontFamily: 'Upheaval' }}>
        {def.label}
      </span>
      {def.badge && (
        <span style={{
          fontFamily: 'Orange Kid', fontSize: '15px', color: 'rgba(255,255,255,0.75)',
          position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)',
          // The label is centered on the BAR, so a long balance would run under
          // it before it ran off the edge. pointer-events stay off so the whole
          // bar remains one click target.
          pointerEvents: 'none', whiteSpace: 'nowrap',
        }}>
          {def.badge}
        </span>
      )}
    </button>
  )
}
