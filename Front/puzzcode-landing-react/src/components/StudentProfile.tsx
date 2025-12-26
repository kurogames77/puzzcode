import React, { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../utils/api'

export default function StudentProfile() {
  const { user, refreshUser, updateUserProfile } = useAuth()
  const [isEditing, setIsEditing] = useState(false)
  const [editMode, setEditMode] = useState<'profile' | 'password' | null>(null)
  const [formData, setFormData] = useState({
    username: user?.username || '',
    email: user?.email || '',
    schoolId: user?.schoolId || '',
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    avatarUrl: user?.avatarUrl || ''
  })
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [successMessage, setSuccessMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [avatarPreview, setAvatarPreview] = useState<string>(user?.avatarUrl || '')
  const [statistics, setStatistics] = useState({
    totalCourses: 0,
    lessonsCompleted: 0,
    currentStreak: 0,
    totalPoints: 0,
    multiplayerWins: 0,
    studentRank: 'novice'
  })
  const [loadingStats, setLoadingStats] = useState(true)

  // Fetch user statistics
  useEffect(() => {
    const fetchStatistics = async () => {
      if (!user) return
      try {
        setLoadingStats(true)
        const result = await api.getUserStatistics()
        if (result.success && result.statistics) {
          setStatistics(result.statistics)
        }
      } catch (error) {
        console.error('Failed to fetch statistics:', error)
      } finally {
        setLoadingStats(false)
      }
    }
    fetchStatistics()
  }, [user])

  // Update formData when user changes
  useEffect(() => {
    if (user) {
      setFormData({
        username: user.username || '',
        email: user.email || '',
        schoolId: user.schoolId || '',
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        avatarUrl: user.avatarUrl || ''
      })
      setAvatarPreview(user.avatarUrl || '')
    }
  }, [user])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
    // Clear error for this field
    if (errors[name]) {
      setErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors[name]
        return newErrors
      })
    }
  }

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setPasswordData(prev => ({
      ...prev,
      [name]: value
    }))
    // Clear error for this field
    if (errors[name]) {
      setErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors[name]
        return newErrors
      })
    }
  }

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      setAvatarPreview(dataUrl)
      setFormData(prev => ({ ...prev, avatarUrl: dataUrl }))
    }
    reader.readAsDataURL(file)
  }

  const validateProfile = () => {
    const newErrors: Record<string, string> = {}
    
    if (!formData.username || formData.username.length < 3) {
      newErrors.username = 'Username must be at least 3 characters'
    }
    
    if (!formData.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email'
    }
    
    if (!formData.schoolId || formData.schoolId.length < 3) {
      newErrors.schoolId = 'School ID must be at least 3 characters'
    }

    return newErrors
  }

  const validatePassword = () => {
    const newErrors: Record<string, string> = {}
    
    if (!passwordData.currentPassword) {
      newErrors.currentPassword = 'Current password is required'
    }
    
    if (passwordData.newPassword.length < 6) {
      newErrors.newPassword = 'Password must be at least 6 characters'
    } else if (!/[A-Z]/.test(passwordData.newPassword)) {
      newErrors.newPassword = 'Password must contain at least one uppercase letter'
    } else if (!/[a-z]/.test(passwordData.newPassword)) {
      newErrors.newPassword = 'Password must contain at least one lowercase letter'
    } else if (!/\d/.test(passwordData.newPassword)) {
      newErrors.newPassword = 'Password must contain at least one number'
    }
    
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match'
    }

    return newErrors
  }

  const handleSaveProfile = async () => {
    const profileErrors = validateProfile()
    
    if (Object.keys(profileErrors).length > 0) {
      setErrors(profileErrors)
      return
    }

    setIsLoading(true)
    try {
      const result = await updateUserProfile({
        username: formData.username,
        email: formData.email,
        schoolId: formData.schoolId,
        firstName: formData.firstName,
        lastName: formData.lastName,
        avatarUrl: formData.avatarUrl
      })
      if (result.success) {
        setSuccessMessage('Profile updated successfully!')
        setIsEditing(false)
        // Ensure global auth state picks up avatar/field changes
        await refreshUser()
        setTimeout(() => setSuccessMessage(''), 3000)
      } else {
        setErrors(result.errors || {})
      }
    } catch (error) {
      setErrors({ general: 'Failed to update profile' })
    } finally {
      setIsLoading(false)
    }
  }

  const handleChangePassword = async () => {
    const passwordErrors = validatePassword()
    
    if (Object.keys(passwordErrors).length > 0) {
      setErrors(passwordErrors)
      return
    }

    setIsLoading(true)
    try {
      const response = await api.changePassword(passwordData)
      if (response.success) {
        setSuccessMessage('Password changed successfully!')
        setPasswordData({
          currentPassword: '',
          newPassword: '',
          confirmPassword: ''
        })
        setIsEditing(false)
        setEditMode(null)
        setTimeout(() => setSuccessMessage(''), 3000)
      } else {
        setErrors({ general: response.error || 'Failed to change password' })
      }
    } catch (error: any) {
      const errorMessage = error.response?.error || error.message || 'Failed to change password'
      setErrors({ general: errorMessage })
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancel = () => {
    setIsEditing(false)
    setEditMode(null)
    setFormData({
      username: user?.username || '',
      email: user?.email || '',
      schoolId: user?.schoolId || '',
      firstName: user?.firstName || '',
      lastName: user?.lastName || '',
      avatarUrl: user?.avatarUrl || ''
    })
    setPasswordData({
      currentPassword: '',
      newPassword: '',
      confirmPassword: ''
    })
    setErrors({})
    setAvatarPreview(user?.avatarUrl || '')
  }

  if (!user) {
    return <div>Loading...</div>
  }

  // Format statistics for display
  const formatRank = (rank: string) => {
    if (!rank) return 'Novice'
    // Handle rank names with underscores (e.g., "bronze_coder" -> "Bronze Coder")
    return rank
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  const stats = [
    { label: 'Languages Engaged', value: loadingStats ? '...' : String(statistics.totalCourses), icon: '📚' },
    { label: 'Lessons Completed', value: loadingStats ? '...' : String(statistics.lessonsCompleted), icon: '✅' },
    { label: 'Current Streak', value: loadingStats ? '...' : `${statistics.currentStreak} ${statistics.currentStreak === 1 ? 'day' : 'days'}`, icon: '🔥' },
    { label: 'Total Points', value: loadingStats ? '...' : String(statistics.totalPoints), icon: '⭐' },
    { label: 'Multiplayer Wins', value: loadingStats ? '...' : String(statistics.multiplayerWins), icon: '🏆' },
    { label: 'Student Rank', value: loadingStats ? '...' : formatRank(statistics.studentRank), icon: '🎓' }
  ]

  return (
    <div className="student-profile">
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Design your Self</h1>
          <p className="page-subtitle">Manage your account and personalize your experience.</p>
        </div>
        {!isEditing && (
          <button className="btn-edit-profile" onClick={() => setIsEditing(true)}>
            Edit Profile
          </button>
        )}
      </div>

      {successMessage && (
        <div className="success-message">
          {successMessage}
        </div>
      )}

      {errors.general && (
        <div className="error-message">
          {errors.general}
        </div>
      )}

      <div className="dashboard-grid">
        {/* Profile Info Card */}
        <div className="dashboard-card">
          <div className="card-header">
            <h3 className="card-title">Profile Information</h3>
            {isEditing && (
              <div className="card-actions">
                <button 
                  className="btn-secondary"
                  onClick={handleCancel}
                  disabled={isLoading}
                >
                  Cancel
                </button>
                <button 
                  className="btn-primary"
                  onClick={handleSaveProfile}
                  disabled={isLoading}
                >
                  {isLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            )}
          </div>
          <div className="card-content">
            <div className="profile-avatar-large">
              {avatarPreview ? (
                <img src={avatarPreview} alt="Avatar" className="avatar-image" />
              ) : (
                <div className="avatar-circle">
                  {(user.firstName?.charAt(0) || user.lastName?.charAt(0) || user.username?.charAt(0) || 'U').toUpperCase()}
                </div>
              )}
              <div className="avatar-info">
                <h3>
                  {user.firstName && user.lastName 
                    ? `${user.firstName} ${user.lastName}`
                    : user.firstName || user.lastName
                    ? `${user.firstName || ''}${user.lastName || ''}`.trim()
                    : user.username}
                </h3>
                <p>School ID: {user.schoolId || '—'}</p>
              </div>
            </div>

            <div className="profile-form">
              {isEditing && (
                <div className="form-group">
                  <label htmlFor="avatar">Profile Picture</label>
                  <input
                    type="file"
                    id="avatar"
                    name="avatar"
                    accept="image/*"
                    onChange={handleAvatarChange}
                  />
                </div>
              )}

              <div className="form-group">
                <label htmlFor="firstName">First Name</label>
                <input
                  type="text"
                  id="firstName"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleInputChange}
                  disabled={!isEditing}
                  className={errors.firstName ? 'error' : ''}
                />
                {errors.firstName && <span className="error-text">{errors.firstName}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="lastName">Last Name</label>
                <input
                  type="text"
                  id="lastName"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleInputChange}
                  disabled={!isEditing}
                  className={errors.lastName ? 'error' : ''}
                />
                {errors.lastName && <span className="error-text">{errors.lastName}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="schoolId">School ID</label>
                <input
                  type="text"
                  id="schoolId"
                  name="schoolId"
                  value={formData.schoolId}
                  onChange={handleInputChange}
                  disabled={!isEditing}
                  className={errors.schoolId ? 'error' : ''}
                />
                {errors.schoolId && <span className="error-text">{errors.schoolId}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  disabled={!isEditing}
                  className={errors.email ? 'error' : ''}
                />
                {errors.email && <span className="error-text">{errors.email}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="username">Username</label>
                <input
                  type="text"
                  id="username"
                  name="username"
                  value={formData.username}
                  onChange={handleInputChange}
                  disabled={!isEditing}
                  className={errors.username ? 'error' : ''}
                />
                {errors.username && <span className="error-text">{errors.username}</span>}
              </div>

              <div className="form-group">
                <label>User Type</label>
                <input
                  type="text"
                  value={user.userType ? (user.userType.charAt(0).toUpperCase() + user.userType.slice(1)) : 'Student'}
                  disabled
                />
              </div>

              <div className="form-group">
                <label>Account Created</label>
                <input
                  type="text"
                  value={new Date(user.createdAt).toLocaleDateString()}
                  disabled
                />
              </div>

              {user.lastLogin && (
                <div className="form-group">
                  <label>Last Login</label>
                  <input
                    type="text"
                    value={new Date(user.lastLogin).toLocaleString()}
                    disabled
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Stats Card */}
        <div className="dashboard-card">
          <div className="card-header">
            <h3 className="card-title">Account Statistics</h3>
          </div>
          <div className="card-content">
            <div className="stats-grid">
              {stats.map((stat, index) => (
                <div key={index} className="stat-card-small">
                  <div className="stat-icon-small">
                    {stat.icon}
                  </div>
                  <div className="stat-content-small">
                    <div className="stat-value-small">{stat.value}</div>
                    <div className="stat-label-small">{stat.label}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Change Password Card */}
        <div className="dashboard-card">
          <div className="card-header">
            <h3 className="card-title">Security</h3>
            {!isEditing && (
              <button 
                className="btn-secondary"
                onClick={() => {
                  setIsEditing(true)
                  setEditMode('password')
                }}
              >
                Change Password
              </button>
            )}
          </div>
          <div className="card-content">
            {editMode === 'password' && isEditing ? (
              <div className="profile-form">
                <div className="form-group">
                  <label htmlFor="currentPassword">Current Password</label>
                  <input
                    type="password"
                    id="currentPassword"
                    name="currentPassword"
                    value={passwordData.currentPassword}
                    onChange={handlePasswordChange}
                    className={errors.currentPassword ? 'error' : ''}
                  />
                  {errors.currentPassword && <span className="error-text">{errors.currentPassword}</span>}
                </div>

                <div className="form-group">
                  <label htmlFor="newPassword">New Password</label>
                  <input
                    type="password"
                    id="newPassword"
                    name="newPassword"
                    value={passwordData.newPassword}
                    onChange={handlePasswordChange}
                    className={errors.newPassword ? 'error' : ''}
                  />
                  {errors.newPassword && <span className="error-text">{errors.newPassword}</span>}
                </div>

                <div className="form-group">
                  <label htmlFor="confirmPassword">Confirm New Password</label>
                  <input
                    type="password"
                    id="confirmPassword"
                    name="confirmPassword"
                    value={passwordData.confirmPassword}
                    onChange={handlePasswordChange}
                    className={errors.confirmPassword ? 'error' : ''}
                  />
                  {errors.confirmPassword && <span className="error-text">{errors.confirmPassword}</span>}
                </div>

                <div className="form-actions">
                  <button 
                    className="btn-secondary"
                    onClick={handleCancel}
                    disabled={isLoading}
                  >
                    Cancel
                  </button>
                  <button 
                    className="btn-primary"
                    onClick={handleChangePassword}
                    disabled={isLoading}
                  >
                    {isLoading ? 'Changing...' : 'Change Password'}
                  </button>
                </div>
              </div>
            ) : (
              <p className="info-text">
                Click "Change Password" to update your password.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
