import React, { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../utils/api'

export default function AdminProfile() {
  const { user, updateUserProfile } = useAuth()
  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState({
    email: user?.email || '',
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    schoolId: user?.schoolId || ''
  })
  const [profileImage, setProfileImage] = useState<string | null>(user?.avatarUrl || null)
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [showCoursesModal, setShowCoursesModal] = useState(false)
  const [adminStats, setAdminStats] = useState([
    { label: 'Total Language Handled', value: '0', icon: '🌐' },
    { label: 'Total Lessons', value: '0', icon: '📝' },
    { label: 'Active Levels', value: '0', icon: '📚' },
    { label: 'Total Students Enrolled', value: '0', icon: '👥', breakdown: [] }
  ])
  const [loading, setLoading] = useState(true)

  // Load admin statistics from API
  useEffect(() => {
    const loadStatistics = async () => {
      try {
        setLoading(true)
        const result = await api.getAdminStatistics()
        if (result.success && result.statistics) {
          const stats = result.statistics
          const enrollmentData = stats.enrollmentData || []
          
          setAdminStats([
            { label: 'Total Language Handled', value: String(stats.totalCoursesHandled || 0), icon: '🌐' },
            { label: 'Total Lessons', value: String(stats.totalLessons || 0), icon: '📝' },
            { label: 'Active Levels', value: String(stats.activeLevels || 0), icon: '📚' },
            { 
              label: 'Total Students Enrolled', 
              value: String(stats.totalStudentsEnrolled || 0), 
              icon: '👥', 
              breakdown: enrollmentData 
            }
          ])
        }
      } catch (error) {
        console.error('Error loading admin statistics:', error)
      } finally {
        setLoading(false)
      }
    }
    loadStatistics()
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (event) => {
        setProfileImage(event.target?.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setMessage(null)

    try {
      await updateUserProfile({
        ...formData,
        avatarUrl: profileImage
      })
      setMessage({ type: 'success', text: 'Profile updated successfully!' })
      setIsEditing(false)
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to update profile. Please try again.' })
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancel = () => {
    setFormData({
      email: user?.email || '',
      firstName: user?.firstName || '',
      lastName: user?.lastName || '',
      schoolId: user?.schoolId || ''
    })
    setProfileImage(user?.avatarUrl || null)
    setIsEditing(false)
    setMessage(null)
  }

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

  return (
    <div className="admin-profile">
      <div className="page-header">
        <div>
          <h1 className="page-title">Admin Profile</h1>
          <p className="page-subtitle">Manage your administrator account</p>
        </div>
        {!isEditing && (
          <button className="btn-edit-profile" onClick={() => setIsEditing(true)}>
            Edit Profile
          </button>
        )}
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-card">
          <div className="card-header">
            <h3 className="card-title">Profile Information</h3>
          </div>
          <div className="card-content">
          <div className="profile-avatar-large">
            {profileImage ? (
              <img src={profileImage} alt="Avatar" className="avatar-image" />
            ) : (
              <div className="avatar-circle">
                {user?.firstName?.charAt(0) || user?.username?.charAt(0) || 'A'}
              </div>
            )}
            <div className="avatar-info">
              <h3>{user?.firstName} {user?.lastName}</h3>
              <p>Administrator</p>
            </div>
          </div>

          {message && (
            <div className={`${message.type === 'success' ? 'success-message' : 'error-message'}`}>
              {message.text}
            </div>
          )}

          <form className="profile-form" onSubmit={handleSubmit}>
            {isEditing && (
              <div className="form-group">
                <label htmlFor="avatar">Profile Picture</label>
                <input
                  type="file"
                  id="avatar"
                  name="avatar"
                  accept="image/*"
                  onChange={handleImageChange}
                />
              </div>
            )}

            {/* Username removed per requirements */}

            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                disabled={!isEditing}
                className="form-input"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="firstName">First Name</label>
              <input
                type="text"
                id="firstName"
                name="firstName"
                value={formData.firstName}
                onChange={handleInputChange}
                disabled={!isEditing}
                className="form-input"
                required
              />
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
                className="form-input"
                required
              />
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
                className="form-input"
                required
              />
            </div>

            {isEditing && (
              <div className="form-actions">
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={isLoading}
                >
                  {isLoading ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleCancel}
                  disabled={isLoading}
                >
                  Cancel
                </button>
              </div>
            )}
          </form>
          </div>
        </div>

        <div className="dashboard-card">
          <div className="card-header">
            <h3 className="card-title">Account Statistics</h3>
          </div>
          <div className="card-content">
            <div className="stats-grid">
              {adminStats.map((stat, index) => (
                <div key={index} className="stat-card-small">
                  <div className="stat-icon-small">{stat.icon}</div>
                  <div className="stat-content-small">
                    <div className="d-flex align-items-center justify-content-between" style={{ gap: 12 }}>
                      <div>
                        <div className="stat-value-small">{stat.value}</div>
                        <div className="stat-label-small">{stat.label}</div>
                      </div>
                      {Array.isArray((stat as any).breakdown) && (
                        <button
                          className="btn btn-outline-light btn-sm"
                          onClick={() => setShowCoursesModal(true)}
                          title="View per-course enrollment"
                        >
                          Courses
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {showCoursesModal && (
          <div className="modal-overlay" style={{ zIndex: 1100 }}>
            <div className="modal-content" style={{ maxWidth: 520 }}>
              <h3>Enrolled Students by Course</h3>
              <div className="divider" style={{ margin: '12px 0 16px', height: 1, background: 'rgba(255,255,255,0.08)' }} />
              <div>
                {(() => {
                  const breakdown = adminStats.find(s => s.label === 'Total Students Enrolled')?.breakdown
                  if (!breakdown || !Array.isArray(breakdown)) {
                    return <p style={{ color: '#8f8aa2', padding: '8px 0' }}>No enrollment data available</p>
                  }
                  
                  return breakdown.map((course: { name: string; students: number }, index: number) => {
                    const iconPath = getLanguageIcon(course.name)
                    return (
                      <div key={index} className="d-flex justify-content-between align-items-center" style={{ padding: '12px 0', borderBottom: index < breakdown.length - 1 ? '1px solid rgba(255,255,255,0.08)' : 'none' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          {iconPath && (
                            <img 
                              src={iconPath} 
                              alt={course.name} 
                              style={{ 
                                width: 32, 
                                height: 32, 
                                objectFit: 'contain',
                                borderRadius: 4
                              }} 
                            />
                          )}
                          <span style={{ fontSize: 14, fontWeight: 500 }}>{course.name}</span>
                        </div>
                        <strong style={{ fontSize: 14, color: '#eae6ff' }}>
                          {course.students} {course.students === 1 ? 'student' : 'students'}
                        </strong>
                      </div>
                    )
                  })
                })()}
              </div>
              <div className="modal-actions" style={{ marginTop: 16 }}>
                <button className="btn-primary" onClick={() => setShowCoursesModal(false)}>Close</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
