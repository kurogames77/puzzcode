import React from 'react'
import { Link } from 'react-router-dom'

type Props = {
  id: string
  title: string
  summary: string
  icon: string
  to?: string // optional override for destination route
  variant?: 'default' | 'tower'
}

export default function LanguageCard({ id, title, summary, icon, to, variant = 'default' }: Props) {
  const isTower = variant === 'tower'

  return (
    <Link to={to || `/lang/${id}`} className="text-decoration-none text-light">
      <div className={['card-neon', isTower ? 'card-neon--tower' : '', 'rounded-3', 'p-3', 'h-100'].filter(Boolean).join(' ')}>
        {isTower ? (
          <>
            <div className="tower-card__icon">
              <img src={icon} alt={`${title} logo`} />
            </div>
            <h6 className="tower-card__title">{title}</h6>
            <p className="tower-card__summary muted small">{summary}</p>
          </>
        ) : (
          <>
            <div className="d-flex align-items-center mb-2">
              <div className="me-2" style={{ width: '32px', height: '32px' }}>
                <img src={icon} alt={`${title} logo`} className="img-fluid" style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} />
              </div>
              <h6 className="mb-0 fw-semibold">{title}</h6>
            </div>
            <p className="mb-0 muted small">{summary}</p>
          </>
        )}
      </div>
    </Link>
  )
}


