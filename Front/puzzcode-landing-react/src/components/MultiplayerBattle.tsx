import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  Cell
} from 'recharts'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../utils/api'
import MatchmakingModal from './MatchmakingModal'
import ChallengeModal from './ChallengeModal'
import { getTempBattleAccess, setTempBattleAccess, TEMP_BATTLE_ACCESS_QUERY } from '../utils/battleAccess'
import { getWebSocketClient, initWebSocket, getLocalIP } from '../utils/websocket'

export default function MultiplayerBattle() {
  const [battleType, setBattleType] = useState<'quick' | 'ranked' | 'tournament' | null>(null)
  const [showMatchmaking, setShowMatchmaking] = useState(false)
  const [showChallengeModal, setShowChallengeModal] = useState(false)
  const [selectedOpponent, setSelectedOpponent] = useState<{ id: string; name: string } | null>(null)
  const navigate = useNavigate()
  const { user } = useAuth()
  const [yourStats, setYourStats] = useState({
    username: user?.username || '',
    rank: '0',
    rankName: 'Novice',
    wins: 0,
    losses: 0,
    winRate: 0,
    currentStreak: 0
  })
  const [quickBattleOpponents, setQuickBattleOpponents] = useState<Array<{ 
    id: string; 
    userId: string;
    schoolId: string; 
    skill: string; 
    winRate: number; 
    avatar: string; 
    isOnline: boolean;
    username?: string;
    firstName?: string;
    lastName?: string;
    rank?: string;
  }>>([])
  const [loadingOpponents, setLoadingOpponents] = useState(false)
  const [tempBattleAccessEnabled, setTempBattleAccessEnabled] = useState<boolean>(() => getTempBattleAccess())
  const [recentMatches, setRecentMatches] = useState<
    Array<{ opponent: string; result: 'Win' | 'Loss' | 'Pending' | 'Cancelled'; date: string }>
  >([])
  const [rankedRecentMatches, setRankedRecentMatches] = useState<
    Array<{ opponents: string[]; result: 'Win' | 'Loss'; date: string; ratingChange: number }>
  >([])
  const wsClientRef = useRef<ReturnType<typeof getWebSocketClient> | null>(null)
  const [localIP, setLocalIP] = useState<string | null>(null)
  const [wsConnected, setWsConnected] = useState(false)
  
  // View more states
  const [showAllOpponents, setShowAllOpponents] = useState(false)
  const [showAllChallengeMatches, setShowAllChallengeMatches] = useState(false)
  const [showAllRankedMatches, setShowAllRankedMatches] = useState(false)
  
  // Battle statistics for graph (from Ranked Mode and Challenges combined)
  const [battleStats, setBattleStats] = useState({
    wins: 0,
    losses: 0
  })

  // Initialize WebSocket connection
  useEffect(() => {
    if (!user) return

    const setupWebSocket = async () => {
      try {
        // Get local IP
        const ip = await getLocalIP()
        setLocalIP(ip)

        const token = localStorage.getItem('auth_token')
        if (!token) {
          console.warn('No auth token for WebSocket')
          return
        }

        const client = await initWebSocket(token, ip || undefined)
        wsClientRef.current = client
        setWsConnected(client.connected())

        // Listen for matchmaking events
        client.on('matchmaking_queued', (data: any) => {
          console.log('✅ Added to matchmaking queue:', data)
        })

        client.on('matchmaking_left', (data: any) => {
          console.log('Left matchmaking queue:', data)
        })

        client.on('match_found', (data: any) => {
          console.log('🎯 Match found!', data)
          // The MatchmakingModal will handle this event and display all participants
          // Don't navigate immediately - let the modal show all players first
        })
        
        // Listen for matchmaking participant updates
        client.on('matchmaking_participants_updated', (data: any) => {
          console.log('🔄 Matchmaking participants updated:', data)
          // The MatchmakingModal will handle this event
        })

        client.on('matchmaking_error', (data: any) => {
          console.error('Matchmaking error:', data)
          alert(data.error || 'Matchmaking error occurred')
        })

        client.on('connect', () => {
          setWsConnected(true)
        })

        client.on('disconnect', () => {
          setWsConnected(false)
        })

        client.on('reconnect', () => {
          setWsConnected(true)
        })
      } catch (error) {
        console.error('Failed to setup WebSocket:', error)
        setWsConnected(false)
      }
    }

    setupWebSocket()

    return () => {
      if (wsClientRef.current) {
        wsClientRef.current.disconnect()
      }
    }
  }, [user, navigate])

  // Fetch user statistics and rank
  useEffect(() => {
    const fetchUserStats = async () => {
      if (!user) return
      try {
        const result = await api.getUserStatistics()
        if (result.success && result.statistics) {
          const stats = result.statistics
          // Get rank position from multiplayer leaderboard (not overall)
          try {
            const leaderboardResult = await api.getLeaderboard('multiplayer', 100)
            if (leaderboardResult.success && leaderboardResult.leaderboard) {
              const userEntry = leaderboardResult.leaderboard.find((entry: any) => entry.userId === user.id)
              // Ensure rankPosition is always a number, not a rank name
              let rankPosition: string | number = '0'
              if (userEntry?.rank !== undefined && userEntry?.rank !== null) {
                // Check if it's already a number
                const rankValue = typeof userEntry.rank === 'number' 
                  ? userEntry.rank 
                  : typeof userEntry.rank === 'string' 
                    ? parseInt(userEntry.rank, 10) 
                    : 0
                // Only use if it's a valid number (not NaN and > 0)
                if (!isNaN(rankValue) && rankValue > 0) {
                  rankPosition = rankValue
                }
              }
              
              // Calculate win rate if we have the data
              const winRate = userEntry?.winRate !== undefined ? userEntry.winRate : 0
              
              // For multiplayer, don't use the overall rank name - use empty string or a multiplayer-specific label
              // The rank position is what matters for multiplayer
              setYourStats({
                username: user.username || '',
                rank: String(rankPosition),
                rankName: '', // Don't show overall rank name for multiplayer
                wins: stats.multiplayerWins || 0,
                losses: 0, // Not available in current API
                winRate: winRate,
                currentStreak: stats.currentStreak || 0
              })
            } else {
              // Fallback: set rank to '0' (not rank name) if leaderboard fails
              setYourStats({
                username: user.username || '',
                rank: '0',
                rankName: '', // Don't show overall rank name for multiplayer
                wins: stats.multiplayerWins || 0,
                losses: 0,
                winRate: 0,
                currentStreak: stats.currentStreak || 0
              })
            }
          } catch (err) {
            // Fallback: set rank to '0' (not rank name) if leaderboard fails
            setYourStats({
              username: user.username || '',
              rank: '0',
              rankName: '', // Don't show overall rank name for multiplayer
              wins: stats.multiplayerWins || 0,
              losses: 0,
              winRate: 0,
              currentStreak: stats.currentStreak || 0
            })
          }
        }
      } catch (error) {
        console.error('Failed to fetch user stats:', error)
      }
    }
    fetchUserStats()
  }, [user])

  // Fetch available opponents
  const fetchAvailableOpponents = async () => {
    if (!user) return
    setLoadingOpponents(true)
    try {
      const result = await api.getAvailableOpponents()
      if (result.success && result.opponents) {
        setQuickBattleOpponents(result.opponents)
      }
    } catch (error) {
      console.error('Failed to fetch available opponents:', error)
      setQuickBattleOpponents([])
    } finally {
      setLoadingOpponents(false)
    }
  }

  // Fetch opponents on mount and set up polling
  useEffect(() => {
    fetchAvailableOpponents()
    
    // Poll every 10 seconds for available opponents
    const interval = setInterval(() => {
      fetchAvailableOpponents()
    }, 10000)

    return () => clearInterval(interval)
  }, [user])

  const handleRankedClick = () => {
    setBattleType('ranked')
    setShowMatchmaking(true)
  }

  const startRankedMatch = async (language: string, options?: { tempAccess?: boolean }) => {
    if (options?.tempAccess) {
      setShowMatchmaking(false)
      const params = new URLSearchParams()
      params.set('language', language)
      params.set(TEMP_BATTLE_ACCESS_QUERY, '1')
      navigate(`/dashboard/student/battle/room?${params.toString()}`)
      return
    }

    // Use WebSocket matchmaking if available
    if (wsClientRef.current && wsConnected) {
      try {
        wsClientRef.current.emit('join_matchmaking_queue', {
          matchType: 'ranked',
          language,
          matchSize: 3 // Minimum 3 players, maximum 5 for ranked matchmaking
        })
        setShowMatchmaking(false)
        // Wait for match_found event to navigate
      } catch (error) {
        console.error('Failed to join matchmaking queue via WebSocket:', error)
        // Fallback to HTTP
        fallbackToHTTPMatchmaking(language)
      }
    } else {
      // Fallback to HTTP matchmaking
      fallbackToHTTPMatchmaking(language)
    }
  }

  const fallbackToHTTPMatchmaking = async (language: string) => {
    try {
      const result = await api.joinMatchmakingQueue({
        matchType: 'ranked',
        language,
        matchSize: 3 // Minimum 3 players, maximum 5 for ranked matchmaking
      })

      if (result.status === 'matched' && result.matchId) {
        setShowMatchmaking(false)
        const params = new URLSearchParams()
        params.set('matchId', result.matchId)
        params.set('language', language)
        navigate(`/dashboard/student/battle/room?${params.toString()}`)
      } else {
        // Queued, show waiting message
        alert('Added to matchmaking queue. Waiting for opponents...')
        setShowMatchmaking(false)
      }
    } catch (error: any) {
      console.error('Failed to join matchmaking queue:', error)
      alert(error.message || 'Failed to start matchmaking')
    }
  }

  const handleChallengeOpponent = (opponentId: string, opponentName: string) => {
    setSelectedOpponent({ id: opponentId, name: opponentName })
    setShowChallengeModal(true)
  }

  const handleChallengeSent = () => {
    alert('Challenge sent! Waiting for your opponent to respond.')
    // Refresh opponents list
    fetchAvailableOpponents()
  }

  // Load recent 1v1 challenge matches for the current user
  useEffect(() => {
    const loadRecentMatches = async () => {
      if (!user) return
      try {
        const response = await api.getRecentChallengeMatches()
        if (response?.success && Array.isArray(response.matches)) {
          setRecentMatches(
            response.matches.map((m: any) => ({
              opponent: m.opponent,
              // Backend may send 'Win' | 'Loss' | 'Pending' | 'Cancelled'
              result:
                m.result === 'Win' ||
                m.result === 'Loss' ||
                m.result === 'Cancelled'
                  ? m.result
                  : 'Pending',
              date: new Date(m.date).toLocaleString()
            }))
          )
          
          // Calculate battle statistics from challenge matches
          const wins = response.matches.filter((m: any) => m.result === 'Win').length
          const losses = response.matches.filter((m: any) => m.result === 'Loss').length
          setBattleStats(prev => ({
            wins: prev.wins + wins,
            losses: prev.losses + losses
          }))
        }
      } catch (error) {
        console.error('Failed to load recent challenge matches:', error)
      }
    }

    loadRecentMatches()
  }, [user])

  // Load recent ranked multiplayer matches for the current user
  useEffect(() => {
    const loadRankedMatches = async () => {
      if (!user) return
      try {
        const response = await api.getRecentRankedMatches()
        if (response?.success && Array.isArray(response.matches)) {
          setRankedRecentMatches(
            response.matches.map((m: any) => ({
              opponents: Array.isArray(m.opponents) ? m.opponents : [],
              result: m.result === 'Win' ? 'Win' : 'Loss',
              date: new Date(m.date).toLocaleString(),
              ratingChange: typeof m.ratingChange === 'number' ? m.ratingChange : 0
            }))
          )
          
          // Calculate battle statistics from ranked matches
          const wins = response.matches.filter((m: any) => m.result === 'Win').length
          const losses = response.matches.filter((m: any) => m.result === 'Loss').length
          
          setBattleStats(prev => ({
            wins: prev.wins + wins,
            losses: prev.losses + losses
          }))
        }
      } catch (error) {
        console.error('Failed to load recent ranked matches:', error)
      }
    }

    loadRankedMatches()
  }, [user])

  // Calculate win rate from battleStats for graph display only
  // Note: This is based on recent matches only, so it may differ from overall win rate
  const calculatedWinRate = battleStats.wins + battleStats.losses > 0
    ? Math.round((battleStats.wins / (battleStats.wins + battleStats.losses)) * 100)
    : 0
  
  // Use the win rate from leaderboard (all matches) for consistency with opponent display
  // This matches how opponents' win rates are calculated (all matches, not just recent)
  const displayWinRate = yourStats.winRate || calculatedWinRate

  // Get rank icon based on rank number or rank name
  const getRankIcon = (rank: string | number, rankName?: string): string => {
    // Check if user has master_coder rank - use crown icon like achievement card
    if (rankName && (rankName.toLowerCase() === 'master_coder' || rankName.toLowerCase() === 'master coder')) {
      return '👑'
    }
    
    const rankNum = typeof rank === 'string' ? parseInt(rank) || 0 : rank
    if (rankNum === 1) return '🥇'
    if (rankNum === 2) return '🥈'
    if (rankNum === 3) return '🥉'
    if (rankNum >= 4 && rankNum <= 5) return '💎'
    if (rankNum >= 6 && rankNum <= 7) return '🔷'
    if (rankNum >= 8 && rankNum <= 10) return '⭐'
    if (rankNum > 10 && rankNum <= 50) return '🎖️'
    return '🏆' // Default icon for ranks beyond 50 or unranked
  }

  const leaderboard = [
    { rank: 1, username: 'TopCoder', wins: 245, winRate: 89 },
    { rank: 2, username: 'CodeChampion', wins: 198, winRate: 87 },
    { rank: 3, username: 'AlgoMaster', wins: 187, winRate: 85 },
    { rank: 4, username: 'Yourself', wins: 45, winRate: 66 },
    { rank: 5, username: 'BugHunter', wins: 156, winRate: 83 }
  ]

  const battleTypes = [
    { 
      type: 'ranked', 
      title: 'Ranked Mode', 
      icon: '⚔️', 
      description: 'Competitive battles for rating',
      difficulty: 'Your Level',
      time: '30 min'
    }
  ]

  return (
    <div className="multiplayer-battle">
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Let the Battle Begin</h1>
          <p className="page-subtitle">Challenge other coders in competitive programming battles.</p>
          {localIP && (
            <p style={{ 
              marginTop: '8px', 
              fontSize: '14px', 
              color: 'rgba(255, 255, 255, 0.7)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span style={{ 
                display: 'inline-block',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: wsConnected ? '#22c55e' : '#ef4444'
              }} />
              {wsConnected ? 'Real-time connected' : 'Real-time disconnected'} 
              {localIP && ` • Local IP: ${localIP}`}
            </p>
          )}
        </div>
      </div>

      {/* Your Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ backgroundColor: '#7b5cff' }}>
            {yourStats.rank !== '0' ? getRankIcon(yourStats.rank, yourStats.rankName) : getRankIcon(0, yourStats.rankName)}
          </div>
          <div className="stat-content">
            <div className="stat-value">
              {yourStats.rank !== '0' && !isNaN(parseInt(yourStats.rank)) 
                ? yourStats.rank === '1' 
                  ? `#${yourStats.rank} Champion`
                  : `#${yourStats.rank}` 
                : 'Unranked'}
            </div>
            <div className="stat-label">Current Rank</div>
            {/* Don't show rank name for multiplayer - only show rank position */}
          </div>
        </div>
        {/* Battle level removed as requested */}
        <div className="stat-card">
          <div className="stat-icon" style={{ backgroundColor: '#2196f3' }}>
            📊
          </div>
          <div className="stat-content">
            <div className="stat-value">{displayWinRate}%</div>
            <div className="stat-label">Win Rate</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ backgroundColor: '#ff9800' }}>
            🔥
          </div>
          <div className="stat-content">
            <div className="stat-value">{yourStats.currentStreak}</div>
            <div className="stat-label">Win Streak</div>
          </div>
        </div>
      </div>

      {/* Battle Statistics Graph */}
      <div className="dashboard-card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <h3 className="card-title">Battle Statistics</h3>
        </div>
        <div className="card-content" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Recharts Bar Chart - Wins, Losses, and Win Rate */}
          {battleStats.wins + battleStats.losses > 0 ? (
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={[
                    { name: 'Wins', value: battleStats.wins, color: '#4ade80' },
                    { name: 'Losses', value: battleStats.losses, color: '#f87171' },
                    { 
                      name: 'Win Rate', 
                      value: calculatedWinRate, 
                      color: '#7b5cff' 
                    }
                  ]}
                  margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                >
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                  <XAxis
                    dataKey="name"
                    stroke="rgba(255,255,255,0.6)"
                    tickLine={false}
                    axisLine={false}
                    minTickGap={24}
                  />
                  <YAxis
                    stroke="rgba(255,255,255,0.6)"
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                    width={46}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null
                      const data = payload[0].payload
                      return (
                        <div
                          style={{
                            backgroundColor: 'rgba(13,10,25,0.95)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: 12,
                            padding: '10px 12px',
                            minWidth: 140
                          }}
                        >
                          <div style={{ color: '#fff', fontWeight: 600, marginBottom: 6 }}>{data.name}</div>
                          <div style={{ color: '#b8a9ff', fontSize: 13 }}>
                            {data.name === 'Win Rate' 
                              ? `${data.name}: ${data.value}%` 
                              : `${data.name}: ${data.value}`}
                          </div>
                        </div>
                      )
                    }}
                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                  />
                  <Bar
                    dataKey="value"
                    name="Value"
                    radius={[6, 6, 0, 0]}
                  >
                    {[
                      { name: 'Wins', value: battleStats.wins, color: '#4ade80' },
                      { name: 'Losses', value: battleStats.losses, color: '#f87171' },
                      { 
                        name: 'Win Rate', 
                        value: calculatedWinRate, 
                        color: '#7b5cff' 
                      }
                    ].map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="course-item empty-state">
              <div className="course-name">No battle data yet</div>
              <div className="course-difficulty" style={{ marginTop: 8, fontSize: 13, opacity: 0.7 }}>
                Complete battles to see your statistics
              </div>
            </div>
          )}
          
          {/* Summary stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <div style={{ textAlign: 'center', padding: '12px', background: 'rgba(74, 222, 128, 0.1)', borderRadius: 8, border: '1px solid rgba(74, 222, 128, 0.3)' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#4ade80' }}>{battleStats.wins}</div>
              <div style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.7)' }}>Total Wins</div>
            </div>
            <div style={{ textAlign: 'center', padding: '12px', background: 'rgba(248, 113, 113, 0.1)', borderRadius: 8, border: '1px solid rgba(248, 113, 113, 0.3)' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#f87171' }}>{battleStats.losses}</div>
              <div style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.7)' }}>Total Losses</div>
            </div>
            <div style={{ textAlign: 'center', padding: '12px', background: 'rgba(123, 92, 255, 0.1)', borderRadius: 8, border: '1px solid rgba(123, 92, 255, 0.3)' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#7b5cff' }}>
                {displayWinRate}%
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.7)' }}>Win Rate</div>
            </div>
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        {/* Battle Types */}
        <div className="dashboard-card">
          <div className="card-header">
            <h3 className="card-title">Start a Battle</h3>
          </div>
          <div className="card-content">
            <div className="battle-types">
              {battleTypes.map((battle) => (
                <div 
                  key={battle.type}
                  className="battle-type-card"
                  onClick={handleRankedClick}
                >
                  <div className="battle-type-icon">{battle.icon}</div>
                  <div className="battle-type-content">
                    <h4>{battle.title}</h4>
                    <p>{battle.description}</p>
                    <div className="battle-type-meta">
                      <span>Difficulty: {battle.difficulty}</span>
                      <span>⏱️ {battle.time}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Available Opponents */}
        <div className="dashboard-card">
          <div className="card-header">
            <h3 className="card-title">Available Opponents</h3>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              {quickBattleOpponents.length > 5 && (
                <button
                  className="card-action"
                  onClick={() => setShowAllOpponents(!showAllOpponents)}
                >
                  {showAllOpponents ? 'View Less' : `View More (${quickBattleOpponents.length - 5} more)`}
                </button>
              )}
            <button 
              className="card-action" 
              onClick={fetchAvailableOpponents}
              disabled={loadingOpponents}
            >
              {loadingOpponents ? 'Loading...' : 'Refresh'}
            </button>
            </div>
          </div>
          <div className="card-content">
            <div className="opponents-list">
              {loadingOpponents ? (
                <div className="opponent-item" style={{ justifyContent: 'center', padding: '24px' }}>
                  <div style={{ textAlign: 'center', color: 'rgba(255, 255, 255, 0.5)' }}>
                    <div>Loading opponents...</div>
                  </div>
                </div>
              ) : quickBattleOpponents.length === 0 ? (
                <div className="opponent-item" style={{ justifyContent: 'center', padding: '24px' }}>
                  <div style={{ textAlign: 'center', color: 'rgba(255, 255, 255, 0.5)' }}>
                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>👥</div>
                    <div>No opponents available yet</div>
                  </div>
                </div>
              ) : (
                <>
                  {(showAllOpponents ? quickBattleOpponents : quickBattleOpponents.slice(0, 5)).map((opponent) => (
                    <div key={opponent.id || opponent.userId} className="opponent-item">
                      <div className="opponent-avatar-container">
                        <div className="opponent-avatar">
                          {opponent.avatar ? (
                            <img 
                              src={opponent.avatar} 
                              alt={opponent.username || opponent.schoolId}
                              style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
                            />
                          ) : (
                            (opponent.firstName?.charAt(0) || opponent.lastName?.charAt(0) || opponent.username?.charAt(0) || opponent.schoolId?.charAt(0) || '?').toUpperCase()
                          )}
                        </div>
                        <div className={`online-status ${opponent.isOnline ? 'online' : 'offline'}`}>
                          {opponent.isOnline ? '🟢' : '⚫'}
                        </div>
                      </div>
                      <div className="opponent-info">
                        <div className="opponent-schoolid">
                          {opponent.firstName && opponent.lastName 
                            ? `${opponent.firstName} ${opponent.lastName}`
                            : opponent.schoolId || opponent.username}
                        </div>
                        <div className="opponent-details">
                          <span className={`skill-badge ${opponent.skill.toLowerCase()}`}>
                            {opponent.skill}
                          </span>
                          <span className="win-rate">Win Rate: {opponent.winRate}%</span>
                          {opponent.rank && (
                            <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.6)', marginLeft: '8px' }}>
                              {opponent.rank}
                            </span>
                          )}
                        </div>
                      </div>
                      <button 
                        className="btn-challenge" 
                        disabled={!opponent.isOnline}
                        onClick={() => handleChallengeOpponent(
                          opponent.userId || opponent.id,
                          opponent.firstName && opponent.lastName 
                            ? `${opponent.firstName} ${opponent.lastName}`
                            : opponent.schoolId || opponent.username || 'Opponent'
                        )}
                      >
                        {opponent.isOnline ? 'Challenge' : 'Offline'}
                      </button>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Top Players section removed as requested */}

        {/* Recent Challenge Matches */}
        <div className="dashboard-card">
          <div className="card-header">
            <h3 className="card-title">Recent Challenge Matches</h3>
            {recentMatches.length > 5 && (
              <button
                className="card-action"
                onClick={() => setShowAllChallengeMatches(!showAllChallengeMatches)}
              >
                {showAllChallengeMatches ? 'View Less' : `View More (${recentMatches.length - 5} more)`}
              </button>
            )}
          </div>
          <div className="card-content">
            <div className="matches-list">
              {recentMatches.length === 0 ? (
                <div className="match-item" style={{ justifyContent: 'center' }}>
                  <div className="match-date">No challenge matches yet</div>
                </div>
              ) : (
                <>
                  {(showAllChallengeMatches ? recentMatches : recentMatches.slice(0, 5)).map((match, index) => (
                    <div key={index} className="match-item">
                      <div className="match-result">
                        <span className={`result-badge ${match.result.toLowerCase()}`}>
                          {match.result}
                        </span>
                      </div>
                      <div className="match-opponent">vs {match.opponent}</div>
                      <div className="match-date">{match.date}</div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Recent Ranked Matches */}
        <div className="dashboard-card">
          <div className="card-header">
            <h3 className="card-title">Recent Ranked Matches</h3>
            {rankedRecentMatches.length > 5 && (
              <button
                className="card-action"
                onClick={() => setShowAllRankedMatches(!showAllRankedMatches)}
              >
                {showAllRankedMatches ? 'View Less' : `View More (${rankedRecentMatches.length - 5} more)`}
              </button>
            )}
          </div>
          <div className="card-content">
            <div className="matches-list">
              {rankedRecentMatches.length === 0 ? (
                <div className="match-item" style={{ justifyContent: 'center' }}>
                  <div className="match-date">No ranked matches yet</div>
                </div>
              ) : (
                <>
                  {(showAllRankedMatches ? rankedRecentMatches : rankedRecentMatches.slice(0, 5)).map((match, index) => (
                    <div key={index} className="match-item">
                      <div className="match-result">
                        <span className={`result-badge ${match.result.toLowerCase()}`}>
                          {match.result}
                        </span>
                      </div>
                      <div className="match-opponent">
                        <span>vs {match.opponents.join(', ')}</span>
                        <span className="meta-divider" />
                        <span className="players-count">Players: {match.opponents.length + 1}</span>
                      </div>
                      <div className="match-date">{match.date}</div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      {showMatchmaking && (
        <MatchmakingModal 
          onClose={() => setShowMatchmaking(false)} 
          onStart={startRankedMatch} 
          tempAccessEnabled={tempBattleAccessEnabled}
          currentUser={{
            username: user?.username || yourStats.username,
            firstName: user?.firstName || '',
            lastName: user?.lastName || '',
            schoolId: user?.schoolId || '',
            avatarUrl: user?.avatarUrl || ''
          }}
        />
      )}
      {showChallengeModal && selectedOpponent && (
        <ChallengeModal
          opponentId={selectedOpponent.id}
          opponentName={selectedOpponent.name}
          onClose={() => {
            setShowChallengeModal(false)
            setSelectedOpponent(null)
          }}
          onChallengeSent={handleChallengeSent}
        />
      )}
    </div>
  )
}

