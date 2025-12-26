import React, { useState, useEffect, useRef } from 'react'
import { api } from '../utils/api'

export default function AdminOverview() {
  const [userCount, setUserCount] = useState(0)
  const [courseCount, setCourseCount] = useState(0)
  const [languagesHandled, setLanguagesHandled] = useState(0)
  const [lessonsCount, setLessonsCount] = useState(0)
  const [enrollmentData, setEnrollmentData] = useState<Array<{ name: string; students: number }>>([])
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [containerWidth, setContainerWidth] = useState<number>(800)

  useEffect(() => {
    // Fetch admin statistics from API
    const loadStatistics = async () => {
      try {
        setLoading(true)
        const result = await api.getAdminStatistics()
        if (result.success && result.statistics) {
          setUserCount(result.statistics.totalUsers || 0)
          setCourseCount(result.statistics.totalCourses || 0)
          setLanguagesHandled(result.statistics.totalCoursesHandled || 0)
          setLessonsCount(result.statistics.totalLessons || 0)
          setEnrollmentData(result.statistics.enrollmentData || [])
        }
      } catch (error) {
        console.error('Error loading admin statistics:', error)
        // Set empty data on error
        setUserCount(0)
        setCourseCount(0)
        setLanguagesHandled(0)
        setLessonsCount(0)
        setEnrollmentData([])
      } finally {
        setLoading(false)
      }
    }
    
    loadStatistics()
  }, [])

  // Track container width to make chart full-width and responsive
  useEffect(() => {
    const el = containerRef.current
    const update = () => {
      if (el) setContainerWidth(el.offsetWidth)
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])


  const stats = [
    { label: 'Total Students', value: userCount.toLocaleString(), icon: '👥', color: '#7b5cff' },
    { label: 'Active Levels', value: courseCount.toString(), icon: '📚', color: '#4caf50' },
    { label: 'Total Language Handled', value: languagesHandled.toString(), icon: '🌐', color: '#0097a7' },
    { label: 'Total Lessons', value: lessonsCount.toString(), icon: '📝', color: '#ff7043' }
  ]

  return (
    <div className="admin-overview">
      <div className="page-header">
        <div>
          <h1 className="page-title">Admin Dashboard</h1>
          <p className="page-subtitle">Monitor and manage your platform</p>
        </div>
      </div>

      {/* Stats Grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#eae6ff' }}>
          Loading statistics...
        </div>
      ) : (
        <>
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

          {/* Enrollment Graph */}
          <div className="dashboard-card" style={{ marginTop: 24 }}>
        <div className="card-header">
          <h3 className="card-title">Enrollment Overview</h3>
        </div>
        <div className="card-content" ref={containerRef}>
          {enrollmentData.length === 0 ? (
            <p className="muted">No enrollment data yet.</p>
          ) : (
            <div style={{ width: '100%' }}>
              <svg width="100%" height={320}>
                {(() => {
                  const max = Math.max(1, ...enrollmentData.map(d => d.students))
                  const topPad = 24
                  const bottomPad = 60
                  const leftPad = 48
                  const rightPad = 80
                  const chartHeight = 220
                  const plotWidth = Math.max(200, containerWidth - leftPad - rightPad)
                  const n = enrollmentData.length
                  
                  // Calculate bar width and spacing to evenly distribute bars across full width
                  const maxBarWidth = 60
                  const minBarWidth = 30
                  
                  // We have n bars and need n+1 gaps (left, between bars, right) for equal spacing
                  // Total width = (n * barWidth) + ((n + 1) * gap)
                  // Solve for gap: gap = (plotWidth - (n * barWidth)) / (n + 1)
                  
                  // First, calculate ideal bar width if we want equal spacing
                  // If we want bars to fill most of the space, we can calculate:
                  const idealBarWidth = plotWidth / (n + 1)
                  const barWidth = Math.max(minBarWidth, Math.min(maxBarWidth, idealBarWidth))
                  
                  // Now calculate gap to fill exactly the remaining space
                  const totalBarsWidth = barWidth * n
                  const totalGapsWidth = plotWidth - totalBarsWidth
                  const gap = totalGapsWidth / (n + 1)
                  
                  // Start offset equals the gap (equal spacing on left)
                  const startOffset = gap
                  
                  const totalWidth = plotWidth

                  const avg = enrollmentData.reduce((s, d) => s + d.students, 0) / enrollmentData.length
                  const avgY = topPad + chartHeight - (avg / max) * chartHeight

                  return (
                    <g>
                      {/* Gridlines and Y-axis labels */}
                      {[0, 0.25, 0.5, 0.75, 1].map((t, idx) => {
                        const y = topPad + chartHeight - t * chartHeight
                        const value = Math.round(t * max)
                        return (
                          <g key={idx}>
                            <line x1={leftPad} y1={y} x2={leftPad + totalWidth} y2={y} stroke="#2d2a36" />
                            <text x={leftPad - 10} y={y + 4} textAnchor="end" fill="#8f8aa2" fontSize="11">{value}</text>
                          </g>
                        )
                      })}

                      {/* Average guideline */}
                      <line x1={leftPad} y1={avgY} x2={leftPad + totalWidth} y2={avgY} stroke="#4e46e5" strokeDasharray="4 4" />
                      <text x={leftPad + totalWidth + 8} y={avgY + 4} textAnchor="start" fill="#a8a3ff" fontSize="11">avg {avg.toFixed(1)}</text>

                      {/* Bars */}
                      <g transform={`translate(${leftPad + startOffset},${topPad})`}>
                        {enrollmentData.map((d, i) => {
                          const h = (d.students / max) * chartHeight
                          // Calculate x position: offset + sum of previous bars and gaps
                          const x = i * (barWidth + gap)
                          const y = chartHeight - h
                          const isHover = hoverIndex === i
                          // Keep tooltip centered but clamp within plot bounds
                          const tooltipHalf = 60
                          const tooltipCenterX = leftPad + startOffset + x + barWidth / 2
                          const overflowRight = tooltipCenterX + tooltipHalf - (leftPad + totalWidth)
                          const overflowLeft = leftPad - (tooltipCenterX - tooltipHalf)
                          const tipShiftX = overflowRight > 0 ? -overflowRight - 4 : (overflowLeft > 0 ? overflowLeft + 4 : 0)
                          return (
                            <g key={i} transform={`translate(${x},0)`} onMouseEnter={() => setHoverIndex(i)} onMouseLeave={() => setHoverIndex(null)}>
                              <defs>
                                <linearGradient id={`grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor="#9a8cff" />
                                  <stop offset="100%" stopColor="#6b5cff" />
                                </linearGradient>
                              </defs>
                              <rect x={0} y={y} width={barWidth} height={h} rx={8} fill={`url(#grad-${i})`} opacity={isHover ? 1 : 0.9} />
                              {/* x label */}
                              <text x={barWidth / 2} y={chartHeight + 22} textAnchor="middle" fill="#bbb" fontSize="12">{d.name}</text>
                              {isHover && (
                                <g transform={`translate(${barWidth / 2 + tipShiftX},${Math.max(y - 40, 10)})`}>
                                  <rect x={-60} y={-22} rx={6} width={120} height={32} fill="#1e1a29" stroke="#4e46e5" />
                                  <text x={0} y={-6} textAnchor="middle" fill="#cfcbe6" fontSize="12">{d.name}</text>
                                  <text x={0} y={8} textAnchor="middle" fill="#ffffff" fontSize="12">{d.students} students</text>
                                </g>
                              )}
                            </g>
                          )
                        })}
                      </g>

                      {/* Axes */}
                      <line x1={leftPad} y1={topPad + chartHeight} x2={leftPad + totalWidth} y2={topPad + chartHeight} stroke="#2d2a36" />
                      <line x1={leftPad} y1={topPad} x2={leftPad} y2={topPad + chartHeight} stroke="#2d2a36" />
                    </g>
                  )
                })()}
              </svg>
            </div>
          )}
        </div>
      </div>
        </>
      )}
    </div>
  )
}
