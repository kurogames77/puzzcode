import React, { useMemo, useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import LanguageCard from './LanguageCard'
import { getAllCourses, getLessonsByCourseId, type Course, type Lesson, type Level } from '../utils/courseManager'
import { api } from '../utils/api'
import { useAuth } from '../contexts/AuthContext'
import LessonIntroModal from './LessonIntroModal'

const getProgressCacheKey = (userId: string | null) => {
  if (!userId) return 'lesson_progress_cache_anonymous'
  return `lesson_progress_cache_${userId}`
}

type ProgressEntry = { completed: number; total: number; completedLevels?: number[]; updatedAt?: number }

const normalizeCompletedLevels = (levels?: unknown): number[] | undefined => {
  if (!Array.isArray(levels)) return undefined
  const normalized = levels
    .map(level => Number(level))
    .filter(level => Number.isFinite(level) && level >= 1)
  if (normalized.length === 0) return []
  return Array.from(new Set(normalized)).sort((a, b) => a - b)
}

const mergeCompletedLevels = (...lists: Array<number[] | undefined>): number[] => {
  const set = new Set<number>()
  for (const list of lists) {
    if (!list) continue
    for (const level of list) {
      if (Number.isFinite(level) && level >= 1) {
        set.add(level)
      }
    }
  }
  return Array.from(set).sort((a, b) => a - b)
}

const loadProgressCache = (userId: string | null): Record<string, ProgressEntry> => {
  try {
    const cacheKey = getProgressCacheKey(userId)
    const raw = sessionStorage.getItem(cacheKey)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') {
      const entries = Object.entries(parsed as Record<string, ProgressEntry>).reduce<Record<string, ProgressEntry>>((acc, [lessonId, value]) => {
        if (value && typeof value === 'object' && typeof value.completed === 'number') {
          acc[lessonId] = {
            completed: value.completed,
            total: typeof value.total === 'number' ? value.total : 10,
            completedLevels: normalizeCompletedLevels(value.completedLevels),
            updatedAt: value.updatedAt
          }
        }
        return acc
      }, {})
      return entries
    }
    return {}
  } catch {
    return {}
  }
}

const loadProgressFromCache = (lessonId: string, userId: string | null): ProgressEntry | undefined => {
  try {
    const cacheKey = getProgressCacheKey(userId)
    const raw = sessionStorage.getItem(cacheKey)
    if (!raw) return undefined
    const parsed: Record<string, ProgressEntry> = JSON.parse(raw)
    const entry = parsed[lessonId]
    if (!entry) return undefined
    return {
      completed: entry.completed,
      total: entry.total,
      completedLevels: normalizeCompletedLevels(entry.completedLevels),
      updatedAt: entry.updatedAt
    }
  } catch {
    return undefined
  }
}

const persistProgressCache = (lessonId: string, progress: ProgressEntry, userId: string | null) => {
  try {
    const cacheKey = getProgressCacheKey(userId)
    const raw = sessionStorage.getItem(cacheKey)
    const parsed: Record<string, ProgressEntry> = raw ? JSON.parse(raw) : {}
    parsed[lessonId] = {
      completed: progress.completed,
      total: progress.total,
      completedLevels: progress.completedLevels,
      updatedAt: Date.now()
    }
    sessionStorage.setItem(cacheKey, JSON.stringify(parsed))
  } catch {
    // ignore cache errors
  }
}

const REQUIRED_EASY_LEVEL_NUMBERS = Array.from({ length: 10 }, (_, idx) => idx + 1)

const isLevelFieldFilled = (value?: string | null) =>
  typeof value === 'string' && value.trim().length > 0

const isLevelPlayable = (level: Level | undefined) => {
  if (!level) return false
  return isLevelFieldFilled(level.initialCode) && isLevelFieldFilled(level.expectedOutput)
}

const isLessonStudentReady = (lesson: Lesson): boolean => {
  if (!lesson || !Array.isArray(lesson.levels)) return false
  const easyLevels = lesson.levels.filter(level => level.difficulty === 'Easy')

  if (easyLevels.length === 0) {
    return false
  }

  const easyLevelNumbers = new Set(easyLevels.map(level => level.levelNumber))
  const hasMissingEasyLevel = REQUIRED_EASY_LEVEL_NUMBERS.some(
    requiredNumber => !easyLevelNumbers.has(requiredNumber)
  )

  if (hasMissingEasyLevel) {
    return false
  }

  const hasInvalidLevel = easyLevels.some(level => !isLevelPlayable(level))
  return !hasInvalidLevel
}

