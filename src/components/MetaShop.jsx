import { useState, useEffect, useMemo } from 'react'
import { useTheme } from '../lib/theme'
import { muted, cash } from '../lib/colors'
import { METACASH_ITEMS, KEY_ITEMS } from '../game/metaCatalog.js'
import { applyPurchase } from '../game/metaProfile.js'
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
  const dimmed = state === 'owned' || state === 'too_expensive'
  const textColor = dark ? '#DBDBDB' : '#333333'
  const mutedColor = muted(dark)
  const borderStyle = dark ? '2px solid #121212' : '2px solid #2e2e2e'

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: '12px', padding: '10px 12px', borderBottom: borderStyle,
      opacity: dimmed ? 0.6 : 1,
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
        <span style={{ fontFamily: 'Upheaval', fontSize: '14px', color: textColor }}>{item.name}</span>
        <span style={{ fontFamily: 'Orange Kid', fontSize: '14px', color: mutedColor }}>{item.description}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        {state === 'locked' ? (
          <span style={{ fontFamily: 'Orange Kid', fontSize: '13px', color: mutedColor, fontStyle: 'italic' }}>
            Requires Starting Funds I
          </span>
        ) : (
          <span style={{
            fontFamily: 'Orange Kid', fontSize: '18px',
            color: state === 'affordable' ? cash(dark) : mutedColor,
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
// closes the picker — the only two-step purchase in the shop.
function StarterPicker({ item, profile, dark, onConfirm, onCancel }) {
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
  const offers = useMemo(
    () => dailyOffers(todayUtc(), region, spriteList, owned)
      .map(sprite => ({ ...sprite, price: priceForDisplayName(sprite.name, tierPrices) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [region, spriteList, profile?.ownedSprites, tierPrices]
  )
  const [msLeft, setMsLeft] = useState(() => msUntilNextUtcDay())
  useEffect(() => {
    const id = setInterval(() => setMsLeft(msUntilNextUtcDay()), 60000)
    return () => clearInterval(id)
  }, [])

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
  async function runPurchase(nextProfile) {
    setNotice(null)
    const outcome = await onPurchase(nextProfile)
    if (outcome?.notice) setNotice(outcome.notice)
  }

  function handleBuyUpgrade(item) {
    if (item.effect?.type === 'vitamin') {
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

  function handleConfirmVitamin(speciesId) {
    const item = pendingVitamin
    setPendingVitamin(null)
    const result = applyPurchase(profile, item, speciesId, overrides)
    if (!result.ok) {
      setNotice(result.reason)
      return
    }
    runPurchase(result.profile)
  }

  function handleBuySprite(sprite) {
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
          onConfirm={handleConfirmVitamin}
          onCancel={() => setPendingVitamin(null)}
        />
      )}
    </div>
  )
}
