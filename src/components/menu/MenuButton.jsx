// One main-menu bar. Both the mobile column and the desktop stack render
// through this, so the two layouts can never drift apart visually.
export default function MenuButton({ def, dark, style }) {
  const borderStyle = dark ? '2px solid #121212' : '2px solid #3f3f3f'
  const shadowStyle = dark ? '-2.5px 4.3px 0 0 #121212' : '-2.5px 4.3px 0 0 #3f3f3f'
  // Hard (0 blur) inner bevel to match the pixel-art styling, appended after
  // the drop shadow so both render.
  const bevel = `${shadowStyle}, inset 2px 2px 0 0 rgba(255,255,255,0.35), inset -2px -2px 0 0 rgba(0,0,0,0.3)`

  // The Daily bar animates its box-shadow via --btn-shadow (index.css), which
  // would otherwise replace the bevel outright.
  const usesGlow = def.className?.includes('daily-glow')

  return (
    <button
      onClick={def.onClick}
      className={`hover:scale-105 active:scale-95 transition-transform duration-150${def.className ? ` ${def.className}` : ''}`}
      style={{
        width: '320px', maxWidth: '100%', height: '40px',
        background: def.background,
        border: borderStyle,
        ...(usesGlow ? { '--btn-shadow': bevel } : { boxShadow: bevel }),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        ...style,
      }}
    >
      <span style={{ fontSize: def.fontSize, color: def.color, letterSpacing: '2px', fontFamily: 'Upheaval' }}>
        {def.label}
      </span>
    </button>
  )
}
