import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

interface Props {
  children: React.ReactNode
  requiredUserType?: 'student' | 'admin'
}

export default function ProtectedRoute({ children, requiredUserType }: Props) {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    // Redirect to login page with return url
    return <Navigate to="/" state={{ from: location }} replace />
  }

  if (requiredUserType && user.userType !== requiredUserType) {
    // Redirect to appropriate dashboard based on user type
    const dashboardPath = user.userType === 'student' ? '/dashboard/student' : '/dashboard/admin'
    return <Navigate to={dashboardPath} replace />
  }

  return <>{children}</>
}
