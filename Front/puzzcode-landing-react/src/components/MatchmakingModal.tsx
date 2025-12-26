import React, { useEffect, useState, useRef } from 'react'
import ConfirmModal from './ConfirmModal'
import { useAuth } from '../contexts/AuthContext'
import { getTempBattleAccess } from '../utils/battleAccess'
import { getWebSocketClient } from '../utils/websocket'

type Props = {
  onClose: () => void
  onStart: (language: string, options?: { tempAccess?: boolean }) => void
  currentUser: { 
    username: string
    firstName?: string
    lastName?: string
    schoolId?: string
    avatarUrl?: string
  }
  tempAccessEnabled?: boolean
}

export default function MatchmakingModal({ onClose, onStart, currentUser, tempAccessEnabled }: Props) {
  const { user } = useAuth()
  const [status, setStatus] = useState<'setup' | 'search' | 'found'>('setup')
  const [opponents, setOpponents] = useState<Array<{ username: string; avatar?: string; isReady?: boolean; rank?: string; userId?: string; name?: string }>>([])
  const [matchIdFromWS, setMatchIdFromWS] = useState<string | null>(null)
  const [selectedLanguage, setSelectedLanguage] = useState<string>('')
  const [waitingTime, setWaitingTime] = useState<number>(0) // Time in seconds
  const [readyTime, setReadyTime] = useState<number>(0) // Time waiting for ready (2 minutes max)
  const [isReady, setIsReady] = useState<boolean>(false)
  const [matchId, setMatchId] = useState<string | null>(null)
  const [showExpConfirm, setShowExpConfirm] = useState<boolean>(false)
  const [currentExp, setCurrentExp] = useState<number | null>(null)
  const [timeoutNotificationShown, setTimeoutNotificationShown] = useState<boolean>(false)
  const [showTimeoutNotification, setShowTimeoutNotification] = useState<boolean>(false)
  const [timeoutMessage, setTimeoutMessage] = useState<string>('')
  const tempAccessActive = typeof tempAccessEnabled === 'boolean' ? tempAccessEnabled : getTempBattleAccess()
  
  // Use refs to track current state values inside intervals
  const isReadyRef = useRef(isReady)
  const opponentsRef = useRef(opponents)
  const timeoutNotificationShownRef = useRef(timeoutNotificationShown)
  
  // Update refs when state changes
  useEffect(() => {
    isReadyRef.current = isReady
  }, [isReady])
  
  useEffect(() => {
    opponentsRef.current = opponents
  }, [opponents])
  
  useEffect(() => {
    timeoutNotificationShownRef.current = timeoutNotificationShown
  }, [timeoutNotificationShown])
  
  const languages = [
    { id: 'python', name: 'Python' },
    { id: 'csharp', name: 'C#' },
    { id: 'javascript', name: 'JavaScript' },
    { id: 'cpp', name: 'C++' },
    { id: 'php', name: 'PHP' },
    { id: 'mysql', name: 'MySQL' }
  ]

  const isLanguageSelected = selectedLanguage !== ''

  // Check if all participants are ready (calculate this before useEffects that use it)
  const allReady = isReady && opponents.length > 0 && opponents.every(opp => opp.isReady)

  // Timer effect - starts when searching, stops when found or closed
  useEffect(() => {
    if (status !== 'search') {
      setWaitingTime(0)
      setTimeoutNotificationShown(false) // Reset timeout notification when status changes
      return
    }

    const interval = setInterval(() => {
      setWaitingTime((prev) => prev + 1)
    }, 1000)

    return () => clearInterval(interval)
  }, [status])

  // Timeout notification after 1 minute (60 seconds) of searching
  useEffect(() => {
    if (status === 'search' && waitingTime >= 60 && !timeoutNotificationShown) {
      setTimeoutNotificationShown(true)
      
      // Leave matchmaking queue
      const wsClient = getWebSocketClient()
      const canUseWebSocket = typeof (wsClient as any).connected === 'function' && wsClient.connected()
      
      if (canUseWebSocket) {
        wsClient.emit('leave_matchmaking_queue')
      }
      
      // Set notification message
      const message = opponents.length > 0
        ? `Failed to find a complete match after 1 minute.\n\nFound ${opponents.length} player(s), but need at least 3 players total.\n\nPossible reasons:\n• Not enough players online\n• No players with the same language preference\n• Players may have different ranks\n\nTry again later or select a different language.`
        : `Failed to find a match after 1 minute.\n\nNo players were found in the matchmaking queue.\n\nPossible reasons:\n• No players are currently online\n• No players with the same language preference\n• Players may be in different rank brackets\n\nTry again later or select a different language.`
      
      setTimeoutMessage(message)
      setShowTimeoutNotification(true)
    }
  }, [status, waitingTime, timeoutNotificationShown, opponents.length])

  // Ready timer effect - starts when match is found, kicks unready players after 2 minutes
  useEffect(() => {
    if (status !== 'found' || !matchId) {
      setReadyTime(0)
      return
    }

    const interval = setInterval(() => {
      setReadyTime((prev) => {
        const newTime = prev + 1
        // Calculate allReady using refs to get current state values
        const currentAllReady = isReadyRef.current && opponentsRef.current.length > 0 && opponentsRef.current.every(opp => opp.isReady)
        // Auto-kick after 2 minutes (120 seconds) if not all ready
        if (newTime >= 120 && !currentAllReady) {
          // Call kick endpoint
          const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
          fetch(`${API_BASE_URL}/battle/${matchId}/kick-unready`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
            }
          }).catch(console.error)
          
          // Close modal and show error
          onClose()
          return newTime
        }
        return newTime
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [status, matchId, onClose])

  // Reset timer and ready state when modal closes or status changes
  useEffect(() => {
    if (status === 'setup') {
      setWaitingTime(0)
      setIsReady(false)
      setOpponents([])
      setMatchIdFromWS(null)
    }
  }, [status])

  // Listen for WebSocket match_found events
  useEffect(() => {
    const wsClient = getWebSocketClient()
    
    const handleMatchFound = (data: any) => {
      console.log('🎯 Match found via WebSocket:', data)
      if (data.participants && data.participants.length >= 3) {
        const currentUserId = user?.id
        setMatchIdFromWS(data.matchId)
        setMatchId(data.matchId)
        
        // Set all participants (excluding current user)
        setOpponents(data.participants
          .filter((p: any) => p.userId !== currentUserId)
          .map((p: any) => ({
            username: p.name || p.username || 'Opponent',
            avatar: p.avatar || '🤖',
            isReady: false,
            rank: p.rank,
            userId: p.userId,
            name: p.name
          })))
        
        setStatus('found')
        
        // Subscribe to matchmaking room for updates
        wsClient.emit('subscribe_matchmaking_updates', { matchId: data.matchId })
      }
    }
    
    const handleParticipantsUpdated = (data: any) => {
      console.log('🔄 Participants updated:', data)
      if (data.matchId === matchIdFromWS || data.matchId === matchId) {
        const currentUserId = user?.id
        setOpponents(data.participants
          .filter((p: any) => p.userId !== currentUserId)
          .map((p: any) => ({
            username: p.name || p.username || 'Opponent',
            avatar: p.avatar || '🤖',
            isReady: false,
            rank: p.rank,
            userId: p.userId,
            name: p.name
          })))
      }
    }
    
    wsClient.on('match_found', handleMatchFound)
    wsClient.on('matchmaking_participants_updated', handleParticipantsUpdated)
    
    const handleQueueUpdate = (data: any) => {
      console.log('🔄 Queue update received:', data)
      if (status === 'search') {
        // Update opponents list with queued players (even if match not found yet)
        if (data.queuedPlayers && Array.isArray(data.queuedPlayers)) {
          const currentUserId = user?.id
          const filteredPlayers = data.queuedPlayers
            .filter((p: any) => p.userId !== currentUserId)
            .map((p: any) => ({
              username: p.name || p.username || 'Opponent',
              avatar: p.avatar || '🤖',
              isReady: false,
              rank: p.rank,
              userId: p.userId,
              name: p.name
            }))
          
          if (filteredPlayers.length > 0) {
            setOpponents(filteredPlayers)
            console.log('✅ Updated opponents list:', filteredPlayers)
          }
        }
      }
    }
    
    wsClient.on('matchmaking_queue_update', handleQueueUpdate)
    wsClient.on('player_joined_matchmaking', (data: any) => {
      // When a new player joins, we'll get a queue update from the processor
      console.log('👤 Player joined matchmaking:', data)
      // The queue update will be sent by the matchmaking processor
    })
    
    return () => {
      wsClient.off('match_found', handleMatchFound)
      wsClient.off('matchmaking_participants_updated', handleParticipantsUpdated)
      wsClient.off('matchmaking_queue_update', handleQueueUpdate)
      wsClient.off('player_joined_matchmaking', handleQueueUpdate)
    }
  }, [user, matchId, matchIdFromWS, status])

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // Check user's current EXP before showing confirmation
  const handleStartMatchClick = async () => {
    if (!isLanguageSelected) {
      return // Prevent starting if no language is selected
    }

    if (tempAccessActive) {
      onStart(selectedLanguage, { tempAccess: true })
      return
    }

    try {
      // Get user statistics to check EXP
      const { api } = await import('../utils/api')
      const stats = await api.getUserStatistics()
      const userExp = stats.statistics?.totalPoints || 0
      setCurrentExp(userExp)
      
      // Check if user has enough EXP
      if (userExp < 100) {
        alert(`Insufficient EXP! You need at least 100 EXP to start a match.\n\nYour current EXP: ${userExp}\nRequired EXP: 100`)
        return
      }
      
      // Show confirmation modal
      setShowExpConfirm(true)
    } catch (error: any) {
      console.error('Failed to get user statistics:', error)
      // Still show confirmation, but warn about potential issues
      setShowExpConfirm(true)
    }
  }

  const beginSearch = async () => {
    if (!isLanguageSelected) {
      return // Prevent starting if no language is selected
    }
    
    setShowExpConfirm(false)
    setStatus('search')
    setWaitingTime(0) // Reset timer when starting search
    setReadyTime(0) // Reset ready timer
    
    try {
      // Join matchmaking queue (uses algorithms for skill-based matching)
      const wsClient = getWebSocketClient()
      const canUseWebSocket = typeof (wsClient as any).connected === 'function' && wsClient.connected()

      if (canUseWebSocket) {
        wsClient.emit('join_matchmaking_queue', {
          matchType: 'ranked',
          language: selectedLanguage,
          matchSize: 3 // Minimum 3 players, maximum 5 for ranked matchmaking
        })
        return
      }

      const { api } = await import('../utils/api')
      const result = await api.joinMatchmakingQueue({
        matchType: 'ranked',
        language: selectedLanguage,
        matchSize: 3 // Minimum 3 players, maximum 5 for ranked matchmaking
      })
      
      setMatchId(result.matchId)
      
      // If immediately matched, show opponents
      if (result.status === 'matched' && result.opponents) {
        setOpponents(result.opponents.map((opp: any) => ({
          username: opp.userId || 'Opponent',
          avatar: '🤖',
          isReady: false,
          rank: opp.rank
        })))
        setStatus('found')
      } else {
        // Poll for match status
        let pollStartTime = Date.now()
        const pollInterval = setInterval(async () => {
          try {
            const statusResult = await api.getMatchmakingStatus(result.matchId)
            
            if (statusResult.status === 'pending' && statusResult.participantCount >= 3) {
              // Match found with enough participants (minimum 3, maximum 5)
              const currentUserId = user?.id
              
              setOpponents(statusResult.participants
                .filter((p: any) => p.userId !== currentUserId)
                .map((p: any) => ({
                  username: p.name || p.username || 'Opponent',
                  avatar: p.avatar || '🤖',
                  isReady: false,
                  rank: p.rank
                })))
              setStatus('found')
              clearInterval(pollInterval)
            } else if (statusResult.status === 'active' || statusResult.status === 'completed') {
              // Match already started or completed
              clearInterval(pollInterval)
              onStart(selectedLanguage) // Proceed to battle
              } else {
              // Check if 1 minute has passed
              const elapsedSeconds = Math.floor((Date.now() - pollStartTime) / 1000)
              if (elapsedSeconds >= 60 && !timeoutNotificationShownRef.current) {
                clearInterval(pollInterval)
                setTimeoutNotificationShown(true)
                
                const message = statusResult.participantCount > 0
                  ? `Failed to find a complete match after 1 minute.\n\nFound ${statusResult.participantCount} player(s), but need at least 3 players total.\n\nPossible reasons:\n• Not enough players online\n• No players with the same language preference\n• Players may have different ranks\n\nTry again later or select a different language.`
                  : `Failed to find a match after 1 minute.\n\nNo players were found in the matchmaking queue.\n\nPossible reasons:\n• No players are currently online\n• No players with the same language preference\n• Players may be in different rank brackets\n\nTry again later or select a different language.`
                
                setTimeoutMessage(message)
                setShowTimeoutNotification(true)
                setStatus('setup')
              }
            }
          } catch (pollError) {
            console.error('Error polling matchmaking status:', pollError)
            // Check timeout even on error
            const elapsedSeconds = Math.floor((Date.now() - pollStartTime) / 1000)
            if (elapsedSeconds >= 60 && !timeoutNotificationShownRef.current) {
              clearInterval(pollInterval)
              setTimeoutNotificationShown(true)
              setTimeoutMessage('Failed to find a match after 1 minute.\n\nNo players are currently online or available for matchmaking.\n\nTry again later or select a different language.')
              setShowTimeoutNotification(true)
              setStatus('setup')
            }
          }
        }, 2000) // Poll every 2 seconds
        
        // Cleanup interval after 1 minute + buffer (65 seconds total)
        setTimeout(() => {
          clearInterval(pollInterval)
        }, 65 * 1000)
      }
    } catch (error: any) {
      console.error('Failed to join matchmaking queue:', error)
      setStatus('setup')

      let errorMessage = 'Failed to join matchmaking queue.'
      let errorHint = ''

      console.error('Matchmaking error details:', {
        error,
        response: error.response,
        message: error.message,
        status: error.status
      })

      if (error.response) {
        const details = error.response.details || error.details

        if (details && typeof details === 'object') {
          if (typeof details.message === 'string' && details.message.trim().length > 0) {
            errorMessage = details.message
          }
          if (typeof details.hint === 'string' && details.hint.trim().length > 0) {
            errorHint = details.hint
          }
        }

        if (!details || !details.message) {
          if (error.response.error) {
            errorMessage = error.response.error
          } else if (error.response.message) {
            errorMessage = error.response.message
          } else if (typeof error.response.details === 'string') {
            errorMessage = error.response.details
          }
        }
      } else if (error.message) {
        errorMessage = error.message
      }

      const fullErrorMessage = errorHint
        ? `${errorMessage}\n\n${errorHint}`
        : errorMessage
      alert(fullErrorMessage)
    }
  }

  // Simulate opponents becoming ready (for demo purposes)
  useEffect(() => {
    if (status === 'found' && opponents.length > 0) {
      // Simulate opponents becoming ready after a delay
      const readyTimers = opponents.map((opp, index) => {
        return setTimeout(() => {
          setOpponents(prev => prev.map((o, i) => 
            i === index ? { ...o, isReady: true } : o
          ))
        }, (index + 1) * 1000) // Stagger ready times
      })

      return () => {
        readyTimers.forEach(timer => clearTimeout(timer))
      }
    }
  }, [status, opponents.length])

  // Auto-start match when all players are ready
  useEffect(() => {
    if (allReady && isReady && matchId) {
      // Small delay to show the "All players ready" message
      const startTimer = setTimeout(() => {
        // Navigate to battle room with matchId
        window.location.href = `/dashboard/student/battle/room?matchId=${matchId}&language=${encodeURIComponent(selectedLanguage)}`
      }, 1500)
      return () => clearTimeout(startTimer)
    }
  }, [allReady, isReady, matchId, selectedLanguage])

  const handleReady = async () => {
    if (!matchId || isReady) return
    
    try {
      const { api } = await import('../utils/api')
      await api.markBattleReady(matchId)
      setIsReady(true)
    } catch (error) {
      console.error('Failed to mark as ready:', error)
    }
  }

  return (
    <div className="auth-overlay" onClick={onClose}>
      <div 
        className="auth-modal" 
        onClick={(e) => e.stopPropagation()} 
        style={{ width: '80vw', maxWidth: '1100px', overflowY: 'hidden' }}
      >
        <div className="auth-header">
          <h3 className="auth-title text-center">Ranked Matchmaking</h3>
          <button className="auth-close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="auth-body" style={{ textAlign: 'center', overflowY: 'visible' }}>
          {/* Language Selection Dropdown */}
          <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <label style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255, 255, 255, 0.9)' }}>Language:</label>
              <select
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value)}
                required
                disabled={status === 'search' || status === 'found'}
                style={{
                  padding: '8px 12px',
                  fontSize: 14,
                  fontWeight: 600,
                  background: selectedLanguage ? 'rgba(123, 92, 255, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                  border: selectedLanguage ? '1px solid rgba(123, 92, 255, 0.35)' : '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: 8,
                  color: selectedLanguage ? '#fff' : 'rgba(255, 255, 255, 0.5)',
                  cursor: (status === 'search' || status === 'found') ? 'not-allowed' : 'pointer',
                  outline: 'none',
                  minWidth: 150,
                  opacity: (status === 'search' || status === 'found') ? 0.6 : 1
                }}
              >
                <option value="" disabled style={{ background: '#1a1a2e', color: 'rgba(255, 255, 255, 0.5)' }}>
                  Select a language...
                </option>
                {languages.map((lang) => (
                  <option key={lang.id} value={lang.id} style={{ background: '#1a1a2e', color: '#fff' }}>
                    {lang.name}
                  </option>
                ))}
              </select>
            </div>
            {status === 'search' && (
              <div style={{
                fontSize: 16,
                fontWeight: 700,
                color: '#7b5cff',
                padding: '8px 16px',
                background: 'rgba(123, 92, 255, 0.1)',
                border: '1px solid rgba(123, 92, 255, 0.3)',
                borderRadius: 8,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}>
                <span>⏱️</span>
                <span>{formatTime(waitingTime)}</span>
              </div>
            )}
            {status === 'found' && !allReady && readyTime > 0 && (
              <div style={{
                fontSize: 14,
                fontWeight: 600,
                color: readyTime >= 100 ? '#f87171' : 'rgba(255, 255, 255, 0.8)',
                padding: '8px 16px',
                background: readyTime >= 100 ? 'rgba(248, 113, 113, 0.1)' : 'rgba(123, 92, 255, 0.1)',
                border: readyTime >= 100 ? '1px solid rgba(248, 113, 113, 0.3)' : '1px solid rgba(123, 92, 255, 0.3)',
                borderRadius: 8,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}>
                <span>⏱️</span>
                <span>Time remaining: {Math.max(0, 120 - readyTime)}s</span>
              </div>
            )}
          </div>
          {tempAccessActive && (
            <div style={{
              marginBottom: 16,
              padding: '12px 16px',
              borderRadius: 8,
              background: 'rgba(34, 197, 94, 0.1)',
              border: '1px solid rgba(34, 197, 94, 0.3)',
              color: '#4ade80',
              fontSize: 13,
              fontWeight: 600,
              textAlign: 'center'
            }}>
              Temporary battle access is ON. Starting a match will open the Battle Room in local demo mode without matchmaking or EXP deductions.
            </div>
          )}
          {/* Players row (supports up to 5 players) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 12 }}>
            {/* Current user slot */}
            <div style={{ 
              background: 'rgba(123, 92, 255, 0.08)', 
              border: '1px solid rgba(123, 92, 255, 0.25)', 
              borderRadius: 10, 
              padding: 16, 
              textAlign: 'center',
              position: 'relative'
            }}>
              {isReady && (
                <div style={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  background: '#4ade80',
                  border: '2px solid #fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 8px rgba(74, 222, 128, 0.4)',
                  zIndex: 10
                }}>
                  <span style={{ color: '#fff', fontSize: 14, fontWeight: 'bold' }}>✓</span>
                </div>
              )}
              {currentUser.avatarUrl ? (
                <img 
                  src={currentUser.avatarUrl} 
                  alt="Profile" 
                  style={{ 
                    width: 60, 
                    height: 60, 
                    borderRadius: '50%', 
                    objectFit: 'cover',
                    marginBottom: 8,
                    border: '2px solid rgba(123, 92, 255, 0.5)'
                  }} 
                />
              ) : (
                <div style={{ 
                  fontSize: 40, 
                  width: 60, 
                  height: 60, 
                  borderRadius: '50%', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  margin: '0 auto 8px',
                  background: 'rgba(123, 92, 255, 0.2)',
                  border: '2px solid rgba(123, 92, 255, 0.5)'
                }}>
                  {(currentUser.firstName?.charAt(0) || currentUser.lastName?.charAt(0) || currentUser.username?.charAt(0) || 'U').toUpperCase()}
                </div>
              )}
              <div style={{ fontWeight: 700, marginTop: 4, fontSize: 14 }}>
                {currentUser.firstName && currentUser.lastName 
                  ? `${currentUser.firstName} ${currentUser.lastName}`
                  : currentUser.firstName || currentUser.lastName
                  ? `${currentUser.firstName || ''}${currentUser.lastName || ''}`.trim()
                  : currentUser.username}
              </div>
              {currentUser.schoolId && (
                <div style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.6)', marginTop: 4 }}>
                  {currentUser.schoolId}
                </div>
              )}
              {isReady && (
                <div style={{ 
                  fontSize: 12, 
                  color: '#4ade80', 
                  marginTop: 4,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4
                }}>
                  <span>✓</span>
                  <span>Ready</span>
                </div>
              )}
            </div>
            {/* Opponent placeholders (up to 4 slots for 3-5 total players) */}
            {[0,1,2,3].map((i) => {
              const opp = opponents[i]
              const isFilled = Boolean(opp)
              const opponentReady = opp?.isReady || false
              return (
                <div 
                  key={i} 
                  style={{ 
                    background: isFilled ? 'rgba(123, 92, 255, 0.08)' : 'rgba(255,255,255,0.04)', 
                    border: isFilled ? '1px solid rgba(123, 92, 255, 0.25)' : '1px dashed rgba(255,255,255,0.2)', 
                    borderRadius: 10, 
                    padding: 16, 
                    textAlign: 'center',
                    position: 'relative'
                  }}
                >
                  {opponentReady && (
                    <div style={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      background: '#4ade80',
                      border: '2px solid #fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 2px 8px rgba(74, 222, 128, 0.4)',
                      zIndex: 10
                    }}>
                      <span style={{ color: '#fff', fontSize: 14, fontWeight: 'bold' }}>✓</span>
                    </div>
                  )}
                  {isFilled ? (
                    <>
                      <div style={{ fontSize: 40 }}>{opp?.avatar || '👤'}</div>
                      <div style={{ fontWeight: 700, marginTop: 6 }}>{opp?.username || opp?.name}</div>
                      {opp?.rank && (
                        <div style={{ 
                          fontSize: 11, 
                          color: '#bda7ff', 
                          marginTop: 4,
                          fontWeight: 500,
                          textTransform: 'capitalize'
                        }}>
                          {opp.rank}
                        </div>
                      )}
                      {opponentReady && (
                        <div style={{ 
                          fontSize: 12, 
                          color: '#4ade80', 
                          marginTop: 4,
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 4
                        }}>
                          <span>✓</span>
                          <span>Ready</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 14, opacity: 0.8 }}>Waiting...</div>
                      {status === 'search' && i === opponents.length && <div style={{ marginTop: 8, fontSize: 28 }}>🔎</div>}
                    </>
                  )}
                </div>
              )
            })}
          </div>
          <div style={{ textAlign: 'center', fontSize: 16, fontWeight: 800, color: '#bda7ff', marginBottom: 8 }}>VS</div>
          
          {/* Status message */}
          {status === 'search' && (
            <div style={{ textAlign: 'center', fontSize: 14, color: 'rgba(255, 255, 255, 0.7)', marginBottom: 12 }}>
              {opponents.length > 0 
                ? `Found ${opponents.length} player(s). Waiting for ${3 - (opponents.length + 1)} more... (Minimum 3 players, Maximum 5 players)`
                : 'Searching for opponents... (Minimum 3 players, Maximum 5 players)'}
            </div>
          )}
          {status === 'found' && (
            <div style={{ textAlign: 'center', fontSize: 14, color: 'rgba(255, 255, 255, 0.7)', marginBottom: 12 }}>
              Match found! Waiting for all players to be ready... ({opponents.length + 1} / {opponents.length + 1} players)
            </div>
          )}

          {/* Controls */}
          {status === 'setup' && (
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button className="btn-secondary" onClick={onClose}>Cancel</button>
              <button 
                className="btn-primary" 
                onClick={handleStartMatchClick}
                disabled={!isLanguageSelected}
                style={{
                  opacity: isLanguageSelected ? 1 : 0.5,
                  cursor: isLanguageSelected ? 'pointer' : 'not-allowed',
                  pointerEvents: isLanguageSelected ? 'auto' : 'none'
                }}
              >
                Start Match
              </button>
            </div>
          )}
          {status === 'search' && (
            <>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 12 }}>
                <button className="btn-secondary" onClick={onClose}>Cancel</button>
              </div>
            </>
          )}
              {status === 'found' && (
            <>
              {!allReady && (
                <div style={{ 
                  fontSize: 14, 
                  marginTop: 8, 
                  textAlign: 'center',
                  color: 'rgba(255, 255, 255, 0.7)'
                }}>
                  Waiting for all players to be ready...
                </div>
              )}
              {allReady && (
                <div style={{ 
                  fontSize: 14, 
                  marginTop: 8, 
                  textAlign: 'center',
                  color: '#4ade80',
                  fontWeight: 600
                }}>
                  All players ready! Starting match...
                </div>
              )}
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 12 }}>
                <button className="btn-secondary" onClick={onClose}>Cancel</button>
                <button 
                  className="btn-primary" 
                  onClick={handleReady}
                  disabled={isReady}
                  style={{
                    opacity: isReady ? 0.7 : 1,
                    cursor: isReady ? 'not-allowed' : 'pointer'
                  }}
                >
                  {isReady ? '✓ Ready' : 'Ready'}
                </button>
              </div>
              {/* Auto-start when all players are ready */}
              {allReady && !isReady && (
                <div style={{ 
                  marginTop: 8,
                  textAlign: 'center',
                  fontSize: 12,
                  color: 'rgba(255, 255, 255, 0.6)'
                }}>
                  You can click Ready to start
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* EXP Deduction Confirmation Modal */}
      {showExpConfirm && (
        <ConfirmModal
          title="Start Ranked Match?"
          message={`Starting a ranked match will deduct 100 EXP from your account as a wager.\n\n${currentExp !== null ? `Your current EXP: ${currentExp}\nEXP after deduction: ${Math.max(0, currentExp - 100)}` : 'This will deduct 100 EXP from your account.'}\n\nAre you sure you want to proceed?`}
          confirmLabel="Yes, Start Match"
          cancelLabel="Cancel"
          onConfirm={beginSearch}
          onClose={() => setShowExpConfirm(false)}
        />
      )}

      {/* Timeout Notification Popup */}
      {showTimeoutNotification && (
        <div 
          className="auth-overlay" 
          onClick={() => {
            setShowTimeoutNotification(false)
            onClose()
          }}
          style={{ zIndex: 10001 }}
        >
          <div 
            className="auth-modal" 
            onClick={(e) => e.stopPropagation()}
            style={{ 
              maxWidth: '500px',
              background: 'linear-gradient(135deg, rgba(26, 26, 46, 0.98), rgba(20, 20, 35, 0.98))',
              border: '1px solid rgba(248, 113, 113, 0.3)',
              boxShadow: '0 20px 60px rgba(248, 113, 113, 0.3), 0 0 40px rgba(248, 113, 113, 0.1)'
            }}
          >
            <div className="auth-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  background: 'rgba(248, 113, 113, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 24
                }}>
                  ⚠️
                </div>
                <h3 className="auth-title" style={{ color: '#f87171', margin: 0 }}>
                  Matchmaking Timeout
                </h3>
              </div>
              <button 
                className="auth-close-btn" 
                onClick={() => {
                  setShowTimeoutNotification(false)
                  onClose()
                }}
              >
                ✕
              </button>
            </div>
            <div className="auth-body" style={{ padding: '24px' }}>
              <div style={{
                fontSize: 14,
                lineHeight: 1.6,
                color: 'rgba(255, 255, 255, 0.9)',
                whiteSpace: 'pre-line'
              }}>
                {timeoutMessage}
              </div>
              <div style={{
                marginTop: 24,
                display: 'flex',
                gap: 12,
                justifyContent: 'flex-end'
              }}>
                <button
                  className="btn-primary"
                  onClick={() => {
                    setShowTimeoutNotification(false)
                    onClose()
                  }}
                  style={{
                    background: 'linear-gradient(135deg, #7b5cff, #6d4cdb)',
                    border: 'none',
                    padding: '10px 24px',
                    fontSize: 14,
                    fontWeight: 600
                  }}
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


