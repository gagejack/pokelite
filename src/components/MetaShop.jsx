import { useState, useEffect, useMemo, useRef } from 'react'
import { useTheme } from '../lib/theme'
import { muted, cash } from '../lib/colors'
import { useIsDesktop } from '../lib/useIsDesktop'
import { METACASH_ITEMS, KEY_ITEMS, metaIconUrl } from '../game/metaCatalog.js'
import { applyPurchase, effectivePrice, toggleUpgrade } from '../game/metaProfile.js'
import { rowState, rowPrice, vitaminPickerRows } from '../game/metaShopUi.js'
import { spritesForRegion, SPRITE_REGIONS } from '../game/spriteIndex.js'
import { dailyOffers } from '../game/spriteRotation.js'
import { priceForDisplayName } from '../game/spriteTiers.js'
import { SPRITE_TIER_PRICES } from '../game/metaCatalog.js'
import { msUntilNextUtcDay } from '../game/dailyDerive.js'
import { todayUtc } from '../lib/daily.js'
import { fetchPokemonBase } from '../game/pokemon.js'
import { supabase } from '../lib/supabase'

// Countdown formatted the same way the daily challenge already does: hours +
// minutes, no seconds (spec §6c: "New stock in 4h 12m").
function formatCountdown(ms) {
  const totalMin = Math.max(0, Math.floor(ms / 60000))
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

// One row in the Upgrades list. Shared styling for both metacash and key
// items — the only difference is what `onBuy` does with the choice.
function UpgradeRow({ item, profile, overrides, dark, onBuy, onToggle }) {
  const state = rowState(profile, item, overrides)
  const price = rowPrice(profile, item, overrides)
  const disabled = (profile?.disabledUpgrades ?? []).includes(item.id)
  const textColor = dark ? '#DBDBDB' : '#333333'
  const mutedColor = muted(dark)
  const borderStyle = dark ? '2px solid #121212' : '2px solid #2e2e2e'
  const cellBg = dark ? '#1a1a1a' : '#c8c8c8'

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: '12px', padding: '10px 12px', borderBottom: borderStyle,
      // The row itself never dims. Fading the name, description and icon of
      // everything unaffordable greys out nearly the whole catalog for a
      // player who has just started earning — which reads as "this shop is
      // broken", not "you can't afford this yet". Only the Buy button carries
      // the affordability state; the merchandise stays legible so the player
      // can see what they're saving toward.
    }}>
      {/* Icon leads the row. The name/description block is what gets scanned,
          so a fixed-width cell on the left gives the eye a straight rail to run
          down 23 rows; trailing it would put the sprite in competition with the
          price and Buy button, which are the action zone.

          The recessed cell is doing real work, not decoration: PokeAPI item
          sprites vary in silhouette and transparent padding, so bare <img>s
          would make the rail visibly jitter. A fixed box with the panel's own
          border keeps it optically straight and reads as a shelf compartment,
          which is what a shop shelf actually looks like. */}
      <div style={{
        width: '64px', height: '64px', flexShrink: 0,
        border: borderStyle, backgroundColor: cellBg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <img
          src={metaIconUrl(item)}
          alt=""
          style={{ width: '52px', height: '52px', imageRendering: 'pixelated' }}
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, flex: 1 }}>
        <span style={{ fontFamily: 'Upheaval', fontSize: '21px', color: textColor }}>{item.name}</span>
        <span style={{ fontFamily: 'Orange Kid', fontSize: '18px', color: mutedColor }}>{item.description}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        {state === 'locked' ? (
          <span style={{ fontFamily: 'Orange Kid', fontSize: '13px', color: mutedColor, fontStyle: 'italic' }}>
            Requires Starting Funds I
          </span>
        ) : (
          // Price keeps its money color whether or not you can afford it — it
          // is a fact about the item, not about your wallet, and greying it
          // made the whole right column read as disabled.
          <span style={{
            fontFamily: 'Orange Kid', fontSize: '18px', color: cash(dark),
          }}>
            {item.currency === 'keys' ? `${price} 🔑` : `$${price.toLocaleString()}`}
          </span>
        )}
        {state === 'owned' ? (
          <button
            type="button"
            role="switch"
            aria-checked={!disabled}
            aria-label={`${item.name} ${disabled ? 'disabled' : 'enabled'}`}
            onClick={() => onToggle(item)}
            className="hover:opacity-80 transition-opacity"
            style={{
              width: '40px', height: '22px', borderRadius: '11px',
              border: borderStyle, padding: '2px',
              backgroundColor: disabled ? (dark ? '#444' : '#999') : '#7c3aed',
              cursor: 'pointer', flexShrink: 0,
              display: 'flex', justifyContent: disabled ? 'flex-start' : 'flex-end',
            }}
          >
            <span style={{
              width: '16px', height: '16px', borderRadius: '50%',
              backgroundColor: '#fff', display: 'block',
            }} />
          </button>
        ) : (
          <button
            type="button"
            disabled={state !== 'affordable'}
            onClick={() => onBuy(item)}
            className="disabled:cursor-not-allowed hover:opacity-80 transition-opacity disabled:hover:opacity-100"
            style={{
              fontFamily: 'Upheaval', fontSize: '13px', color: '#fff',
              backgroundColor: state === 'affordable' ? '#7c3aed' : (dark ? '#444' : '#999'),
              border: '2px solid #000', padding: '6px 14px',
              cursor: state === 'affordable' ? 'pointer' : 'not-allowed',
            }}
          >
            Buy
          </button>
        )}
      </div>
    </div>
  )
}

