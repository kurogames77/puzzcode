import { api } from './api'

export interface Level {
  id: string
  levelNumber: number
  title: string
  description: string
  difficulty: 'Easy' | 'Medium' | 'Hard'
  points: number
  initialCode?: string
  expectedOutput?: string
  isCompleted?: boolean
}

export interface Lesson {
  id: string
  courseId: string
  title: string
  description: string
  difficulty?: 'Beginner' | 'Intermediate' | 'Advanced'
  levels: Level[]
  createdAt?: string
  updatedAt?: string
}

export interface Course {
  id: string
  name: string
  students: number
  status: 'Active' | 'Draft' | 'Archived'
  summary: string
  icon: string
  lessons?: Lesson[]
  createdAt?: string
  updatedAt?: string
}

// Generate unique ID for courses
function generateCourseId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

// Generate unique ID for lessons
function generateLessonId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

// Generate unique ID for levels
function generateLevelId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

// Get all courses from API
export async function getAllCourses(): Promise<Course[]> {
  try {
    return await api.getCourses()
  } catch (error) {
    console.error('Error fetching courses:', error)
    // Fallback to localStorage
    const courses = localStorage.getItem('puzzcode_courses')
    return courses ? JSON.parse(courses) : []
  }
}

// Save courses to localStorage
function saveCourses(courses: Course[]): void {
  localStorage.setItem('puzzcode_courses', JSON.stringify(courses))
}

// Reset all course student counts to zero (useful for fresh environments with no activity)
export async function resetAllCourseStudentCounts(): Promise<void> {
  try {
    await api.resetStudentCounts()
  } catch (error) {
    console.error('Error resetting student counts:', error)
    // Fallback to localStorage
    const courses = localStorage.getItem('puzzcode_courses')
    if (!courses) return
    const parsed = JSON.parse(courses)
    const updated = parsed.map((c: Course) => ({ ...c, students: 0 }))
    localStorage.setItem('puzzcode_courses', JSON.stringify(updated))
  }
}

