import React, { useState, useEffect } from 'react'
import { api } from '../utils/api'
import { useAuth } from '../contexts/AuthContext'

// Custom Rank Emblem SVG Components
const GoldMedalEmblem = ({ size = 80 }: { size?: number }) => {
  const gradientId = `goldGradient-${Math.random().toString(36).substr(2, 9)}`
  return (
    <svg width={size} height={size} viewBox="0 0 100 120" style={{ display: 'block' }}>
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFD700" />
          <stop offset="50%" stopColor="#FFA500" />
          <stop offset="100%" stopColor="#FF8C00" />
        </linearGradient>
      </defs>
      {/* Ribbon */}
      <path d="M20 10 L50 25 L80 10 L75 35 L50 30 L25 35 Z" fill="#FFD700" stroke="#FFA500" strokeWidth="1.5"/>
      <path d="M25 20 L50 30 L75 20" stroke="#FFA500" strokeWidth="1" fill="none"/>
      {/* Medal Circle */}
      <circle cx="50" cy="70" r="35" fill="#FFD700" stroke="#FFA500" strokeWidth="3"/>
      <circle cx="50" cy="70" r="28" fill={`url(#${gradientId})`} stroke="#FFA500" strokeWidth="2"/>
      {/* Number 1 */}
      <text x="50" y="82" fontSize="36" fontWeight="900" fill="#1a1a1a" textAnchor="middle" fontFamily="Arial, sans-serif">1</text>
      {/* Crown detail */}
      <path d="M35 25 L50 15 L65 25 L60 30 L50 25 L40 30 Z" fill="#FFD700" opacity="0.8"/>
    </svg>
  )
}

const SilverMedalEmblem = ({ size = 80 }: { size?: number }) => {
  const gradientId = `silverGradient-${Math.random().toString(36).substr(2, 9)}`
  return (
    <svg width={size} height={size} viewBox="0 0 100 120" style={{ display: 'block' }}>
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#E8E8E8" />
          <stop offset="50%" stopColor="#C0C0C0" />
          <stop offset="100%" stopColor="#A8A8A8" />
        </linearGradient>
      </defs>
      {/* Ribbon */}
      <path d="M20 10 L50 25 L80 10 L75 35 L50 30 L25 35 Z" fill="#C0C0C0" stroke="#A8A8A8" strokeWidth="1.5"/>
      <path d="M25 20 L50 30 L75 20" stroke="#A8A8A8" strokeWidth="1" fill="none"/>
      {/* Medal Circle */}
      <circle cx="50" cy="70" r="35" fill="#C0C0C0" stroke="#A8A8A8" strokeWidth="3"/>
      <circle cx="50" cy="70" r="28" fill={`url(#${gradientId})`} stroke="#A8A8A8" strokeWidth="2"/>
      {/* Number 2 */}
      <text x="50" y="82" fontSize="36" fontWeight="900" fill="#1a1a1a" textAnchor="middle" fontFamily="Arial, sans-serif">2</text>
    </svg>
  )
}

const BronzeMedalEmblem = ({ size = 80 }: { size?: number }) => {
  const gradientId = `bronzeGradient-${Math.random().toString(36).substr(2, 9)}`
  return (
    <svg width={size} height={size} viewBox="0 0 100 120" style={{ display: 'block' }}>
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#CD7F32" />
          <stop offset="50%" stopColor="#B87333" />
          <stop offset="100%" stopColor="#A0522D" />
        </linearGradient>
      </defs>
      {/* Green Ribbon */}
      <path d="M20 10 L50 25 L80 10 L75 35 L50 30 L25 35 Z" fill="#4CAF50" stroke="#2E7D32" strokeWidth="1.5"/>
      <path d="M25 20 L50 30 L75 20" stroke="#2E7D32" strokeWidth="1" fill="none"/>
      {/* Medal Circle */}
      <circle cx="50" cy="70" r="35" fill="#CD7F32" stroke="#B87333" strokeWidth="3"/>
      <circle cx="50" cy="70" r="28" fill={`url(#${gradientId})`} stroke="#B87333" strokeWidth="2"/>
      {/* Number 3 */}
      <text x="50" y="82" fontSize="36" fontWeight="900" fill="#1a1a1a" textAnchor="middle" fontFamily="Arial, sans-serif">3</text>
    </svg>
  )
}

