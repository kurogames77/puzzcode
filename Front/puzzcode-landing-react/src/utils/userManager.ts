export interface User {
  id: string
  username: string
  email: string
  userType: 'student' | 'admin'
  schoolId: string
  password: string
  createdAt: string
  lastLogin?: string
  avatarUrl?: string
  firstName?: string
  lastName?: string
}

export interface SignupData {
  username: string
  email: string
  password: string
  confirmPassword: string
  schoolId: string
  userType: 'student' | 'admin'
  firstName: string
  lastName: string
}

// Generate unique ID
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

// Get all users from localStorage
export function getAllUsers(): User[] {
  const users = localStorage.getItem('puzzcode_users')
  return users ? JSON.parse(users) : []
}

// Save users to localStorage
function saveUsers(users: User[]): void {
  localStorage.setItem('puzzcode_users', JSON.stringify(users))
}

// Get user by username, email, or schoolId
export function getUserByIdentifier(identifier: string): User | null {
  const users = getAllUsers()
  return users.find(user => 
    user.username === identifier || 
    user.email === identifier || 
    user.schoolId === identifier
  ) || null
}

// Validate email format
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

// Validate password strength
export function validatePassword(password: string): { isValid: boolean; errors: string[] } {
  const errors: string[] = []
  
  if (password.length < 6) {
    errors.push('Password must be at least 6 characters long')
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter')
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter')
  }
  
  if (!/\d/.test(password)) {
    errors.push('Password must contain at least one number')
  }
  
  return {
    isValid: errors.length === 0,
    errors
  }
}

// Validate username
export function validateUsername(username: string): { isValid: boolean; error: string } {
  if (username.length < 3) {
    return { isValid: false, error: 'Username must be at least 3 characters long' }
  }
  
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return { isValid: false, error: 'Username can only contain letters, numbers, underscores, and hyphens' }
  }
  
  const existingUser = getUserByIdentifier(username)
  if (existingUser) {
    return { isValid: false, error: 'Username already exists' }
  }
  
  return { isValid: true, error: '' }
}

// Validate school id
export function validateSchoolId(schoolId: string): { isValid: boolean; error: string } {
  if (schoolId.length < 3) {
    return { isValid: false, error: 'School ID must be at least 3 characters long' }
  }
  
  if (!/^[a-zA-Z0-9_-]+$/.test(schoolId)) {
    return { isValid: false, error: 'School ID can only contain letters, numbers, underscores, and hyphens' }
  }
  
  const existingUser = getUserByIdentifier(schoolId)
  if (existingUser) {
    return { isValid: false, error: 'School ID already exists' }
  }
  
  return { isValid: true, error: '' }
}

// Create new user
export function createUser(signupData: SignupData): { success: boolean; user?: User; errors: Record<string, string> } {
  const errors: Record<string, string> = {}
  
  // Validate username
  const usernameValidation = validateUsername(signupData.username)
  if (!usernameValidation.isValid) {
    errors.username = usernameValidation.error
  }
  
  // Validate email
  if (!isValidEmail(signupData.email)) {
    errors.email = 'Please enter a valid email address'
  } else {
    const existingUser = getUserByIdentifier(signupData.email)
    if (existingUser) {
      errors.email = 'Email already exists'
    }
  }
  
  // Validate password
  const passwordValidation = validatePassword(signupData.password)
  if (!passwordValidation.isValid) {
    errors.password = passwordValidation.errors.join(', ')
  }
  
  // Validate confirm password
  if (signupData.password !== signupData.confirmPassword) {
    errors.confirmPassword = 'Passwords do not match'
  }
  
  // Validate school ID
  const schoolIdValidation = validateSchoolId(signupData.schoolId)
  if (!schoolIdValidation.isValid) {
    errors.schoolId = schoolIdValidation.error
  }
  
  // If there are errors, return them
  if (Object.keys(errors).length > 0) {
    return { success: false, errors }
  }
  
  // Create new user
  const newUser: User = {
    id: generateId(),
    username: signupData.username,
    email: signupData.email,
    password: signupData.password, // In real app, this should be hashed
    userType: signupData.userType,
    schoolId: signupData.schoolId,
    createdAt: new Date().toISOString()
  }
  
  // Save user to localStorage
  const users = getAllUsers()
  users.push(newUser)
  saveUsers(users)
  
  return { success: true, user: newUser, errors: {} }
}