export default function StudentCourses() {
  const { user } = useAuth()
  const userId = user?.id || null
  const [filter, setFilter] = useState('all')
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const activeLang = (searchParams.get('lang') || '').toLowerCase()
  const [courses, setCourses] = useState<Course[]>([])
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null)
  const [lessonProgress, setLessonProgress] = useState<Record<string, ProgressEntry>>(() => loadProgressCache(userId))
  const [introLesson, setIntroLesson] = useState<Lesson | null>(null)

  const publishableLessons = useMemo(() => lessons.filter(isLessonStudentReady), [lessons])

  // Map language slug to course name
  const langSlugToCourseName = (slug: string): string => {
    const mapping: Record<string, string> = {
      python: 'Python',
      csharp: 'C#',
      javascript: 'JavaScript',
      cpp: 'C++',
      php: 'PHP',
      mysql: 'MySQL'
    }
    return mapping[slug] || slug
  }

  // Fetch courses and lessons when language is selected
  useEffect(() => {
    const fetchData = async () => {
      if (!activeLang) {
        setLessons([])
        setSelectedCourse(null)
        return
      }

      setIsLoading(true)
      try {
        const allCourses = await getAllCourses()
        setCourses(allCourses)
        
        // Find course matching the language
        const courseName = langSlugToCourseName(activeLang)
        const matchingCourse = allCourses.find(c => 
          c.name.toLowerCase() === courseName.toLowerCase() || 
          c.id.toLowerCase() === activeLang
        )

        if (matchingCourse) {
          setSelectedCourse(matchingCourse)
          const courseLessons = await getLessonsByCourseId(matchingCourse.id)
          setLessons(courseLessons)
        } else {
          setSelectedCourse(null)
          setLessons([])
        }
      } catch (error) {
        console.error('Error fetching courses/lessons:', error)
        setLessons([])
        setSelectedCourse(null)
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [activeLang])

  // Clear cache when user changes
  useEffect(() => {
    setLessonProgress(loadProgressCache(userId))
  }, [userId])

  // Helper function to refetch progress
  const refetchLessonProgress = useCallback(async () => {
    if (publishableLessons.length === 0 || !userId) return

    const progressMap: Record<string, ProgressEntry> = {}
    
    const progressPromises = publishableLessons.map(async (lesson) => {
      try {
        const result = await api.getLessonProgress(lesson.id)
        if (result.completed !== undefined && result.total !== undefined) {
          progressMap[lesson.id] = {
            completed: result.completed,
            total: result.total,
            completedLevels: normalizeCompletedLevels(result.completedLevels)
          }
        }
      } catch (error) {
        console.error(`Error fetching progress for lesson ${lesson.id}:`, error)
      }
    })

    await Promise.all(progressPromises)

    setLessonProgress(prev => {
      const next: Record<string, ProgressEntry> = { ...prev }
      Object.entries(progressMap).forEach(([lessonId, progress]) => {
        const cached = loadProgressFromCache(lessonId, userId)
        const previous = prev[lessonId] || cached
        const mergedCompletedLevels = mergeCompletedLevels(
          previous?.completedLevels,
          cached?.completedLevels,
          progress.completedLevels
        )
        const mergedCompleted = Math.max(
          previous?.completed ?? 0,
          cached?.completed ?? 0,
          progress.completed ?? 0,
          mergedCompletedLevels.length
        )
        const mergedTotal = Math.max(
          progress.total ?? previous?.total ?? 10,
          mergedCompletedLevels.length
        )
        next[lessonId] = {
          completed: mergedCompleted,
          total: mergedTotal,
          completedLevels: mergedCompletedLevels
        }
        persistProgressCache(lessonId, next[lessonId], userId)
      })
      return next
    })
  }, [publishableLessons, userId])

  // Refresh progress when component becomes visible (user navigates back)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && publishableLessons.length > 0) {
        refetchLessonProgress()
      }
    }

    const handleFocus = () => {
      if (publishableLessons.length > 0) {
        refetchLessonProgress()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
    }
  }, [publishableLessons, refetchLessonProgress])

  useEffect(() => {
    if (!userId) return

    const handleLessonProgressUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ lessonId: string; progress: { completed?: number; total?: number; completedLevels?: number[] } }>).detail
      if (!detail || !detail.lessonId) {
        return
      }

      setLessonProgress(prev => {
        const previous = prev[detail.lessonId]
        const cached = loadProgressFromCache(detail.lessonId, userId)
        const incomingCompletedLevels = normalizeCompletedLevels(detail.progress.completedLevels)
        const mergedCompletedLevels = mergeCompletedLevels(
          previous?.completedLevels,
          cached?.completedLevels,
          incomingCompletedLevels
        )
        const updatedCompleted =
          typeof detail.progress.completed === 'number'
            ? detail.progress.completed
            : (mergedCompletedLevels.length > 0 ? mergedCompletedLevels.length : (previous?.completed ?? cached?.completed ?? 0))
        const updatedTotal =
          typeof detail.progress.total === 'number'
            ? Math.max(detail.progress.total, mergedCompletedLevels.length)
            : Math.max(previous?.total ?? cached?.total ?? 10, mergedCompletedLevels.length)

        const nextState = {
          ...prev,
          [detail.lessonId]: {
            completed: updatedCompleted,
            total: updatedTotal,
            completedLevels: mergedCompletedLevels
          }
        }
        persistProgressCache(detail.lessonId, { completed: updatedCompleted, total: updatedTotal, completedLevels: mergedCompletedLevels }, userId)
        return nextState
      })
    }

    window.addEventListener('lesson-progress-updated', handleLessonProgressUpdated as EventListener)
    return () => {
      window.removeEventListener('lesson-progress-updated', handleLessonProgressUpdated as EventListener)
    }
  }, [userId])

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'Beginner': return '#4caf50'
      case 'Intermediate': return '#ff9800'
      case 'Advanced': return '#f44336'
      default: return '#7b5cff'
    }
  }

  // Fetch progress for all lessons that are student-ready
  useEffect(() => {
    const fetchLessonProgress = async () => {
      if (publishableLessons.length === 0 || !userId) return

      const progressMap: Record<string, ProgressEntry> = {}
      
      // Fetch progress for each lesson in parallel
      const progressPromises = publishableLessons.map(async (lesson) => {
        try {
          const result = await api.getLessonProgress(lesson.id)
          if (result.completed !== undefined && result.total !== undefined) {
            progressMap[lesson.id] = {
              completed: result.completed,
              total: result.total,
              completedLevels: normalizeCompletedLevels(result.completedLevels)
            }
          } else {
            // Fallback: calculate from levels if API doesn't return progress
            const uniqueLevelNumbers = new Set(lesson.levels?.map(l => l.levelNumber) || [])
            progressMap[lesson.id] = {
              completed: 0,
              total: uniqueLevelNumbers.size || 10,
              completedLevels: []
            }
          }
        } catch (error) {
          console.error(`Error fetching progress for lesson ${lesson.id}:`, error)
          // Fallback: calculate from levels
          const uniqueLevelNumbers = new Set(lesson.levels?.map(l => l.levelNumber) || [])
          progressMap[lesson.id] = {
            completed: 0,
            total: uniqueLevelNumbers.size || 10,
            completedLevels: []
          }
        }
      })

      await Promise.all(progressPromises)
      setLessonProgress(prev => {
        const merged: Record<string, ProgressEntry> = { ...prev }
        Object.entries(progressMap).forEach(([lessonId, progress]) => {
          const cached = loadProgressFromCache(lessonId, userId)
          const existing = prev[lessonId] || cached
          const mergedCompletedLevels = mergeCompletedLevels(existing?.completedLevels, progress.completedLevels)
          const completed = Math.max(progress.completed, existing?.completed ?? 0, mergedCompletedLevels.length)
          const total = Math.max(progress.total, existing?.total ?? 0, mergedCompletedLevels.length)
          merged[lessonId] = {
            completed,
            total,
            completedLevels: mergedCompletedLevels
          }
          persistProgressCache(lessonId, merged[lessonId], userId)
        })
        return merged
      })
    }

    fetchLessonProgress()
  }, [publishableLessons, userId])

  // Calculate progress for a lesson
  const calculateLessonProgress = (lesson: Lesson): ProgressEntry => {
    // Use cached progress if available
    if (lessonProgress[lesson.id]) {
      const entry = lessonProgress[lesson.id]
      const completedLevels = entry.completedLevels ?? []
      return {
        completed: Math.max(entry.completed, completedLevels.length),
        total: Math.max(entry.total, completedLevels.length),
        completedLevels
      }
    }

    // Fallback: calculate from levels structure
    if (!lesson.levels || lesson.levels.length === 0) {
      return { completed: 0, total: 10, completedLevels: [] } // Default to 10 levels
    }
    
    // Count unique level numbers (each level can have Easy, Medium, Hard variants)
    const uniqueLevelNumbers = new Set(lesson.levels.map(l => l.levelNumber))
    const totalLevels = uniqueLevelNumbers.size
    
    return { completed: 0, total: totalLevels, completedLevels: [] }
  }

  // Get lesson difficulty from database, fallback to calculating from levels
  const getLessonDifficulty = (lesson: Lesson): 'Beginner' | 'Intermediate' | 'Advanced' => {
    // Use difficulty from database if available
    if (lesson.difficulty) {
      return lesson.difficulty
    }
    
    // Fallback: determine difficulty based on levels
    if (!lesson.levels || lesson.levels.length === 0) return 'Beginner'
    
    // Check if lesson has Hard levels (Advanced)
    const hasHard = lesson.levels.some(l => l.difficulty === 'Hard')
    if (hasHard) return 'Advanced'
    
    // Check if lesson has Medium levels (Intermediate)
    const hasMedium = lesson.levels.some(l => l.difficulty === 'Medium')
    if (hasMedium) return 'Intermediate'
    
    return 'Beginner'
  }

  const getDurationMinutes = (difficulty: 'Beginner' | 'Intermediate' | 'Advanced') => {
    if (difficulty === 'Beginner') return 10
    if (difficulty === 'Intermediate') return 15
    return 20
  }

  // Filter lessons based on status
  const visibleLessons = useMemo(() => {
    if (filter === 'all') return publishableLessons

    return publishableLessons.filter((lesson) => {
      const progress = calculateLessonProgress(lesson)
      const totalLevels = progress.total || 0
      const completedLevelsCount = progress.completedLevels?.length ?? progress.completed ?? 0
      const isCompleted = totalLevels > 0 ? completedLevelsCount >= totalLevels : false

      if (filter === 'completed') {
        return isCompleted
      }

      if (filter === 'in-progress') {
        // Show lessons that are not fully completed (including not started yet)
        return !isCompleted
      }

      return true
    })
  }, [publishableLessons, filter, lessonProgress])

  return (
    <div className="student-courses">
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Let’s Play Puzzle</h1>
          <p className="page-subtitle">Solve challenges, level up, and track your progress.</p>
        </div>
        <div className="page-actions">
          {activeLang && (
            <div className="filter-tabs" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button 
                className={`filter-tab ${filter === 'all' ? 'active' : ''}`}
                onClick={() => setFilter('all')}
              >
                All Lessons
              </button>
              <button 
                className={`filter-tab ${filter === 'in-progress' ? 'active' : ''}`}
                onClick={() => setFilter('in-progress')}
              >
                In Progress
              </button>
              <button 
                className={`filter-tab ${filter === 'completed' ? 'active' : ''}`}
                onClick={() => setFilter('completed')}
              >
                Completed
              </button>
              <button
                className={`filter-tab`}
                onClick={() => navigate('/dashboard/student/courses')}
              >
                Back
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Language Picker (hidden when a language filter is active) */}
      {!activeLang && (
        <div className="mb-4">
          <h3 className="mb-3">Pick a language</h3>
          <div className="dashboard-grid">
            <LanguageCard to="/dashboard/student/courses?lang=python" id="python" title="Python" summary="Beginner-friendly, versatile scripting." icon="/python-logo.png" />
            <LanguageCard to="/dashboard/student/courses?lang=csharp" id="csharp" title="C#" summary="Modern OOP for apps, games, and web." icon="/csharp_logo-221dcba91bfe189e98c562b90269b16f.png" />
            <LanguageCard to="/dashboard/student/courses?lang=javascript" id="javascript" title="JavaScript" summary="The language of the web." icon="/javascript-logo-javascript-icon-transparent-free-png.webp" />
            <LanguageCard to="/dashboard/student/courses?lang=cpp" id="cpp" title="C++" summary="High performance systems and games." icon="/c-logo-a2fa.png" />
            <LanguageCard to="/dashboard/student/courses?lang=php" id="php" title="PHP" summary="Server-side scripting for the web." icon="/php_PNG43.png" />
            <LanguageCard to="/dashboard/student/courses?lang=mysql" id="mysql" title="MySQL" summary="Relational DB and SQL fundamentals." icon="/269-2693201_mysql-logo-circle-png.png" />
          </div>
        </div>
      )}

      {/* Active language chip */}
      {activeLang && (
        <div className="mb-3" style={{ display: 'flex', alignItems: 'center' }}>
          <span className="badge" style={{ background: 'rgba(79,70,229,0.15)', color: '#a5b4fc', border: '1px solid rgba(79,70,229,0.35)', padding: '6px 10px', borderRadius: 9999, fontWeight: 600 }}>
            Language: {activeLang}
          </span>
        </div>
      )}

      {/* Hide main course card when language is selected; show only lesson cards below */}

      {/* Removed bullet-list topics per request */}

      {activeLang && (
        <div className="mb-4" style={{ marginTop: 16 }}>
          <h3 className="mb-3">Lessons</h3>
          {isLoading ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af' }}>
              Loading lessons...
            </div>
          ) : visibleLessons.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af' }}>
              No lessons available yet. Admins need to create lessons and levels for this course.
            </div>
          ) : (
            <div className="courses-grid">
              {visibleLessons.map((lesson) => {
                const progress = calculateLessonProgress(lesson)
                const difficulty = getLessonDifficulty(lesson)
                const totalLevels = progress.total || 10 // Default to 10 if no levels
                const completedLevelsCount = progress.completedLevels?.length ?? progress.completed
                const completedLevelSet = new Set(
                  (progress.completedLevels && progress.completedLevels.length > 0)
                    ? progress.completedLevels
                    : Array.from({ length: completedLevelsCount }, (_, idx) => idx + 1)
                )
                const courseId = selectedCourse?.id || ''

                const isLessonCompleted = completedLevelsCount >= totalLevels && totalLevels > 0
                
                return (
                  <div key={lesson.id} className="course-card" style={{ position: 'relative', overflow: 'hidden' }}>
                    {/* Big circular checkmark in background for completed lessons */}
                    {isLessonCompleted && (
                      <div style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: '200px',
                        height: '200px',
                        borderRadius: '50%',
                        background: 'rgba(74, 222, 128, 0.15)',
                        border: '8px solid rgba(74, 222, 128, 0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 0,
                        pointerEvents: 'none'
                      }}>
                        <span style={{
                          fontSize: '120px',
                          color: 'rgba(74, 222, 128, 0.4)',
                          fontWeight: 'bold'
                        }}>✓</span>
                      </div>
                    )}
                    <div style={{ position: 'relative', zIndex: 1 }}>
                      <div className="course-header">
                        <div className="course-title">{lesson.title}</div>
                        <div 
                          className="course-difficulty"
                          style={{ backgroundColor: getDifficultyColor(difficulty) }}
                        >
                          {difficulty}
                        </div>
                      </div>
                    <div className="course-description">
                      {lesson.description || `Practice the ${lesson.title.toLowerCase()} unit with interactive puzzles.`}
                    </div>
                    {/* Per-lesson progress bar */}
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Progress</div>
                      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(totalLevels, 10)}, 1fr)`, gap: 6 }}>
                        {Array.from({ length: Math.max(totalLevels, 10) }).map((_, idx) => {
                          const levelNumber = idx + 1
                          const isCompleted = completedLevelSet.has(levelNumber)
                          return (
                            <div 
                              key={idx}
                              style={{
                                height: 10,
                                borderRadius: 4,
                                background: isCompleted ? '#4caf50' : '#374151',
                                border: isCompleted ? '1px solid #4caf50' : '1px solid rgba(255,255,255,0.18)'
                              }}
                            />
                          )
                        })}
                      </div>
                    </div>
                    <div className="course-meta" style={{ marginTop: 12 }}>
                      <div className="course-duration">⏱️ {getDurationMinutes(difficulty)} mins</div>
                      <div className="course-status">{completedLevelsCount}/{totalLevels} levels</div>
                    </div>
                    <div className="course-actions">
                      {isLessonCompleted ? (
                        <button 
                          className="btn-secondary" 
                          disabled
                          style={{
                            background: 'rgba(74, 222, 128, 0.2)',
                            border: '1px solid rgba(74, 222, 128, 0.4)',
                            color: '#4ade80',
                            cursor: 'not-allowed',
                            opacity: 0.8
                          }}
                        >
                          ✓ Completed
                        </button>
                      ) : (
                        <button 
                          className="btn-primary" 
                          onClick={() => {
                            // Open cinematic intro popup instead of navigating immediately
                            setIntroLesson(lesson)
                          }}
                          disabled={!courseId || totalLevels === 0}
                        >
                          Start
                        </button>
                      )}
                    </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {introLesson && selectedCourse && activeLang && (
        <LessonIntroModal
          lesson={introLesson}
          languageSlug={activeLang}
          onClose={() => setIntroLesson(null)}
          onStart={() => {
            const courseId = selectedCourse.id
            if (!courseId) return
            const topicSlug = introLesson.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
            setIntroLesson(null)
            navigate(`/lesson/${courseId}?lang=${activeLang}&lesson=${introLesson.id}&topic=${topicSlug}`)
          }}
        />
      )}
    </div>
  )
}
