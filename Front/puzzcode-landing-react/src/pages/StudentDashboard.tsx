import React from 'react'
import { useAuth } from '../contexts/AuthContext'
import DashboardLayout from '../components/DashboardLayout'

export default function StudentDashboard() {
  const { user, logout } = useAuth()

  if (!user) return null

  return (
    <DashboardLayout userType="student" userName={user.username} onLogout={logout} user={user} />
  )
}