const PurpleBadgeEmblem = ({ size = 80, label = '10' }: { size?: number; label?: string }) => {
  const gradientId = `purpleGradient-${Math.random().toString(36).substr(2, 9)}`
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: 'block' }}>
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#7b5cff" />
          <stop offset="50%" stopColor="#9d7aff" />
          <stop offset="100%" stopColor="#b89aff" />
        </linearGradient>
      </defs>
      {/* Purple Badge Shape */}
      <path d="M50 10 L75 25 L75 50 L50 90 L25 50 L25 25 Z" fill={`url(#${gradientId})`} stroke="#9d7aff" strokeWidth="2.5"/>
      <circle cx="50" cy="50" r="20" fill="rgba(0,0,0,0.2)"/>
      <text x="50" y="58" fontSize="24" fontWeight="900" fill="#ffffff" textAnchor="middle" fontFamily="Arial, sans-serif">
        {label}
      </text>
    </svg>
  )
}

const Top4BadgeEmblem = ({ size = 80 }: { size?: number }) => {
  const gradientId = `top4Gradient-${Math.random().toString(36).substr(2, 9)}`
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: 'block' }}>
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ff6b6b" />
          <stop offset="50%" stopColor="#ff8787" />
          <stop offset="100%" stopColor="#ffa3a3" />
        </linearGradient>
      </defs>
      {/* Red Diamond Badge */}
      <path d="M50 15 L70 35 L50 85 L30 35 Z" fill={`url(#${gradientId})`} stroke="#ff8787" strokeWidth="2.5"/>
      <circle cx="50" cy="50" r="18" fill="rgba(0,0,0,0.2)"/>
      <text x="50" y="58" fontSize="22" fontWeight="900" fill="#ffffff" textAnchor="middle" fontFamily="Arial, sans-serif">4</text>
    </svg>
  )
}

const Top5BadgeEmblem = ({ size = 80 }: { size?: number }) => {
  const gradientId = `top5Gradient-${Math.random().toString(36).substr(2, 9)}`
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: 'block' }}>
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffa502" />
          <stop offset="50%" stopColor="#ffbe76" />
          <stop offset="100%" stopColor="#ffd59e" />
        </linearGradient>
      </defs>
      {/* Shield Badge */}
      <path d="M50 12 L80 25 L80 50 C80 70 65 85 50 90 C35 85 20 70 20 50 L20 25 Z" 
        fill={`url(#${gradientId})`} stroke="#ffbe76" strokeWidth="2.5"/>
      <circle cx="50" cy="48" r="20" fill="rgba(0,0,0,0.2)"/>
      <text x="50" y="55" fontSize="24" fontWeight="900" fill="#ffffff" textAnchor="middle" fontFamily="Arial, sans-serif">5</text>
    </svg>
  )
}

const Top6BadgeEmblem = ({ size = 80, rank = 6 }: { size?: number; rank?: number }) => {
  const gradientId = `top6Gradient-${Math.random().toString(36).substr(2, 9)}`
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: 'block' }}>
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4ecdc4" />
          <stop offset="50%" stopColor="#6eddd6" />
          <stop offset="100%" stopColor="#8eede8" />
        </linearGradient>
      </defs>
      {/* Teal Hexagon Badge */}
      <path d="M50 10 L75 25 L75 50 L50 75 L25 50 L25 25 Z" fill={`url(#${gradientId})`} stroke="#6eddd6" strokeWidth="2.5"/>
      <circle cx="50" cy="50" r="18" fill="rgba(0,0,0,0.2)"/>
      <text x="50" y="58" fontSize="20" fontWeight="900" fill="#ffffff" textAnchor="middle" fontFamily="Arial, sans-serif">{rank}</text>
    </svg>
  )
}