// Authenticate user
export function authenticateUser(identifier: string, password: string): { success: boolean; user?: User; error: string } {
  const user = getUserByIdentifier(identifier)
  
  if (!user) {
    return { success: false, error: 'User not found' }
  }
  
  if (user.password !== password) {
    return { success: false, error: 'Invalid password' }
  }
  
  // Update last login
  user.lastLogin = new Date().toISOString()
  const users = getAllUsers()
  const userIndex = users.findIndex(u => u.id === user.id)
  if (userIndex !== -1) {
    users[userIndex] = user
    saveUsers(users)
  }
  
  return { success: true, user, error: '' }
}

// Update user profile
export function updateUserProfile(
  profileData: { username?: string; email?: string; schoolId?: string; avatarUrl?: string; firstName?: string; lastName?: string }, 
  userId: string, 
  passwordData?: { currentPassword: string; newPassword: string; confirmPassword: string }
): { success: boolean; errors?: Record<string, string> } {
  const users = getAllUsers()
  const userIndex = users.findIndex(u => u.id === userId)
  
  if (userIndex === -1) {
    return { success: false, errors: { general: 'User not found' } }
  }

  const errors: Record<string, string> = {}
  const user = users[userIndex]

  // Handle password change
  if (passwordData) {
    if (user.password !== passwordData.currentPassword) {
      errors.currentPassword = 'Current password is incorrect'
      return { success: false, errors }
    }
    
    // Validate new password
    const passwordValidation = validatePassword(passwordData.newPassword)
    if (!passwordValidation.isValid) {
      errors.newPassword = passwordValidation.errors.join(', ')
      return { success: false, errors }
    }
    
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match'
      return { success: false, errors }
    }
    
    user.password = passwordData.newPassword
  }

  // Handle profile update
  if (profileData.username) {
    // Check if username is different
    if (profileData.username !== user.username) {
      const existingUser = getUserByIdentifier(profileData.username)
      if (existingUser && existingUser.id !== userId) {
        errors.username = 'Username already exists'
        return { success: false, errors }
      }
      
      if (profileData.username.length < 3) {
        errors.username = 'Username must be at least 3 characters'
        return { success: false, errors }
      }
    }
    user.username = profileData.username
  }

  if (profileData.email) {
    // Check if email is valid and different
    if (profileData.email !== user.email) {
      if (!isValidEmail(profileData.email)) {
        errors.email = 'Please enter a valid email'
        return { success: false, errors }
      }
      
      const existingUser = getUserByIdentifier(profileData.email)
      if (existingUser && existingUser.id !== userId) {
        errors.email = 'Email already exists'
        return { success: false, errors }
      }
    }
    user.email = profileData.email
  }

  if (profileData.schoolId) {
    // Check if school ID is different
    if (profileData.schoolId !== user.schoolId) {
      const existingUser = getUserByIdentifier(profileData.schoolId)
      if (existingUser && existingUser.id !== userId) {
        errors.schoolId = 'School ID already exists'
        return { success: false, errors }
      }
      
      if (profileData.schoolId.length < 3) {
        errors.schoolId = 'School ID must be at least 3 characters'
        return { success: false, errors }
      }
    }
    user.schoolId = profileData.schoolId
  }

  // Update avatar if provided
  if (typeof profileData.avatarUrl === 'string') {
    user.avatarUrl = profileData.avatarUrl
  }

  // Update firstName if provided
  if (profileData.firstName !== undefined) {
    user.firstName = profileData.firstName
  }

  // Update lastName if provided
  if (profileData.lastName !== undefined) {
    user.lastName = profileData.lastName
  }

  // Save updated user
  users[userIndex] = user
  saveUsers(users)

  // Update stored user session
  const savedUser = localStorage.getItem('puzzcode_user')
  if (savedUser) {
    const currentUser = JSON.parse(savedUser)
    if (currentUser.id === userId) {
      // Update the session user with new data
      const updatedUser = { ...currentUser, ...user }
      localStorage.setItem('puzzcode_user', JSON.stringify(updatedUser))
    }
  }

  return { success: true }
}

// Initialize with default users if none exist
export function initializeDefaultUsers(): void {
  const users = getAllUsers()
  if (users.length === 0) {
    const defaultUsers: User[] = [
      {
        id: generateId(),
        username: 'john_doe',
        email: 'john@school.edu',
        password: 'password123',
        userType: 'student',
        schoolId: 'STU001',
        createdAt: new Date().toISOString()
      },
      {
        id: generateId(),
        username: 'admin_user',
        email: 'admin@school.edu',
        password: 'admin123',
        userType: 'admin',
        schoolId: 'ADM001',
        createdAt: new Date().toISOString()
      },
      {
        id: generateId(),
        username: 'sarah_smith',
        email: 'sarah@school.edu',
        password: 'password123',
        userType: 'student',
        schoolId: 'STU002',
        createdAt: new Date().toISOString()
      }
    ]
    saveUsers(defaultUsers)
  }
}
