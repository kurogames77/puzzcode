import React, { useState } from 'react'
import { api } from '../utils/api'

type Props = {
  opponentId: string
  opponentName: string
  onClose: () => void
  onChallengeSent: () => void
}

const AVAILABLE_LANGUAGES = [
  { value: 'python', label: 'Python' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'csharp', label: 'C#' },
  { value: 'cpp', label: 'C++' },
  { value: 'php', label: 'PHP' },
  { value: 'mysql', label: 'MySQL' }
]

const EXP_WAGER_OPTIONS = [
  { value: 50, label: '50 EXP' },
  { value: 100, label: '100 EXP' },
  { value: 150, label: '150 EXP' },
  { value: 200, label: '200 EXP' },
  { value: 250, label: '250 EXP' }
]

export default function ChallengeModal({ opponentId, opponentName, onClose, onChallengeSent }: Props) {
  const [selectedLanguage, setSelectedLanguage] = useState('python')
  const [selectedExpWager, setSelectedExpWager] = useState(100)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!selectedLanguage || !selectedExpWager) {
      setError('Please select both language and EXP wager')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Send challenge with language and expWager
      const response = await api.sendChallenge(opponentId, selectedLanguage, selectedExpWager)
      onChallengeSent()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to send challenge. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="auth-overlay" onClick={onClose}>
      <div className="auth-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
        <div className="auth-header">
          <h3 className="auth-title text-center">Challenge {opponentName}</h3>
          <button className="auth-close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="auth-body" style={{ padding: '24px' }}>
          {/* Language Selection */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ 
              display: 'block', 
              marginBottom: 8, 
              color: '#eae6ff', 
              fontWeight: 600,
              fontSize: 14
            }}>
              Select Language
            </label>
            <select
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
              style={{
                width: '100%',
                padding: '12px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: 8,
                color: '#eae6ff',
                fontSize: 14,
                cursor: 'pointer'
              }}
            >
              {AVAILABLE_LANGUAGES.map(lang => (
                <option key={lang.value} value={lang.value}>
                  {lang.label}
                </option>
              ))}
            </select>
          </div>

          {/* EXP Wager Selection */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ 
              display: 'block', 
              marginBottom: 8, 
              color: '#eae6ff', 
              fontWeight: 600,
              fontSize: 14
            }}>
              EXP Wager
            </label>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(3, 1fr)', 
              gap: 8 
            }}>
              {EXP_WAGER_OPTIONS.map(option => (
                <button
                  key={option.value}
                  onClick={() => setSelectedExpWager(option.value)}
                  style={{
                    padding: '10px 12px',
                    background: selectedExpWager === option.value
                      ? 'rgba(123, 92, 255, 0.3)'
                      : 'rgba(255, 255, 255, 0.05)',
                    border: `1px solid ${selectedExpWager === option.value
                      ? 'rgba(123, 92, 255, 0.6)'
                      : 'rgba(255, 255, 255, 0.1)'}`,
                    borderRadius: 8,
                    color: '#eae6ff',
                    fontSize: 13,
                    fontWeight: selectedExpWager === option.value ? 600 : 400,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p style={{ 
              marginTop: 8, 
              fontSize: 12, 
              color: 'rgba(255, 255, 255, 0.6)',
              lineHeight: 1.4
            }}>
              Both players will wager {selectedExpWager} EXP. Winner takes all!
            </p>
          </div>

          {error && (
            <div style={{
              padding: '12px',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 8,
              color: '#f87171',
              fontSize: 13,
              marginBottom: 16
            }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button 
              className="btn-secondary" 
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button 
              className="btn-primary" 
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading ? 'Sending...' : 'Send Challenge'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