// The vitamin picker modal, opened when Buy is clicked on a vitamin row.
// Confirming applies the purchase and closes the picker on success — the
// only two-step purchase in the shop. On failure (an applyPurchase rejection
// reached from this flow — at-cap species are already disabled, so this is
// defence-in-depth, not the normal path) the picker stays open and shows
// `error` instead of silently closing.
//
// Sprite URL for any species id — same raw-PokeAPI convention Pokedex.jsx
// draws its grid from. Synchronous (no fetch needed to know the URL), so the
// picker's grid never waits on a request before it can paint an image.
const dexSpriteUrl = speciesId => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${speciesId}.png`

// Vitamins target any species the player has caught or seen (not just a
// starter, spec change) — a grid that can run to dozens of entries instead of
// a fixed 12, so this borrows the Pokédex's own shape (search bar, scrolling
// grid, responsive sizing) rather than the old fixed-size 3-column popup.
// `speciesIds` is the caught/seen id list MetaShop already fetched;
// `namesById` fills in as fetchPokemonBase resolves each one (see MetaShop's
// effect below) — a still-loading name falls back to the dex number so the
// grid never waits on a request before it can paint.
function VitaminPicker({ item, profile, speciesIds, namesById, dark, isDesktop, error, onConfirm, onCancel }) {
  const [search, setSearch] = useState('')
  const rows = vitaminPickerRows(profile, speciesIds)
  const textColor = dark ? '#DBDBDB' : '#333333'
  const cardBg = dark ? '#2e2e2e' : '#DBDBDB'
  const cellBg = dark ? '#1a1a1a' : '#c8c8c8'
  const borderStyle = dark ? '2px solid #121212' : '2px solid #2e2e2e'

  const query = search.trim().toLowerCase()
  const visibleRows = query
    ? rows.filter(({ speciesId }) => {
        const name = namesById[speciesId]
        return String(speciesId).padStart(3, '0').includes(query.replace(/^#/, ''))
          || (name && name.toLowerCase().includes(query))
      })
    : rows

  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 220,
        backgroundColor: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          backgroundColor: cardBg, border: borderStyle,
          boxShadow: dark ? '-4px 6px 0 0 #121212' : '-4px 6px 0 0 #2e2e2e',
          padding: '16px', width: '100%', maxWidth: isDesktop ? '560px' : '420px',
          maxHeight: '80vh',
          display: 'flex', flexDirection: 'column', gap: '12px',
        }}
      >
        <span style={{ fontFamily: 'Upheaval', fontSize: '16px', color: textColor }}>
          Choose a Pokémon for {item.name}
        </span>
        {rows.length === 0 && (
          <span style={{ fontFamily: 'Orange Kid', fontSize: '14px', color: muted(dark) }}>
            Catch or encounter a Pokémon in a run before spending a vitamin on it.
          </span>
        )}
        {rows.length > 0 && (
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name or #"
            style={{
              fontFamily: 'Upheaval', fontSize: '12px', color: textColor,
              backgroundColor: cellBg, border: borderStyle,
              padding: '8px 10px', outline: 'none',
            }}
          />
        )}
        {error && (
          <span style={{ fontFamily: 'Orange Kid', fontSize: '13px', color: '#f87171' }}>
            {error}
          </span>
        )}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {rows.length > 0 && visibleRows.length === 0 ? (
            <span style={{ fontFamily: 'Orange Kid', fontSize: '13px', color: muted(dark) }}>
              No Pokémon match "{search.trim()}"
            </span>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)', gap: '8px' }}>
              {visibleRows.map(({ speciesId, count, atCap }) => (
                <button
                  key={speciesId}
                  type="button"
                  disabled={atCap}
                  onClick={() => onConfirm(speciesId)}
                  className="disabled:cursor-not-allowed hover:opacity-80 transition-opacity disabled:hover:opacity-100"
                  style={{
                    backgroundColor: cellBg, border: borderStyle,
                    padding: '8px 4px', display: 'flex', flexDirection: 'column',
                    alignItems: 'center', gap: '4px',
                    opacity: atCap ? 0.5 : 1,
                    cursor: atCap ? 'not-allowed' : 'pointer',
                  }}
                >
                  <img
                    src={dexSpriteUrl(speciesId)}
                    alt={namesById[speciesId] ?? `#${speciesId}`}
                    style={{ width: '48px', height: '48px', imageRendering: 'pixelated' }}
                  />
                  <span style={{ fontFamily: 'Orange Kid', fontSize: '12px', color: textColor, textAlign: 'center' }}>
                    {namesById[speciesId] ?? `#${String(speciesId).padStart(3, '0')}`}
                  </span>
                  <span style={{ fontFamily: 'Orange Kid', fontSize: '12px', color: muted(dark) }}>
                    {count}/3
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onCancel}
          style={{
            fontFamily: 'Upheaval', fontSize: '13px', color: textColor,
            backgroundColor: cellBg, border: borderStyle, padding: '8px', alignSelf: 'flex-end',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function UpgradesTab({ profile, overrides, dark, onBuy, onToggle }) {
  const mutedColor = muted(dark)
  const sorted = items => [...items].sort((a, b) => a.cost - b.cost)
  const metacashItems = sorted(METACASH_ITEMS)
  const keyItems = sorted(KEY_ITEMS)

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {metacashItems.map(item => (
        <UpgradeRow key={item.id} item={item} profile={profile} overrides={overrides} dark={dark} onBuy={onBuy} onToggle={onToggle} />
      ))}
      <div style={{
        padding: '10px 12px', textAlign: 'center',
        fontFamily: 'Upheaval', fontSize: '12px', color: mutedColor,
        borderBottom: dark ? '2px solid #121212' : '2px solid #2e2e2e',
      }}>
        KEY ITEMS
      </div>
      {keyItems.map(item => (
        <UpgradeRow key={item.id} item={item} profile={profile} overrides={overrides} dark={dark} onBuy={onBuy} onToggle={onToggle} />
      ))}
    </div>
  )
}

// One region's daily offers as sprite cards, including the locked-region
// darkened treatment (spec §6c: offers still render, brightness(0.3), lock
// icon, "Unlock <Region>" text, inert click).
function CosmeticsRegionPanel({ region, profile, dark, overrides, onBuy, onEquip }) {
  const unlocked = (profile?.unlockedRegions ?? []).includes(region)
  const spriteList = useMemo(() => spritesForRegion(region), [region])
  const owned = new Set(profile?.ownedSprites ?? [])
  // Sprite tier prices are admin-editable per spec §5a (Task 10) — merge
  // `overrides` over the in-code defaults the same way effectivePrice does
  // for catalog items, so a Task 10 override object with common/uncommon/
  // elite/champion keys takes effect here with no changes to this component.
  const tierPrices = useMemo(() => ({ ...SPRITE_TIER_PRICES, ...overrides }), [overrides])
  // Bargain Hunter is "15% off ALL shop prices" (spec §2 item 9), and the
  // cosmetics tab is a shop price. Sprites aren't catalog rows, so the
  // discount can't reach them the way it reaches an item id — route the tier
  // price through effectivePrice as a synthetic metacash item instead, so
  // there is still exactly ONE place the discount is applied and the display
  // here can't drift from what handleBuySprite charges.
  const spritePrice = useMemo(() => name => {
    const tierCost = priceForDisplayName(name, tierPrices)
    // Empty overrides: the admin override already landed in `tierPrices`
    // above, and passing it again would let a catalog item id collide with a
    // tier key. Only the discount is wanted from effectivePrice here.
    return effectivePrice({ id: `sprite:${name}`, currency: 'metacash', cost: tierCost }, profile, {})
  }, [tierPrices, profile])

  const offers = useMemo(
    () => dailyOffers(todayUtc(), region, spriteList, owned)
      .map(sprite => ({ ...sprite, price: spritePrice(sprite.name) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [region, spriteList, profile?.ownedSprites, spritePrice]
  )
  const [msLeft, setMsLeft] = useState(() => msUntilNextUtcDay())
  useEffect(() => {
    const id = setInterval(() => setMsLeft(msUntilNextUtcDay()), 60000)
    return () => clearInterval(id)
  }, [])

  // Owned sprites for this region — a SEPARATE surface from the daily
  // rotation above, not a filter over it. dailyOffers() excludes owned ids by
  // design (spec §5: the rotation is a buy list), so an owned sprite can only
  // ever be re-equipped from here. Per-region rather than all-regions-at-once
  // because sprite ids are already region-namespaced ("Kanto/Lance 4") and the
  // tab itself is region-scoped — no new navigation, and a 1-3-sprite
  // collection (the common case for a long time) reads as a short strip
  // rather than an awkward near-empty full-collection view.
  const ownedInRegion = useMemo(
    () => spriteList.filter(sprite => owned.has(sprite.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spriteList, profile?.ownedSprites]
  )

  const textColor = dark ? '#DBDBDB' : '#333333'
  const cellBg = dark ? '#1a1a1a' : '#c8c8c8'
  const borderStyle = dark ? '2px solid #121212' : '2px solid #2e2e2e'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '12px' }}>
      <span style={{ fontFamily: 'Orange Kid', fontSize: '13px', color: muted(dark), textAlign: 'center' }}>
        New stock in {formatCountdown(msLeft)}
      </span>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
        {offers.map(sprite => {
          const isOwned = owned.has(sprite.id)
          const isEquipped = profile?.equippedSprite === sprite.id
          return (
            <div
              key={sprite.id}
              style={{
                position: 'relative', backgroundColor: cellBg, border: borderStyle,
                padding: '10px', display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: '4px',
                cursor: unlocked && !isEquipped ? 'pointer' : 'default',
              }}
              onClick={() => {
                if (!unlocked || isEquipped) return
                if (isOwned) onEquip(sprite.id)
                else onBuy(sprite)
              }}
            >
              <img
                src={sprite.url}
                alt={sprite.name}
                style={{
                  width: '72px', height: '72px', objectFit: 'contain',
                  filter: unlocked ? 'none' : 'brightness(0.3)',
                }}
              />
              <span style={{ fontFamily: 'Upheaval', fontSize: '13px', color: textColor, textAlign: 'center' }}>
                {sprite.name}
              </span>
              {unlocked ? (
                isEquipped ? (
                  <span style={{ fontFamily: 'Orange Kid', fontSize: '14px', color: muted(dark) }}>EQUIPPED</span>
                ) : isOwned ? (
                  <span style={{ fontFamily: 'Orange Kid', fontSize: '14px', color: cash(dark) }}>EQUIP</span>
                ) : (
                  <span style={{ fontFamily: 'Orange Kid', fontSize: '16px', color: textColor }}>
                    ${(sprite.price ?? 0).toLocaleString()}
                  </span>
                )
              ) : (
                // Height-matching placeholder — the locked overlay below
                // carries the "Unlock <Region>" text instead of this row.
                <span style={{ fontSize: '16px', lineHeight: 1 }}>&nbsp;</span>
              )}

              {/* Locked overlay — the card is inert, no click routes anywhere
                  (spec §6c: never navigates to the region-unlock flow). */}
              {!unlocked && (
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex',
                  flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: '6px', pointerEvents: 'none',
                }}>
                  <span style={{ fontSize: '28px' }}>🔒</span>
                  <span style={{ fontFamily: 'Upheaval', fontSize: '12px', color: '#fff', textShadow: '1px 1px 0 rgba(0,0,0,0.9)' }}>
                    Unlock {region}
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Owned sprites for this region — always visible, independent of the
          daily rotation above. This is the only way to re-equip a sprite once
          it's no longer one of today's 2 offers (which is true for EVERY
          owned sprite, by design — see the comment on `ownedInRegion`). */}
      {unlocked && ownedInRegion.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontFamily: 'Upheaval', fontSize: '12px', color: muted(dark) }}>
            YOUR SPRITES
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
            {ownedInRegion.map(sprite => {
              const isEquipped = profile?.equippedSprite === sprite.id
              return (
                <div
                  key={sprite.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => { if (!isEquipped) onEquip(sprite.id) }}
                  onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && !isEquipped) onEquip(sprite.id) }}
                  style={{
                    backgroundColor: cellBg, border: borderStyle,
                    padding: '8px', display: 'flex', flexDirection: 'column',
                    alignItems: 'center', gap: '4px',
                    cursor: isEquipped ? 'default' : 'pointer',
                  }}
                >
                  <img
                    src={sprite.url}
                    alt={sprite.name}
                    style={{ width: '48px', height: '48px', objectFit: 'contain' }}
                  />
                  <span style={{ fontFamily: 'Orange Kid', fontSize: '11px', color: textColor, textAlign: 'center' }}>
                    {sprite.name}
                  </span>
                  <span style={{ fontFamily: 'Orange Kid', fontSize: '12px', color: isEquipped ? muted(dark) : cash(dark) }}>
                    {isEquipped ? 'EQUIPPED' : 'EQUIP'}
                  </span>
                </div>
              )
            })}
          </div>
          {/* Un-equip back to the default trainer sprite — only shown once
              something in THIS region is actually equipped, so it doesn't
              clutter every region's panel with a button that does nothing
              differently from "just don't equip anything". */}
          {ownedInRegion.some(sprite => sprite.id === profile?.equippedSprite) && (
            <button
              type="button"
              onClick={() => onEquip(null)}
              style={{
                fontFamily: 'Upheaval', fontSize: '12px', color: textColor,
                backgroundColor: cellBg, border: borderStyle, padding: '6px 10px',
                alignSelf: 'flex-start', cursor: 'pointer',
              }}
            >
              Reset to default
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function CosmeticsTab({ profile, dark, overrides, onBuy, onEquip }) {
  const [region, setRegion] = useState(SPRITE_REGIONS[0])
  const textColor = dark ? '#DBDBDB' : '#333333'
  const borderStyle = dark ? '2px solid #121212' : '2px solid #2e2e2e'

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', borderBottom: borderStyle }}>
        {SPRITE_REGIONS.map(r => (
          <button
            key={r}
            type="button"
            onClick={() => setRegion(r)}
            style={{
              fontFamily: 'Upheaval', fontSize: '12px',
              color: r === region ? '#fff' : textColor,
              backgroundColor: r === region ? '#7c3aed' : 'transparent',
              border: 'none', padding: '8px 12px', cursor: 'pointer',
            }}
          >
            {r.toUpperCase()}
          </button>
        ))}
      </div>
      <CosmeticsRegionPanel region={region} profile={profile} dark={dark} overrides={overrides} onBuy={onBuy} onEquip={onEquip} />
    </div>
  )
}

// Full-screen overlay, matching the Pokédex/Stats pattern (spec §6c). Not a
// route — App/MainMenu keep `shopOpen` state and mount/unmount this like the
// other two full-screen sheets.
//
// `overrides` threads Task 10's (not-yet-built) admin price overrides through
// to canAfford/effectivePrice/applyPurchase without this component knowing
// anything about where they come from — defaults to {} so Task 10 wiring it
// in later is a no-op integration (constraint from the task brief).
export default function MetaShop({ profile, onClose, onPurchase, overrides = {} }) {
  const { dark } = useTheme()
  const isDesktop = useIsDesktop()
  const [tab, setTab] = useState('upgrades')
  const [pendingVitamin, setPendingVitamin] = useState(null) // item awaiting a Pokémon choice
  const [vitaminError, setVitaminError] = useState(null) // inline error inside the open picker
  const [notice, setNotice] = useState(null)
  // Species the account has caught or seen across every saved run — the
  // vitamin picker's pool (spec: "any mon", scoped to species the player has
  // actually encountered rather than the full ~649-species dex). Same query
  // shape Pokedex.jsx already runs; fetched here too rather than threaded
  // down as a prop, since MetaShop is its own self-contained overlay the same
  // way the Pokédex/Stats sheets are.
  const [caughtSpeciesIds, setCaughtSpeciesIds] = useState([])
  // speciesId -> display name, filled in as fetchPokemonBase resolves each id
  // the vitamin picker needs. Starts empty; the picker falls back to the dex
  // number for any id not yet resolved rather than blocking on a fetch.
  const [vitaminNamesById, setVitaminNamesById] = useState({})

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data, error } = await supabase
        .from('runs')
        .select('pokemon_caught_ids, pokemon_seen_ids')
        .eq('user_id', user.id)
      if (cancelled || error || !data) return
      const ids = new Set()
      data.forEach(row => {
        (row.pokemon_caught_ids ?? []).forEach(id => ids.add(id))
        ;(row.pokemon_seen_ids ?? []).forEach(id => ids.add(id))
      })
      setCaughtSpeciesIds([...ids].sort((a, b) => a - b))
    })()
    return () => { cancelled = true }
  }, [])

  // Resolve display names for the picker's species only when a vitamin item
  // is actually being bought — not on mount, since most shop visits never
  // open the picker and a name isn't needed until then. Skips ids already
  // resolved from a previous open in this session.
  useEffect(() => {
    if (!pendingVitamin) return
    let cancelled = false
    const unresolved = caughtSpeciesIds.filter(id => !(id in vitaminNamesById))
    if (unresolved.length === 0) return
    ;(async () => {
      const entries = await Promise.all(unresolved.map(async id => {
        try {
          const base = await fetchPokemonBase(id)
          return [id, base.name]
        } catch {
          return [id, null]
        }
      }))
      if (cancelled) return
      setVitaminNamesById(prev => {
        const next = { ...prev }
        entries.forEach(([id, name]) => { if (name) next[id] = name })
        return next
      })
    })()
    return () => { cancelled = true }
  }, [pendingVitamin, caughtSpeciesIds])

  const cardBg = dark ? '#2e2e2e' : '#DBDBDB'
  const borderStyle = dark ? '2px solid #121212' : '2px solid #2e2e2e'
  const textColor = dark ? '#DBDBDB' : '#333333'

  // Every purchase path funnels through here: apply the next profile
  // immediately (App.jsx's onProfileChange calls setProfile synchronously
  // before its own await, so the UI updates the same tick), then surface
  // whatever the save layer reports. onProfileChange may return a plain
  // value, undefined, or a promise resolving to `{ notice? }` — App.jsx's
  // handleShopProfileChange returns the latter (same `saved || !user`
  // posture as unlockAndEnterRegion/recordRunEnd); component tests that pass
  // a bare `setProfile`-shaped stub still work since awaiting a non-promise
  // is a no-op.
  // In-flight guard. Every handler below computes its next profile from the
  // CURRENT `profile` prop, so two clicks landing before App's setProfile
  // commits would both read the same stale balance and both succeed — the
  // player pays once but the second write clobbers the first, or a
  // repeat-buyable item (vitamins, up to 3) charges twice. A ref rather than
  // state because it has to be readable and writable synchronously within one
  // click handler; state wouldn't have updated yet, which is the whole bug.
  const purchasing = useRef(false)

  async function runPurchase(nextProfile) {
    if (purchasing.current) return
    purchasing.current = true
    setNotice(null)
    try {
      const outcome = await onPurchase(nextProfile)
      if (outcome?.notice) setNotice(outcome.notice)
    } catch {
      // onPurchase (App.jsx's handleShopProfileChange) awaits saveProfile,
      // which can reject rather than resolve false — a thrown error here, not
      // just an { ok: false } outcome. Without this catch the optimistic
      // profile the player already sees would sit there with zero indication
      // the save failed, and the rejection would surface as an unhandled
      // promise rejection instead of UI. Same wording as the guest-safe save
      // notice below, since a player can't tell the difference and shouldn't
      // need to.
      setNotice('Could not save — try again')
    } finally {
      purchasing.current = false
    }
  }

  function handleBuyUpgrade(item) {
    if (item.effect?.type === 'vitamin') {
      setVitaminError(null)
      setPendingVitamin(item)
      return
    }
    const result = applyPurchase(profile, item, undefined, overrides)
    if (!result.ok) {
      setNotice(result.reason)
      return
    }
    runPurchase(result.profile)
  }

  // Owned-upgrade toggle (where Buy used to sit once owned). Same runPurchase
  // pipe as a purchase — it's just another profile write — so save/notice
  // handling doesn't need a second copy.
  function handleToggleUpgrade(item) {
    const result = toggleUpgrade(profile, item.id)
    if (!result.ok) {
      setNotice(result.reason)
      return
    }
    runPurchase(result.profile)
  }

  // Only closes the picker on success. On failure the picker stays open and
  // shows the reason inline (vitaminError, not the shop-wide `notice` banner
  // — that banner renders behind the modal we just opened, so a player would
  // see the picker vanish with no explanation). At-cap species are already
  // `disabled` in the grid, so reaching the failure branch here means either
  // a stale `profile` prop or a race with another purchase — rare, but the
  // picker must not silently disappear either way.
  function handleConfirmVitamin(speciesId) {
    const result = applyPurchase(profile, pendingVitamin, speciesId, overrides)
    if (!result.ok) {
      setVitaminError(result.reason)
      return
    }
    setVitaminError(null)
    setPendingVitamin(null)
    runPurchase(result.profile)
  }

  // Sprites aren't catalog rows, so applyPurchase can't route them and this
  // reimplements its checks. That means it also has to reimplement the guard
  // applyPurchase gives every other purchase for free: refusing to charge for
  // something already owned. Two layers upstream should make this unreachable
  // (dailyOffers excludes owned ids from the roll, and the card renders EQUIP
  // instead of a price when owned) — but this is the money path, and the cost
  // of being wrong is charging a player twice for one sprite.
  function handleBuySprite(sprite) {
    if ((profile?.ownedSprites ?? []).includes(sprite.id)) {
      setNotice('Already owned')
      return
    }
    const price = sprite.price ?? 0
    if ((profile?.metacash ?? 0) < price) {
      setNotice('Not enough metacash')
      return
    }
    const nextProfile = {
      ...profile,
      metacash: profile.metacash - price,
      ownedSprites: [...(profile.ownedSprites ?? []), sprite.id],
      equippedSprite: sprite.id,
    }
    runPurchase(nextProfile)
  }

  // Reachable from two places: an owned sprite that happens to still be one
  // of today's 2 rotation offers, and (the only path for everything else,
  // since dailyOffers excludes owned ids from the roll) the "YOUR SPRITES"
  // section in CosmeticsRegionPanel. `spriteId === null` un-equips back to
  // the default trainer sprite — same write, no special case needed.
  function handleEquipSprite(spriteId) {
    runPurchase({ ...profile, equippedSprite: spriteId })
  }

  const balanceText = `$${(profile?.metacash ?? 0).toLocaleString()} · ${profile?.keys ?? 0} 🔑`

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        backgroundColor: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px', boxSizing: 'border-box',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          backgroundColor: cardBg, border: borderStyle,
          boxShadow: dark ? '-4px 6px 0 0 #121212' : '-4px 6px 0 0 #2e2e2e',
          width: '100%', maxWidth: '520px', maxHeight: '85dvh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {/* Header — purple, balance persistent across both tabs (spec §6c). */}
        <div style={{
          backgroundColor: '#7c3aed', padding: '10px 14px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontFamily: 'Upheaval', fontSize: '18px', color: '#fff', letterSpacing: '1px' }}>SHOP</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <span style={{ fontFamily: 'Orange Kid', fontSize: '15px', color: 'rgba(255,255,255,0.85)' }}>
              {balanceText}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="hover:opacity-70 transition-opacity"
              style={{ fontFamily: 'Upheaval', fontSize: '16px', color: '#fff' }}
            >
              X
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: borderStyle }}>
          {[['upgrades', 'UPGRADES'], ['cosmetics', 'COSMETICS']].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              style={{
                flex: 1, fontFamily: 'Upheaval', fontSize: '13px',
                color: tab === id ? '#fff' : textColor,
                backgroundColor: tab === id ? '#7c3aed' : 'transparent',
                border: 'none', padding: '10px', cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {notice && (
          <div style={{ padding: '8px 14px', backgroundColor: dark ? '#3a1a1a' : '#fde2e2' }}>
            <span style={{ fontFamily: 'Orange Kid', fontSize: '13px', color: dark ? '#f87171' : '#b91c1c' }}>
              {notice}
            </span>
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {tab === 'upgrades' ? (
            <UpgradesTab profile={profile} overrides={overrides} dark={dark} onBuy={handleBuyUpgrade} onToggle={handleToggleUpgrade} />
          ) : (
            <CosmeticsTab profile={profile} dark={dark} overrides={overrides} onBuy={handleBuySprite} onEquip={handleEquipSprite} />
          )}
        </div>
      </div>

      {pendingVitamin && (
        <VitaminPicker
          item={pendingVitamin}
          profile={profile}
          speciesIds={caughtSpeciesIds}
          namesById={vitaminNamesById}
          dark={dark}
          isDesktop={isDesktop}
          error={vitaminError}
          onConfirm={handleConfirmVitamin}
          onCancel={() => { setVitaminError(null); setPendingVitamin(null) }}
        />
      )}
    </div>
  )
}
