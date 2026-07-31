import { useEffect, useRef } from 'react'
import { useTheme } from '../lib/theme'

// Evolution result, shown after a win / Evolve Stone / Rare Candy that changed
// a Pokémon. Shared by NodeMap and EliteFour.
//
// The pair IS the message: the old form on the left, the new one on the right,
// so the modal shows what happened instead of only asserting it in past tense.
// The left panel is desaturated and dimmed because evolution is a one-way
// replacement — that form is gone from the roster — and greying it says so
// without spending a line of copy on it. The arrow between them is the only
// element carrying direction, which is why it is the one thing tinted.
//
// One win can evolve several Pokémon, so notices stack vertically in a single
// modal rather than queueing one dialog per evolution.
export default function EvolutionNotice({ notices, onDismiss }) {
  const { dark } = useTheme()
  const okRef = useRef(null)

  // Focus OK on open so the modal is dismissible from the keyboard without
  // hunting, and wire Escape to the same exit as the backdrop and the button.
  useEffect(() => {
    okRef.current?.focus()
    function onKey(e) { if (e.key === 'Escape') onDismiss() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDismiss])

  if (!notices || notices.length === 0) return null

  const cardBg = dark ? '#2e2e2e' : '#DBDBDB'
  const panelBg = dark ? '#1a1a1a' : '#c8c8c8'
  const border = dark ? '2px solid #121212' : '2px solid #2e2e2e'
  const shadow = dark ? '-4px 6px 0 0 #121212' : '-4px 6px 0 0 #2e2e2e'
  const textColor = dark ? '#DBDBDB' : '#333'
  const mutedColor = dark ? '#888' : '#666'
  // The arrow is the one tinted element, so it has to hold at both themes:
  // #facc15 on the light card's #DBDBDB is thin, so light mode drops to amber.
  const arrowColor = dark ? '#facc15' : '#8a5a00'

  // One side of the pair: sprite only. The line above each row names both
  // Pokémon, so a caption here would print every name twice.
  //
  // `past` renders the pre-evolution form greyscaled and sunk into a dashed,
  // unfilled panel, leaving the new form as the only solid surface on the row.
  // Two earlier passes were worse: dimming the sprite to 55% left it barely
  // visible on the light card, and dropping the past panel entirely made a
  // three-evolution modal read as an empty left column rather than a past one —
  // the outline is what holds the column while still receding.
  function Stage({ sprite, past }) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '8px 6px',
        backgroundColor: past ? 'transparent' : panelBg,
        border: past ? `2px dashed ${mutedColor}` : border,
        minWidth: 0, flex: 1,
      }}>
        <img
          src={sprite}
          alt=""
          aria-hidden="true"
          style={{
            width: '72px', height: '72px', imageRendering: 'pixelated',
            filter: past ? 'grayscale(1)' : 'none',
          }}
        />
      </div>
    )
  }

  return (
    <div
      // Click-outside dismisses. The card stops propagation, so only clicks on
      // the backdrop itself close the modal.
      onClick={onDismiss}
      style={{
        position: 'fixed', inset: 0, zIndex: 110,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px', overflowY: 'auto',
        backgroundColor: 'rgba(0,0,0,0.7)',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={notices.map(n => `${n.from} evolved into ${n.to}`).join('. ')}
        onClick={e => e.stopPropagation()}
        style={{
          backgroundColor: cardBg, border, boxShadow: shadow,
          width: '100%', maxWidth: '320px', margin: 'auto',
          padding: '16px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
        }}
      >
        {/* Title only when it adds something. With one evolution the sentence
            below already says "X evolved to Y", so a standalone "Evolved" above
            it is the same word twice; with several, the count is new. */}
        {notices.length > 1 && (
          <span style={{ fontFamily: 'Upheaval', fontSize: '13px', color: textColor, letterSpacing: '1px' }}>
            {notices.length} Evolved
          </span>
        )}

        {notices.map((n, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
            {/* The names carry the weight; "Evolved to" is the connective and
                stays muted, so a row scans as two Pokémon rather than as a
                sentence to be read word by word. */}
            {/* PokéAPI names arrive lowercase ("charmeleon"), so the capital
                comes from CSS rather than from the data.
                Upheaval is set on the name spans, not inherited from the line:
                on the parent it styled "Evolved to" and left the names to a
                fallback face, which made the connective louder than the two
                Pokémon it connects. */}
            <span style={{
              fontFamily: 'Orange Kid', fontSize: '14px', color: mutedColor,
              textAlign: 'center', lineHeight: 1.5, textTransform: 'capitalize',
            }}>
              <span style={{ fontFamily: 'Upheaval', fontSize: '12px', color: textColor }}>{n.from}</span>
              {' evolved to '}
              <span style={{ fontFamily: 'Upheaval', fontSize: '12px', color: textColor }}>{n.to}</span>
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
              <Stage sprite={n.fromSprite} past />
              {/* The arrow is the only tinted element: it carries the direction,
                  which is the whole content of the pair. */}
              <span aria-hidden="true" style={{
                fontFamily: 'Upheaval', fontSize: '16px', color: arrowColor,
                flexShrink: 0, textShadow: dark ? '1px 1px 0 rgba(0,0,0,0.55)' : 'none',
              }}>
                &gt;
              </span>
              <Stage sprite={n.toSprite} />
            </div>
          </div>
        ))}

        <button
          ref={okRef}
          onClick={onDismiss}
          className="hover:opacity-70 transition-opacity"
          style={{
            fontFamily: 'Upheaval', fontSize: '11px', color: textColor,
            border, backgroundColor: panelBg,
            padding: '8px 20px', cursor: 'pointer', width: '100%',
          }}
        >
          OK
        </button>
      </div>
    </div>
  )
}
