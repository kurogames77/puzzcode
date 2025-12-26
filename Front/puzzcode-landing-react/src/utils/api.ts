import { 
  createAPIError, 
  isRetryableError, 
  getRetryDelay, 
  classifyError,
  logError,
  ErrorType 
} from './errorHandler';

// Detect API base URL - use current host if on local network, otherwise use env or localhost
function getApiBaseUrl(): string {
  // If environment variable is set, use it
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  // If running in browser, detect if we're on a local network IP
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const port = window.location.port;
    
    // Check if hostname is a local IP (192.168.x.x, 10.x.x.x, 172.16-31.x.x, or localhost)
    const isLocalNetwork = hostname === 'localhost' || 
                          hostname === '127.0.0.1' ||
                          /^192\.168\./.test(hostname) ||
                          /^10\./.test(hostname) ||
                          /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname);
    
    if (isLocalNetwork) {
      // Use the same hostname but with backend port (3001)
      // Extract port from current URL or use default 3001
      const backendPort = '3001';
      return `http://${hostname}:${backendPort}/api`;
    }
  }

  // Default fallback
  return 'http://localhost:3001/api';
}

const API_BASE_URL = getApiBaseUrl();

// Configuration
const MAX_RETRIES = 3;
const RETRY_DELAY_BASE = 1000; // 1 second

// Helper function to get auth token from localStorage
function getAuthToken(): string | null {
  return localStorage.getItem('auth_token');
}

/**
 * Enhanced fetchAPI with authentication, retry logic, and better error handling
 */