const Top8BadgeEmblem = ({ size = 80, rank = 8 }: { size?: number; rank?: number }) => {
  const gradientId = `top8Gradient-${Math.random().toString(36).substr(2, 9)}`
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: 'block' }}>
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#feca57" />
          <stop offset="50%" stopColor="#ffd780" />
          <stop offset="100%" stopColor="#ffe4a9" />
        </linearGradient>
      </defs>
      {/* Yellow Octagon Badge */}
      <path d="M50 5 L70 10 L85 25 L90 45 L85 65 L70 80 L50 85 L30 80 L15 65 L10 45 L15 25 L30 10 Z" fill={`url(#${gradientId})`} stroke="#ffd780" strokeWidth="2.5"/>
      <circle cx="50" cy="45" r="18" fill="rgba(0,0,0,0.2)"/>
      <text x="50" y="53" fontSize="20" fontWeight="900" fill="#ffffff" textAnchor="middle" fontFamily="Arial, sans-serif">{rank}</text>
    </svg>
  )
}

const StarBadgeEmblem = ({ size = 80 }: { size?: number }) => {
  const gradientId = `starGradient-${Math.random().toString(36).substr(2, 9)}`
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: 'block' }}>
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4caf50" />
          <stop offset="50%" stopColor="#66bb6a" />
          <stop offset="100%" stopColor="#81c784" />
        </linearGradient>
      </defs>
      {/* Star Shape */}
      <path d="M50 5 L61 35 L95 35 L68 55 L79 85 L50 65 L21 85 L32 55 L5 35 L39 35 Z" 
            fill={`url(#${gradientId})`} stroke="#66bb6a" strokeWidth="2"/>
      <circle cx="50" cy="50" r="15" fill="rgba(0,0,0,0.2)"/>
      <text x="50" y="57" fontSize="18" fontWeight="900" fill="#ffffff" textAnchor="middle" fontFamily="Arial, sans-serif">⭐</text>
    </svg>
  )
}

const RookieBadgeEmblem = ({ size = 80 }: { size?: number }) => {
  const gradientId = `rookieGradient-${Math.random().toString(36).substr(2, 9)}`
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: 'block' }}>
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#607d8b" />
          <stop offset="50%" stopColor="#78909c" />
          <stop offset="100%" stopColor="#90a4ae" />
        </linearGradient>
      </defs>
      {/* Simple Badge */}
      <circle cx="50" cy="50" r="40" fill={`url(#${gradientId})`} stroke="#90a4ae" strokeWidth="2.5"/>
      <circle cx="50" cy="50" r="30" fill="rgba(0,0,0,0.2)"/>
      <path d="M35 40 L50 50 L65 40 M50 50 L50 60" stroke="#90a4ae" strokeWidth="3" strokeLinecap="round" fill="none"/>
    </svg>
  )
}

interface LeaderboardEntry {
  rank: number
  userId: string
  username: string
  name: string
  avatar?: string
  schoolId?: string
  exp: number
  rankName: string
  achievements?: number
  levelsCompleted?: number
  longestStreak?: number
  multiplayerWins?: number
  multiplayerMatches?: number
  winRate?: number
  wins?: number
  totalMatches?: number
  currentStreak?: number
}

