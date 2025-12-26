import React, { createContext, useContext, useState, useEffect, useRef } from 'react'
import { User, SignupData } from '../utils/userManager'
import { api } from '../utils/api'

interface AuthContextType {
  user: User | null
  login: (username: string, password: string) => Promise<{ success: boolean; error: string }>
  signup: (signupData: SignupData) => Promise<{ success: boolean; errors: Record<string, string> }>
  logout: () => void
  isLoading: boolean
  refreshUser: () => void
  updateUserProfile: (profileData: { username?: string; email?: string; schoolId?: string; avatarUrl?: string; firstName?: string; lastName?: string }) => Promise<{ success: boolean; errors?: Record<string, string> }>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const sessionPingSentRef = useRef(false)

  // Check for existing session on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = localStorage.getItem('auth_token')
        const savedUser = localStorage.getItem('puzzcode_user')
        
        if (token && savedUser) {
          // Verify token is still valid by fetching current user
          try {
            const response = await api.getCurrentUser()
            if (response.success && response.user) {
              setUser(response.user)
              await api.sessionHeartbeat()
            } else {
              // Token invalid, clear storage
              localStorage.removeItem('auth_token')
              localStorage.removeItem('puzzcode_user')
            }
          } catch (error) {
            // Token invalid or expired, clear storage
            localStorage.removeItem('auth_token')
            localStorage.removeItem('puzzcode_user')
          }
        }
      } catch (error) {
        console.error('Error checking auth:', error)
      } finally {
        setIsLoading(false)
      }
    }
    
    checkAuth()
  }, [])

  // Periodic session heartbeat to keep user marked as online (every 2 minutes)
  useEffect(() => {
    if (!user) return

    const heartbeatInterval = setInterval(async () => {
      try {
        await api.sessionHeartbeat()
      } catch (error) {
        console.error('Session heartbeat failed:', error)
      }
    }, 120000) // 2 minutes

    return () => clearInterval(heartbeatInterval)
  }, [user])

  const login = async (username: string, password: string): Promise<{ success: boolean; error: string }> => {
    setIsLoading(true)
    
    try {
      const response = await api.login(username, password)
      
      if (response.success && response.user && response.token) {
        // Store token and user
        localStorage.setItem('auth_token', response.token)
        localStorage.setItem('puzzcode_user', JSON.stringify(response.user))
        setUser(response.user)
        await api.sessionHeartbeat()
        return { success: true, error: '' }
      } else {
        return { success: false, error: response.error || 'Login failed' }
      }
    } catch (error: any) {
      console.error('Login error:', error)
      return { success: false, error: error.message || 'Failed to login. Please try again.' }
    } finally {
      setIsLoading(false)
    }
  }

  const signup = async (signupData: SignupData): Promise<{ success: boolean; errors: Record<string, string> }> => {
    setIsLoading(true)
    
    try {
      const response = await api.register({
        username: signupData.username,
        email: signupData.email,
        password: signupData.password,
        confirmPassword: signupData.confirmPassword,
        userType: signupData.userType,
        schoolId: signupData.schoolId,
        firstName: signupData.firstName,
        lastName: signupData.lastName,
      })
      
      if (response.success && response.user && response.token) {
        // Store token and user
        localStorage.setItem('auth_token', response.token)
        localStorage.setItem('puzzcode_user', JSON.stringify(response.user))
        setUser(response.user)
        await api.sessionHeartbeat()
        return { success: true, errors: {} }
      } else {
        return { success: false, errors: response.errors || { general: 'Registration failed' } }
      }
    } catch (error: any) {
      console.error('Signup error:', error)
      // Check if error has response object with errors
      if (error.response && error.response.errors) {
        return { success: false, errors: error.response.errors }
      }
      // Try to parse error message as JSON
      try {
        const errorData = JSON.parse(error.message)
        if (errorData.errors) {
          return { success: false, errors: errorData.errors }
        }
      } catch {
        // Not a JSON error
      }
      return { success: false, errors: { general: error.message || 'Failed to register. Please try again.' } }
    } finally {
      setIsLoading(false)
    }
  }

  const logout = async () => {
    try {
      // Call logout API (optional - mainly for token blacklist if implemented)
      await api.logout()
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      // Always clear local storage
      setUser(null)
      localStorage.removeItem('puzzcode_user')
      localStorage.removeItem('auth_token')
    }
  }

  const refreshUser = async () => {
    try {
      const response = await api.getCurrentUser()
      if (response.success && response.user) {
        setUser(response.user)
        localStorage.setItem('puzzcode_user', JSON.stringify(response.user))
      }
    } catch (error) {
      console.error('Error refreshing user:', error)
      // Fallback to localStorage if API fails
      try {
        const savedUser = localStorage.getItem('puzzcode_user')
        if (savedUser) {
          setUser(JSON.parse(savedUser))
        }
      } catch {
        // ignore
      }
    }
  }

  const updateUserProfileWrapper = async (profileData: { username?: string; email?: string; schoolId?: string; avatarUrl?: string; firstName?: string; lastName?: string }) => {
    if (!user) {
      return { success: false, errors: { general: 'No user logged in' } }
    }

    try {
      const response = await api.updateProfile(profileData)
      
      if (response.success && response.user) {
        // Update the current user state
        setUser(response.user)
        localStorage.setItem('puzzcode_user', JSON.stringify(response.user))
        return { success: true }
      } else {
        return { success: false, errors: response.errors || { general: 'Failed to update profile' } }
      }
    } catch (error: any) {
      console.error('Update profile error:', error)
      try {
        const errorData = JSON.parse(error.message)
        if (errorData.errors) {
          return { success: false, errors: errorData.errors }
        }
      } catch {
        // Not a JSON error
      }
      return { success: false, errors: { general: error.message || 'Failed to update profile' } }
    }
  }

  useEffect(() => {
    if (!user) {
      sessionPingSentRef.current = false
      return
    }

    const sendSessionPing = () => {
      if (sessionPingSentRef.current) {
        return
      }
      sessionPingSentRef.current = true
      api.logoutSessionPing().finally(() => {
        // allow future pings after a short delay
        setTimeout(() => {
          sessionPingSentRef.current = false
        }, 5000)
      })
    }

    window.addEventListener('beforeunload', sendSessionPing)
    window.addEventListener('pagehide', sendSessionPing)

    return () => {
      window.removeEventListener('beforeunload', sendSessionPing)
      window.removeEventListener('pagehide', sendSessionPing)
      sessionPingSentRef.current = false
    }
  }, [user])

  const value = {
    user,
    login,
    signup,
    logout,
    isLoading,
    refreshUser,
    updateUserProfile: updateUserProfileWrapper
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