async function fetchAPI(
  endpoint: string, 
  options: RequestInit = {},
  retryCount: number = 0
): Promise<any> {
  const token = getAuthToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  // Add auth token if available
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Add request ID for tracking
  const requestId = `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  headers['X-Request-ID'] = requestId;

  // Log request details for debugging (only in development)
  if (process.env.NODE_ENV === 'development' && endpoint.includes('/puzzle/attempt')) {
    console.log('🌐 API Request:', {
      endpoint: `${API_BASE_URL}${endpoint}`,
      method: options.method || 'GET',
      body: options.body ? JSON.parse(options.body as string) : null,
      hasToken: !!token,
      requestId,
      retryCount
    });
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ 
        error: `HTTP error! status: ${response.status}`,
        type: 'SERVER_ERROR'
      }));
      
      // Create API error
      const apiError = createAPIError(
        { 
          message: errorData.error || `HTTP error! status: ${response.status}`,
          status: response.status,
          response: errorData
        },
        errorData
      );

      // Check if error is retryable and we haven't exceeded max retries
      const errorType = classifyError(apiError);
      if (isRetryableError(apiError, errorType) && retryCount < MAX_RETRIES) {
        const delay = getRetryDelay(retryCount, RETRY_DELAY_BASE);
        
        // Log retry attempt
        if (process.env.NODE_ENV === 'development') {
          console.warn(`⚠️ Retrying request (attempt ${retryCount + 1}/${MAX_RETRIES}) after ${delay}ms:`, endpoint);
        }

        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // Retry the request
        return fetchAPI(endpoint, options, retryCount + 1);
      }

      // Log error for debugging
      logError(apiError, `API Request to ${endpoint}`);
      
      throw apiError;
    }

    return response.json();
  } catch (error: any) {
    // Handle abort (timeout)
    if (error.name === 'AbortError') {
      const timeoutError = createAPIError(
        { message: 'Request timed out', status: 504 },
        { type: ErrorType.TIMEOUT }
      );
      
      // Retry timeout errors
      if (retryCount < MAX_RETRIES) {
        const delay = getRetryDelay(retryCount, RETRY_DELAY_BASE);
        await new Promise(resolve => setTimeout(resolve, delay));
        return fetchAPI(endpoint, options, retryCount + 1);
      }
      
      logError(timeoutError, `API Request to ${endpoint}`);
      throw timeoutError;
    }

    // Handle network errors
    if (error instanceof TypeError && error.message?.includes('fetch')) {
      const networkError = createAPIError(
        { message: 'Network error', status: 0 },
        { type: ErrorType.NETWORK }
      );
      
      // Retry network errors
      if (retryCount < MAX_RETRIES) {
        const delay = getRetryDelay(retryCount, RETRY_DELAY_BASE);
        await new Promise(resolve => setTimeout(resolve, delay));
        return fetchAPI(endpoint, options, retryCount + 1);
      }
      
      logError(networkError, `API Request to ${endpoint}`);
      throw networkError;
    }

    // Re-throw if it's already an APIError
    if (error.name === 'APIError') {
      throw error;
    }

    // Wrap unknown errors
    const wrappedError = createAPIError(error, error.response);
    logError(wrappedError, `API Request to ${endpoint}`);
    throw wrappedError;
  }
}

export const api = {
  // Authentication
  register: (data: {
    username: string;
    email: string;
    password: string;
    confirmPassword: string;
    userType: 'student' | 'admin';
    schoolId?: string;
    firstName?: string;
    lastName?: string;
  }) => fetchAPI('/auth/register', { method: 'POST', body: JSON.stringify(data) }),

  login: (identifier: string, password: string) =>
    fetchAPI('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    }),

  getCurrentUser: () => fetchAPI('/auth/me'),

  getUserStatistics: () => fetchAPI('/auth/statistics'),
  getPerformanceSummary: () => fetchAPI('/auth/statistics/performance'),

  getAdminStatistics: () => fetchAPI('/auth/admin/statistics'),

  updateProfile: (data: {
    username?: string;
    email?: string;
    schoolId?: string;
    firstName?: string;
    lastName?: string;
    avatarUrl?: string;
  }) => fetchAPI('/auth/profile', { method: 'PUT', body: JSON.stringify(data) }),

  changePassword: (data: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }) => fetchAPI('/auth/change-password', { method: 'PUT', body: JSON.stringify(data) }),

  logout: () => fetchAPI('/auth/logout', { method: 'POST' }),
  logoutSessionPing: () => {
    if (typeof window === 'undefined') {
      return Promise.resolve();
    }

    const token = getAuthToken();
    if (!token) {
      return Promise.resolve();
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 4000);

    return fetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      keepalive: true,
      signal: controller.signal,
    })
      .catch(() => undefined)
      .finally(() => window.clearTimeout(timeoutId));
  },
  sessionHeartbeat: () => fetchAPI('/auth/session/heartbeat', { method: 'POST' }),

  // Courses
  getCourses: () => fetchAPI('/courses'),
  getCourse: (id: string) => fetchAPI(`/courses/${id}`),
  createCourse: (data: any) => fetchAPI('/courses', { method: 'POST', body: JSON.stringify(data) }),
  updateCourse: (id: string, data: any) => fetchAPI(`/courses/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCourse: (id: string) => fetchAPI(`/courses/${id}`, { method: 'DELETE' }),
  resetStudentCounts: () => fetchAPI('/courses/reset-student-counts', { method: 'POST' }),

  // Lessons
  getLessons: (courseId: string) => fetchAPI(`/lessons/course/${courseId}`),
  getLesson: (id: string) => fetchAPI(`/lessons/${id}`),
  getLessonProgress: (lessonId: string) => fetchAPI(`/lessons/${lessonId}/progress`),
  createLesson: (data: any) => fetchAPI('/lessons', { method: 'POST', body: JSON.stringify(data) }),
  updateLesson: (id: string, data: any) => fetchAPI(`/lessons/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteLesson: (id: string) => fetchAPI(`/lessons/${id}`, { method: 'DELETE' }),

  // Levels
  getLevel: (id: string) => fetchAPI(`/levels/${id}`),
  createLevel: (data: any) => fetchAPI('/levels', { method: 'POST', body: JSON.stringify(data) }),
  updateLevel: (id: string, data: any) => fetchAPI(`/levels/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  // Puzzle Attempts
  submitPuzzleAttempt: (data: {
    levelId: string;
    lessonId?: string;
    success: boolean;
    attemptTime?: number;
    codeSubmitted?: string;
    expectedOutput?: string;
    actualOutput?: string;
  }) => fetchAPI('/puzzle/attempt', { method: 'POST', body: JSON.stringify(data) }),

  getPuzzleProgress: (levelId: string) => fetchAPI(`/puzzle/progress/${levelId}`),

  getPreferredDifficulty: (lessonId: string) => fetchAPI(`/puzzle/preferred-difficulty/${lessonId}`),
  purchaseHint: (data?: { level?: number; cost?: number }) =>
    fetchAPI('/puzzle/hint', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }),

  // Achievements
  getAchievements: () => fetchAPI('/achievements'),

  // Leaderboard
  getLeaderboard: (type?: 'overall' | 'multiplayer' | 'achievements' | 'streaks', limit?: number) => {
    const params = new URLSearchParams();
    if (type) params.append('type', type);
    if (limit) params.append('limit', limit.toString());
    return fetchAPI(`/leaderboard${params.toString() ? '?' + params.toString() : ''}`);
  },
  getUserLeaderboardPosition: (userId: string, type?: string) => 
    fetchAPI(`/leaderboard/user/${userId}${type ? '?type=' + type : ''}`),

  // Battle
  createBattle: (data?: { matchType?: string; timeLimit?: number; language?: string }) => 
    fetchAPI('/battle/create', { method: 'POST', body: JSON.stringify(data || {}) }),
  getBattle: (matchId: string, language?: string, problemId?: string) => {
    const params = new URLSearchParams();
    if (language) params.append('language', language);
    if (problemId) params.append('problemId', problemId);
    return fetchAPI(`/battle/${matchId}${params.toString() ? '?' + params.toString() : ''}`);
  },
  submitBattleSolution: (matchId: string, code: string, language?: string) => 
    fetchAPI(`/battle/${matchId}/submit`, { 
      method: 'POST', 
      body: JSON.stringify({ code, language: language || 'python' }) 
    }),
  exitBattle: (matchId: string) => 
    fetchAPI(`/battle/${matchId}/exit`, { method: 'POST' }),
  markBattleReady: (matchId: string) => 
    fetchAPI(`/battle/${matchId}/ready`, { method: 'POST' }),
  
  // Matchmaking (using algorithms)
  joinMatchmakingQueue: (data?: { matchType?: string; language?: string; matchSize?: number }) =>
    fetchAPI('/battle/matchmaking/queue', { 
      method: 'POST', 
      body: JSON.stringify(data || {}) 
    }),
  getMatchmakingStatus: (matchId: string) =>
    fetchAPI(`/battle/matchmaking/status/${matchId}`),
  getAvailableOpponents: () => fetchAPI('/battle/available-opponents'),

  // Direct 1v1 Challenges
  sendChallenge: (opponentId: string, language?: string, expWager?: number) =>
    fetchAPI('/battle/challenge', {
      method: 'POST',
      body: JSON.stringify({ opponentId, language, expWager }),
    }),
  getIncomingChallenges: () => fetchAPI('/battle/challenges/incoming'),
  respondToChallenge: (challengeId: string, action: 'accept' | 'decline') =>
    fetchAPI(`/battle/challenges/${challengeId}/respond`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    }),
  getOutgoingChallenges: () => fetchAPI('/battle/challenges/outgoing'),
  getRecentChallengeMatches: () => fetchAPI('/battle/challenges/recent'),
  getRecentRankedMatches: () => fetchAPI('/battle/recent-ranked'),

  // Network
  getLocalIP: () => fetchAPI('/network/local-ip'),

  // File Upload
  uploadIcon: async (file: File) => {
    const formData = new FormData();
    formData.append('icon', file);
    
    const token = getAuthToken();
    const headers: HeadersInit = {};
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}/upload/icon`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Network error' }));
      throw new Error(error.error || error.message || `HTTP error! status: ${response.status}`);
    }

    return response.json();
  },
};

