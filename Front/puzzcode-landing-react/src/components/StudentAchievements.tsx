import React, { useState, useEffect } from 'react'
import { api } from '../utils/api'

interface Achievement {
  id: string | number
  type?: string
  name: string
  description: string
  icon: string
  category: string
  tier?: string
  points: number
  earned: boolean
  date: string | null
  progress: number
}

export default function StudentAchievements() {
  const [filter, setFilter] = useState('all')
  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState({
    earned: 0,
    total: 0,
    points: 0,
    completionRate: 0
  })

  // Fetch achievements from backend
  useEffect(() => {
    const fetchAchievements = async () => {
      try {
        setLoading(true)
        const result = await api.getAchievements()
        if (result.achievements) {
          setAchievements(result.achievements)
          if (result.summary) {
            setSummary(result.summary)
          }
        }
      } catch (error) {
        console.error('Failed to fetch achievements:', error)
        // Fallback to empty array on error
        setAchievements([])
      } finally {
        setLoading(false)
      }
    }

    fetchAchievements()
  }, [])

  // Fallback achievements if API fails or returns empty
  const fallbackAchievements = [
    {
      id: 1,
      name: 'First Steps',
      description: 'Complete your first lesson',
      icon: '👶',
      category: 'beginner',
      earned: false,
      date: null,
      points: 10,
      progress: 0
    },
    {
      id: 2,
      name: 'Week Warrior',
      description: 'Study for 7 consecutive days',
      icon: '🔥',
      category: 'streak',
      earned: false,
      date: null,
      points: 25,
      progress: 0
    },
    {
      id: 3,
      name: 'Code Master',
      description: 'Complete 50 coding challenges',
      icon: '💻',
      category: 'coding',
      earned: false,
      date: null,
      points: 50,
      progress: 0
    },
    {
      id: 4,
      name: 'Speed Demon',
      description: 'Solve 10 problems in under 30 minutes',
      icon: '⚡',
      category: 'speed',
      earned: false,
      date: null,
      points: 30,
      progress: 0
    },
    {
      id: 5,
      name: 'Quiz Champion',
      description: 'Score 100% on 5 quizzes in a row',
      icon: '🎯',
      category: 'quiz',
      earned: false,
      date: null,
      points: 40,
      progress: 0
    },
    {
      id: 6,
      name: 'Night Owl',
      description: 'Study after 10 PM for 5 days',
      icon: '🦉',
      category: 'streak',
      earned: false,
      date: null,
      points: 20,
      progress: 0
    },
    {
      id: 7,
      name: 'Social Learner',
      description: 'Help 10 other students in discussions',
      icon: '🤝',
      category: 'social',
      earned: false,
      date: null,
      points: 35,
      progress: 0
    },
    {
      id: 8,
      name: 'Perfect Score',
      description: 'Get perfect scores on 20 assignments',
      icon: '⭐',
      category: 'academic',
      earned: false,
      date: null,
      points: 60,
      progress: 0
    },
    // Additional locked achievements (no activity yet)
    {
      id: 9,
      name: 'Daily Learner',
      description: 'Log in 10 days in a row',
      icon: '📅',
      category: 'streak',
      earned: false,
      date: null,
      points: 15,
      progress: 0
    },
    {
      id: 10,
      name: 'Helper',
      description: 'Answer 5 questions from peers',
      icon: '🧩',
      category: 'social',
      earned: false,
      date: null,
      points: 20,
      progress: 0
    },
    {
      id: 11,
      name: 'First Challenge',
      description: 'Attempt your first coding challenge',
      icon: '🚀',
      category: 'beginner',
      earned: false,
      date: null,
      points: 5,
      progress: 0
    },
    {
      id: 12,
      name: 'Algorithm Apprentice',
      description: 'Solve 10 coding challenges',
      icon: '📐',
      category: 'coding',
      earned: false,
      date: null,
      points: 25,
      progress: 0
    }
  ]

  // Use fetched achievements or fallback
  const displayAchievements = achievements.length > 0 ? achievements : fallbackAchievements

  const categories = [
    { key: 'all', label: 'All', count: displayAchievements.length },
    { key: 'earned', label: 'Earned', count: displayAchievements.filter(a => a.earned).length },
    { key: 'inprogress', label: 'In Progress', count: displayAchievements.filter(a => !a.earned && (a.progress || 0) > 0).length }
  ]

  // Sort achievements from easy to hardest (by points, then by tier if available)
  const sortAchievements = (achievements: Achievement[]): Achievement[] => {
    return [...achievements].sort((a, b) => {
      // First sort by earned status (earned first, then locked)
      if (a.earned !== b.earned) {
        return a.earned ? -1 : 1
      }
      // Then sort by points (easy to hard)
      if (a.points !== b.points) {
        return a.points - b.points
      }
      // Finally sort by tier if available (bronze < silver < gold < platinum)
      const tierOrder: Record<string, number> = { bronze: 1, silver: 2, gold: 3, platinum: 4, diamond: 5 }
      const aTier = tierOrder[a.tier?.toLowerCase() || 'bronze'] || 0
      const bTier = tierOrder[b.tier?.toLowerCase() || 'bronze'] || 0
      return aTier - bTier
    })
  }

  const filteredAchievements = sortAchievements(displayAchievements.filter(achievement => {
    if (filter === 'all') return true
    if (filter === 'earned') return achievement.earned
    if (filter === 'inprogress') return !achievement.earned && (achievement.progress || 0) > 0
    return true
  }))

  const totalPoints = summary.points || displayAchievements.filter(a => a.earned).reduce((sum, a) => sum + a.points, 0)
  const earnedCount = summary.earned || displayAchievements.filter(a => a.earned).length
  const completionRate = summary.completionRate || Math.round((earnedCount / displayAchievements.length) * 100)

  // Find the next unearned achievement
  const nextAchievement = displayAchievements.find(a => !a.earned) || null

  // Format progress label based on achievement type
  const getProgressLabel = (achievement: Achievement | null): string => {
    if (!achievement) return 'No achievements available'
    
    const progress = achievement.progress || 0
    const type = achievement.type || ''
    
    if (type.startsWith('levels_')) {
      const target = parseInt(type.split('_')[1])
      const current = Math.round((progress / 100) * target)
      return `Progress: ${current}/${target} levels`
    } else if (type.startsWith('streak_')) {
      const target = parseInt(type.split('_')[1])
      const current = Math.round((progress / 100) * target)
      return `Progress: ${current}/${target} streak`
    } else if (type.startsWith('rank_')) {
      return `Progress: ${progress}%`
    } else {
      return `Progress: ${progress}%`
    }
  }

  return (
    <div className="student-achievements">
      <div className="page-header">
        <div className="page-header-left">
          <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#eae6ff', margin: '0 0 4px 0' }}>Earn badges</h2>
          <p className="page-subtitle">showcase milestones, and track progress.</p>
        </div>
      </div>

      {/* Achievement Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ backgroundColor: '#ffc107' }}>
            🏆
          </div>
          <div className="stat-content">
            <div className="stat-value">{earnedCount}</div>
            <div className="stat-label">Achievements Earned</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ backgroundColor: '#4caf50' }}>
            ⭐
          </div>
          <div className="stat-content">
            <div className="stat-value">{totalPoints}</div>
            <div className="stat-label">Total Points</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ backgroundColor: '#2196f3' }}>
            📊
          </div>
          <div className="stat-content">
            <div className="stat-value">{completionRate}%</div>
            <div className="stat-label">Completion Rate</div>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="filter-section">
        <div className="filter-tabs">
          {categories.map((category) => (
            <button
              key={category.key}
              className={`filter-tab ${filter === category.key ? 'active' : ''}`}
              onClick={() => setFilter(category.key)}
            >
              {category.label} ({category.count})
            </button>
          ))}
        </div>
      </div>

      {/* Achievements Grid */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#eae6ff' }}>
              Loading achievements...
            </div>
          ) : (
            <div className="achievements-grid">
              {filteredAchievements.map((achievement) => (
              <div key={achievement.id} className={`achievement-card ${achievement.earned ? 'earned' : 'locked'}`}>
                <div className="achievement-icon-large">
                  {achievement.earned ? achievement.icon : '🔒'}
                </div>
                <div className="achievement-content">
                  <h3 className="achievement-name">{achievement.name}</h3>
                  <p className="achievement-description">{achievement.description}</p>
                  {/* Progress bar between description and points */}
                  <div className="progress-bar" style={{ marginTop: 8 }}>
                    <div className="progress-fill" style={{ width: `${achievement.progress || 0}%` }} />
                  </div>
                  <div className="achievement-meta">
                    <span className="achievement-points">{achievement.points} pts</span>
                    <span className="achievement-category">{achievement.category}</span>
                  </div>
                  {achievement.earned && (
                    <div className="achievement-date">
                      Earned: {new Date(achievement.date!).toLocaleDateString()}
                    </div>
                  )}
                </div>
                <div className="achievement-status">
                  {achievement.earned ? (
                    <span className="status-earned">✓ Earned</span>
                  ) : (
                    <span className="status-locked">🔒 Locked</span>
                  )}
                </div>
              </div>
              ))}
            </div>
          )}

      {/* Progress to Next Achievement */}
      {nextAchievement && (
        <div className="dashboard-card">
          <div className="card-header">
            <h3 className="card-title">Next Achievement</h3>
          </div>
          <div className="card-content">
              <div className="next-achievement">
                <div className="achievement-preview">
                  <div className="achievement-icon">{nextAchievement.icon || '🎯'}</div>
                  <div className="achievement-info">
                    <h4>{nextAchievement.name}</h4>
                    <p>{nextAchievement.description}</p>
                  </div>
                </div>
                <div className="progress-to-next">
                  <div className="progress-label">{getProgressLabel(nextAchievement)}</div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${nextAchievement.progress || 0}%` }} />
                  </div>
                  <div className="progress-percentage">{nextAchievement.progress || 0}%</div>
                </div>
              </div>
          </div>
        </div>
      )}
    </div>
  )
}
