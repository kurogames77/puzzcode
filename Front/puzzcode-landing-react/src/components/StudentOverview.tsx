import React, { useState, useEffect } from 'react'
import {
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar
} from 'recharts'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../utils/api'
import { getAllCourses, getLessonsByCourseId, type Course, type Lesson } from '../utils/courseManager'

type RecentCourse = {
  name: string
  progress: number
  difficulty: string
  courseId: string
}

type PerformancePoint = {
  date: string
  label: string
  completions: number
  cumulative: number
  attempts: number
  successes: number
  fails: number
}

type PerformanceSummary = {
  trend: PerformancePoint[]
  summary: {
    totalCompletions: number
    weeklyAverage: number
    activeDays: number
    currentStreak: number
    bestDay: { date: string; label: string; completions: number } | null
    difficultyBreakdown: Array<{ label: string; count: number; percent: number }>
    daysTracked: number
    languageBreakdown: Array<{
      courseId: string
      name: string
      attempts: number
      successes: number
      errors: number
    }>
  }
}

export default function StudentOverview() {
  const { user } = useAuth()
  const [statistics, setStatistics] = useState({
    totalCourses: 0,
    lessonsCompleted: 0,
    currentStreak: 0,
    totalPoints: 0
  })
  const [loadingStats, setLoadingStats] = useState(true)
  const [recentCourses, setRecentCourses] = useState<RecentCourse[]>([])
  const [loadingCourses, setLoadingCourses] = useState(true)
  const [performance, setPerformance] = useState<PerformanceSummary | null>(null)
  const [loadingPerformance, setLoadingPerformance] = useState(true)
  const [performanceError, setPerformanceError] = useState<string | null>(null)

  // Fetch statistics
  useEffect(() => {
    const fetchStatistics = async () => {
      if (!user) return
      try {
        setLoadingStats(true)
        const result = await api.getUserStatistics()
        if (result.success && result.statistics) {
          setStatistics({
            totalCourses: result.statistics.totalCourses,
            lessonsCompleted: result.statistics.lessonsCompleted,
            currentStreak: result.statistics.currentStreak,
            totalPoints: result.statistics.totalPoints
          })
        }
      } catch (error) {
        console.error('Failed to fetch statistics:', error)
      } finally {
        setLoadingStats(false)
      }
    }
    fetchStatistics()
  }, [user])

  // Fetch recent courses with progress from statistics endpoint
  useEffect(() => {
    const fetchRecentCourses = async () => {
      if (!user) return
      try {
        setLoadingCourses(true)
        const result = await api.getUserStatistics()
        
        if (result.success && result.recentCourses) {
          // Get course details for difficulty
          const courses = await getAllCourses()
          const coursesMap = new Map(courses.map(c => [c.id, c]))
          
          const coursesWithDetails: RecentCourse[] = result.recentCourses.map((course: any) => {
            const courseDetails = coursesMap.get(course.courseId)
            // Get first lesson difficulty as course difficulty
            return {
              name: course.name,
              progress: course.progress,
              difficulty: courseDetails?.lessons?.[0]?.difficulty || 'Beginner',
              courseId: course.courseId
            }
          })
          
          setRecentCourses(coursesWithDetails)
        }
      } catch (error) {
        console.error('Failed to fetch recent courses:', error)
      } finally {
        setLoadingCourses(false)
      }
    }
    fetchRecentCourses()
  }, [user])

  useEffect(() => {
    if (!user) return

    let isActive = true

    const fetchPerformanceSummary = async () => {
      try {
        setLoadingPerformance(true)
        setPerformanceError(null)
        const result = await api.getPerformanceSummary()
        if (!isActive) return

        if (result.success && result.performance) {
          setPerformance(result.performance)
        } else {
          setPerformance(null)
          setPerformanceError('Performance data unavailable')
        }
      } catch (error) {
        console.error('Failed to fetch performance summary:', error)
        if (isActive) {
          setPerformance(null)
          setPerformanceError('Unable to load performance insights')
        }
      } finally {
        if (isActive) {
          setLoadingPerformance(false)
        }
      }
    }

    fetchPerformanceSummary()

    return () => {
      isActive = false
    }
  }, [user])

  const resolvedStreak = performance?.summary.currentStreak ?? statistics.currentStreak

  const hasPerformanceData = performance?.trend?.some(
    point => point.attempts > 0 || point.successes > 0 || point.fails > 0
  )

  const renderPerformanceTooltip = ({ active, payload, label }: any) => {
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
        <div style={{ color: '#fff', fontWeight: 600, marginBottom: 6 }}>{label}</div>
        <div style={{ color: '#b8a9ff', fontSize: 13 }}>Attempts: {data.attempts}</div>
        <div style={{ color: '#7ee18f', fontSize: 13 }}>Successes: {data.successes}</div>
        <div style={{ color: '#ff9f68', fontSize: 13 }}>Fails: {data.fails}</div>
      </div>
    )
  }

  const stats = [
    { 
      label: 'Languages Engaged', 
      value: loadingStats ? '...' : String(statistics.totalCourses), 
      icon: '📚', 
      color: '#7b5cff' 
    },
    { 
      label: 'Completed Lessons', 
      value: loadingStats ? '...' : String(statistics.lessonsCompleted), 
      icon: '✅', 
      color: '#4caf50' 
    },
    { 
      label: 'Current Streak', 
      value: loadingStats && loadingPerformance
        ? '...'
        : `${resolvedStreak} ${resolvedStreak === 1 ? 'day' : 'days'}`, 
      icon: '🔥', 
      color: '#ff9800' 
    },
    { 
      label: 'Total Points', 
      value: loadingStats ? '...' : String(statistics.totalPoints), 
      icon: '⭐', 
      color: '#ffc107' 
    }
  ]

  return (
    <div className="student-overview">
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Welcome back!</h1>
          <p className="page-subtitle">Continue your coding journey</p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        {stats.map((stat, index) => (
          <div key={index} className="stat-card">
            <div className="stat-icon" style={{ backgroundColor: stat.color }}>
              {stat.icon}
            </div>
            <div className="stat-content">
              <div className="stat-value">{stat.value}</div>
              <div className="stat-label">{stat.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-card" style={{ marginBottom: 32 }}>
          <div className="card-header">
            <div>
              <h3 className="card-title">Performance Insights</h3>
              <div style={{ fontSize: 13, opacity: 0.7 }}>
                Last {performance?.summary.daysTracked || 30} days
              </div>
            </div>
          </div>
          <div
            className="card-content"
            style={{ display: 'flex', flexDirection: 'column', gap: 24 }}
          >
            {loadingPerformance ? (
              <div className="course-item empty-state">
                <div className="course-name">Analyzing performance...</div>
              </div>
            ) : performanceError ? (
              <div className="course-item empty-state">
                <div className="course-name">{performanceError}</div>
              </div>
            ) : !performance ? (
              <div className="course-item empty-state">
                <div className="course-name">No performance data yet</div>
                <div className="course-difficulty" style={{ marginTop: 8, fontSize: 13, opacity: 0.7 }}>
                  Complete levels to unlock insights
                </div>
              </div>
            ) : (
              <>
                {hasPerformanceData ? (
                  <div style={{ width: '100%', height: 260 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={performance.trend}
                        margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                      >
                        <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                        <XAxis
                          dataKey="label"
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
                        <Tooltip content={renderPerformanceTooltip} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                        <Bar
                          dataKey="attempts"
                          fill="#7b5cff"
                          name="Attempts"
                          radius={[6, 6, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="course-item empty-state">
                    <div className="course-name">Complete a level to see your progress trend</div>
                  </div>
                )}

                <div>
                  <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 8 }}>
                    Attempts, successes, and fails per language
                  </div>
                  {performance.summary.languageBreakdown.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {performance.summary.languageBreakdown.map((language) => (
                        <div
                          key={language.courseId}
                          style={{
                            padding: '12px 14px',
                            borderRadius: 12,
                            background: 'rgba(255,255,255,0.03)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: 12
                          }}
                        >
                          <div style={{ fontWeight: 600 }}>{language.name}</div>
                          <div style={{ display: 'flex', gap: 16, fontSize: 13, opacity: 0.85 }}>
                            <span>Attempts: {language.attempts}</span>
                            <span style={{ color: '#4caf50' }}>Successes: {language.successes}</span>
                            <span style={{ color: '#ff5722' }}>Fails: {language.errors}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="course-item empty-state">
                      <div className="course-name">No attempts logged yet</div>
                      <div className="course-difficulty" style={{ marginTop: 8, fontSize: 13, opacity: 0.7 }}>
                        Solve puzzles to see per-language stats
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Recent Courses */}
      <div className="dashboard-card">
          <div className="card-header">
            <h3 className="card-title">Recent Languages</h3>
            {recentCourses.length > 0 && (
              <button 
                className="card-action"
                onClick={() => window.location.href = '/dashboard/student/courses'}
              >
                View All
              </button>
            )}
          </div>
          <div className="card-content">
            {loadingCourses ? (
              <div className="course-item empty-state">
                <div className="course-name">Loading...</div>
              </div>
            ) : recentCourses.length === 0 ? (
              <div className="course-item empty-state">
                <div className="course-name">No courses in progress yet</div>
                <div className="course-difficulty" style={{ marginTop: 8, fontSize: 13, opacity: 0.7 }}>
                  Start a lesson to see your progress here
                </div>
              </div>
            ) : (
              recentCourses.map((course, index) => {
                // Get language icon based on course name
                const getLanguageIcon = (name: string): string => {
                  const lowerName = name.toLowerCase()
                  if (lowerName.includes('python')) return '/python-logo.png'
                  if (lowerName.includes('javascript') || lowerName.includes('js')) return '/javascript-logo-javascript-icon-transparent-free-png.webp'
                  if (lowerName.includes('c#') || lowerName.includes('csharp')) return '/csharp_logo-221dcba91bfe189e98c562b90269b16f.png'
                  if (lowerName.includes('c++') || lowerName.includes('cpp')) return '/c-logo-a2fa.png'
                  if (lowerName.includes('php')) return '/php_PNG43.png'
                  if (lowerName.includes('mysql')) return '/269-2693201_mysql-logo-circle-png.png'
                  return ''
                }
                
                const iconPath = getLanguageIcon(course.name)
                
                return (
                  <div key={course.courseId || index} className="course-item">
                    <div className="course-info" style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                      {iconPath && (
                        <div style={{ 
                          width: 40, 
                          height: 40, 
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}>
                          <img 
                            src={iconPath} 
                            alt={course.name}
                            style={{ 
                              width: '100%', 
                              height: '100%', 
                              objectFit: 'contain'
                            }}
                          />
                        </div>
                      )}
                      <div style={{ 
                        flex: 1, 
                        display: 'flex', 
                        flexDirection: 'column', 
                        justifyContent: 'center',
                        gap: 4,
                        alignItems: 'flex-start'
                      }}>
                        <div className="course-name" style={{ margin: 0, marginLeft: 0, lineHeight: 1.3, padding: 0, width: '100%' }}>{course.name}</div>
                        <div className="course-difficulty" style={{ margin: 0, marginLeft: 0, lineHeight: 1.3, padding: 0, textAlign: 'left', width: '100%' }}>{course.difficulty}</div>
                      </div>
                    </div>
                    <div className="course-progress">
                      <div className="progress-bar">
                        <div 
                          className="progress-fill" 
                          style={{ width: `${course.progress}%` }}
                        />
                      </div>
                      <span className="progress-text">{course.progress}%</span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
      </div>

      {/** Upcoming Deadlines removed as requested */}

      {/** Quick Actions removed as requested */}
    </div>
  )
}