export default function Leaderboard() {
  const { user } = useAuth()
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [leaderboardType, setLeaderboardType] = useState<'overall' | 'ranked' | 'lessons' | 'challenge'>('overall')
  const [userRank, setUserRank] = useState<number | null>(null)

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        setLoading(true)
        let apiType: 'overall' | 'multiplayer' | 'achievements' | 'streaks' = 'overall'
        if (leaderboardType === 'ranked' || leaderboardType === 'challenge') {
          apiType = 'multiplayer'
        } else if (leaderboardType === 'overall' || leaderboardType === 'lessons') {
          apiType = 'overall'
        }
        const result = await api.getLeaderboard(apiType, 100)
        if (result.leaderboard) {
          setLeaderboard(result.leaderboard)
          // For Ranked view, we intentionally hide any numeric rank for now
          setUserRank(leaderboardType === 'ranked' ? null : (result.userRank || null))
        }
      } catch (error) {
        console.error('Failed to fetch leaderboard:', error)
        // Fallback to empty array on error
        setLeaderboard([])
      } finally {
        setLoading(false)
      }
    }

    fetchLeaderboard()
  }, [leaderboardType])

  // Fallback to localStorage if API fails (for backward compatibility)
  const raw = localStorage.getItem('puzzcode_leaderboard')
  const fallbackData: Array<{name: string; wins: number; avatar?: string}> = raw ? JSON.parse(raw) : []
  
  // Adjust ordering for specific leaderboard views (e.g., Lessons by lessons completed, then levels completed)
  const sortedLeaderboard =
    leaderboardType === 'lessons' && leaderboard.length > 0
      ? [...leaderboard].sort((a, b) => {
          const aLessonsCompleted = a.lessonsCompleted ?? 0
          const bLessonsCompleted = b.lessonsCompleted ?? 0
          if (bLessonsCompleted !== aLessonsCompleted) return bLessonsCompleted - aLessonsCompleted
          const aLevels = a.levelsCompleted ?? 0
          const bLevels = b.levelsCompleted ?? 0
          return bLevels - aLevels
        })
      : leaderboard

  // Use API data if available, otherwise fallback
  const data =
    leaderboardType === 'ranked'
      ? []
      : sortedLeaderboard.length > 0
          ? sortedLeaderboard.map((entry, index) => ({
              userId: entry.userId,
              name: entry.name || entry.username,
              username: entry.username,
              wins: entry.multiplayerWins || entry.wins || 0,
              avatar: entry.avatar,
              exp: entry.exp,
              rank: leaderboardType === 'lessons' ? index + 1 : entry.rank,
              rankName: entry.rankName,
              achievements: entry.achievements,
              levelsCompleted: entry.levelsCompleted,
              lessonsCompleted: entry.lessonsCompleted,
              longestStreak: entry.longestStreak,
              currentStreak: entry.currentStreak,
              multiplayerWins: entry.multiplayerWins,
              multiplayerMatches: entry.multiplayerMatches,
              totalMatches: entry.totalMatches,
              winRate: entry.winRate
            }))
          : fallbackData.map((row, i) => ({
              userId: '',
              name: row.name,
              username: row.name,
              wins: row.wins,
              avatar: row.avatar,
              exp: row.wins * 50, // Calculate from wins
              rank: i + 1,
              rankName: 'novice',
              achievements: 0,
              levelsCompleted: 0,
              longestStreak: 0
            }))

  const getBadge = (rank: number): { label: string; className: string; emoji: string } => {
    if (rank === 1) return { label: 'Champion', className: 'gold', emoji: '🥇' }
    if (rank === 2) return { label: 'Runner-up', className: 'silver', emoji: '🥈' }
    if (rank === 3) return { label: 'Top 3', className: 'bronze', emoji: '🥉' }
    if (rank >= 4 && rank <= 5) return { label: `Top ${rank}`, className: 'top4', emoji: '💎' }
    if (rank >= 6 && rank <= 7) return { label: `Top ${rank}`, className: 'top6', emoji: '🔷' }
    if (rank >= 8 && rank <= 10) return { label: `Top ${rank}`, className: 'top8', emoji: '⭐' }
    return { label: 'Rookie', className: 'rookie', emoji: '🎖️' }
  }

  const getRankEmblem = (rank: number) => {
    if (rank === 1) {
      return {
        title: 'Champion',
        subtitle: 'The Ultimate Coder',
        EmblemComponent: GoldMedalEmblem,
        gradient: 'linear-gradient(135deg, #FFD700 0%, #FFA500 50%, #FF6347 100%)',
        glow: '0 0 30px rgba(255, 215, 0, 0.6), 0 0 60px rgba(255, 165, 0, 0.4)',
        borderColor: 'rgba(255, 215, 0, 0.5)',
        textColor: '#FFD700'
      }
    }
    if (rank === 2) {
      return {
        title: 'Runner-up',
        subtitle: 'Elite Programmer',
        EmblemComponent: SilverMedalEmblem,
        gradient: 'linear-gradient(135deg, #C0C0C0 0%, #A8A8A8 50%, #808080 100%)',
        glow: '0 0 25px rgba(192, 192, 192, 0.5), 0 0 50px rgba(168, 168, 168, 0.3)',
        borderColor: 'rgba(192, 192, 192, 0.4)',
        textColor: '#C0C0C0'
      }
    }
    if (rank === 3) {
      return {
        title: 'Top 3',
        subtitle: 'Master Coder',
        EmblemComponent: BronzeMedalEmblem,
        gradient: 'linear-gradient(135deg, #CD7F32 0%, #B87333 50%, #A0522D 100%)',
        glow: '0 0 20px rgba(205, 127, 50, 0.4), 0 0 40px rgba(184, 115, 51, 0.2)',
        borderColor: 'rgba(205, 127, 50, 0.35)',
        textColor: '#CD7F32'
      }
    }
    if (rank === 4) {
      return {
        title: 'Top 4',
        subtitle: 'Elite Competitor',
        EmblemComponent: Top4BadgeEmblem,
        gradient: 'linear-gradient(135deg, #7f5eff 0%, #9a7bff 50%, #b499ff 100%)',
        glow: '0 0 15px rgba(127, 94, 255, 0.4), 0 0 30px rgba(154, 123, 255, 0.25)',
        borderColor: 'rgba(127, 94, 255, 0.35)',
        textColor: '#d5c7ff'
      }
    }
    if (rank === 5) {
      return {
        title: 'Top 5',
        subtitle: 'Premier Competitor',
        EmblemComponent: Top5BadgeEmblem,
        gradient: 'linear-gradient(135deg, #ffa502 0%, #ffbe76 50%, #ffd59e 100%)',
        glow: '0 0 15px rgba(255, 165, 2, 0.4), 0 0 30px rgba(255, 190, 118, 0.2)',
        borderColor: 'rgba(255, 190, 118, 0.3)',
        textColor: '#ffbe76'
      }
    }
    if (rank >= 6 && rank <= 7) {
      return {
        title: `Top ${rank}`,
        subtitle: 'Advanced Coder',
        EmblemComponent: Top6BadgeEmblem,
        gradient: 'linear-gradient(135deg, #4ecdc4 0%, #6eddd6 50%, #8eede8 100%)',
        glow: '0 0 15px rgba(78, 205, 196, 0.4), 0 0 30px rgba(110, 221, 214, 0.2)',
        borderColor: 'rgba(78, 205, 196, 0.3)',
        textColor: '#6eddd6',
        emblemProps: { rank }
      }
    }
    if (rank >= 8 && rank <= 10) {
      return {
        title: `Top ${rank}`,
        subtitle: 'Expert Developer',
        EmblemComponent: Top8BadgeEmblem,
        gradient: 'linear-gradient(135deg, #feca57 0%, #ffd780 50%, #ffe4a9 100%)',
        glow: '0 0 15px rgba(254, 202, 87, 0.4), 0 0 30px rgba(255, 215, 128, 0.2)',
        borderColor: 'rgba(254, 202, 87, 0.3)',
        textColor: '#ffd780',
        emblemProps: { rank }
      }
    }
    if (rank <= 50) {
      return {
        title: 'Rising Star',
        subtitle: 'Skilled Coder',
        EmblemComponent: StarBadgeEmblem,
        gradient: 'linear-gradient(135deg, #4caf50 0%, #66bb6a 50%, #81c784 100%)',
        glow: '0 0 10px rgba(76, 175, 80, 0.3), 0 0 20px rgba(76, 175, 80, 0.15)',
        borderColor: 'rgba(76, 175, 80, 0.25)',
        textColor: '#66bb6a'
      }
    }
    return {
      title: 'Rookie',
      subtitle: 'Getting Started',
      EmblemComponent: RookieBadgeEmblem,
      gradient: 'linear-gradient(135deg, #607d8b 0%, #78909c 50%, #90a4ae 100%)',
      glow: '0 0 8px rgba(96, 125, 139, 0.2)',
      borderColor: 'rgba(96, 125, 139, 0.2)',
      textColor: '#90a4ae'
    }
  }

  const getDisplayValue = (entry: any) => {
    switch (leaderboardType) {
      case 'ranked':
      case 'challenge':
        return {
          primary: `Wins: ${entry.wins || 0}`,
          secondary:
            entry.winRate !== undefined
              ? `Win Rate: ${entry.winRate}%`
              : `Matches: ${entry.totalMatches || 0}`
        }
      case 'lessons':
        return {
          primary: `Lessons: ${entry.lessonsCompleted || 0}`,
          secondary: `Levels: ${entry.levelsCompleted || 0}`
        }
      default: // overall
        return {
          primary: `EXP: ${entry.exp || 0}`,
          secondary: `Achievements: ${entry.achievements || 0} • Levels: ${entry.levelsCompleted || 0} • Wins: ${entry.multiplayerWins || entry.wins || 0}`
        }
    }
  }

  const currentUserEntry = user ? data.find(entry => entry.userId === user.id) : undefined
  const derivedRank = currentUserEntry
    ? (currentUserEntry.rank || (data.findIndex(entry => entry.userId === currentUserEntry.userId) + 1))
    : null

  const rawEffectiveUserRank = derivedRank ?? userRank ?? null
  const effectiveUserRank = leaderboardType === 'ranked' ? null : rawEffectiveUserRank
  const hasRank = effectiveUserRank !== null && effectiveUserRank !== undefined

  return (
    <div className="student-overview">
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">The Best of the best</h1>
          <p className="page-subtitle">Top performers across all categories.</p>
        </div>
      </div>

      {/* Leaderboard Type Selector */}
      <div className="filter-section" style={{ marginBottom: '24px' }}>
        <div className="filter-tabs">
          <button
            className={`filter-tab ${leaderboardType === 'overall' ? 'active' : ''}`}
            onClick={() => setLeaderboardType('overall')}
          >
            Overall
          </button>
          <button
            className={`filter-tab ${leaderboardType === 'ranked' ? 'active' : ''}`}
            onClick={() => setLeaderboardType('ranked')}
          >
            Ranked
          </button>
          <button
            className={`filter-tab ${leaderboardType === 'lessons' ? 'active' : ''}`}
            onClick={() => setLeaderboardType('lessons')}
          >
            Lessons
          </button>
          <button
            className={`filter-tab ${leaderboardType === 'challenge' ? 'active' : ''}`}
            onClick={() => setLeaderboardType('challenge')}
          >
            Challenge
          </button>
        </div>
      </div>

      {/* User Rank Display - Enhanced with Custom Emblems */}
      {(() => {
        const emblem = getRankEmblem(hasRank ? effectiveUserRank as number : Number.MAX_SAFE_INTEGER)
        const EmblemComp = emblem.EmblemComponent
        // Get current user's entry from leaderboard to get avatar, or use user object
        const userAvatar = currentUserEntry?.avatar || user?.avatarUrl
        const userName = currentUserEntry?.name || user?.firstName || user?.lastName || user?.username || 'User'
        const userInitial = (user?.firstName?.charAt(0) || user?.lastName?.charAt(0) || userName?.charAt(0) || 'U').toUpperCase()
        
        return (
          <div 
            className="rank-emblem-card"
            style={{ 
              marginBottom: '24px', 
              backgroundImage: emblem.gradient,
              border: `2px solid ${emblem.borderColor}`,
              borderRadius: '16px',
              padding: '24px',
              position: 'relative',
              overflow: 'hidden',
              boxShadow: emblem.glow,
              animation: 'rankGlow 3s ease-in-out infinite alternate'
            }}
          >
            {/* Animated background pattern */}
            <div style={{
              position: 'absolute',
              top: '-50%',
              right: '-50%',
              width: '200%',
              height: '200%',
              background: 'radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%)',
              animation: 'rankRotate 20s linear infinite',
              pointerEvents: 'none'
            }} />
            
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              position: 'relative',
              zIndex: 1
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flex: 1 }}>
                {/* User Avatar Picture */}
                <div style={{
                  width: '80px',
                  height: '80px',
                  borderRadius: '50%',
                  background: userAvatar ? 'transparent' : 'rgba(123, 92, 255, 0.3)',
                  backdropFilter: 'blur(10px)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: `3px solid ${emblem.borderColor}`,
                  boxShadow: `0 0 20px ${emblem.borderColor}`,
                  overflow: 'hidden',
                  position: 'relative'
                }}>
                  {userAvatar ? (
                    <img 
                      src={userAvatar} 
                      alt={`${userName} avatar`}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        borderRadius: '50%'
                      }}
                    />
                  ) : (
                    <span style={{
                      fontSize: '32px',
                      fontWeight: 700,
                      color: '#fff',
                      textShadow: '0 2px 4px rgba(0, 0, 0, 0.3)'
                    }}>
                      {userInitial}
                    </span>
                  )}
                </div>
                
                {/* Rank Info */}
                <div style={{ flex: 1 }}>
                  <div style={{ 
                    color: '#1a1a1a', 
                    fontSize: '14px', 
                    fontWeight: 500,
                    letterSpacing: '0.5px',
                    textTransform: 'uppercase',
                    marginBottom: '4px',
                    textShadow: '0 1px 2px rgba(255, 255, 255, 0.5)'
                  }}>
                    Your Rank
                  </div>
                  <div style={{ 
                    color: '#1a1a1a', 
                    fontSize: '36px', 
                    fontWeight: 800,
                    lineHeight: 1,
                    marginBottom: '4px',
                    textShadow: `0 0 10px ${emblem.textColor}40, 0 2px 4px rgba(0, 0, 0, 0.3)`
                  }}>
                    {hasRank ? `#${effectiveUserRank}` : 'Unranked'}
                  </div>
                  <div style={{ 
                    color: '#1a1a1a', 
                    fontSize: '18px', 
                    fontWeight: 700,
                    marginBottom: '2px',
                    textShadow: '0 1px 3px rgba(255, 255, 255, 0.6), 0 2px 4px rgba(0, 0, 0, 0.2)'
                  }}>
                    {userName}
                  </div>
                  <div style={{ 
                    color: '#2a2a2a', 
                    fontSize: '13px', 
                    fontWeight: 400,
                    textShadow: '0 1px 2px rgba(255, 255, 255, 0.5)'
                  }}>
                    {hasRank ? `${emblem.title} • ${emblem.subtitle}` : emblem.subtitle}
                  </div>
                </div>
              </div>

              {/* Rank Badge */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
                padding: '16px 20px',
                background: 'rgba(0, 0, 0, 0.25)',
                backdropFilter: 'blur(10px)',
                borderRadius: '12px',
                border: `1px solid ${emblem.borderColor}`
              }}>
                <div style={{
                  width: '48px',
                  height: '48px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  filter: 'drop-shadow(0 0 8px rgba(255,255,255,0.3))'
                }}>
                  <EmblemComp size={48} {...(emblem.emblemProps || {})} />
                </div>
                <div style={{
                  color: '#1a1a1a',
                  fontSize: '12px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '1px',
                  textShadow: '0 1px 2px rgba(255, 255, 255, 0.6)'
                }}>
                  {hasRank ? emblem.title : 'Unranked'}
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      <div className="dashboard-card">
        <div className="card-header">
          <h3 className="card-title">
            {leaderboardType === 'overall' && 'Top Players'}
            {leaderboardType === 'ranked' && 'Ranked Champions'}
            {leaderboardType === 'lessons' && 'Lesson Masters'}
            {leaderboardType === 'challenge' && 'Challenge Leaders'}
          </h3>
        </div>
        <div className="card-content">
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#eae6ff' }}>
              Loading leaderboard...
            </div>
          ) : (
            <div className="leaderboard-list">
              {data.length === 0 && (
                <div className="leaderboard-item" style={{ justifyContent: 'center', opacity: 0.8 }}>
                  No players yet. Start playing to appear on the leaderboard!
                </div>
              )}
              {data.map((entry) => {
                const rank = entry.rank || (data.indexOf(entry) + 1)
                const badge = getBadge(rank)
                const display = getDisplayValue(entry)
                const isCurrentUser = user && entry.userId === user.id
                
                return (
                  <div 
                    key={entry.userId || entry.name} 
                    className="leaderboard-item"
                    style={isCurrentUser ? { 
                      background: 'rgba(123, 92, 255, 0.15)', 
                      border: '1px solid rgba(123, 92, 255, 0.3)' 
                    } : {}}
                  >
                    <div className="leaderboard-rank">{rank}</div>
                    <div className="leaderboard-name">
                      <span className="leaderboard-avatar">
                        {entry.avatar ? (
                          <img src={entry.avatar} alt={`${entry.name} avatar`} />
                        ) : (
                          (entry.name || '?').charAt(0).toUpperCase()
                        )}
                      </span>
                      {entry.name}
                      {isCurrentUser && <span style={{ marginLeft: '8px', color: '#7b5cff' }}>(You)</span>}
                      <span className={`rank-badge ${badge.className}`}>{badge.emoji} {badge.label}</span>
                    </div>
                    <div className="leaderboard-stats">
                      <span className="leaderboard-wins">{display.primary}</span>
                      <span className="leaderboard-winrate">{display.secondary}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}


