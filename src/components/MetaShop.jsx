import { useState, useEffect, useMemo, useRef } from 'react'
import { useTheme } from '../lib/theme'
import { muted, cash } from '../lib/colors'
import { METACASH_ITEMS, KEY_ITEMS, metaIconUrl } from '../game/metaCatalog.js'
import { applyPurchase, effectivePrice } from '../game/metaProfile.js'
import { rowState, rowPrice, starterPickerRows } from '../game/metaShopUi.js'
import { spritesForRegion, SPRITE_REGIONS } from '../game/spriteIndex.js'
import { dailyOffers } from '../game/spriteRotation.js'
import { priceForDisplayName } from '../game/spriteTiers.js'
import { SPRITE_TIER_PRICES } from '../game/metaCatalog.js'
import { msUntilNextUtcDay } from '../game/dailyDerive.js'
import { todayUtc } from '../lib/daily.js'
import { SPRITE as STARTER_SPRITE } from '../game/regions/regionList'

// Species -> display name for the vitamin picker's grid. A literal table
// (same approach Stats.jsx already uses for STARTER_NAMES) rather than an
// async PokeAPI fetch — this is a small fixed set of 12 ids and the picker
// must never show a blank name while a request is in flight.
const STARTER_NAMES = {
  1: 'Bulbasaur', 4: 'Charmander', 7: 'Squirtle',
  152: 'Chikorita', 155: 'Cyndaquil', 158: 'Totodile',
  252: 'Treecko', 255: 'Torchic', 258: 'Mudkip',
  387: 'Turtwig', 390: 'Chimchar', 393: 'Piplup',
  495: 'Snivy', 498: 'Tepig', 501: 'Oshawott',
}

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
function UpgradeRow({ item, profile, overrides, dark, onBuy }) {
  const state = rowState(profile, item, overrides)
  const price = rowPrice(profile, item, overrides)
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
          <span style={{ fontFamily: 'Upheaval', fontSize: '13px', color: mutedColor }}>OWNED</span>
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

// The starter picker modal, opened when Buy is clicked on a vitamin row.
// Grid of the player's unlocked starters; starters at the 3-vitamin cap are
// dimmed and unselectable (spec §6c). Confirming applies the purchase and
// closes the picker on success — the only two-step purchase in the shop. On
// failure (an applyPurchase rejection reached from this flow — at-cap
// starters are already disabled, so this is defence-in-depth, not the normal
// path) the picker stays open and shows `error` instead of silently closing.
function StarterPicker({ item, profile, dark, error, onConfirm, onCancel }) {
  const rows = starterPickerRows(profile)
  const textColor = dark ? '#DBDBDB' : '#333333'
  const cardBg = dark ? '#2e2e2e' : '#DBDBDB'
  const cellBg = dark ? '#1a1a1a' : '#c8c8c8'
  const borderStyle = dark ? '2px solid #121212' : '2px solid #2e2e2e'

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
          padding: '16px', width: '100%', maxWidth: '420px',
          display: 'flex', flexDirection: 'column', gap: '12px',
        }}
      >
        <span style={{ fontFamily: 'Upheaval', fontSize: '16px', color: textColor }}>
          Choose a starter for {item.name}
        </span>
        {rows.length === 0 && (
          <span style={{ fontFamily: 'Orange Kid', fontSize: '14px', color: muted(dark) }}>
            No starters unlocked yet.
          </span>
        )}
        {error && (
          <span style={{ fontFamily: 'Orange Kid', fontSize: '13px', color: '#f87171' }}>
            {error}
          </span>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
          {rows.map(({ speciesId, count, atCap }) => (
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
                src={STARTER_SPRITE(speciesId)}
                alt={STARTER_NAMES[speciesId] ?? String(speciesId)}
                style={{ width: '48px', height: '48px', imageRendering: 'pixelated' }}
              />
              <span style={{ fontFamily: 'Orange Kid', fontSize: '12px', color: textColor, textAlign: 'center' }}>
                {STARTER_NAMES[speciesId] ?? speciesId}
              </span>
              <span style={{ fontFamily: 'Orange Kid', fontSize: '12px', color: muted(dark) }}>
                {count}/3
              </span>
            </button>
          ))}
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

function UpgradesTab({ profile, overrides, dark, onBuy }) {
  const mutedColor = muted(dark)
  const sorted = items => [...items].sort((a, b) => a.cost - b.cost)
  const metacashItems = sorted(METACASH_ITEMS)
  const keyItems = sorted(KEY_ITEMS)

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {metacashItems.map(item => (
        <UpgradeRow key={item.id} item={item} profile={profile} overrides={overrides} dark={dark} onBuy={onBuy} />
      ))}
      <div style={{
        padding: '10px 12px', textAlign: 'center',
        fontFamily: 'Upheaval', fontSize: '12px', color: mutedColor,
        borderBottom: dark ? '2px solid #121212' : '2px solid #2e2e2e',
      }}>
        KEY ITEMS
      </div>
      {keyItems.map(item => (
        <UpgradeRow key={item.id} item={item} profile={profile} overrides={overrides} dark={dark} onBuy={onBuy} />
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
  const [tab, setTab] = useState('upgrades')
  const [pendingVitamin, setPendingVitamin] = useState(null) // item awaiting a starter choice
  const [vitaminError, setVitaminError] = useState(null) // inline error inside the open picker
  const [notice, setNotice] = useState(null)

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

  // Only closes the picker on success. On failure the picker stays open and
  // shows the reason inline (vitaminError, not the shop-wide `notice` banner
  // — that banner renders behind the modal we just opened, so a player would
  // see the picker vanish with no explanation). At-cap starters are already
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
            <UpgradesTab profile={profile} overrides={overrides} dark={dark} onBuy={handleBuyUpgrade} />
          ) : (
            <CosmeticsTab profile={profile} dark={dark} overrides={overrides} onBuy={handleBuySprite} onEquip={handleEquipSprite} />
          )}
        </div>
      </div>

      {pendingVitamin && (
        <StarterPicker
          item={pendingVitamin}
          profile={profile}
          dark={dark}
          error={vitaminError}
          onConfirm={handleConfirmVitamin}
          onCancel={() => { setVitaminError(null); setPendingVitamin(null) }}
        />
      )}
    </div>
  )
}
