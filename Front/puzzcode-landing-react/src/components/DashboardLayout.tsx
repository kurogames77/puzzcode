import React, { useState, useEffect, useRef } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import ConfirmModal from './ConfirmModal'
import { User } from '../utils/userManager'
import { api } from '../utils/api'
import { getWebSocketClient, initWebSocket, getLocalIP } from '../utils/websocket'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'

type Props = {
  userType: 'student' | 'admin'
  userName: string
  onLogout: () => void
  user: User | null
}

const DEFAULT_BATTLE_DURATION_SECONDS = 1800; // 30 minutes
const BATTLE_DURATION_GRACE_SECONDS = 120; // Allow 2 minutes buffer before considering stale

export default function DashboardLayout({ userType, userName, onLogout, user: userProp }: Props) {
  const { user } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [showLogout, setShowLogout] = useState(false)
  const [incomingChallenge, setIncomingChallenge] = useState<{
    id: string
    language: string
    expWager?: number
    fromUser: {
      id: string
      username: string
      firstName?: string
      lastName?: string
      schoolId?: string
    }
  } | null>(null)
  const [lastHandledChallengeId, setLastHandledChallengeId] = useState<string | null>(null)
  const [lastJoinedMatchId, setLastJoinedMatchId] = useState<string | null>(null)
  const [recentlyLeftMatchId, setRecentlyLeftMatchId] = useState<string | null>(null)
  const [challengeDeclinedNotification, setChallengeDeclinedNotification] = useState<{
    message: string
  } | null>(null)
  const wsClientRef = useRef<ReturnType<typeof getWebSocketClient> | null>(null)
  const navigate = useNavigate()
  const location = useLocation()

  const notifications = [
    {
      id: 1,
      title: 'New Assignment Available',
      message: 'JavaScript Fundamentals: Project Assignment is now available',
      time: '2 hours ago',
      read: false,
      type: 'assignment'
    },
    {
      id: 2,
      title: 'Deadline Reminder',
      message: 'React Development: Quiz #3 is due in 3 days',
      time: '5 hours ago',
      read: false,
      type: 'deadline'
    },
    {
      id: 3,
      title: 'Achievement Unlocked',
      message: 'Congratulations! You earned the "Week Warrior" badge',
      time: '1 day ago',
      read: true,
      type: 'achievement'
    },
    {
      id: 4,
      title: 'Course Completed',
      message: 'You have completed Python Basics! Great job!',
      time: '2 days ago',
      read: true,
      type: 'completion'
    },
    {
      id: 5,
      title: 'New Comment on Discussion',
      message: 'Dr. Sarah Johnson replied to your question about data structures',
      time: '3 days ago',
      read: true,
      type: 'discussion'
    }
  ]

  const unreadCount = notifications.filter(n => !n.read).length

  const handleNotificationClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setNotificationsOpen(!notificationsOpen)
  }

  // Close notifications when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest('.notification-container')) {
        setNotificationsOpen(false)
      }
    }

    if (notificationsOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [notificationsOpen])

  const studentMenuItems = [
    { path: '/dashboard/student', label: 'Overview', icon: '📊' },
    { path: '/dashboard/student/courses', label: 'Puzzle Languages', icon: '🧩' },
    // { path: '/dashboard/student/progress', label: 'Progress', icon: '📈' },
    { path: '/dashboard/student/achievements', label: 'Achievements', icon: '🏆' },
    { path: '/dashboard/student/battle', label: 'Multiplayer Battle', icon: '⚔️' },
    { path: '/dashboard/student/leaderboard', label: 'Leaderboard', icon: '🥇' },
    { path: '/dashboard/student/profile', label: 'Profile', icon: '👤' }
  ]

  const adminMenuItems = [
    { path: '/dashboard/admin', label: 'Overview', icon: '📊' },
    { path: '/dashboard/admin/courses', label: 'Languages', icon: '📚' },
    { path: '/dashboard/admin/profile', label: 'Profile', icon: '👤' }
  ]

  const menuItems = userType === 'student' ? studentMenuItems : adminMenuItems

  const handleNavigation = (path: string) => {
    navigate(path)
    setSidebarOpen(false)
  }

  const isActive = (path: string) => {
    return location.pathname === path
  }

  const handleLogout = () => {
    setShowLogout(true)
  }

  // Setup WebSocket for challenge notifications (students only)
  useEffect(() => {
    if (userType !== 'student' || !user) return

    let isCancelled = false

    const setupWebSocket = async () => {
      try {
        const token = localStorage.getItem('auth_token')
        if (!token) return

        const localIP = await getLocalIP().catch(() => null)
        const client = await initWebSocket(token, localIP || undefined)
        wsClientRef.current = client

        if (!client.connected()) return

        // Join user's personal room for notifications
        client.emit('join_user_room', { userId: user.id })

        // Listen for challenge declined notifications
        const handleChallengeDeclined = (data: any) => {
          if (!isCancelled) {
            setChallengeDeclinedNotification({
              message: data.message || `${data.declinedBy || 'Opponent'} declined your challenge`
            })
          }
        }

        client.on('challenge_declined', handleChallengeDeclined)

        return () => {
          client.off('challenge_declined', handleChallengeDeclined)
          client.emit('leave_user_room', { userId: user.id })
        }
      } catch (error) {
        console.error('Failed to setup WebSocket for challenges:', error)
      }
    }

    setupWebSocket()

    return () => {
      isCancelled = true
      if (wsClientRef.current) {
        wsClientRef.current.disconnect()
      }
    }
  }, [userType, user])

  // Poll for incoming direct challenges (students only)
  useEffect(() => {
    if (userType !== 'student') return

    let isCancelled = false

    const pollChallenges = async () => {
      if (isCancelled || incomingChallenge) return

      try {
        const response = await api.getIncomingChallenges()
        if (response?.success && Array.isArray(response.challenges) && response.challenges.length > 0) {
          const challenge = response.challenges[0]
          if (challenge.id !== lastHandledChallengeId) {
            setIncomingChallenge(challenge)
          }
        }
      } catch (error) {
        // Fail silently; this is best-effort
        console.error('Failed to fetch incoming challenges:', error)
      }
    }

    const intervalId = window.setInterval(pollChallenges, 5000)
    // Run immediately on mount
    pollChallenges()

    return () => {
      isCancelled = true
      window.clearInterval(intervalId)
    }
  }, [userType, incomingChallenge, lastHandledChallengeId])

  // Poll for outgoing accepted challenges so the challenger can auto-join once
  useEffect(() => {
    if (userType !== 'student') return

    let isCancelled = false

    const pollOutgoing = async () => {
      if (isCancelled) return

      // Don't auto-join while already inside a battle room
      if (location.pathname.includes('/dashboard/student/battle/room')) {
        return
      }

      try {
        // Check sessionStorage for recently left match
        const recentlyLeftFromStorage = sessionStorage.getItem('recentlyLeftMatchId')
        
        const response = await api.getOutgoingChallenges()
        if (response?.success && Array.isArray(response.challenges) && response.challenges.length > 0) {
          const challenge = response.challenges[0]
          // Only join if we haven't already joined this match
          // AND we didn't just leave this match (check both state and sessionStorage)
          // AND the match is still active (not completed)
          if (challenge.matchId && 
              challenge.matchId !== lastJoinedMatchId && 
              challenge.matchId !== recentlyLeftMatchId &&
              challenge.matchId !== recentlyLeftFromStorage) {
            // Double-check match status before joining
            try {
              const matchStatus = await api.getBattle(challenge.matchId)
              const matchInfo = matchStatus?.match
              const startedAt = matchInfo?.startedAt ? new Date(matchInfo.startedAt).getTime() : null
              const durationSeconds = typeof matchInfo?.durationSeconds === 'number' 
                ? matchInfo.durationSeconds 
                : DEFAULT_BATTLE_DURATION_SECONDS
              const elapsedSeconds = startedAt ? Math.floor((Date.now() - startedAt) / 1000) : null
              const allowableDuration = durationSeconds + BATTLE_DURATION_GRACE_SECONDS

              // If the match has been running far longer than the allowed duration, treat it as stale
              if (elapsedSeconds !== null && elapsedSeconds > allowableDuration) {
                console.warn('Skipping stale battle auto-join (elapsed > limit)', {
                  matchId: challenge.matchId,
                  elapsedSeconds,
                  allowableDuration
                })
                setLastJoinedMatchId(challenge.matchId)
                return
              }

              // Only auto-join if match is still active/pending, not completed
              if (matchStatus?.match?.status && 
                  matchStatus.match.status !== 'completed' && 
                  matchStatus.match.status !== 'cancelled') {
                const language = challenge.language || 'python'
                const params = new URLSearchParams()
                params.set('matchId', challenge.matchId)
                params.set('language', language)
                if (challenge.problemId) {
                  params.set('problemId', challenge.problemId)
                }
                setLastJoinedMatchId(challenge.matchId)
                navigate(`/dashboard/student/battle/room?${params.toString()}`)
              } else {
                // Match is completed, mark it as joined so we don't try again
                setLastJoinedMatchId(challenge.matchId)
              }
            } catch (matchError) {
              // If we can't check match status, don't auto-join (safety)
              console.error('Failed to check match status:', matchError)
            }
          }
        }
      } catch (error) {
        console.error('Failed to fetch outgoing challenges:', error)
      }
    }

    // Poll more frequently so challengers enter the battle room with minimal delay
    const intervalId = window.setInterval(pollOutgoing, 1000)
    pollOutgoing()

    return () => {
      isCancelled = true
      window.clearInterval(intervalId)
    }
  }, [userType, navigate, location.pathname, lastJoinedMatchId, recentlyLeftMatchId])

  // Track when user leaves battle room to prevent auto-rejoin
  useEffect(() => {
    // If we're not in a battle room but were before, mark the match as recently left
    const wasInBattleRoom = location.pathname.includes('/dashboard/student/battle/room')
    if (!wasInBattleRoom) {
      // Extract matchId from previous location if available
      // Clear recentlyLeftMatchId after 5 seconds to allow rejoining new matches
      const timeout = setTimeout(() => {
        setRecentlyLeftMatchId(null)
      }, 5000)
      return () => clearTimeout(timeout)
    }
  }, [location.pathname])

  const handleAcceptChallenge = async () => {
    if (!incomingChallenge) return

    try {
      const response = await api.respondToChallenge(incomingChallenge.id, 'accept')
      setLastHandledChallengeId(incomingChallenge.id)
      setIncomingChallenge(null)

      if (response?.success && response.matchId) {
        const language = response.language || incomingChallenge.language || 'python'
        const params = new URLSearchParams()
        params.set('matchId', response.matchId)
        params.set('language', language)
        if (response.problemId) {
          params.set('problemId', response.problemId)
        }
        navigate(`/dashboard/student/battle/room?${params.toString()}`)
      }
    } catch (error) {
      console.error('Failed to accept challenge:', error)
      alert('Failed to accept challenge. Please try again.')
    }
  }

  const handleDeclineChallenge = async () => {
    if (!incomingChallenge) return

    try {
      await api.respondToChallenge(incomingChallenge.id, 'decline')
      setLastHandledChallengeId(incomingChallenge.id)
      setIncomingChallenge(null)
    } catch (error) {
      console.error('Failed to decline challenge:', error)
      // Even if decline API fails, close the modal to avoid blocking the user
      setIncomingChallenge(null)
    }
  }

  const isBattleRoom = location.pathname.includes('/dashboard/student/battle/room')
  const isLessonPlayer = location.pathname.includes('/dashboard/student/courses/') && location.pathname.includes('/play')
  const isLessonIntroduction = location.pathname.includes('/dashboard/student/courses/') && !location.pathname.includes('/play')
  // Disable navigation on the lesson selection page (when a language is selected, has back button)
  // But NOT on the language selection page (no lang parameter)
  const searchParams = new URLSearchParams(location.search)
  const hasLangParam = searchParams.has('lang')
  const isLessonsListingPage = (location.pathname === '/dashboard/student/courses' || location.pathname.startsWith('/dashboard/student/courses?')) && hasLangParam

  if (isBattleRoom || isLessonPlayer) {
    return (
      <div className="dashboard-main" style={{ marginLeft: 0 }}>
        <div className="dashboard-content">
          <Outlet />
        </div>
      </div>
    )
  }

  return (
    <>
    <div className="dashboard-container">
      {/* Sidebar */}
      <div className={`dashboard-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h3 className="sidebar-title">PuzzCode</h3>
          <button 
            className="sidebar-toggle"
            onClick={() => setSidebarOpen(false)}
          >
            ✕
          </button>
        </div>
        
        <div className="sidebar-user">
          <div className="user-avatar" style={{ overflow: 'hidden' }}>
            {userProp?.avatarUrl ? (
              <img src={userProp.avatarUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
            ) : (
              (userProp?.firstName?.charAt(0) || userProp?.lastName?.charAt(0) || userName?.charAt(0) || 'U').toUpperCase()
            )}
          </div>
          <div className="user-info">
            <div className="user-name">
              {userProp?.firstName && userProp?.lastName 
                ? `${userProp.firstName} ${userProp.lastName}`
                : userProp?.firstName || userProp?.lastName
                ? `${userProp.firstName || ''}${userProp.lastName || ''}`.trim()
                : userName}
            </div>
            <div className="user-type">{userType === 'student' ? 'Student' : 'Admin'}</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {menuItems.map((item) => {
            // Disable navigation items when on lesson introduction page or lessons listing page (has back button)
            const isDisabled = (isLessonIntroduction || isLessonsListingPage) && item.path !== '/dashboard/student/courses'
            return (
              <button
                key={item.path}
                className={`nav-item ${isActive(item.path) ? 'active' : ''} ${isDisabled ? 'disabled' : ''}`}
                onClick={() => !isDisabled && handleNavigation(item.path)}
                disabled={isDisabled}
                style={isDisabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                title={isDisabled ? 'Use the Back button to navigate' : ''}
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
              </button>
            )
          })}
        </nav>

        <div className="sidebar-footer">
          <button className="logout-btn" onClick={handleLogout}>
            <span className="nav-icon">🚪</span>
            <span className="nav-label">Logout</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="dashboard-main">
        {/* Top Bar */}
        <div className="dashboard-header">
          <button 
            className="mobile-menu-toggle"
            onClick={() => setSidebarOpen(true)}
          >
            ☰
          </button>
          <div className="header-title">
            {menuItems.find(item => isActive(item.path))?.label || 'Dashboard'}
          </div>
          <div className="header-actions">
            <button
              className="theme-toggle-btn"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
          </div>
        </div>

        {/* Page Content */}
        <div className="dashboard-content">
          <Outlet />
        </div>
      </div>

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div 
          className="mobile-overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
    {showLogout && (
      <ConfirmModal
        title="Log out"
        message={`Are you sure you want to log out from your ${userType.charAt(0).toUpperCase() + userType.slice(1)} account?`}
        confirmLabel="Log out"
        cancelLabel="Cancel"
        onConfirm={() => { setShowLogout(false); onLogout() }}
        onClose={() => setShowLogout(false)}
      />
    )}
    {incomingChallenge && (
      <ConfirmModal
        title="Battle Challenge"
        message={`${incomingChallenge.fromUser.firstName && incomingChallenge.fromUser.lastName
          ? `${incomingChallenge.fromUser.firstName} ${incomingChallenge.fromUser.lastName}`
          : incomingChallenge.fromUser.username || 'An opponent'
        } challenged you to a ${incomingChallenge.language || 'coding'} battle.${incomingChallenge.expWager ? `\n\nEXP Wager: ${incomingChallenge.expWager} EXP (Winner takes all!)` : ''}\n\nAccept?`}
        confirmLabel="Accept"
        cancelLabel="Decline"
        onConfirm={handleAcceptChallenge}
        onClose={handleDeclineChallenge}
      />
    )}
    {challengeDeclinedNotification && (
      <ConfirmModal
        title="Challenge Declined"
        message={challengeDeclinedNotification.message}
        confirmLabel="OK"
        cancelLabel=""
        onConfirm={() => setChallengeDeclinedNotification(null)}
        onClose={() => setChallengeDeclinedNotification(null)}
      />
    )}
    </>
  )
}