// Initialize with default courses if none exist
export async function initializeDefaultCourses(): Promise<void> {
  try {
    const courses = await getAllCourses()
    if (courses.length === 0) {
    const defaultCourses: Course[] = [
      {
        id: 'python',
        name: 'Python',
        students: 0,
        status: 'Active',
        summary: 'Beginner friendly, versatile scripting.',
        icon: '/python-logo.png',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'csharp',
        name: 'C#',
        students: 0,
        status: 'Active',
        summary: 'Robust OOP for web, game, and enterprise.',
        icon: '/csharp_logo-221dcba91bfe189e98c562b90269b16f.png',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'javascript',
        name: 'JavaScript',
        students: 0,
        status: 'Active',
        summary: 'The language of the web.',
        icon: '/javascript-logo-javascript-icon-transparent-free-png.webp',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'cpp',
        name: 'C++',
        students: 0,
        status: 'Active',
        summary: 'High performance systems and games.',
        icon: '/c-logo-a2fa.png',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'php',
        name: 'PHP',
        students: 0,
        status: 'Active',
        summary: 'Server-side productivity.',
        icon: '/php_PNG43.png',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'mysql',
        name: 'MySQL',
        students: 0,
        status: 'Active',
        summary: 'Relational database fundamentals.',
        icon: '/269-2693201_mysql-logo-circle-png.png',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ]
    // Try to create courses via API, fallback to localStorage
    for (const course of defaultCourses) {
      try {
        await api.createCourse(course)
      } catch (error) {
        console.error('Error creating default course:', error)
        // Fallback to localStorage
        const existing = localStorage.getItem('puzzcode_courses')
        const courses = existing ? JSON.parse(existing) : []
        courses.push(course)
        localStorage.setItem('puzzcode_courses', JSON.stringify(courses))
      }
    }
  }
  } catch (error) {
    console.error('Error initializing default courses:', error)
  }
}

// Create a new course
export async function createCourse(courseData: Omit<Course, 'id' | 'createdAt' | 'updatedAt'>): Promise<{ success: boolean; course?: Course; error?: string }> {
  try {
    const course = await api.createCourse(courseData)
    return { success: true, course }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to create course' }
  }
}

// Update an existing course
export async function updateCourse(courseId: string, courseData: Partial<Omit<Course, 'id' | 'createdAt'>>): Promise<{ success: boolean; course?: Course; error?: string }> {
  try {
    const course = await api.updateCourse(courseId, courseData)
    return { success: true, course }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to update course' }
  }
}

// Delete a course
export async function deleteCourse(courseId: string): Promise<{ success: boolean; error?: string }> {
  try {
    await api.deleteCourse(courseId)
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to delete course' }
  }
}

// Get course by ID
export async function getCourseById(courseId: string): Promise<Course | null> {
  try {
    return await api.getCourse(courseId)
  } catch (error) {
    console.error('Error fetching course:', error)
    // Fallback to localStorage
    const courses = localStorage.getItem('puzzcode_courses')
    const parsed = courses ? JSON.parse(courses) : []
    return parsed.find((course: Course) => course.id === courseId) || null
  }
}

// Create a new lesson with 10 levels
export async function createLesson(courseId: string, lessonData: { title: string; description: string; difficulty?: 'Beginner' | 'Intermediate' | 'Advanced' }): Promise<{ success: boolean; lesson?: Lesson; error?: string }> {
  try {
    const lesson = await api.createLesson({
      courseId,
      title: lessonData.title,
      description: lessonData.description,
      difficulty: lessonData.difficulty || 'Beginner'
    })
    return { success: true, lesson }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to create lesson' }
  }
}

// Get all lessons for a course
export async function getLessonsByCourseId(courseId: string): Promise<Lesson[]> {
  try {
    return await api.getLessons(courseId)
  } catch (error) {
    console.error('Error fetching lessons:', error)
    // Fallback to localStorage
    const course = await getCourseById(courseId)
    return course?.lessons || []
  }
}

// Get lesson by ID
export async function getLessonById(lessonId: string): Promise<Lesson | null> {
  try {
    return await api.getLesson(lessonId)
  } catch (error) {
    console.error('Error fetching lesson:', error)
    return null
  }
}

// Update a lesson
export async function updateLesson(lessonId: string, lessonData: Partial<Omit<Lesson, 'id' | 'courseId' | 'levels'>>): Promise<{ success: boolean; lesson?: Lesson; error?: string }> {
  try {
    const lesson = await api.updateLesson(lessonId, lessonData)
    return { success: true, lesson }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to update lesson' }
  }
}

// Delete a lesson
export async function deleteLesson(lessonId: string): Promise<{ success: boolean; error?: string }> {
  try {
    await api.deleteLesson(lessonId)
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to delete lesson' }
  }
}

// Update level code and output (or create if it doesn't exist)
export async function updateLevel(levelId: string | null, data: { initialCode?: string; expectedOutput?: string; lessonId?: string; levelNumber?: number; difficulty?: string; title?: string; description?: string; points?: number }): Promise<{ success: boolean; level?: Level; error?: string }> {
  try {
    console.log('updateLevel called with:', { levelId, data })
    
    // If no levelId is provided, we need to create a new level
    // In this case, we should use the POST endpoint instead
    if (!levelId && data.lessonId && data.levelNumber && data.difficulty) {
      const level = await api.createLevel({
        lessonId: data.lessonId,
        levelNumber: data.levelNumber,
        difficulty: data.difficulty,
        title: data.title,
        description: data.description,
        points: data.points,
        initialCode: data.initialCode,
        expectedOutput: data.expectedOutput
      })
      console.log('createLevel API returned:', level)
      if (level && level.id) {
        return { success: true, level }
      } else {
        return { success: false, error: 'Invalid response from server' }
      }
    }
    
    // Otherwise, use PUT to update (or create if levelId doesn't exist)
    const level = await api.updateLevel(levelId || '', data)
    console.log('updateLevel API returned:', level)
    if (level && level.id) {
      return { success: true, level }
    } else {
      return { success: false, error: 'Invalid response from server' }
    }
  } catch (error: any) {
    console.error('updateLevel error:', error)
    return { success: false, error: error.message || 'Failed to update level' }
  }
}

// Get level by ID
export async function getLevel(levelId: string): Promise<Level | null> {
  try {
    return await api.getLevel(levelId)
  } catch (error) {
    console.error('Error fetching level:', error)
    return null
  }
}
