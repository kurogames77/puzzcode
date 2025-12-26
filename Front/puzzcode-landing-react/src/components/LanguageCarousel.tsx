import React, { useCallback, useEffect, useMemo, useState } from 'react'
import LanguageCard from './LanguageCard'

type Language = {
  id: string
  title: string
  summary: string
  icon: string
  to?: string
}

type Props = {
  items: Language[]
  autoAdvanceMs?: number
}

const DEFAULT_INTERVAL = 4500

export default function LanguageCarousel({ items, autoAdvanceMs = DEFAULT_INTERVAL }: Props) {
  const [activeIndex, setActiveIndex] = useState(0)
  const total = items.length

  useEffect(() => {
    if (!total) {
      return
    }

    const timer = window.setInterval(() => {
      setActiveIndex(prev => (prev + 1) % total)
    }, autoAdvanceMs)

    return () => window.clearInterval(timer)
  }, [autoAdvanceMs, total])

  const clampOffset = useCallback((index: number) => {
    if (!total) return 0
    let offset = index - activeIndex
    if (offset > total / 2) {
      offset -= total
    } else if (offset < -total / 2) {
      offset += total
    }
    return offset
  }, [activeIndex, total])

  const positions = useMemo(() => {
    return items.map((item, index) => {
      const offset = clampOffset(index)
      if (offset === 0) {
        return {
          item,
          offset,
          style: {
            transform: 'translate3d(0, 0, 120px) rotateY(0deg) scale(1.3)',
            opacity: 1,
            filter: 'blur(0px) !important',
            zIndex: 5,
            pointerEvents: 'auto' as const,
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden'
          }
        }
      }

      if (offset === 1) {
        return {
          item,
          offset,
          style: {
            transform: 'translate3d(240px, 0, 40px) rotateY(-18deg) scale(1.15)',
            opacity: 1,
            filter: 'blur(0px)',
            zIndex: 4,
            pointerEvents: 'auto' as const,
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden'
          }
        }
      }

      if (offset === -1) {
        return {
          item,
          offset,
          style: {
            transform: 'translate3d(-240px, 0, 40px) rotateY(18deg) scale(1.15)',
            opacity: 1,
            filter: 'blur(0px)',
            zIndex: 4,
            pointerEvents: 'auto' as const,
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden'
          }
        }
      }

      if (offset === 2) {
        return {
          item,
          offset,
          style: {
            transform: 'translate3d(420px, 0, -180px) rotateY(-28deg) scale(0.85)',
            opacity: 0.7,
            filter: 'blur(1px)',
            zIndex: 3,
            pointerEvents: 'auto' as const
          }
        }
      }

      if (offset === -2) {
        return {
          item,
          offset,
          style: {
            transform: 'translate3d(-420px, 0, -180px) rotateY(28deg) scale(0.85)',
            opacity: 0.7,
            filter: 'blur(1px)',
            zIndex: 3,
            pointerEvents: 'auto' as const
          }
        }
      }

      const farOffset = offset > 0 ? 600 : -600

      return {
        item,
        offset,
        style: {
          transform: `translate3d(${farOffset}px, 0, -420px) rotateY(${offset > 0 ? -35 : 35}deg) scale(0.7)`,
          opacity: 0,
          filter: 'blur(2px)',
          zIndex: 1,
          pointerEvents: 'none' as const
        }
      }
    })
  }, [items, clampOffset, total])


  if (!total) {
    return null
  }

  return (
    <div className="language-carousel">
      <div className="language-carousel__shadow" />
      <div className="language-carousel__track">
        {positions.map(({ item, style, offset }, idx) => (
          <div
            key={`${item.id}-${idx}`}
            className={[
              'language-slide',
              offset === 0 ? 'is-active' : '',
              offset === 1 ? 'is-next' : '',
              offset === -1 ? 'is-prev' : '',
              offset === 2 ? 'is-next-2' : '',
              offset === -2 ? 'is-prev-2' : '',
              Math.abs(offset) > 2 ? 'is-hidden' : ''
            ].filter(Boolean).join(' ')}
            style={style}
          >
            <LanguageCard {...item} variant="tower" />
          </div>
        ))}
      </div>

      <div className="language-carousel__dots">
        {items.map((_, index) => (
          <button
            key={index}
            type="button"
            className={['language-carousel__dot', index === activeIndex ? 'is-active' : ''].join(' ')}
            onClick={() => setActiveIndex(index)}
            aria-label={`View ${items[index].title}`}
          />
        ))}
      </div>
    </div>
  )
}


