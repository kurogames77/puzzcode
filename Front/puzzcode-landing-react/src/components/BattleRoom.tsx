// @ts-nocheck
import React, { useEffect, useState, useRef, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../utils/api'
import ConfirmModal from './ConfirmModal'
import JigsawCodePuzzle from './JigsawCodePuzzle'
import { User } from '../utils/userManager'
import { getTempBattleAccess, TEMP_BATTLE_ACCESS_QUERY } from '../utils/battleAccess'
import { getWebSocketClient, initWebSocket, getLocalIP } from '../utils/websocket'
import { classifyError, getUserFriendlyMessage } from '../utils/errorHandler'

// Helper function to convert code string to lines array
const toLines = (code: string): string[] => {
  if (!code) return []
  const normalized = code.replace(/\r/g, '').replace(/^\n+|\n+$/g, '')
  if (!normalized) return []
  const rawLines = normalized.split('\n')
  const indents = rawLines
    .filter(line => line.trim().length > 0)
    .map(line => (line.match(/^(\s*)/)?.[1].length ?? 0))
  const minIndent = indents.length ? Math.min(...indents) : 0
  return rawLines
    .map(line => line.slice(Math.min(minIndent, line.length)))
    .map(line => line.trimEnd())
    .filter(line => line.trim().length > 0)
}

// Language noise pools for random extras (simplified version)
const languageNoise: Record<string, string[]> = {
  python: [
    "x = 10  # integer",
    "y = x * 2  # integer",
    "flag = False  # boolean",
    "items = [1, 2, 3]  # list",
    "print('hello')  # output",
    "result = sum(items)  # calculation"
  ],
  javascript: [
    "let x = 10;  // number",
    "const y = x * 2;  // number",
    "let flag = false;  // boolean",
    "const items = [1, 2, 3];  // array",
    "console.log('hello');  // output"
  ],
  csharp: [
    "int x = 10;  // integer",
    "int y = x * 2;  // integer",
    "bool flag = false;  // boolean",
    "int[] items = {1, 2, 3};  // array",
    "Console.WriteLine(\"hello\");  // output"
  ],
  cpp: [
    "int x = 10;  // integer",
    "int y = x * 2;  // integer",
    "bool flag = false;  // boolean",
    "int items[] = {1, 2, 3};  // array",
    "cout << \"hello\";  // output"
  ],
  php: [
    "$x = 10;  // integer",
    "$y = $x * 2;  // integer",
    "$flag = false;  // boolean",
    "$items = [1, 2, 3];  // array",
    "echo 'hello';  // output"
  ],
  mysql: [
    "SELECT * FROM table;  -- query",
    "WHERE id = 1;  -- condition",
    "ORDER BY name;  -- sorting"
  ],
  default: [
    "x = 10",
    "y = x * 2",
    "flag = false",
    "items = [1, 2, 3]"
  ]
}

const demoProblemSnippets: Record<string, { title: string; description: string; initialCode: string; expectedOutput?: string }> = {
  python: {
    title: 'Demo Battle: Python Two Sum',
    description: 'Arrange the blocks to rebuild the classic Two Sum helper. Combine loops, hash lookups, and returns to finish before the rival bot.',
    initialCode: `
def two_sum(nums, target):
    seen = {}
    for index, value in enumerate(nums):
        complement = target - value
        if complement in seen:
            return [seen[complement], index]
        seen[value] = index
    return []

numbers = [2, 7, 11, 15]
print(two_sum(numbers, 9))
    `.trim(),
    expectedOutput: '[0, 1]'
  },
  javascript: {
    title: 'Demo Battle: JavaScript',
    description: 'No puzzle syntax available yet for JavaScript in the database. Please add lessons to this course first.',
    initialCode: '',
    expectedOutput: undefined
  },
  csharp: {
    title: 'Demo Battle: C#',
    description: 'No puzzle syntax available yet for C# in the database. Please add lessons to this course first.',
    initialCode: '',
    expectedOutput: undefined
  },
  cpp: {
    title: 'Demo Battle: C++',
    description: 'No puzzle syntax available yet for C++ in the database. Please add lessons to this course first.',
    initialCode: '',
    expectedOutput: undefined
  },
  php: {
    title: 'Demo Battle: PHP',
    description: 'No puzzle syntax available yet for PHP in the database. Please add lessons to this course first.',
    initialCode: '',
    expectedOutput: undefined
  },
  mysql: {
    title: 'Demo Battle: MySQL',
    description: 'No puzzle syntax available yet for MySQL in the database. Please add lessons to this course first.',
    initialCode: '',
    expectedOutput: undefined
  }
}

const buildDemoProblem = (language: string): Problem => {
  const normalized = (language || 'python').toLowerCase()
  const template = demoProblemSnippets[normalized] || demoProblemSnippets.python
  return {
    id: `demo-${normalized}`,
    title: template.title,
    description: template.description,
    difficulty: 'Easy',
    initialCode: template.initialCode,
    expectedOutput: template.expectedOutput
  }
}

const createDemoParticipants = (user: User | null): Participant[] => {
  const studentName =
    (user?.firstName || user?.lastName)
      ? `${user?.firstName || ''} ${user?.lastName || ''}`.trim()
      : user?.username || 'Demo Student'

  const studentParticipant: Participant = {
    userId: user?.id || 'demo-student',
    username: user?.username || 'demo_student',
    name: studentName || 'Demo Student',
    avatar: user?.avatarUrl,
    completedCode: false,
    isWinner: false
  }

  const rivalParticipant: Participant = {
    userId: 'demo-ai-rival',
    username: 'Temp Rival',
    name: 'Temp Rival',
    completedCode: false,
    isWinner: false
  }

  return [studentParticipant, rivalParticipant]
}

const DEMO_MATCH_ID = 'demo-battle-room'
const DEMO_TIME_LIMIT = 15 * 60

interface Problem {
  id: string
  title: string
  description: string
  difficulty: string
  examples?: Array<{ input: string; output: string; explanation?: string }>
  constraints?: string[]
  initialCode?: string
  expectedOutput?: string
  levelId?: string
  lessonId?: string
}

interface Participant {
  userId: string
  username: string
  name: string
  avatar?: string
  isWinner?: boolean
  completedCode?: boolean
  completionTime?: number
  expGained?: number
  expLost?: number
}

export default function BattleRoom() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const matchIdParam = searchParams.get('matchId')
  const languageParam = searchParams.get('language') || 'python'
  const tempAccessQueryActive = searchParams.get(TEMP_BATTLE_ACCESS_QUERY) === '1'
  const localTempAccess = useMemo(() => getTempBattleAccess(), [])
  const isTempBattle = tempAccessQueryActive || localTempAccess

  const [matchId, setMatchId] = useState<string | null>(matchIdParam)
  const [timeLeft, setTimeLeft] = useState(30 * 60) // 30 minutes in seconds
  const [status, setStatus] = useState<'waiting' | 'ongoing' | 'finished' | 'won' | 'lost'>('waiting')
  const [showExitConfirm, setShowExitConfirm] = useState(false)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [problemId, setProblemId] = useState<string | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [currentUser, setCurrentUser] = useState<Participant | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [showResultPopup, setShowResultPopup] = useState(false)
  const [code, setCode] = useState('')
  const [result, setResult] = useState<{ 
    success: boolean; 
    message: string;
    category?: 'syntax' | 'logic' | 'runtime' | 'network' | 'validation' | 'unknown';
  } | null>(null)
  const [showResultModal, setShowResultModal] = useState(false)
  const [resultData, setResultData] = useState<{ isWinner: boolean; expGained?: number; expLost?: number } | null>(null)
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const autoCloseRef = useRef<NodeJS.Timeout | null>(null)
  const wsClientRef = useRef<ReturnType<typeof getWebSocketClient> | null>(null)
  const wsConnectedRef = useRef(false)
  const [useWebSocket, setUseWebSocket] = useState(true)

  // Initialize battle
  useEffect(() => {
    const initializeBattle = async () => {
      try {
        setLoading(true)
        let battleMatchId = matchId

        if (isTempBattle) {
          // Try to fetch actual lesson problem from database first
          try {
            const createResult = await api.createBattle({ 
              matchType: 'ranked', 
              timeLimit: DEMO_TIME_LIMIT,
              language: languageParam,
              tempAccess: true
            })
            
            // Use the real problem from the database
            const realProblem = createResult.problem
            const demoParticipants = createDemoParticipants(user)
            
            setMatchId(DEMO_MATCH_ID)
            setProblem(realProblem)
            setProblemId(realProblem.id)
            setParticipants(demoParticipants)
            setCurrentUser(demoParticipants.find(p => user?.id ? p.userId === user.id : true) || demoParticipants[0])
            setTimeLeft(DEMO_TIME_LIMIT)
            setStatus('ongoing')
            setResult(null)
            setResultData(null)
            setShowResultModal(false)
            setShowResultPopup(false)
            return
          } catch (dbError) {
            console.warn('Failed to fetch lesson problem, using fallback demo:', dbError)
            // Fallback to hardcoded demo problem if database fetch fails
            const demoProblem = buildDemoProblem(languageParam)
            const demoParticipants = createDemoParticipants(user)
            setMatchId(DEMO_MATCH_ID)
            setProblem(demoProblem)
            setProblemId(demoProblem.id)
            setParticipants(demoParticipants)
            setCurrentUser(demoParticipants.find(p => user?.id ? p.userId === user.id : true) || demoParticipants[0])
            setTimeLeft(DEMO_TIME_LIMIT)
            setStatus('ongoing')
            setResult(null)
            setResultData(null)
            setShowResultModal(false)
            setShowResultPopup(false)
            return
          }
        }

        // Create new battle if no matchId
        if (!battleMatchId) {
          const createResult = await api.createBattle({ 
            matchType: 'ranked', 
            timeLimit: 1800,
            language: languageParam
          })
          battleMatchId = createResult.matchId
          setMatchId(battleMatchId)
          console.log('Battle created, problem:', createResult.problem)
          console.log('InitialCode:', createResult.problem?.initialCode)
          setProblem(createResult.problem)
          setProblemId(createResult.problemId || createResult.problem?.id)
          setTimeLeft(createResult.timeLimit || 1800)
          setStatus('ongoing')
        } else {
          // Load existing battle - pass language and problemId to get the same problem
          const battleResult = await api.getBattle(battleMatchId, languageParam, problemId || undefined)
          console.log('Battle loaded, problem:', battleResult.problem)
          console.log('InitialCode:', battleResult.problem?.initialCode)
          setProblem(battleResult.problem)
          setProblemId(battleResult.problem?.id || problemId)
          setParticipants(battleResult.participants || [])
          setCurrentUser(battleResult.currentUser)
          
          if (battleResult.match.status === 'completed') {
            setStatus(battleResult.currentUser?.isWinner ? 'won' : 'lost')
          } else {
            setStatus('ongoing')
            // Calculate time left
            const startedAt = new Date(battleResult.match.startedAt)
            const now = new Date()
            const elapsed = Math.floor((now.getTime() - startedAt.getTime()) / 1000)
            const timeLimit = 1800 // 30 minutes
            setTimeLeft(Math.max(0, timeLimit - elapsed))
          }
        }
      } catch (error) {
        console.error('Failed to initialize battle:', error)
        // Fallback to demo mode
        setProblem({
          id: 'two_sum',
          title: 'Two Sum',
          description: 'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.',
          difficulty: 'Medium'
        })
        setStatus('ongoing')
        setTimeLeft(30 * 60)
      } finally {
        setLoading(false)
      }
    }

    initializeBattle()
  }, [])

  // Timer countdown
  useEffect(() => {
    if (status !== 'ongoing') {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }

    intervalRef.current = setInterval(() => {
      setTimeLeft((t) => {
        const newTime = Math.max(0, t - 1)
        if (newTime === 0) {
          setStatus('finished')
        }
        return newTime
      })
    }, 1000)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [status])

  // Automatically close battle room shortly after win popup is shown
  useEffect(() => {
    if (showResultModal && resultData?.isWinner) {
      // Give the student a moment to see the popup, then return to lobby
      if (autoCloseRef.current) {
        clearTimeout(autoCloseRef.current)
      }
      autoCloseRef.current = setTimeout(() => {
        setShowResultModal(false)
        navigate('/dashboard/student/battle')
      }, 3500)
    }

    return () => {
      if (autoCloseRef.current) {
        clearTimeout(autoCloseRef.current)
        autoCloseRef.current = null
      }
    }
  }, [showResultModal, resultData, navigate])

  // WebSocket connection for real-time updates
  useEffect(() => {
    if (!matchId || status !== 'ongoing' || isTempBattle || !user) {
      return
    }

    let localIP: string | null = null

    const setupWebSocket = async () => {
      try {
        // Try to get local IP for local network connections
        try {
          localIP = await getLocalIP()
        } catch (err) {
          console.warn('Could not get local IP, using default:', err)
        }

        const token = localStorage.getItem('auth_token')
        if (!token) {
          console.warn('No auth token, falling back to HTTP polling')
          setUseWebSocket(false)
          return
        }

        const client = await initWebSocket(token, localIP || undefined)
        wsClientRef.current = client
        wsConnectedRef.current = client.connected()

        if (!wsConnectedRef.current) {
          console.warn('WebSocket connection failed, falling back to HTTP polling')
          setUseWebSocket(false)
          return
        }

        console.log('🔌 WebSocket connected, setting up battle room listeners for matchId:', matchId)

        // Wait a tiny bit to ensure connection is fully established
        await new Promise(resolve => setTimeout(resolve, 200))

        // Verify connection is still active
        if (!client.connected()) {
          console.warn('WebSocket disconnected after setup, falling back to HTTP polling')
          setUseWebSocket(false)
          return
        }

        // Join battle room
        client.emit('join_battle', { matchId })
        // Also join user's personal room for notifications (redundancy)
        if (user?.id) {
          client.emit('join_user_room', { userId: user.id })
        }
        console.log('📤 Sent join_battle event for matchId:', matchId)

        // Set up a confirmation listener
        const joinConfirmation = setTimeout(() => {
          console.warn('⚠️ No battle_joined confirmation received after 2 seconds')
        }, 2000)

        // Clear timeout when we get confirmation
        const handleBattleJoined = () => {
          clearTimeout(joinConfirmation)
          console.log('✅ Battle room join confirmed')
        }
        client.on('battle_joined', handleBattleJoined)

        // Listen for battle updates
        const handleBattleUpdate = (data: any) => {
          console.log('🔔 Battle update received:', data)
          
          // Handle opponent exited in battle_update
          if (data.type === 'opponent_exited') {
            console.log('⚠️ Opponent exited via battle_update:', data.payload)
            const payload = data.payload || data
            if (payload.exitedUserId && payload.exitedUserId !== user?.id) {
              // Stop timer and polling
              if (intervalRef.current) {
                clearInterval(intervalRef.current)
                intervalRef.current = null
              }
              if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current)
                pollIntervalRef.current = null
              }
              
              // Fetch actual EXP from API
              api.getBattle(matchId, languageParam, problemId || undefined)
                .then(battleResult => {
                  const currentUserParticipant = battleResult.participants.find((p: Participant) => p.userId === (user?.id))
                  setStatus('won')
                  setResultData({
                    isWinner: true,
                    expGained: currentUserParticipant?.expGained || 0
                  })
                  setShowResultModal(true)
                  setParticipants(battleResult.participants || [])
                })
                .catch(err => {
                  console.error('Failed to fetch battle data:', err)
                  // Fallback
                  setStatus('won')
                  setResultData({
                    isWinner: true,
                    expGained: payload.expGained || 150
                  })
                  setShowResultModal(true)
                  setParticipants(prev => prev.filter(p => p.userId !== payload.exitedUserId))
                })
            }
            return
          }
          
          if (data.type === 'opponent_submitted' || data.type === 'opponent_progress') {
            // Refresh battle state
            api.getBattle(matchId, languageParam, problemId || undefined)
              .then(battleResult => {
                setParticipants(battleResult.participants || [])
                
                if (battleResult.match.status === 'completed') {
                  setStatus(battleResult.currentUser?.isWinner ? 'won' : 'lost')
                  setResultData({
                    isWinner: battleResult.currentUser?.isWinner || false,
                    expGained: battleResult.currentUser?.expGained || 0,
                    expLost: battleResult.currentUser?.expLost || 0
                  })
                  setShowResultModal(true)
                }
              })
              .catch(err => console.error('Failed to refresh battle:', err))
          }
        }

        const handlePlayerJoined = (data: any) => {
          console.log('Player joined battle:', data)
        }

        const handlePlayerLeft = (data: any) => {
          console.log('Player left battle:', data)
        }

        const handleOpponentExited = (data: any) => {
          console.log('🚪 Opponent exited battle event received:', data)
          
          // Check if this is about the current user (shouldn't happen, but safety check)
          if (data.exitedUserId === user?.id) {
            console.log('⚠️ Ignoring own exit event')
            return
          }
          
          // Check if current user is a winner
          const isWinner = data.winnerIds && Array.isArray(data.winnerIds) 
            ? data.winnerIds.includes(user?.id)
            : true // Default to winner if opponent exited
          
          if (!isWinner) {
            console.log('⚠️ Current user is not in winner list, ignoring')
            return
          }
          
          // IMMEDIATE response - don't wait for API call
          // Opponent left, current player wins
          console.log('✅ Setting status to won, showing modal immediately')
          
          // Stop timer first
          if (intervalRef.current) {
            clearInterval(intervalRef.current)
            intervalRef.current = null
          }
          
          // Stop polling if active
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current)
            pollIntervalRef.current = null
          }
          
          // Set status and show modal
          setStatus('won')
          setResultData({
            isWinner: true,
            expGained: data.expGained || 150 // Use from data if available
          })
          setShowResultModal(true)
          
          // Update participants immediately (remove exited player)
          setParticipants(prev => {
            const filtered = prev.filter(p => p.userId !== data.exitedUserId)
            console.log('👥 Updated participants:', filtered.length, 'remaining (removed:', data.exitedUserId, ')')
            return filtered
          })
          
          // Refresh from API in background (non-blocking) to get final state
          api.getBattle(matchId, languageParam, problemId || undefined)
            .then(battleResult => {
              console.log('📊 Battle refreshed from API:', battleResult.match.status)
              setParticipants(battleResult.participants || [])
              // Update EXP if available
              const currentUserParticipant = battleResult.participants.find((p: Participant) => p.userId === (user?.id))
              if (currentUserParticipant?.expGained) {
                setResultData(prev => ({
                  ...prev,
                  expGained: currentUserParticipant.expGained || 150
                }))
              }
            })
            .catch(err => console.error('Failed to refresh battle:', err))
        }

        // Handle reconnection - rejoin battle room if connection drops and reconnects
        client.on('connect', () => {
          console.log('🔌 WebSocket (re)connected, rejoining battle room')
          wsConnectedRef.current = true
          if (client.connected() && matchId) {
            client.emit('join_battle', { matchId })
          }
        })

        client.on('disconnect', () => {
          console.log('❌ WebSocket disconnected')
          wsConnectedRef.current = false
        })

        const handleBattleCompleted = async (data: any) => {
          console.log('🏁 Battle completed event:', data)
          
          // Stop timer
          if (intervalRef.current) {
            clearInterval(intervalRef.current)
            intervalRef.current = null
          }
          
          // Check if opponent exited (this is a completion due to exit)
          if (data.exitedUserId && data.exitedUserId !== user?.id) {
            // Opponent exited, current user wins - fetch actual EXP from API
            console.log('✅ Opponent exited, current user wins')
            try {
              const battleResult = await api.getBattle(matchId, languageParam, problemId || undefined)
              const currentUserParticipant = battleResult.participants.find((p: Participant) => p.userId === (user?.id))
              setStatus('won')
              setResultData({
                isWinner: true,
                expGained: currentUserParticipant?.expGained || 150
              })
              setShowResultModal(true)
            } catch (err) {
              console.error('Failed to fetch battle data:', err)
              // Fallback to default
              setStatus('won')
              setResultData({
                isWinner: true,
                expGained: 150
              })
              setShowResultModal(true)
            }
            return
          }
          
          // Fetch actual EXP values from API instead of using hardcoded values
          try {
            const battleResult = await api.getBattle(matchId, languageParam, problemId || undefined)
            const currentUserParticipant = battleResult.participants.find((p: Participant) => p.userId === (user?.id))
            const wasWinner = currentUserParticipant?.isWinner || false
            
            if (wasWinner) {
              console.log('✅ Current user is winner, showing modal')
              setStatus('won')
              setResultData({
                isWinner: true,
                expGained: currentUserParticipant?.expGained || 0
              })
            } else {
              console.log('❌ Current user lost')
              setStatus('lost')
              setResultData({
                isWinner: false,
                expLost: currentUserParticipant?.expLost || 0
              })
            }
            setShowResultModal(true)
          } catch (err) {
            console.error('Failed to fetch battle data on completion:', err)
            // Fallback: use winner list from WebSocket event
            if (data.winners && Array.isArray(data.winners) && data.winners.includes(user?.id)) {
              setStatus('won')
              setResultData({
                isWinner: true,
                expGained: 150 // Fallback value
              })
            } else if (data.winners && Array.isArray(data.winners) && data.winners.length > 0) {
              setStatus('lost')
              setResultData({
                isWinner: false,
                expLost: 50 // Fallback value
              })
            }
            setShowResultModal(true)
          }
        }

        // Register ALL event listeners BEFORE joining battle room
        // This ensures we don't miss any events
        console.log('📋 Registering WebSocket event listeners...')
        client.on('battle_update', handleBattleUpdate)
        client.on('player_joined_battle', handlePlayerJoined)
        client.on('player_left_battle', handlePlayerLeft)
        client.on('opponent_exited', handleOpponentExited)
        client.on('battle_completed', handleBattleCompleted)
        console.log('✅ All event listeners registered')

        // Log all incoming events for debugging (only in dev)
        if (import.meta.env.DEV) {
          // Use the socket.io-client's onAny if available
          const socket = (client as any).socket
          if (socket && typeof socket.onAny === 'function') {
            socket.onAny((eventName: string, ...args: any[]) => {
              if (eventName.includes('battle') || eventName.includes('opponent') || eventName.includes('exit') || eventName.includes('completed')) {
                console.log('📨 WebSocket event received:', eventName, args)
              }
            })
          }
        }

        // Cleanup
        return () => {
          client.off('battle_update', handleBattleUpdate)
          client.off('player_joined_battle', handlePlayerJoined)
          client.off('player_left_battle', handlePlayerLeft)
          client.off('opponent_exited', handleOpponentExited)
          client.off('battle_completed', handleBattleCompleted)
          client.emit('leave_battle', { matchId })
        }
      } catch (error) {
        console.error('Failed to setup WebSocket, falling back to HTTP polling:', error)
        setUseWebSocket(false)
      }
    }

    let cleanupFn: (() => void) | null = null

    setupWebSocket().then(cleanup => {
      if (cleanup) cleanupFn = cleanup
    }).catch(err => {
      console.error('WebSocket setup error:', err)
    })

    return () => {
      if (cleanupFn) {
        cleanupFn()
      }
      if (wsClientRef.current) {
        wsClientRef.current.emit('leave_battle', { matchId })
      }
    }
  }, [matchId, status, isTempBattle, user, languageParam, problemId])

  // Fallback: Poll for opponent updates (if WebSocket not available)
  // Also use as backup even when WebSocket is connected (redundancy)
  useEffect(() => {
    if (!matchId || status !== 'ongoing' || isTempBattle) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
      return
    }

    const pollForUpdates = async () => {
      try {
        const battleResult = await api.getBattle(matchId, languageParam, problemId || undefined)
        setParticipants(battleResult.participants || [])
        
        if (battleResult.match.status === 'completed') {
          // Stop timer and polling
          if (intervalRef.current) {
            clearInterval(intervalRef.current)
            intervalRef.current = null
          }
          setStatus(battleResult.currentUser?.isWinner ? 'won' : 'lost')
          setResultData({
            isWinner: battleResult.currentUser?.isWinner || false,
            expGained: battleResult.currentUser?.expGained || 0,
            expLost: battleResult.currentUser?.expLost || 0
          })
          setShowResultModal(true)
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current)
            pollIntervalRef.current = null
          }
        } else {
            // Check if someone else completed (auto-stop game)
            const completedParticipants = battleResult.participants.filter((p: Participant) => p.completedCode && p.isWinner)
            if (completedParticipants.length > 0 && !currentUser?.isWinner) {
              const currentUserParticipant = battleResult.participants.find((p: Participant) => p.userId === (user?.id))
              setStatus('lost')
              setResultData({
                isWinner: false,
                expLost: currentUserParticipant?.expLost || 0
              })
              setShowResultModal(true)
              if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current)
                pollIntervalRef.current = null
              }
            }
            
            // Check if opponent count decreased (opponent might have exited)
            const activeParticipants = battleResult.participants.filter((p: Participant) => p.userId !== (user?.id))
            const previousParticipantCount = participants.length
            const currentParticipantCount = battleResult.participants.length
            
            // If participant count decreased and match is still active, opponent likely exited
            if (currentParticipantCount < previousParticipantCount && battleResult.match.status === 'active') {
              console.log('⚠️ Participant count decreased, opponent may have exited')
              // Check again in next poll to confirm
            }
            
            // If no opponents remain and match is active, current player wins
            if (activeParticipants.length === 0 && battleResult.match.status === 'active') {
              console.log('✅ No opponents remaining, current player wins by forfeit')
              // Stop timer
              if (intervalRef.current) {
                clearInterval(intervalRef.current)
                intervalRef.current = null
              }
              const currentUserParticipant = battleResult.participants.find((p: Participant) => p.userId === (user?.id))
              setStatus('won')
              setResultData({
                isWinner: true,
                expGained: currentUserParticipant?.expGained || 0
              })
              setShowResultModal(true)
              if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current)
                pollIntervalRef.current = null
              }
            }
            
            // Check if match status changed to completed (opponent might have exited)
            // This is a critical check - if match is completed but we're still in 'ongoing' status, opponent exited
            if (battleResult.match.status === 'completed' && status === 'ongoing') {
              const currentUserParticipant = battleResult.participants.find((p: Participant) => p.userId === (user?.id))
              const wasWinner = currentUserParticipant?.isWinner
              
              console.log('✅ Match completed detected via polling (opponent likely exited)', {
                isWinner: wasWinner,
                matchStatus: battleResult.match.status,
                currentStatus: status
              })
              
              // Stop timer and polling immediately
              if (intervalRef.current) {
                clearInterval(intervalRef.current)
                intervalRef.current = null
              }
              if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current)
                pollIntervalRef.current = null
              }
              
              // Update status and show modal
              setStatus(wasWinner ? 'won' : 'lost')
              setResultData({
                isWinner: wasWinner || false,
                expGained: wasWinner ? (currentUserParticipant?.expGained || 0) : 0,
                expLost: !wasWinner ? (currentUserParticipant?.expLost || 0) : 0
              })
              setShowResultModal(true)
            }
          }
      } catch (error) {
        console.error('Failed to poll battle updates:', error)
      }
    }

    // Use faster polling - every 1 second for both WebSocket and non-WebSocket cases
    // This provides redundancy in case WebSocket events are missed
    pollIntervalRef.current = setInterval(pollForUpdates, 1000)

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
      }
    }
  }, [matchId, status, isTempBattle, languageParam, problemId, currentUser, user])

  const formatTime = (s: number) => {
    const mm = Math.floor(s / 60).toString().padStart(2, '0')
    const ss = (s % 60).toString().padStart(2, '0')
    return `${mm}:${ss}`
  }

  // Memoize initialTexts to prevent unnecessary re-renders of JigsawCodePuzzle
  const initialTexts = useMemo(() => {
    if (!problem?.initialCode) return []
    return toLines(problem.initialCode)
  }, [problem?.initialCode])

  // Prepare random extras for JigsawCodePuzzle based on difficulty and language
  const randomExtras = useMemo(() => {
    if (!problem) return { count: 0, pool: [] }
    const langKey = languageParam.toLowerCase()
    const basePool = languageNoise[langKey] || languageNoise.default
    const difficulty = (problem?.difficulty || 'Medium') as 'Easy' | 'Medium' | 'Hard'
    const extraCount = difficulty === 'Easy' ? 1 : difficulty === 'Medium' ? 2 : 3
    const initialLines = initialTexts.length > 0 ? initialTexts : []
    const filtered = basePool.filter(line => !initialLines.includes(line))
    const pool = filtered.length ? filtered : languageNoise.default
    return { count: extraCount, pool }
  }, [problem?.difficulty, languageParam, initialTexts])

  // Debug: Log when problem changes to verify initialCode is present
  useEffect(() => {
    if (problem) {
      console.log('🔍 Problem state updated:', {
        id: problem.id,
        title: problem.title,
        hasInitialCode: !!problem.initialCode,
        initialCodeLength: problem.initialCode?.length || 0,
        initialCodePreview: problem.initialCode?.substring(0, 150) || 'N/A',
        linesCount: problem.initialCode ? toLines(problem.initialCode).length : 0,
        lines: problem.initialCode ? toLines(problem.initialCode) : []
      })
    }
  }, [problem])

  /**
   * Smart error parser that categorizes and formats errors intelligently
   */
  const parseError = (error: any, result?: { success: boolean; message?: string }): { 
    success: boolean; 
    message: string;
    category?: 'syntax' | 'logic' | 'runtime' | 'network' | 'validation' | 'unknown';
  } => {
    // If result is provided and has a message, parse it first
    if (result && !result.success && result.message) {
      const msg = result.message.toLowerCase();
      
      // Syntax errors
      if (msg.includes('syntax error') || msg.includes('block #')) {
        const blockMatch = result.message.match(/block #(\d+)/i);
        const blockNum = blockMatch ? blockMatch[1] : null;
        
        if (msg.includes('wrong position')) {
          return {
            success: false,
            message: blockNum 
              ? `⚠️ Syntax Error: Block #${blockNum} is in the wrong position. Check the order of your code blocks.`
              : '⚠️ Syntax Error: Some blocks are in the wrong position. Check the order of your code blocks.',
            category: 'syntax'
          };
        }
        if (msg.includes('missing')) {
          return {
            success: false,
            message: blockNum 
              ? `⚠️ Syntax Error: Block #${blockNum} is missing. Make sure all required blocks are connected.`
              : '⚠️ Syntax Error: Some blocks are missing. Make sure all required blocks are connected.',
            category: 'syntax'
          };
        }
        if (msg.includes('unexpected')) {
          return {
            success: false,
            message: blockNum 
              ? `⚠️ Syntax Error: Unexpected block #${blockNum}. Remove unnecessary blocks.`
              : '⚠️ Syntax Error: Unexpected blocks found. Remove unnecessary blocks.',
            category: 'syntax'
          };
        }
        
        return {
          success: false,
          message: result.message,
          category: 'syntax'
        };
      }
      
      // Logic errors
      if (msg.includes('logic error') || msg.includes('used before') || msg.includes('not defined')) {
        const varMatch = result.message.match(/variable\s+["']?(\w+)["']?/i);
        const varName = varMatch ? varMatch[1] : null;
        
        if (msg.includes('used before') || msg.includes('not defined')) {
          return {
            success: false,
            message: varName 
              ? `🔴 Logic Error: Variable "${varName}" is used before it's defined. Define variables before using them.`
              : '🔴 Logic Error: A variable is used before it\'s defined. Check the order of your code blocks.',
            category: 'logic'
          };
        }
        
        return {
          success: false,
          message: result.message,
          category: 'logic'
        };
      }
      
      // Runtime errors
      if (msg.includes('runtime error') || msg.includes('exception') || msg.includes('traceback')) {
        return {
          success: false,
          message: `💥 Runtime Error: ${result.message.replace(/^(runtime error|exception|traceback):?\s*/i, '')}`,
          category: 'runtime'
        };
      }
      
      // Output mismatch
      if (msg.includes('output') && (msg.includes('mismatch') || msg.includes('expected') || msg.includes('incorrect'))) {
        return {
          success: false,
          message: `❌ Output Mismatch: ${result.message}`,
          category: 'logic'
        };
      }
      
      // Timeout errors
      if (msg.includes('timeout') || msg.includes('timed out')) {
        return {
          success: false,
          message: '⏱️ Timeout: Your solution took too long to execute. Check for infinite loops or optimize your code.',
          category: 'runtime'
        };
      }
      
      // Memory errors
      if (msg.includes('memory') || msg.includes('out of memory')) {
        return {
          success: false,
          message: '💾 Memory Error: Your solution uses too much memory. Optimize your code.',
          category: 'runtime'
        };
      }
      
      // Generic incorrect solution
      if (msg.includes('incorrect') || msg.includes('wrong') || msg.includes('invalid') || msg.includes('solution submitted')) {
        // Check if it's just a generic message
        if (msg.includes('solution submitted') && msg.includes('waiting')) {
          return {
            success: false,
            message: '❌ Incorrect: Your solution doesn\'t match the expected output. Review the problem requirements.',
            category: 'logic'
          };
        }
        return {
          success: false,
          message: result.message,
          category: 'logic'
        };
      }
      
      // Return the original message if we can't categorize it better
      return {
        success: false,
        message: result.message,
        category: 'unknown'
      };
    }
    
    // Handle API/network errors
    if (error) {
      const errorType = classifyError(error);
      const friendlyMessage = getUserFriendlyMessage(error, errorType);
      
      // Extract more details from error response
      let detailedMessage = friendlyMessage;
      
      if (error.response?.error) {
        detailedMessage = error.response.error;
      } else if (error.response?.data?.error) {
        detailedMessage = error.response.data.error;
      } else if (error.message && !error.message.includes('fetch')) {
        detailedMessage = error.message;
      }
      
      // Categorize based on error type and message content
      let category: 'syntax' | 'logic' | 'runtime' | 'network' | 'validation' | 'unknown' = 'unknown';
      const lowerMsg = detailedMessage.toLowerCase();
      
      if (errorType === 'NETWORK_ERROR' || lowerMsg.includes('network') || lowerMsg.includes('connection') || lowerMsg.includes('fetch')) {
        category = 'network';
      } else if (errorType === 'VALIDATION_ERROR' || lowerMsg.includes('validation') || lowerMsg.includes('invalid input')) {
        category = 'validation';
      } else if (lowerMsg.includes('syntax') || lowerMsg.includes('block #') || lowerMsg.includes('parse')) {
        category = 'syntax';
      } else if (lowerMsg.includes('logic') || lowerMsg.includes('output') || lowerMsg.includes('expected')) {
        category = 'logic';
      } else if (lowerMsg.includes('runtime') || lowerMsg.includes('exception') || lowerMsg.includes('traceback') || lowerMsg.includes('error at line')) {
        category = 'runtime';
      } else if (lowerMsg.includes('timeout') || lowerMsg.includes('memory')) {
        category = 'runtime';
      }
      
      return {
        success: false,
        message: detailedMessage,
        category
      };
    }
    
    // Fallback
    return {
      success: false,
      message: 'An unexpected error occurred. Please try again.',
      category: 'unknown'
    };
  };

  // Format example input/output based on language
  const formatExampleForLanguage = (example: { input: string; output: string }, lang: string) => {
    // Parse the input string to extract values
    const inputStr = example.input
    
    // For different languages, format the syntax appropriately
    if (lang === 'python') {
      // Python syntax: nums = [2,7,11,15], target = 9
      return {
        input: inputStr,
        output: example.output
      }
    } else if (lang === 'javascript') {
      // JavaScript syntax: const nums = [2,7,11,15]; const target = 9;
      const formatted = inputStr
        .replace(/nums = \[/g, 'const nums = [')
        .replace(/target = /g, 'const target = ')
        .replace(/, target/g, ';\nconst target')
      return {
        input: formatted,
        output: example.output
      }
    } else if (lang === 'csharp' || lang === 'cpp') {
      // C#/C++ syntax: int[] nums = {2,7,11,15}; int target = 9;
      const formatted = inputStr
        .replace(/nums = \[/g, 'int[] nums = {')
        .replace(/\]/g, '}')
        .replace(/target = /g, 'int target = ')
        .replace(/, target/g, ';\nint target')
        .replace(/(\d+)$/, '$1;')
      return {
        input: formatted,
        output: example.output
      }
    } else if (lang === 'php') {
      // PHP syntax: $nums = [2,7,11,15]; $target = 9;
      const formatted = inputStr
        .replace(/nums = /g, '$nums = ')
        .replace(/target = /g, '$target = ')
        .replace(/, \$target/g, ';\n$target')
        .replace(/(\d+)$/, '$1;')
      return {
        input: formatted,
        output: example.output
      }
    }
    
    // Default: return as is
    return {
      input: inputStr,
      output: example.output
    }
  }

  const handleSubmit = async (status: 'success' | 'error', submittedCode?: string) => {
    if (!matchId || submitting) return

    // Show local validation result immediately
    if (status === 'error') {
      setResult({
        success: false,
        message: '⚠️ Puzzle Error: Keep arranging the puzzle blocks until every piece snaps in correctly.',
        category: 'syntax'
      })
      setShowResultPopup(true)
      // Auto-dismiss popup after 5 seconds
      setTimeout(() => {
        setShowResultPopup(false)
      }, 5000)
      return
    }

    if (isTempBattle) {
      setResult({
        success: true,
        message: 'Demo submission accepted! No EXP is awarded in temporary mode.'
      })
      setShowResultPopup(true)
      setStatus('won')
      setParticipants(prev =>
        prev.map(participant => {
          if (participant.userId === (user?.id || 'demo-student')) {
            return { ...participant, completedCode: true, isWinner: true }
          }
          return { ...participant, completedCode: true, isWinner: false }
        })
      )
      setResultData({ isWinner: true, expGained: 0 })
      setShowResultModal(true)
      // Auto-dismiss popup after 5 seconds
      setTimeout(() => {
        setShowResultPopup(false)
      }, 5000)
      return
    }

    try {
      setSubmitting(true)
      const codeToSubmit = submittedCode || code
      
      // Emit WebSocket event if connected
      if (wsClientRef.current && wsConnectedRef.current) {
        wsClientRef.current.emit('submit_solution', {
          matchId,
          code: codeToSubmit,
          language: languageParam
        })
        wsClientRef.current.emit('battle_update', {
          matchId,
          type: 'solution_submitted',
          payload: { code: codeToSubmit }
        })
      }
      
      const result = await api.submitBattleSolution(matchId, codeToSubmit, languageParam)
      
      // Parse and show smart error message
      const parsedResult = result.success 
        ? { success: true, message: '✓ Correct! Your solution is valid.' }
        : parseError(null, result);
      
      setResult(parsedResult)
      setShowResultPopup(true)
      
      // Auto-dismiss popup after 5 seconds
      setTimeout(() => {
        setShowResultPopup(false)
      }, 5000)

      if (result.success) {
        setStatus('won')
        setResultData({
          isWinner: true,
          expGained: result.expGained || 0
        })
        setShowResultModal(true)
        const battleResult = await api.getBattle(matchId)
        setParticipants(battleResult.participants || [])
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current)
          pollIntervalRef.current = null
        }
      } else {
        const battleResult = await api.getBattle(matchId)
        if (battleResult.match.status === 'completed') {
          setStatus(battleResult.currentUser?.isWinner ? 'won' : 'lost')
          setResultData({
            isWinner: battleResult.currentUser?.isWinner || false,
            expGained: battleResult.currentUser?.expGained || 0,
            expLost: battleResult.currentUser?.expLost || 0
          })
          setShowResultModal(true)
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current)
            pollIntervalRef.current = null
          }
        }
      }
    } catch (error: any) {
      console.error('Failed to submit solution:', error)
      // Parse error intelligently
      const parsedError = parseError(error);
      setResult(parsedError)
      setShowResultPopup(true)
      
      // Auto-dismiss popup after 5 seconds
      setTimeout(() => {
        setShowResultPopup(false)
      }, 5000)
    } finally {
      setSubmitting(false)
    }
  }

  const handleExit = async () => {
    if (!matchId || isTempBattle) {
      // Notify via WebSocket if connected (immediate notification)
      if (wsClientRef.current && wsConnectedRef.current) {
        wsClientRef.current.emit('exit_battle', { matchId })
      }
      navigate('/dashboard/student/battle')
      return
    }

    // Send WebSocket notification FIRST for instant update
    if (wsClientRef.current && wsConnectedRef.current) {
      wsClientRef.current.emit('exit_battle', { matchId })
    }

    // Update database in background (non-blocking)
    // Don't wait for this - navigate immediately after WebSocket notification
    api.exitBattle(matchId)
      .then(() => {
        console.log('Exit battle confirmed in database')
      })
      .catch(error => {
        console.error('Failed to exit battle in database:', error)
        // WebSocket notification already sent, so other players are notified
      })

    // Mark this match as recently left to prevent auto-rejoin
    if (matchId) {
      sessionStorage.setItem('recentlyLeftMatchId', matchId)
      setTimeout(() => {
        sessionStorage.removeItem('recentlyLeftMatchId')
      }, 10000)
    }
    
    // Navigate immediately (don't wait for HTTP response)
    navigate('/dashboard/student/battle')
  }

  if (loading) {
    return (
      <div className="student-overview">
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-primary, #eae6ff)' }}>
          Loading battle room...
        </div>
      </div>
    )
  }

  if (!problem) {
    return (
      <div className="student-overview">
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-primary, #eae6ff)' }}>
          Failed to load battle. Please try again.
        </div>
      </div>
    )
  }

  return (
    <>
      <style>{`
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }
      `}</style>
      <div className="student-overview">
      <div className="page-header" style={{ marginBottom: '24px' }}>
        <div>
          <h1 className="page-title">Battle Room</h1>
          <p className="page-subtitle">Solve the challenge before the timer runs out.</p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div className="stat-card" style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, width: 'fit-content' }}>
            <div className="stat-content" style={{ textAlign: 'center', flex: 'none' }}>
              <div className="stat-value" style={{ fontSize: 20, color: timeLeft < 300 ? '#ef4444' : 'var(--text-primary, #eae6ff)', marginBottom: 2, lineHeight: 1.2 }}>
                {formatTime(timeLeft)}
              </div>
              <div className="stat-label" style={{ marginBottom: 0, fontSize: 12 }}>Time Left</div>
            </div>
          </div>
          <button
            className="btn-secondary"
            onClick={() => setShowExitConfirm(true)}
            style={{
              padding: '12px 20px',
              fontSize: 14,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#fca5a5',
              borderRadius: 8,
              cursor: 'pointer'
            }}
          >
            <span style={{ fontSize: 16 }}>✕</span>
            <span>Exit</span>
          </button>
        </div>
      </div>

      {isTempBattle && (
        <div 
          className="dashboard-card" 
          style={{ 
            marginBottom: '24px', 
            border: '1px solid rgba(34, 197, 94, 0.3)', 
            background: 'rgba(34, 197, 94, 0.08)'
          }}
        >
          <div className="card-content" style={{ color: 'var(--text-primary, #c8facc)', fontSize: 14 }}>
            Temporary Battle Access is enabled. This demo match runs locally for UI testing, so matchmaking, EXP, and leaderboard updates are skipped.
          </div>
        </div>
      )}

      {/* Opponents Section */}
      {participants.length > 0 && (
        <div className="dashboard-card" style={{ marginBottom: '24px' }}>
          <div className="card-header">
            <h3 className="card-title">Players</h3>
          </div>
          <div className="card-content">
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              {participants.map((participant) => {
                const isCurrentUser = user && participant.userId === user.id
                return (
                  <div
                    key={participant.userId}
                    style={{
                      padding: '12px 16px',
                      background: isCurrentUser 
                        ? 'rgba(123, 92, 255, 0.15)' 
                        : 'var(--bg-panel, rgba(255, 255, 255, 0.05))',
                      border: `1px solid ${isCurrentUser ? 'rgba(123, 92, 255, 0.3)' : 'var(--bg-output-border, rgba(255, 255, 255, 0.1))'}`,
                      borderRadius: 8,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      minWidth: '200px'
                    }}
                  >
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: '50%',
                        background: participant.avatar 
                          ? `url(${participant.avatar})` 
                          : 'rgba(123, 92, 255, 0.3)',
                        backgroundSize: 'cover',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--text-primary, #eae6ff)',
                        fontWeight: 600
                      }}
                    >
                      {!participant.avatar && (participant.name || participant.username).charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary, #eae6ff)' }}>
                        {participant.name || participant.username}
                        {isCurrentUser && <span style={{ marginLeft: 8, color: '#7b5cff' }}>(You)</span>}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted, #a0a0a0)' }}>
                        {participant.completedCode ? (
                          participant.isWinner ? '🏆 Winner!' : '✓ Completed'
                        ) : (
                          '⏳ Solving...'
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Problem Description */}
      {status === 'ongoing' && (
        <div className="dashboard-card" style={{ marginBottom: '24px' }}>
          <div className="card-header">
            <h3 className="card-title">
              Problem: {problem.title}
            </h3>
          </div>
          <div className="card-content">
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, color: 'var(--text-primary, #eae6ff)' }}>
              {problem.description}
            </div>
          </div>
        </div>
      )}

      {/* Code Editor */}
      {status === 'ongoing' && problem && (
        <div className="dashboard-card" style={{ marginBottom: '24px' }}>
          <div className="card-header">
            <h3 className="card-title">Your Solution</h3>
          </div>
          <div className="card-content">
            {problem.initialCode ? (
              <JigsawCodePuzzle
                key={`battle-${problem.id}-${problem.levelId || problem.id}-${problem.initialCode.substring(0, 50)}`}
                height={400}
                language={languageParam}
                currentLevel={1}
                difficulty={(problem.difficulty as 'Easy' | 'Medium' | 'Hard') || "Medium"}
                initialTexts={initialTexts}
                randomExtras={randomExtras}
                onSubmitResult={handleSubmit}
                onReset={() => {
                  setResult(null)
                  setShowResultPopup(false)
                }}
                showHintButton={false}
              />
            ) : (
              <div style={{ padding: '40px', textAlign: 'center' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>📝</div>
                <h3 style={{ color: 'var(--text-primary, #eae6ff)', marginBottom: 12 }}>No Puzzle Available</h3>
                <p style={{ color: 'var(--text-muted, #a0a0a0)', fontSize: 14, marginBottom: 8 }}>
                  There are no puzzle lessons available for <strong style={{ color: 'var(--text-primary, #eae6ff)' }}>{languageParam}</strong> yet.
                </p>
                <p style={{ color: 'var(--text-muted, #a0a0a0)', fontSize: 13 }}>
                  Please add lessons and levels to the <strong style={{ color: 'var(--text-primary, #eae6ff)' }}>{languageParam}</strong> course in the admin panel to enable battles for this language.
                </p>
              </div>
            )}
            
            {/* Result Popup Notification */}
            {showResultPopup && result && (() => {
              // Determine colors based on error category
              const getErrorColors = () => {
                if (result.success) {
                  return {
                    bg: 'linear-gradient(135deg, rgba(34, 197, 94, 0.95) 0%, rgba(16, 185, 129, 0.95) 100%)',
                    border: 'rgba(34, 197, 94, 1)',
                    shadow: '0 8px 24px rgba(34, 197, 94, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1)',
                    icon: '✓'
                  };
                }
                
                switch (result.category) {
                  case 'syntax':
                    return {
                      bg: 'linear-gradient(135deg, rgba(251, 191, 36, 0.95) 0%, rgba(245, 158, 11, 0.95) 100%)',
                      border: 'rgba(251, 191, 36, 1)',
                      shadow: '0 8px 24px rgba(251, 191, 36, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1)',
                      icon: '⚠️'
                    };
                  case 'logic':
                    return {
                      bg: 'linear-gradient(135deg, rgba(239, 68, 68, 0.95) 0%, rgba(220, 38, 38, 0.95) 100%)',
                      border: 'rgba(239, 68, 68, 1)',
                      shadow: '0 8px 24px rgba(239, 68, 68, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1)',
                      icon: '🔴'
                    };
                  case 'runtime':
                    return {
                      bg: 'linear-gradient(135deg, rgba(239, 68, 68, 0.95) 0%, rgba(185, 28, 28, 0.95) 100%)',
                      border: 'rgba(239, 68, 68, 1)',
                      shadow: '0 8px 24px rgba(239, 68, 68, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1)',
                      icon: '💥'
                    };
                  case 'network':
                    return {
                      bg: 'linear-gradient(135deg, rgba(59, 130, 246, 0.95) 0%, rgba(37, 99, 235, 0.95) 100%)',
                      border: 'rgba(59, 130, 246, 1)',
                      shadow: '0 8px 24px rgba(59, 130, 246, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1)',
                      icon: '🌐'
                    };
                  case 'validation':
                    return {
                      bg: 'linear-gradient(135deg, rgba(168, 85, 247, 0.95) 0%, rgba(147, 51, 234, 0.95) 100%)',
                      border: 'rgba(168, 85, 247, 1)',
                      shadow: '0 8px 24px rgba(168, 85, 247, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1)',
                      icon: '📋'
                    };
                  default:
                    return {
                      bg: 'linear-gradient(135deg, rgba(239, 68, 68, 0.95) 0%, rgba(220, 38, 38, 0.95) 100%)',
                      border: 'rgba(239, 68, 68, 1)',
                      shadow: '0 8px 24px rgba(239, 68, 68, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1)',
                      icon: '✗'
                    };
                }
              };
              
              const colors = getErrorColors();
              
              return (
                <div style={{
                  position: 'fixed',
                  top: '20px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  zIndex: 10000,
                  padding: '16px 24px',
                  background: colors.bg,
                  border: `2px solid ${colors.border}`,
                  borderRadius: 12,
                  color: '#ffffff',
                  fontSize: 15,
                  fontWeight: 600,
                  textAlign: 'center',
                  boxShadow: colors.shadow,
                  minWidth: '320px',
                  maxWidth: '500px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  animation: 'slideDown 0.3s ease-out',
                  cursor: 'pointer'
                }}
                onClick={() => setShowResultPopup(false)}
                >
                  <span style={{ fontSize: 24 }}>
                    {colors.icon}
                  </span>
                  <span style={{ flex: 1, textAlign: 'left' }}>
                    {result.message}
                  </span>
                  <span 
                    style={{ 
                      fontSize: 18, 
                      opacity: 0.8,
                      cursor: 'pointer',
                      lineHeight: 1,
                      flexShrink: 0
                    }}
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowResultPopup(false)
                    }}
                  >
                    ×
                  </span>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Results */}
      {(status === 'won' || status === 'lost' || status === 'finished') && (
        <div className="dashboard-card">
          <div className="card-header">
            <h3 className="card-title">
              {status === 'won' ? '🎉 Victory!' : status === 'lost' ? '😔 Defeat' : '⏱️ Time\'s Up'}
            </h3>
          </div>
          <div className="card-content">
            <div style={{ textAlign: 'center', padding: '24px' }}>
              {status === 'won' && (
                <div>
                  <div style={{ fontSize: 48, marginBottom: 16 }}>🏆</div>
                  <h3 style={{ color: '#4ade80', marginBottom: 8 }}>Congratulations!</h3>
                  <p style={{ color: 'var(--text-primary, #eae6ff)', marginBottom: 24 }}>
                    You solved the problem first and won the battle!
                  </p>
                </div>
              )}
              {status === 'lost' && (
                <div>
                  <div style={{ fontSize: 48, marginBottom: 16 }}>😔</div>
                  <h3 style={{ color: '#f87171', marginBottom: 8 }}>Better luck next time!</h3>
                  <p style={{ color: 'var(--text-primary, #eae6ff)', marginBottom: 24 }}>
                    Your opponent solved it first. Keep practicing!
                  </p>
                </div>
              )}
              {status === 'finished' && (
                <div>
                  <div style={{ fontSize: 48, marginBottom: 16 }}>⏱️</div>
                  <h3 style={{ color: '#fbbf24', marginBottom: 8 }}>Time's Up!</h3>
                  <p style={{ color: 'var(--text-primary, #eae6ff)', marginBottom: 24 }}>
                    The battle has ended. No winner this time.
                  </p>
                </div>
              )}
              <button
                className="btn-primary"
                onClick={() => {
                  // Mark this match as recently left to prevent auto-rejoin
                  if (matchId) {
                    sessionStorage.setItem('recentlyLeftMatchId', matchId)
                    setTimeout(() => {
                      sessionStorage.removeItem('recentlyLeftMatchId')
                    }, 10000)
                  }
                  navigate('/dashboard/student/battle')
                }}
                style={{ padding: '12px 24px' }}
              >
                Return to Battle Lobby
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Exit Confirmation Modal */}
      {showExitConfirm && (
        <ConfirmModal
          title="Exit Battle?"
          message="If you exit the battle now, you will lose 100 EXP. Are you sure you want to leave?"
          confirmLabel="Yes, Exit"
          cancelLabel="Cancel"
          onConfirm={handleExit}
          onClose={() => setShowExitConfirm(false)}
        />
      )}

      {/* Win/Lose Result Modal */}
      {showResultModal && resultData && (
        <div 
          className="auth-overlay" 
          onClick={() => {
            // Mark this match as recently left to prevent auto-rejoin
            if (matchId) {
              sessionStorage.setItem('recentlyLeftMatchId', matchId)
              setTimeout(() => {
                sessionStorage.removeItem('recentlyLeftMatchId')
              }, 10000)
            }
            setShowResultModal(false)
            navigate('/dashboard/student/battle')
          }}
          style={{ 
            zIndex: 10000,
            // Darken background so underlying cards don't show through
            background: 'rgba(3, 0, 30, 0.92)'
          }}
        >
          <div 
            className="auth-modal" 
            onClick={(e) => e.stopPropagation()}
            style={{ 
              width: '90vw', 
              maxWidth: '520px',
              background: resultData.isWinner 
                ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.2) 0%, rgba(16, 185, 129, 0.25) 100%)'
                : 'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(220, 38, 38, 0.25) 100%)',
              border: `2px solid ${resultData.isWinner ? 'rgba(34, 197, 94, 0.7)' : 'rgba(239, 68, 68, 0.7)'}`,
              boxShadow: resultData.isWinner
                ? '0 18px 60px rgba(34, 197, 94, 0.45)'
                : '0 18px 60px rgba(239, 68, 68, 0.45)',
            }}
          >
            <div className="auth-header">
              <h3 className="auth-title text-center" style={{ 
                color: resultData.isWinner ? '#4ade80' : '#f87171',
                fontSize: 24
              }}>
                {resultData.isWinner ? 'Victory!' : 'Defeat'}
              </h3>
            </div>
            <div className="auth-body" style={{ textAlign: 'center', padding: '24px' }}>
              {/* Character illustration */}
              <div style={{ fontSize: 56, marginBottom: 10 }}>
                {resultData.isWinner ? '🧑‍💻🏆' : '🧑‍💻💔'}
              </div>
              <h3 style={{ 
                color: resultData.isWinner ? '#e0fbea' : '#fee2e2', 
                marginBottom: 8,
                fontSize: 20
              }}>
                {resultData.isWinner ? 'Congratulations, Code Warrior!' : 'Better luck next time!'}
              </h3>
              <p style={{ color: 'var(--text-primary, #eae6ff)', marginBottom: 24, fontSize: 14 }}>
                {resultData.isWinner 
                  ? 'You solved the problem first and won this 1v1 battle.'
                  : 'Your opponent solved it first this round. Review, train, and come back stronger!'}
              </p>
              
              {resultData.isWinner && resultData.expGained && (
                <div style={{
                  padding: '16px',
                  background: 'rgba(15, 118, 110, 0.9)',
                  border: '1px solid rgba(45, 212, 191, 0.9)',
                  borderRadius: 10,
                  marginBottom: 16
                }}>
                  <div style={{ fontSize: 14, color: '#e0f2f1', marginBottom: 4 }}>EXP Gained</div>
                  <div style={{ fontSize: 32, fontWeight: 700, color: '#bbf7d0' }}>
                    +{resultData.expGained}
                  </div>
                </div>
              )}
              
              {!resultData.isWinner && resultData.expLost && (
                <div style={{
                  padding: '16px',
                  background: 'rgba(127, 29, 29, 0.9)',
                  border: '1px solid rgba(248, 113, 113, 0.9)',
                  borderRadius: 10,
                  marginBottom: 16
                }}>
                  <div style={{ fontSize: 14, color: '#fee2e2', marginBottom: 4 }}>EXP Lost</div>
                  <div style={{ fontSize: 32, fontWeight: 700, color: '#fecaca' }}>
                    -{resultData.expLost}
                  </div>
                </div>
              )}
              
              <button
                className="btn-primary"
                onClick={() => {
                  // Mark this match as recently left to prevent auto-rejoin
                  if (matchId) {
                    sessionStorage.setItem('recentlyLeftMatchId', matchId)
                    // Clear after 10 seconds
                    setTimeout(() => {
                      sessionStorage.removeItem('recentlyLeftMatchId')
                    }, 10000)
                  }
                  setShowResultModal(false)
                  navigate('/dashboard/student/battle')
                }}
                style={{ padding: '12px 24px', width: '100%' }}
              >
                Return to Battle Lobby
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </>
  )
}
