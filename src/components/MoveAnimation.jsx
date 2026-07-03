import { useEffect, useRef, useState } from 'react'
import { getMoveAnimation } from '../game/moveAnimations.js'

const FRAME_MS = 80

export default function MoveAnimation({ moveName, onDone, battleSpeed = 1, size = 192 }) {
  const anim = getMoveAnimation(moveName)
  const [frame, setFrame] = useState(0)
  const intervalRef = useRef(null)

  useEffect(() => {
    if (!anim) { onDone?.(); return }

    // Play sound
    const audio = new Audio(anim.sound)
    audio.volume = 0.6
    audio.play().catch(() => {})

    if (anim.frameCount <= 1) {
      // Single frame: hold briefly then done
      const t = setTimeout(() => onDone?.(), FRAME_MS * 3 / battleSpeed)
      return () => clearTimeout(t)
    }

    let f = 0
    intervalRef.current = setInterval(() => {
      f += 1
      if (f >= anim.frameCount) {
        clearInterval(intervalRef.current)
        onDone?.()
      } else {
        setFrame(f)
      }
    }, FRAME_MS / battleSpeed)

    return () => clearInterval(intervalRef.current)
  }, [moveName])

  if (!anim) return null

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      pointerEvents: 'none',
      zIndex: 5,
    }}>
      <div style={{
        width: `${size}px`,
        height: `${size}px`,
        backgroundImage: `url(${anim.sheet})`,
        backgroundSize: `${anim.frameCount * size}px ${size}px`,
        backgroundPosition: `-${frame * size}px 0px`,
        backgroundRepeat: 'no-repeat',
        imageRendering: 'pixelated',
      }} />
    </div>
  )
}
