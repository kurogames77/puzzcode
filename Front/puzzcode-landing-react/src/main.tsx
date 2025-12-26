import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import 'bootstrap/dist/css/bootstrap.min.css'
import './styles/global.scss'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import ErrorBoundary from './components/ErrorBoundary'
import Landing from './pages/Landing'
import Language from './pages/Language'
import StudentDashboard from './pages/StudentDashboard'
import AdminDashboard from './pages/AdminDashboard'
import ProtectedRoute from './components/ProtectedRoute'
import StudentOverview from './components/StudentOverview'
import StudentCourses from './components/StudentCourses'
// import StudentProgress from './components/StudentProgress'
import StudentAchievements from './components/StudentAchievements'
import StudentProfile from './components/StudentProfile'
import MultiplayerBattle from './components/MultiplayerBattle'
import BattleRoom from './components/BattleRoom'
import CoursePlayer from './components/CoursePlayer'
import LessonIntroduction from './components/LessonIntroduction'
import LessonLayout from './components/LessonLayout'
import LessonRedirect from './components/LessonRedirect'
import Leaderboard from './pages/Leaderboard'
import AdminOverview from './components/AdminOverview'
import AdminCourses from './components/AdminCourses'
import AdminSettings from './components/AdminSettings'
import AdminProfile from './components/AdminProfile'

const router = createBrowserRouter([
  { path: '/', element: <Landing /> },
  { path: '/lang/:id', element: <Language /> },
  {
    path: '/lesson/:courseId',
    element: (
      <ProtectedRoute requiredUserType="student">
        <LessonLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <LessonIntroduction /> }
    ]
  },
  { 
    path: '/dashboard/student',
    element: (
      <ProtectedRoute requiredUserType="student">
        <StudentDashboard />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <StudentOverview /> },
      { path: 'courses', element: <StudentCourses /> },
      { path: 'courses/:courseId/lesson', element: <LessonRedirect /> },
      { path: 'courses/:courseId/play', element: <CoursePlayer /> },
      // { path: 'progress', element: <StudentProgress /> },
      { path: 'achievements', element: <StudentAchievements /> },
      { path: 'battle', element: <MultiplayerBattle /> },
      { path: 'battle/room', element: <BattleRoom /> },
      { path: 'leaderboard', element: <Leaderboard /> },
      { path: 'profile', element: <StudentProfile /> }
    ]
  },
  { 
    path: '/dashboard/admin',
    element: (
      <ProtectedRoute requiredUserType="admin">
        <AdminDashboard />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <AdminOverview /> },
      { path: 'courses', element: <AdminCourses /> },
      { path: 'settings', element: <AdminSettings /> },
      { path: 'profile', element: <AdminProfile /> }
    ]
  }
])

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>
)


