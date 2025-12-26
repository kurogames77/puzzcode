import React, { useState, useEffect, useRef } from 'react'
import { getAllCourses, createCourse, updateCourse, deleteCourse, initializeDefaultCourses, Course, createLesson, deleteLesson, resetAllCourseStudentCounts, Lesson, Level, updateLevel, getLevel, getCourseById, getLessonsByCourseId } from '../utils/courseManager'

type LevelVariantMeta = {
  id?: string
  levelNumber: number
  difficulty: Level['difficulty']
  points: number
  label: string
  title: string
}

type PythonContext = Record<string, number | string | boolean | null>

type PythonBlockFrame = {
  indent: number
  active: boolean
  kind: 'if' | 'else' | 'root'
  conditionTruth?: boolean
}

const normalizePythonExpression = (expression: string) => {
  return expression
    .replace(/\bTrue\b/g, 'true')
    .replace(/\bFalse\b/g, 'false')
    .replace(/\bNone\b/g, 'null')
    .replace(/\band\b/g, '&&')
    .replace(/\bor\b/g, '||')
    .replace(/\bnot\b/g, '!')
    .replace(/\/\//g, '/')
}

const evaluatePythonExpression = (expression: string, context: PythonContext) => {
  const normalized = normalizePythonExpression(expression)
  const keys = Object.keys(context)
  try {
    // eslint-disable-next-line no-new-func
    const evaluator = new Function(
      ...keys,
      `"use strict"; return (${normalized});`
    )
    return evaluator(...keys.map(key => context[key]))
  } catch {
    return undefined
  }
}

const resolveFString = (template: string, context: PythonContext) => {
  return template.replace(/\{([^{}]+)\}/g, (_, expr) => {
    const value = evaluatePythonExpression(expr.trim(), context)
    return value !== undefined && value !== null ? String(value) : ''
  })
}

const stripQuotes = (value: string) => {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1)
  }
  return value
}

const parsePythonArguments = (args: string) => {
  const parts: string[] = []
  let current = ''
  let depth = 0
  let stringChar: string | null = null

  for (let i = 0; i < args.length; i++) {
    const char = args[i]
    const prevChar = i > 0 ? args[i - 1] : ''

    if (stringChar) {
      current += char
      if (char === stringChar && prevChar !== '\\') {
        stringChar = null
      }
      continue
    }

    if (char === '"' || char === "'") {
      stringChar = char
      current += char
      continue
    }

    if (char === '(' || char === '[' || char === '{') {
      depth++
      current += char
      continue
    }

    if (char === ')' || char === ']' || char === '}') {
      depth = Math.max(0, depth - 1)
      current += char
      continue
    }

    if (char === ',' && depth === 0) {
      if (current.trim()) {
        parts.push(current.trim())
      }
      current = ''
      continue
    }

    current += char
  }

  if (current.trim()) {
    parts.push(current.trim())
  }

  return parts
}

const evaluatePythonArgument = (argument: string, context: PythonContext) => {
  const trimmed = argument.trim()
  if (!trimmed) return ''

  if (/^f['"]/.test(trimmed)) {
    const quoteChar = trimmed[1]
    if (trimmed.endsWith(quoteChar)) {
      const template = trimmed.slice(2, -1)
      return resolveFString(template, context)
    }
  }

  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return stripQuotes(trimmed)
  }

  const value = evaluatePythonExpression(trimmed, context)
  if (value === undefined) {
    return trimmed
  }
  return String(value)
}

const simulateSimplePythonExecution = (code: string) => {
  const context: PythonContext = {}
  const outputs: string[] = []
  const lines = code.split('\n')

  const stack: PythonBlockFrame[] = [
    { indent: -1, active: true, kind: 'root', conditionTruth: true }
  ]
  let invalidLine: string | null = null

  lines.forEach(rawLine => {
    const rawWithoutComment = rawLine.split('#')[0]
    const indentMatch = rawWithoutComment.match(/^\s*/)
    const indent = indentMatch ? indentMatch[0].length : 0
    const line = rawWithoutComment.trim()
    if (!line || invalidLine) return

    const isElseLine = line.startsWith('else')

    // Manage block stack (indentation-based)
    if (isElseLine) {
      while (stack.length > 1 && indent < stack[stack.length - 1].indent) {
        stack.pop()
      }
    } else {
      while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
        stack.pop()
      }
    }

    const parent = stack[stack.length - 1]
    const parentActive = parent.active

    // Handle if statements
    if (line.startsWith('if ') && line.endsWith(':')) {
      const conditionExpr = line.slice(3, -1).trim()
      const conditionValue = parentActive
        ? !!evaluatePythonExpression(conditionExpr, context)
        : false

      stack.push({
        indent,
        active: parentActive && conditionValue,
        kind: 'if',
        conditionTruth: conditionValue
      })
      return
    }

    // Handle else statements (paired with previous if)
    if (line.startsWith('else') && line.endsWith(':')) {
      const previous = stack[stack.length - 1]
      const grandParent = stack[stack.length - 2] || { active: true }
      const previousConditionTrue =
        previous && typeof previous.conditionTruth === 'boolean'
          ? previous.conditionTruth
          : false

      const elseActive = !!grandParent.active && !previousConditionTrue

      stack.push({
        indent,
        active: elseActive,
        kind: 'else',
        conditionTruth: !previousConditionTrue
      })
      return
    }

    // Determine if current line should execute based on active blocks
    const shouldExecute = stack.every(frame => frame.active)
    if (!shouldExecute) {
      return
    }

    // Handle assignments
    const assignmentMatch = line.match(/^([a-zA-Z_]\w*)\s*=\s*(.+)$/)
    if (assignmentMatch) {
      const [, variable, expression] = assignmentMatch
      const evaluated = evaluatePythonExpression(expression.trim(), context)
      if (evaluated !== undefined) {
        context[variable] = evaluated
      }
      return
    }

    // Handle print statements
    if (line.startsWith('print')) {
      const start = line.indexOf('(')
      const end = line.lastIndexOf(')')
      if (start === -1 || end === -1 || end <= start) {
        return
      }
      const args = parsePythonArguments(line.slice(start + 1, end))
      if (!args.length) return
      const evaluatedArgs = args
        .map(arg => evaluatePythonArgument(arg, context))
        .filter(arg => arg.length)
      if (evaluatedArgs.length) {
        outputs.push(evaluatedArgs.join(' '))
      }
      return
    }

    // If we reach this point, the line is not recognized by our simple simulator
    if (!invalidLine) {
      invalidLine = line
    }
  })

  if (invalidLine) {
    return `Error: Unsupported or invalid Python syntax near: ${invalidLine}`
  }

  return outputs.length ? outputs.join('\n') : null
}

const buildPythonContext = (code: string): PythonContext => {
  const context: PythonContext = {}
  const lines = code.split('\n')

  lines.forEach(rawLine => {
    const line = rawLine.split('#')[0].trim()
    if (!line) return

    const assignmentMatch = line.match(/^([a-zA-Z_]\w*)\s*=\s*(.+)$/)
    if (assignmentMatch) {
      const [, variable, expression] = assignmentMatch
      const evaluated = evaluatePythonExpression(expression.trim(), context)
      if (evaluated !== undefined) {
        context[variable] = evaluated
      }
    }
  })

  return context
}

const evaluateNumericExpression = (expression: string, context: PythonContext) => {
  const value = evaluatePythonExpression(expression.trim(), context)
  if (typeof value === 'number') return value
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export default function AdminCourses() {
  const [courses, setCourses] = useState<Course[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [editingCourse, setEditingCourse] = useState<Course | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showUpdateModal, setShowUpdateModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [courseToDelete, setCourseToDelete] = useState<Course | null>(null)
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null)
  const [lessonForm, setLessonForm] = useState({ title: '', description: '', difficulty: 'Beginner' as 'Beginner' | 'Intermediate' | 'Advanced' })
  const [showLevelCodeModal, setShowLevelCodeModal] = useState(false)
  const [selectedLevelMeta, setSelectedLevelMeta] = useState<LevelVariantMeta | null>(null)
  const [levelCode, setLevelCode] = useState('')
  const [levelOutput, setLevelOutput] = useState('')
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null)
  const [isEditMode, setIsEditMode] = useState(false)
  const [lessonToDelete, setLessonToDelete] = useState<Lesson | null>(null)
  const [createdLesson, setCreatedLesson] = useState<Lesson | null>(null) // Store newly created lesson
  const [isLoadingLevelCode, setIsLoadingLevelCode] = useState(false) // Track when loading level code
  const [createDifficultyView, setCreateDifficultyView] = useState<Level['difficulty']>('Easy')
  const [updateDifficultyView, setUpdateDifficultyView] = useState<Level['difficulty']>('Easy')
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [shouldReturnToUpdateModal, setShouldReturnToUpdateModal] = useState(false)
  const [existingLesson, setExistingLesson] = useState<Lesson | null>(null) // Store existing lesson if found
  const [isCheckingLesson, setIsCheckingLesson] = useState(false) // Track when checking for existing lesson
  const [showAddCourseModal, setShowAddCourseModal] = useState(false)
  const [isCreatingCourse, setIsCreatingCourse] = useState(false)
  const [showRemoveLanguageModal, setShowRemoveLanguageModal] = useState(false)
  const [courseToRemove, setCourseToRemove] = useState<Course | null>(null)
  const [newCourseForm, setNewCourseForm] = useState({
    name: '',
    summary: '',
    icon: ''
  })
  const iconFileInputRef = useRef<HTMLInputElement>(null)
  const [failedIcons, setFailedIcons] = useState<Set<string>>(new Set())
  const [outputNotice, setOutputNotice] = useState<{ type: 'success' | 'error' | 'manual'; text: string } | null>(null)
  const [levelValidationStatus, setLevelValidationStatus] = useState<Record<string, 'success' | 'error' | 'manual'>>({})

  const getLevelValidationKey = (meta: LevelVariantMeta | null, courseId?: string | null) => {
    if (!meta) return null
    if (meta.id) return meta.id
    const scopeId = courseId || selectedCourse?.id || editingCourse?.id
    if (!scopeId) return null
    return `${scopeId}-${meta.levelNumber}-${meta.difficulty}`
  }

  const setValidationStatusByKey = (key: string | null, status: 'success' | 'error' | 'manual' | null) => {
    if (!key) return
    setLevelValidationStatus(prev => {
      const next = { ...prev }
      if (status) {
        if (next[key] === status) return prev
        next[key] = status
      } else {
        if (!(key in next)) return prev
        delete next[key]
      }
      return next
    })
  }

  const updateValidationStatusForCurrentLevel = (status: 'success' | 'error' | 'manual' | null) => {
    const key = getLevelValidationKey(selectedLevelMeta, selectedCourse?.id || editingCourse?.id || null)
    setValidationStatusByKey(key, status)
  }

  const transferValidationStatusKey = (oldKey: string | null, newKey: string | null) => {
    if (!oldKey || !newKey || oldKey === newKey) return
    setLevelValidationStatus(prev => {
      if (!(oldKey in prev)) return prev
      const next = { ...prev }
      next[newKey] = next[oldKey]
      delete next[oldKey]
      return next
    })
  }

  // Initialize courses on component mount
  useEffect(() => {
    const loadCourses = async () => {
      await initializeDefaultCourses()
      await resetAllCourseStudentCounts()
      const allCourses = await getAllCourses()
      setCourses(allCourses)
      setFailedIcons(new Set()) // Reset failed icons when courses reload
    }
    loadCourses()
  }, [])

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3000)
  }

  // Helper function to check if a level has code saved
  const levelHasCode = (level: Level | undefined): boolean => {
    return !!(level?.initialCode && level.initialCode.trim().length > 0)
  }

  const hasSyntaxError = outputNotice?.type === 'error'
  const isCodeEmpty = !levelCode.trim()

  // Helper function to validate syntax for all languages
  const validateSyntax = (code: string, language: string): string | null => {
    if (!code.trim()) return null
    
    const syntaxErrors: string[] = []
    const lines = code.split('\n')
    
    // Common validation: Check for invalid text after semicolons (applies to C#, C++, Java, JavaScript, PHP)
    const languagesWithSemicolons = ['csharp', 'c#', 'cs', 'cpp', 'c++', 'java', 'javascript', 'js', 'php']
    if (languagesWithSemicolons.includes(language.toLowerCase())) {
      for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim()
        
        // Skip empty lines and lines that are only comments
        if (!line || line.startsWith('//') || line.startsWith('/*') || line.startsWith('#')) {
          continue
        }
        
        // Remove inline comments
        const commentIndex = line.indexOf('//')
        if (commentIndex !== -1) {
          line = line.substring(0, commentIndex).trim()
        }
        const blockCommentIndex = line.indexOf('/*')
        if (blockCommentIndex !== -1) {
          line = line.substring(0, blockCommentIndex).trim()
        }
        
        // Find the last semicolon on the line
        const lastSemicolonIndex = line.lastIndexOf(';')
        if (lastSemicolonIndex !== -1 && lastSemicolonIndex < line.length - 1) {
          const afterSemicolon = line.substring(lastSemicolonIndex + 1).trim()
          
          // If there's ANY non-whitespace text after semicolon, it's an error
          if (afterSemicolon && afterSemicolon !== '}') {
            const firstTokenMatch = afterSemicolon.match(/^([a-zA-Z_][a-zA-Z0-9_]*)/)
            if (firstTokenMatch) {
              const invalidText = firstTokenMatch[1]
              syntaxErrors.push(`Syntax error: Invalid identifier '${invalidText}' after semicolon. Remove extra text.`)
              break
            } else {
              const nonPunctuationMatch = afterSemicolon.match(/[a-zA-Z0-9_]/)
              if (nonPunctuationMatch) {
                syntaxErrors.push(`Syntax error: Invalid text after semicolon. Remove extra text or add a comment.`)
                break
              }
            }
          }
        }
      }
    }
    
    // Language-specific validations
    if (language === 'csharp' || language === 'c#' || language === 'cs') {
      // C# specific: Check for assignment operator in return/condition
      const assignmentInReturn = code.match(/return\s+[^;]*=\s*[^;=]+;/)
      if (assignmentInReturn && !assignmentInReturn[0].includes('==')) {
        syntaxErrors.push(`Syntax error: Assignment operator '=' used in return statement. Did you mean '==' for comparison?`)
      }
      
      const assignmentInCondition = code.match(/(?:if|while|for|else\s+if)\s*\([^)]*=\s*[^)=]+\)/)
      if (assignmentInCondition && !assignmentInCondition[0].includes('==')) {
        syntaxErrors.push(`Syntax error: Assignment operator '=' used in condition. Did you mean '==' for comparison?`)
      }
    } else if (language === 'java') {
      // Java specific: Check for assignment operator in return/condition
      const assignmentInReturn = code.match(/return\s+[^;]*=\s*[^;=]+;/)
      if (assignmentInReturn && !assignmentInReturn[0].includes('==')) {
        syntaxErrors.push(`Syntax error: Assignment operator '=' used in return statement. Did you mean '==' for comparison?`)
      }
      
      const assignmentInCondition = code.match(/(?:if|while|for|else\s+if)\s*\([^)]*=\s*[^)=]+\)/)
      if (assignmentInCondition && !assignmentInCondition[0].includes('==')) {
        syntaxErrors.push(`Syntax error: Assignment operator '=' used in condition. Did you mean '==' for comparison?`)
      }
    } else if (language === 'cpp' || language === 'c++') {
      // C++ specific: Check for assignment operator in return/condition
      const assignmentInReturn = code.match(/return\s+[^;]*=\s*[^;=]+;/)
      if (assignmentInReturn && !assignmentInReturn[0].includes('==')) {
        syntaxErrors.push(`Syntax error: Assignment operator '=' used in return statement. Did you mean '==' for comparison?`)
      }
      
      const assignmentInCondition = code.match(/(?:if|while|for|else\s+if)\s*\([^)]*=\s*[^)=]+\)/)
      if (assignmentInCondition && !assignmentInCondition[0].includes('==')) {
        syntaxErrors.push(`Syntax error: Assignment operator '=' used in condition. Did you mean '==' for comparison?`)
      }
    } else if (language === 'javascript' || language === 'js') {
      // JavaScript: Check for assignment operator in return/condition (though JS allows it, it's often a mistake)
      // We'll be lenient here since JS allows assignment in conditions, but still check return statements
      const assignmentInReturn = code.match(/return\s+[^;]*=\s*[^;=]+[;}]/)
      if (assignmentInReturn && !assignmentInReturn[0].includes('==') && !assignmentInReturn[0].includes('===')) {
        // This might be intentional in JS, so we'll only warn for obvious mistakes
        if (assignmentInReturn[0].match(/return\s+\w+\s*=\s*\d+[;}]/)) {
          syntaxErrors.push(`Syntax error: Assignment operator '=' used in return statement. Did you mean '==' or '===' for comparison?`)
        }
      }
    } else if (language === 'python' || language === 'py') {
      // Python: Check for assignment operator in conditions (Python doesn't allow assignment in if/while)
      const assignmentInCondition = code.match(/(?:if|while|elif|for)\s+[^:]*=\s*[^:=]+:/)
      if (assignmentInCondition && !assignmentInCondition[0].includes('==')) {
        syntaxErrors.push(`Syntax error: Assignment operator '=' used in condition. Did you mean '==' for comparison?`)
      }
      
      // Python: Check for invalid text after colons (Python uses colons, not semicolons)
      for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim()
        if (!line || line.startsWith('#') || line.startsWith('"""') || line.startsWith("'''")) {
          continue
        }
        
        // Remove inline comments
        const commentIndex = line.indexOf('#')
        if (commentIndex !== -1) {
          line = line.substring(0, commentIndex).trim()
        }
        
        // Check for text after colon that's not part of a valid structure
        const colonIndex = line.lastIndexOf(':')
        if (colonIndex !== -1 && colonIndex < line.length - 1) {
          const afterColon = line.substring(colonIndex + 1).trim()
          // In Python, after a colon we expect either nothing, a comment, or a statement on the same line
          // But random identifiers are invalid
          if (afterColon && !afterColon.startsWith('#') && afterColon !== 'pass' && afterColon !== '...') {
            const invalidMatch = afterColon.match(/^([a-zA-Z_][a-zA-Z0-9_]+)/)
            if (invalidMatch && !['print', 'return', 'if', 'for', 'while', 'def', 'class'].includes(invalidMatch[1])) {
              syntaxErrors.push(`Syntax error: Invalid identifier '${invalidMatch[1]}' after colon. Remove extra text.`)
              break
            }
          }
        }
      }
    } else if (language === 'php') {
      // PHP: Check for assignment operator in return/condition
      const assignmentInReturn = code.match(/return\s+[^;]*=\s*[^;=]+;/)
      if (assignmentInReturn && !assignmentInReturn[0].includes('==') && !assignmentInReturn[0].includes('===')) {
        syntaxErrors.push(`Syntax error: Assignment operator '=' used in return statement. Did you mean '==' or '===' for comparison?`)
      }
      
      const assignmentInCondition = code.match(/(?:if|while|for|elseif)\s*\([^)]*=\s*[^)=]+\)/)
      if (assignmentInCondition && !assignmentInCondition[0].includes('==') && !assignmentInCondition[0].includes('===')) {
        syntaxErrors.push(`Syntax error: Assignment operator '=' used in condition. Did you mean '==' or '===' for comparison?`)
      }
    }
    
    if (syntaxErrors.length > 0) {
      return `Error: ${syntaxErrors[0]}`
    }
    
    return null
  }

  // Function to execute code and get output
  const executeCode = (code: string, language: string): string => {
    if (!code.trim()) return ''
    
    // Validate syntax first
    const validationError = validateSyntax(code, language)
    if (validationError) {
      return validationError
    }
    
    try {
      // For JavaScript, we can execute it directly
      if (language === 'javascript' || language === 'js') {
        const output: string[] = []
        const originalLog = console.log
        const originalError = console.error
        const originalWarn = console.warn
        
        // Capture console methods
        console.log = (...args: any[]) => {
          output.push(args.map(arg => {
            if (arg === null) return 'null'
            if (arg === undefined) return 'undefined'
            if (typeof arg === 'object') {
              try {
                return JSON.stringify(arg, null, 2)
              } catch {
                return String(arg)
              }
            }
            return String(arg)
          }).join(' '))
        }
        console.error = (...args: any[]) => {
          output.push('Error: ' + args.map(arg => {
            if (typeof arg === 'object') {
              try {
                return JSON.stringify(arg, null, 2)
              } catch {
                return String(arg)
              }
            }
            return String(arg)
          }).join(' '))
        }
        console.warn = (...args: any[]) => {
          output.push('Warning: ' + args.map(arg => String(arg)).join(' '))
        }
        
        try {
          // Execute the code as-is (statements)
          const func = new Function(code)
          const result = func()
          
          // If there's a return value and no console output, show the return value
          // This handles cases where code returns a value explicitly
          if (output.length === 0 && result !== undefined && result !== null) {
            if (typeof result === 'object') {
              try {
                output.push(JSON.stringify(result, null, 2))
              } catch {
                output.push(String(result))
              }
            } else {
              output.push(String(result))
            }
          }
          
          // Restore console methods
          console.log = originalLog
          console.error = originalError
          console.warn = originalWarn
          
          return output.length > 0 ? output.join('\n') : ''
        } catch (error: any) {
          // Restore console methods
          console.log = originalLog
          console.error = originalError
          console.warn = originalWarn
          return `Error: ${error.message}`
        }
      }
      
      // For Python, we can't execute it in the browser directly
      // In a real implementation, you'd call a backend API
      if (language === 'python' || language === 'py') {
        const simulatedOutput = simulateSimplePythonExecution(code)
        if (simulatedOutput) {
          return simulatedOutput
        }
        
        // For loop patterns that print repeated characters (like the triangle example)
        if (code.includes('for') && code.includes('print') && code.includes('*')) {
          try {
            const loopMatch = code.match(/for\s+(\w+)\s+in\s+range\s*\(\s*([^,]+)\s*,\s*([^)]+)\)\s*:/)
            const repeatMatch = code.match(/print\(\s*["']([^"']+)["']\s*\*\s*(\w+)\s*\)/)
            
            if (loopMatch && repeatMatch) {
              const iteratorVar = loopMatch[1]
              const startExpr = loopMatch[2]
              const endExpr = loopMatch[3]
              const repeatChar = repeatMatch[1]
              const repeatVar = repeatMatch[2]
              
              if (repeatVar === iteratorVar) {
                const context = buildPythonContext(code)
                const start = evaluateNumericExpression(startExpr, context)
                const end = evaluateNumericExpression(endExpr, context)
                
                if (typeof start === 'number' && typeof end === 'number') {
                  const lines: string[] = []
                  for (let i = start; i < end; i++) {
                    const count = Math.max(0, Math.round(i))
                    lines.push(repeatChar.repeat(count))
                  }
                  if (lines.length) {
                    return lines.join('\n')
                  }
                }
              }
            }
          } catch {
            // Fall through to default message
          }
        }
        
        return '// Python code execution in browser is limited.\n// For full Python execution, a backend service is required.\n// Please enter the expected output manually.'
      }
      
      // For C#, try to simulate Console.WriteLine output
      if (language === 'csharp' || language === 'c#' || language === 'cs') {
        // First, validate basic C# syntax before attempting to parse
        const syntaxErrors: string[] = []
        
        // Check for common syntax errors
        // 1. Assignment operator in return/condition (should be == not =)
        // Check for patterns like "return num % 2 = 0;" or "if (x = 5)"
        const assignmentInReturn = code.match(/return\s+[^;]*=\s*[^;=]+;/)
        if (assignmentInReturn && !assignmentInReturn[0].includes('==')) {
          syntaxErrors.push(`Syntax error: Assignment operator '=' used in return statement. Did you mean '==' for comparison?`)
        }
        
        const assignmentInCondition = code.match(/(?:if|while|for|else\s+if)\s*\([^)]*=\s*[^)=]+\)/)
        if (assignmentInCondition && !assignmentInCondition[0].includes('==')) {
          syntaxErrors.push(`Syntax error: Assignment operator '=' used in condition. Did you mean '==' for comparison?`)
        }
        
        // 2. Check for undefined identifiers (simple check for common patterns)
        const identifierPattern = /\b[a-zA-Z_][a-zA-Z0-9_]*\b/g
        const identifiers = code.match(identifierPattern) || []
        const knownKeywords = new Set([
          'bool', 'int', 'string', 'double', 'float', 'char', 'var', 'void', 'return', 'if', 'else', 'for', 'while',
          'do', 'switch', 'case', 'break', 'continue', 'class', 'public', 'private', 'static', 'Console', 'WriteLine',
          'IsEven', 'true', 'false', 'new', 'List', 'using', 'System', 'namespace'
        ])
        
        // Check for suspicious identifiers that aren't keywords and aren't in variable declarations
        const variableDeclarations = new Set<string>()
        const varDeclPattern = /(?:int|string|double|bool|var|List<\w+>|float|char)\s+(\w+)/g
        let varMatch
        while ((varMatch = varDeclPattern.exec(code)) !== null) {
          variableDeclarations.add(varMatch[1])
        }
        
        // Also extract function names and parameters
        const functionPattern = /(?:bool|int|string|double|void|float|char|static)\s+(\w+)\s*\(/g
        let funcMatch
        while ((funcMatch = functionPattern.exec(code)) !== null) {
          variableDeclarations.add(funcMatch[1])
        }
        
        // Extract function parameters
        const paramPattern = /\([^)]*?(?:int|string|double|bool|float|char)\s+(\w+)/g
        let paramMatch
        while ((paramMatch = paramPattern.exec(code)) !== null) {
          variableDeclarations.add(paramMatch[1])
        }
        
        // Check for function calls to undefined functions
        const functionCallPattern = /\b(\w+)\s*\(/g
        let callMatch
        const functionCalls = new Set<string>()
        while ((callMatch = functionCallPattern.exec(code)) !== null) {
          const funcName = callMatch[1]
          // Skip known methods and keywords
          if (!knownKeywords.has(funcName) && 
              funcName !== 'Console' && 
              funcName !== 'System' &&
              !variableDeclarations.has(funcName)) {
            functionCalls.add(funcName)
          }
        }
        
        // If we found function calls to undefined functions, add error
        for (const funcName of functionCalls) {
          // Check if it's actually a function call (not part of Console.WriteLine)
          const funcCallRegex = new RegExp(`\\b${funcName}\\s*\\(`, 'g')
          let callPos
          while ((callPos = funcCallRegex.exec(code)) !== null) {
            const beforeCall = code.substring(Math.max(0, callPos.index - 20), callPos.index).trim()
            // Skip if it's Console.WriteLine or similar
            if (!beforeCall.endsWith('Console.') && !beforeCall.endsWith('System.')) {
              // This might be an undefined function call, but we'll be lenient
              // Only flag if it's clearly not a valid pattern
              if (funcName.length > 2 && !code.includes(`bool ${funcName}`) && 
                  !code.includes(`int ${funcName}`) && !code.includes(`void ${funcName}`)) {
                // Check if it appears as a standalone call
                const lineStart = code.lastIndexOf('\n', callPos.index)
                const lineEnd = code.indexOf('\n', callPos.index)
                const line = code.substring(lineStart + 1, lineEnd === -1 ? code.length : lineEnd).trim()
                if (line.includes(`${funcName}(`) && !line.match(/Console\.|System\./)) {
                  // This is likely an undefined function call
                  // But don't add error yet - let the undefined identifier check handle it
                }
              }
            }
          }
        }
        
        // Check for undefined identifiers in expressions
        // Use a Set to avoid duplicates
        const uniqueIdentifiers = Array.from(new Set(identifiers))
        for (const identifier of uniqueIdentifiers) {
          if (knownKeywords.has(identifier) || 
              variableDeclarations.has(identifier) ||
              identifier.match(/^\d+$/) || // numbers
              identifier.length <= 1) { // ignore single letters which might be loop variables
            continue
          }
          
          // Find all occurrences of this identifier
          const regex = new RegExp(`\\b${identifier}\\b`, 'g')
          let match
          const positions: number[] = []
          while ((match = regex.exec(code)) !== null) {
            positions.push(match.index)
          }
          
          // Check each occurrence
          for (const pos of positions) {
            const beforeContext = code.substring(Math.max(0, pos - 30), pos)
            const afterContext = code.substring(pos + identifier.length, Math.min(code.length, pos + identifier.length + 20))
            const beforeTrim = beforeContext.trim()
            const afterTrim = afterContext.trim()
            
            // Skip if it's part of a declaration
            if (beforeTrim.match(/(?:int|string|double|bool|var|List|float|char|void|static)\s+$/)) {
              continue
            }
            
            // Skip if it's part of Console.WriteLine or System
            if (beforeTrim.endsWith('Console.') || beforeTrim.endsWith('System.')) {
              continue
            }
            
            // Skip if it's a method call on an object
            if (beforeTrim.endsWith('.')) {
              continue
            }
            
            // Check if it's used as a standalone identifier
            // Look for patterns like: "identifier;" or "identifier)" or just "identifier" at end of line
            if (afterTrim.match(/^[;)\s,]/) || afterTrim === '' || afterTrim.startsWith('\n')) {
              // Get the line containing this identifier
              const lineStart = code.lastIndexOf('\n', pos)
              const lineEnd = code.indexOf('\n', pos)
              const line = code.substring(lineStart + 1, lineEnd === -1 ? code.length : lineEnd).trim()
              
              // If the identifier is alone on a line or at the end of a statement, it's likely an error
              // Also check if it's not part of a function call pattern
              const isStandalone = line === identifier || 
                                  (line.endsWith(identifier) && !line.match(/Console\.WriteLine\s*\(/)) ||
                                  (line.includes(identifier) && !line.match(/Console\.|System\./) && 
                                   !line.match(/\w+\s*\(/) && // not a function call
                                   (line.endsWith(';') || line.endsWith(identifier)))
              
              if (isStandalone) {
                syntaxErrors.push(`Syntax error: Undefined identifier '${identifier}'`)
                break // Only report first undefined identifier
              }
            }
          }
          
          if (syntaxErrors.length > 0) break
        }
        
        // 3. Check for invalid text after semicolons (like "sadssadsad" after ";")
        // This is a critical check - any text after a semicolon (except comments) is invalid
        const lines = code.split('\n')
        for (let i = 0; i < lines.length; i++) {
          const originalLine = lines[i]
          let line = originalLine.trim()
          
          // Skip empty lines and lines that are only comments
          if (!line || line.startsWith('//') || line.startsWith('/*')) {
            continue
          }
          
          // Remove inline comments to check the actual code
          const commentIndex = line.indexOf('//')
          if (commentIndex !== -1) {
            line = line.substring(0, commentIndex).trim()
          }
          const blockCommentIndex = line.indexOf('/*')
          if (blockCommentIndex !== -1) {
            line = line.substring(0, blockCommentIndex).trim()
          }
          
          // Find the last semicolon on the line (in case there are multiple)
          const lastSemicolonIndex = line.lastIndexOf(';')
          if (lastSemicolonIndex !== -1 && lastSemicolonIndex < line.length - 1) {
            const afterSemicolon = line.substring(lastSemicolonIndex + 1).trim()
            
            // If there's ANY non-whitespace text after semicolon, it's an error
            // (except for closing braces which might be on the same line)
            if (afterSemicolon && afterSemicolon !== '}') {
              // Extract the first token/identifier after semicolon
              const firstTokenMatch = afterSemicolon.match(/^([a-zA-Z_][a-zA-Z0-9_]*)/)
              if (firstTokenMatch) {
                const invalidText = firstTokenMatch[1]
                // Check if it's a known keyword (unlikely but possible)
                if (!knownKeywords.has(invalidText) && 
                    !variableDeclarations.has(invalidText)) {
                  syntaxErrors.push(`Syntax error: Invalid identifier '${invalidText}' after semicolon. Remove extra text.`)
                  break
                }
              } else {
                // Even if it doesn't match identifier pattern, any text after semicolon is suspicious
                // Check if it's just punctuation (like closing braces)
                const nonPunctuationMatch = afterSemicolon.match(/[a-zA-Z0-9_]/)
                if (nonPunctuationMatch) {
                  syntaxErrors.push(`Syntax error: Invalid text after semicolon. Remove extra text or add a comment.`)
                  break
                }
              }
            }
          }
          
          // Also check for identifiers that appear to be standalone at the end of lines
          // This catches cases like: "statement; identifier" where identifier is clearly invalid
          if (line) {
            // Check if line ends with an identifier that's not part of a valid statement
            const trailingIdentifierMatch = line.match(/\b([a-zA-Z_][a-zA-Z0-9_]+)\s*$/)
            if (trailingIdentifierMatch) {
              const trailingId = trailingIdentifierMatch[1]
              // If the line has a semicolon and this identifier comes after it
              if (line.includes(';')) {
                const semicolonPos = line.lastIndexOf(';')
                const idPos = line.lastIndexOf(trailingId)
                if (idPos > semicolonPos) {
                  // Identifier appears after semicolon
                  if (!knownKeywords.has(trailingId) && 
                      !variableDeclarations.has(trailingId)) {
                    syntaxErrors.push(`Syntax error: Invalid identifier '${trailingId}' after statement. Remove extra text.`)
                    break
                  }
                }
              }
            }
          }
        }
        
        // 4. Check for missing semicolons (basic check)
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim()
          // Skip empty lines, comments, braces, and control structures
          if (!line || line.startsWith('//') || line.startsWith('/*') || 
              line === '{' || line === '}' ||
              line.match(/^(if|else|for|while|do|switch|case|break|continue|return)\s*\(?/)) {
            continue
          }
          // Check if line should end with semicolon but doesn't
          if (line.match(/[^;{}]\s*$/) && 
              !line.match(/(?:if|else|for|while|do|switch|case)\s*\(/) &&
              line.includes('=') && !line.endsWith(';')) {
            // This is a warning, not a hard error, so we'll be lenient
          }
        }
        
        // If we found syntax errors, return error message
        if (syntaxErrors.length > 0) {
          return `Error: ${syntaxErrors[0]}`
        }
        
        const outputs: string[] = []
        // Normalize code: remove carriage returns and collapse whitespace
        let normalizedCode = code.replace(/\r/g, '').trim()
        // Join lines that might be split
        normalizedCode = normalizedCode.replace(/(\w+)\s*\n\s*\(/g, '$1(')
        
        // Build context from variable assignments
        const context: Record<string, any> = {}
        const assignMatches = normalizedCode.match(/(?:int|string|double|bool|var|List<\w+>)\s+(\w+)\s*=\s*([^;]+);/g)
        if (assignMatches) {
          assignMatches.forEach(assign => {
            const varMatch = assign.match(/(?:int|string|double|bool|var|List<\w+>)\s+(\w+)\s*=\s*(.+);/)
            if (varMatch) {
              const varName = varMatch[1]
              let value = varMatch[2].trim()
              // Try to parse the value
              if (value.match(/^['"](.*)['"]$/)) {
                context[varName] = value.slice(1, -1) // Remove quotes
              } else if (value === 'true' || value === 'false') {
                context[varName] = value === 'true'
              } else if (!isNaN(Number(value)) && value.trim() !== '') {
                context[varName] = Number(value)
              } else if (value.startsWith('new List')) {
                context[varName] = []
              } else {
                context[varName] = value
              }
            }
          })
        }
        
        // Extract Console.WriteLine statements
        const writeLineMatches = normalizedCode.match(/Console\.WriteLine\s*\([^)]+\)/g)
        if (writeLineMatches) {
          writeLineMatches.forEach(match => {
            // Extract string literals from Console.WriteLine
            const stringMatch = match.match(/Console\.WriteLine\s*\(\s*['"]([^'"]+)['"]\s*\)/)
            if (stringMatch) {
              outputs.push(stringMatch[1])
            } else {
              // Try to extract interpolated strings or expressions
              const exprMatch = match.match(/Console\.WriteLine\s*\(([^)]+)\)/)
              if (exprMatch) {
                const expr = exprMatch[1].trim()
                
                // Handle string interpolation like $"Hello, {name}!"
                if (expr.startsWith('$"') || expr.startsWith('@"') || expr.startsWith("$'") || expr.startsWith("@'")) {
                  const cleaned = expr.replace(/^[$@]?["']|["']$/g, '')
                  // Replace variables in interpolated string
                  let result = cleaned.replace(/\{(\w+)\}/g, (match, varName) => {
                    if (context[varName] !== undefined) {
                      return String(context[varName])
                    }
                              return match
                            })
                  outputs.push(result)
                } 
                // Handle string concatenation like "Name: " + name
                else if (expr.includes('+')) {
                  try {
                    const parts = expr.split('+').map(p => p.trim())
                    let result = ''
                    for (const part of parts) {
                      // Check if it's a string literal
                      const stringLit = part.match(/^['"]([^'"]+)['"]$/)
                      if (stringLit) {
                        result += stringLit[1]
                      } else {
                        // Check if it's a variable
                        const varName = part.trim()
                        if (context[varName] !== undefined) {
                          result += String(context[varName])
                        } else {
                          // Try to evaluate as expression
                          try {
                            if (varName.match(/^[\d\s+\-*/().]+$/)) {
                              result += String(Function(`"use strict"; return (${varName})`)())
                            } else {
                              result += varName
                            }
                          } catch {
                            result += varName
                          }
                        }
                      }
                    }
                    outputs.push(result)
                  } catch {
                    outputs.push(expr)
                  }
                } 
                else {
                  // Try to evaluate simple expressions
                  try {
                    if (expr.match(/^[\d\s+\-*/().]+$/)) {
                      const result = Function(`"use strict"; return (${expr})`)()
                      outputs.push(String(result))
                    } else if (context[expr] !== undefined) {
                      outputs.push(String(context[expr]))
                    } else {
                      outputs.push(expr)
                    }
                  } catch {
                    if (context[expr] !== undefined) {
                      outputs.push(String(context[expr]))
                    } else {
                    outputs.push(expr)
                    }
                  }
                }
              }
            }
          })
        }
        
        // If we found Console.WriteLine statements, return the output
        if (outputs.length > 0) {
          return outputs.join('\n')
        }
        
        // For nested loops with Console.WriteLine, try to simulate
        if (code.includes('for') && code.includes('Console.WriteLine') && code.match(/for\s*\(/g)?.length >= 2) {
          try {
            const lines: string[] = []
            // Extract all for loops
            const allLoops = code.match(/for\s*\(\s*int\s+(\w+)\s*=\s*(\d+);\s*\1\s*([<>=!]+)\s*(\d+);\s*\1\+\+\s*\)/g)
            
            if (allLoops && allLoops.length >= 2) {
              // Parse outer loop
              const outerLoopMatch = allLoops[0].match(/for\s*\(\s*int\s+(\w+)\s*=\s*(\d+);\s*\1\s*([<>=!]+)\s*(\d+);\s*\1\+\+\s*\)/)
              // Parse inner loop
              const innerLoopMatch = allLoops[1].match(/for\s*\(\s*int\s+(\w+)\s*=\s*(\d+);\s*\1\s*([<>=!]+)\s*(\d+);\s*\1\+\+\s*\)/)
              
              if (outerLoopMatch && innerLoopMatch) {
                const outerVar = outerLoopMatch[1]
                const outerStart = parseInt(outerLoopMatch[2])
                const outerOp = outerLoopMatch[3]
                const outerEnd = parseInt(outerLoopMatch[4])
                
                const innerVar = innerLoopMatch[1]
                const innerStart = parseInt(innerLoopMatch[2])
                const innerOp = innerLoopMatch[3]
                const innerEnd = parseInt(innerLoopMatch[4])
                
                // Extract the template from Console.WriteLine
                const templateMatch = code.match(/Console\.WriteLine\s*\(([^)]+)\)/)
                if (templateMatch) {
                  const template = templateMatch[1].trim()
                  
                  // Determine loop bounds
                  const outerEndValue = outerOp === '<' ? outerEnd : (outerOp === '<=' ? outerEnd + 1 : outerEnd)
                  const innerEndValue = innerOp === '<=' ? innerEnd + 1 : (innerOp === '<' ? innerEnd : innerEnd + 1)
                  
                  // Simulate nested loops
                  for (let i = outerStart; i < outerEndValue; i++) {
                    for (let j = innerStart; j < innerEndValue; j++) {
                      // Replace variables in template (handle both ${var} and {var} syntax)
                      let line = template
                        .replace(/\$\{(\w+)\}/g, (match, varName) => {
                          if (varName === outerVar) return String(i)
                          if (varName === innerVar) return String(j)
                          return match
                        })
                        .replace(/\{(\w+)\}/g, (match, varName) => {
                          if (varName === outerVar) return String(i)
                          if (varName === innerVar) return String(j)
                          return match
                        })
                        .replace(/^[$@]?["']|["']$/g, '')
                      lines.push(line)
                    }
                  }
                  
                  if (lines.length > 0) {
                    return lines.join('\n')
                  }
                }
              }
            }
          } catch (error) {
            console.error('Error simulating C# nested loops:', error)
            // Fall through
          }
        }
        
        return '// C# code execution in browser is limited.\n// For full C# execution, a backend service is required.\n// Please enter the expected output manually.'
      }
      
      // For C++, try to extract cout statements
      if (language === 'cpp' || language === 'c++') {
        const outputs: string[] = []
        let normalizedCode = code.replace(/\r/g, '').trim()
        
        // Build context from variable assignments
        const context: Record<string, any> = {}
        const assignMatches = normalizedCode.match(/(?:int|string|double|bool|float|char)\s+(\w+)\s*=\s*([^;]+);/g)
        if (assignMatches) {
          assignMatches.forEach(assign => {
            const varMatch = assign.match(/(?:int|string|double|bool|float|char)\s+(\w+)\s*=\s*(.+);/)
            if (varMatch) {
              const varName = varMatch[1]
              let value = varMatch[2].trim()
              if (value.match(/^['"](.*)['"]$/)) {
                context[varName] = value.slice(1, -1)
              } else if (value === 'true' || value === 'false') {
                context[varName] = value === 'true'
              } else if (!isNaN(Number(value)) && value.trim() !== '') {
                context[varName] = Number(value)
              } else {
                context[varName] = value
              }
            }
          })
        }
        
        // Extract cout statements (handle << operator)
        const coutPattern = /cout\s*<<\s*([^;]+);/g
        let match
        while ((match = coutPattern.exec(normalizedCode)) !== null) {
          const expr = match[1].trim()
          // Split by << to handle multiple outputs
          const parts = expr.split('<<').map(p => p.trim())
          let result = ''
          for (const part of parts) {
            // Check for string literals
            const stringMatch = part.match(/^['"]([^'"]+)['"]$/)
            if (stringMatch) {
              result += stringMatch[1]
            } else if (part === 'endl' || part === 'std::endl') {
              // Skip endl, it's just a newline
              continue
            } else {
              // Check if it's a variable
              const varName = part.replace(/std::/g, '').trim()
              if (context[varName] !== undefined) {
                result += String(context[varName])
              } else {
                result += part
              }
            }
          }
          if (result) outputs.push(result)
        }
        
          if (outputs.length > 0) {
            return outputs.join('\n')
        }
        return '// C++ code execution in browser is limited.\n// For full C++ execution, a backend service is required.\n// Please enter the expected output manually.'
      }
      
      // For Java, try to extract System.out.println statements
      if (language === 'java') {
        const outputs: string[] = []
        let normalizedCode = code.replace(/\r/g, '').trim()
        normalizedCode = normalizedCode.replace(/(\w+)\s*\n\s*\(/g, '$1(')
        
        // Build context from variable assignments
        const context: Record<string, any> = {}
        const assignMatches = normalizedCode.match(/(?:int|String|double|boolean|float|char)\s+(\w+)\s*=\s*([^;]+);/g)
        if (assignMatches) {
          assignMatches.forEach(assign => {
            const varMatch = assign.match(/(?:int|String|double|boolean|float|char)\s+(\w+)\s*=\s*(.+);/)
            if (varMatch) {
              const varName = varMatch[1]
              let value = varMatch[2].trim()
              if (value.match(/^['"](.*)['"]$/)) {
                context[varName] = value.slice(1, -1)
              } else if (value === 'true' || value === 'false') {
                context[varName] = value === 'true'
              } else if (!isNaN(Number(value)) && value.trim() !== '') {
                context[varName] = Number(value)
              } else {
                context[varName] = value
              }
            }
          })
        }
        
        // Extract System.out.println statements
        const printlnPattern = /System\.out\.println\s*\(\s*([^)]+)\s*\)/g
        let match
        while ((match = printlnPattern.exec(normalizedCode)) !== null) {
          const expr = match[1].trim()
          
          // Extract string literals
          const stringMatch = expr.match(/^['"]([^'"]+)['"]$/)
            if (stringMatch) {
              outputs.push(stringMatch[1])
            continue
          }
          
          // Handle string concatenation like "Name: " + name
          if (expr.includes('+')) {
            try {
              const parts = expr.split('+').map(p => p.trim())
              let result = ''
              for (const part of parts) {
                const stringLit = part.match(/^['"]([^'"]+)['"]$/)
                if (stringLit) {
                  result += stringLit[1]
                } else {
                  const varName = part.trim()
                  if (context[varName] !== undefined) {
                    result += String(context[varName])
                  } else {
                    try {
                      if (varName.match(/^[\d\s+\-*/().]+$/)) {
                        result += String(Function(`"use strict"; return (${varName})`)())
                      } else {
                        result += varName
                      }
                    } catch {
                      result += varName
                    }
                  }
                }
              }
              outputs.push(result)
              continue
            } catch {
              // Fall through
            }
          }
          
          // Try variable lookup or expression
          try {
            if (expr.match(/^[\d\s+\-*/().]+$/)) {
              const result = Function(`"use strict"; return (${expr})`)()
              outputs.push(String(result))
            } else if (context[expr] !== undefined) {
              outputs.push(String(context[expr]))
            } else {
              outputs.push(expr)
            }
          } catch {
            if (context[expr] !== undefined) {
              outputs.push(String(context[expr]))
            } else {
              outputs.push(expr)
            }
          }
        }
        
          if (outputs.length > 0) {
            return outputs.join('\n')
        }
        return '// Java code execution in browser is limited.\n// For full Java execution, a backend service is required.\n// Please enter the expected output manually.'
      }
      
      // For PHP, try to extract echo/print statements
      if (language === 'php') {
        const outputs: string[] = []
        let normalizedCode = code.replace(/\r/g, '').trim()
        // Remove PHP tags
        normalizedCode = normalizedCode.replace(/^<\?php\s*|\s*\?>$/g, '')
        
        // Build context from variable assignments
        const context: Record<string, any> = {}
        const assignMatches = normalizedCode.match(/\$(\w+)\s*=\s*([^;]+);/g)
        if (assignMatches) {
          assignMatches.forEach(assign => {
            const varMatch = assign.match(/\$(\w+)\s*=\s*(.+);/)
            if (varMatch) {
              const varName = varMatch[1]
              let value = varMatch[2].trim()
              if (value.match(/^['"](.*)['"]$/)) {
                context[varName] = value.slice(1, -1)
              } else if (value === 'true' || value === 'false') {
                context[varName] = value === 'true'
              } else if (!isNaN(Number(value)) && value.trim() !== '') {
                context[varName] = Number(value)
              } else {
                context[varName] = value
              }
            }
          })
        }
        
        // Extract echo/print statements
        const echoPattern = /(?:echo|print)\s+([^;]+);/g
        let match
        while ((match = echoPattern.exec(normalizedCode)) !== null) {
          const expr = match[1].trim()
          
          // Extract string literals
          const stringMatch = expr.match(/^['"]([^'"]+)['"]$/)
            if (stringMatch) {
              outputs.push(stringMatch[1])
            continue
          }
          
          // Handle string concatenation with . operator
          if (expr.includes('.')) {
            try {
              const parts = expr.split('.').map(p => p.trim().replace(/^['"]|['"]$/g, ''))
              let result = ''
              for (const part of parts) {
                // Check if it's a variable (starts with $)
                if (part.startsWith('$')) {
                  const varName = part.slice(1)
                  if (context[varName] !== undefined) {
                    result += String(context[varName])
                  } else {
                    result += part
                  }
                } else {
                  result += part
                }
              }
              outputs.push(result)
              continue
            } catch {
              // Fall through
            }
          }
          
          // Handle variable reference
          if (expr.startsWith('$')) {
            const varName = expr.slice(1)
            if (context[varName] !== undefined) {
              outputs.push(String(context[varName]))
            } else {
              outputs.push(expr)
            }
          } else {
            outputs.push(expr)
          }
        }
        
          if (outputs.length > 0) {
            return outputs.join('\n')
        }
        return '// PHP code execution in browser is limited.\n// For full PHP execution, a backend service is required.\n// Please enter the expected output manually.'
      }
      
      // For MySQL, return placeholder
      if (language === 'mysql') {
        return '// MySQL query execution in browser is not supported.\n// Please enter the expected output manually.'
      }
      
      // For other languages, return placeholder
      return `// Code execution for ${language} is not yet implemented.\n// Please enter the expected output manually.`
    } catch (error: any) {
      return `Error: ${error.message}`
    }
  }

  // Track if output was manually edited
  const outputManuallyEdited = useRef(false)
  
  // Auto-execute code when it changes and update expected output
  useEffect(() => {
    if (!showLevelCodeModal) {
      setOutputNotice(null)
      outputManuallyEdited.current = false
      return
    }
  }, [showLevelCodeModal])

  useEffect(() => {
    if (!showLevelCodeModal || !levelCode.trim()) {
      setOutputNotice(null)
      updateValidationStatusForCurrentLevel(null)
      return
    }
    
    // Get the current course to determine language
    const currentCourse = selectedCourse || editingCourse
    if (!currentCourse) return
    
    // Determine language from course name (not ID, since ID is a UUID)
    // Also check course ID as fallback for courses that might still use string IDs
    const courseName = currentCourse.name.toLowerCase()
    const courseId = currentCourse.id.toLowerCase()
    
    // Map course names to language identifiers
    let language = courseName
    if (courseName.includes('python')) language = 'python'
    else if (courseName.includes('javascript') || courseName.includes('js')) language = 'javascript'
    else if (courseName.includes('java')) language = 'java'
    else if (courseName.includes('c++') || courseName.includes('cpp')) language = 'cpp'
    else if (courseName.includes('c#') || courseName.includes('csharp')) language = 'csharp'
    else if (courseName.includes('php')) language = 'php'
    else if (courseName.includes('mysql')) language = 'mysql'
    // Fallback: check if courseId is a known language (for courses with string IDs)
    else if (courseId === 'python' || courseId === 'py') language = 'python'
    else if (courseId === 'javascript' || courseId === 'js') language = 'javascript'
    
    const isExecutionError = (output: string) => {
      return output.startsWith('//') || output.startsWith('Error')
    }
    
    // Small delay to avoid executing on every keystroke
    const timeoutId = setTimeout(() => {
      const output = executeCode(levelCode, language)
      
      if (output && !isExecutionError(output)) {
        if (!levelOutput || !outputManuallyEdited.current) {
          setLevelOutput(output)
          outputManuallyEdited.current = false // Reset flag after auto-update
        }
        setOutputNotice({ type: 'success', text: 'Syntax looks good. Output generated automatically.' })
        updateValidationStatusForCurrentLevel('success')
      } else if (output && isExecutionError(output)) {
        if (output.startsWith('Error: Unsupported or invalid Python syntax near:')) {
          setOutputNotice({
            type: 'error',
            text: 'Syntax not supported. Please fix the code.'
          })
        } else if (output.startsWith('Error: Syntax error:')) {
          // Show the actual syntax error message
          const errorMessage = output.replace(/^Error:\s*/, '')
          setOutputNotice({
            type: 'error',
            text: errorMessage
          })
        } else {
          setOutputNotice({
            type: 'error',
            text: output.startsWith('Error:') ? output.replace(/^Error:\s*/, '') : 'Could not auto-generate output. Please verify your code.'
          })
        }
        if (!outputManuallyEdited.current) {
          setLevelOutput('')
        }
        updateValidationStatusForCurrentLevel('error')
      } else {
        setOutputNotice(null)
        updateValidationStatusForCurrentLevel(null)
      }
    }, 500) // 500ms debounce
    
    return () => clearTimeout(timeoutId)
  }, [levelCode, showLevelCodeModal, selectedCourse, editingCourse])
  
  // Reset manual edit flag when modal opens/closes
  useEffect(() => {
    if (showLevelCodeModal) {
      outputManuallyEdited.current = false
    }
  }, [showLevelCodeModal])

  const difficultyVariants: Array<{ difficulty: Level['difficulty']; label: string }> = [
    { difficulty: 'Easy', label: 'Easy Mode' },
    { difficulty: 'Medium', label: 'Medium Mode' },
    { difficulty: 'Hard', label: 'Hard Mode' }
  ]

  const variantOrder: Record<Level['difficulty'], number> = {
    Easy: 0,
    Medium: 1,
    Hard: 2
  }

  const levelBlueprints: LevelVariantMeta[][] = Array.from({ length: 10 }, (_, idx) =>
    difficultyVariants.map((variant, variantIdx) => ({
      levelNumber: idx + 1,
      difficulty: variant.difficulty,
      label: variant.label,
      points: 20, // All lesson levels give 20 EXP
      title: `Level ${idx + 1} - ${variant.label}`
    }))
  )

  const updateNewCourseField = (field: 'name' | 'summary' | 'icon', value: string) => {
    setNewCourseForm(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleLanguageNameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    updateNewCourseField('name', event.target.value)
  }

  const handleSummaryChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    updateNewCourseField('summary', event.target.value)
  }

  const handleIconPathChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    updateNewCourseField('icon', event.target.value)
  }

  const handleBrowseIcon = () => {
    iconFileInputRef.current?.click()
  }

  const handleIconFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        showMessage('error', 'Please select an image file')
        if (iconFileInputRef.current) {
          iconFileInputRef.current.value = ''
        }
        return
      }

      // Validate file size (5MB max)
      if (file.size > 5 * 1024 * 1024) {
        showMessage('error', 'File size must be less than 5MB')
        if (iconFileInputRef.current) {
          iconFileInputRef.current.value = ''
        }
        return
      }

      setIsLoading(true)
      try {
        // Upload the file to the server
        const { api } = await import('../utils/api')
        const result = await api.uploadIcon(file)
        
        if (result.success && result.path) {
          updateNewCourseField('icon', result.path)
          showMessage('success', 'Icon uploaded successfully!')
        } else {
          showMessage('error', 'Failed to upload icon')
        }
      } catch (error: any) {
        console.error('Error uploading icon:', error)
        showMessage('error', error.message || 'Failed to upload icon')
      } finally {
        setIsLoading(false)
        // Reset the input so the same file can be selected again if needed
        if (iconFileInputRef.current) {
          iconFileInputRef.current.value = ''
        }
      }
    }
  }

  const handleCreateLanguage = async (
    event?: React.FormEvent<HTMLFormElement> | React.MouseEvent<HTMLButtonElement>
  ) => {
    event?.preventDefault()
    if (!newCourseForm.name.trim() || !newCourseForm.summary.trim() || !newCourseForm.icon.trim()) {
      showMessage('error', 'Please complete all fields before creating a new language.')
      return
    }

    setIsCreatingCourse(true)
    try {
      const result = await createCourse({
        name: newCourseForm.name.trim(),
        summary: newCourseForm.summary.trim(),
        icon: newCourseForm.icon.trim(),
        status: 'Active',
        students: 0
      })

      if (result.success) {
        const allCourses = await getAllCourses()
        setCourses(allCourses)
        setFailedIcons(new Set()) // Reset failed icons when courses are updated
        showMessage('success', `${newCourseForm.name.trim()} course created successfully!`)
        setShowAddCourseModal(false)
        setNewCourseForm({
          name: '',
          summary: '',
          icon: ''
        })
        if (iconFileInputRef.current) {
          iconFileInputRef.current.value = ''
        }
      } else {
        showMessage('error', result.error || 'Failed to create course')
      }
    } catch (error) {
      console.error('Error creating course:', error)
      showMessage('error', 'Failed to create course')
    } finally {
      setIsCreatingCourse(false)
    }
  }

  const handleCreateCourse = (course: Course) => {
    setSelectedCourse(course)
    setShowCreateModal(true)
    setLessonForm({ title: '', description: '', difficulty: 'Beginner' })
    setCreateDifficultyView('Easy')
    setCreatedLesson(null) // Reset created lesson
    setExistingLesson(null) // Reset existing lesson
  }

  const handleLessonSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedCourse) return

    setIsLoading(true)
    
    // If existing lesson was found, use it instead of creating a new one
    if (existingLesson) {
      // Just load the existing lesson - don't create a duplicate
      setCreatedLesson(existingLesson)
      const allCourses = await getAllCourses()
      setCourses(allCourses)
      showMessage('success', `Loaded existing lesson "${existingLesson.title}". You can now add Medium and Hard mode levels.`)
      setIsLoading(false)
      return
    }
    
    // Create new lesson if it doesn't exist
    const result = await createLesson(selectedCourse.id, lessonForm)
    
    if (result.success && result.lesson) {
      // Store the created lesson so we can find level IDs
      setCreatedLesson(result.lesson)
      const allCourses = await getAllCourses()
      setCourses(allCourses)
      showMessage('success', `Lesson "${lessonForm.title}" created successfully! You can now add code to levels.`)
      // Don't close the modal yet - allow user to add code to levels
      // Don't clear the form yet - keep the title and description visible while user adds code
      // setShowCreateModal(false)
      // setSelectedCourse(null)
      // setLessonForm({ title: '', description: '' }) // Don't clear - user might want to see what they entered
      // setCreateDifficultyView('Easy') // Keep current difficulty view
    } else {
      // If creation failed because lesson already exists, try to load it
      if (result.error && result.error.includes('already exists')) {
        try {
          const lessons = await getLessonsByCourseId(selectedCourse.id)
          const foundLesson = lessons.find(l => l.title.toLowerCase() === lessonForm.title.trim().toLowerCase())
          if (foundLesson) {
            setExistingLesson(foundLesson)
            setCreatedLesson(foundLesson)
            setLessonForm(prev => ({
              ...prev,
              title: foundLesson.title,
              description: foundLesson.description,
              difficulty: foundLesson.difficulty || 'Beginner'
            }))
            showMessage('success', `Found existing lesson "${foundLesson.title}". You can now add Medium and Hard mode levels.`)
          } else {
            showMessage('error', result.error || 'Failed to create lesson')
          }
        } catch (error) {
          showMessage('error', result.error || 'Failed to create lesson')
        }
      } else {
        showMessage('error', result.error || 'Failed to create lesson')
      }
    }
    
    setIsLoading(false)
  }

  // Debounce timer for checking existing lessons
  const checkLessonTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  
  const handleLessonInputChange = async (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setLessonForm(prev => ({ ...prev, [name]: value }))
    
    // Check if lesson with same title exists when title is being typed (with debounce)
    if (name === 'title' && value.trim() && selectedCourse && !createdLesson) {
      // Clear previous timeout
      if (checkLessonTimeoutRef.current) {
        clearTimeout(checkLessonTimeoutRef.current)
      }
      
      // Set new timeout to check after user stops typing (500ms delay)
      checkLessonTimeoutRef.current = setTimeout(async () => {
        setIsCheckingLesson(true)
        try {
          // Get all lessons for this course
          const lessons = await getLessonsByCourseId(selectedCourse.id)
          // Find lesson with matching title (case-insensitive)
          const foundLesson = lessons.find(l => l.title.toLowerCase() === value.trim().toLowerCase())
          
          if (foundLesson) {
            // Load existing lesson data
            setExistingLesson(foundLesson)
            setLessonForm(prev => ({
              ...prev,
              title: foundLesson.title,
              description: foundLesson.description,
              difficulty: foundLesson.difficulty || 'Beginner'
            }))
            // Load the existing lesson's levels
            setCreatedLesson(foundLesson)
            showMessage('success', `Found existing lesson "${foundLesson.title}". You can now add Medium and Hard mode levels.`)
          } else {
            // No existing lesson found
            setExistingLesson(null)
            if (createdLesson && createdLesson.title.toLowerCase() !== value.trim().toLowerCase()) {
              // User changed the title to something different, clear the created lesson
              setCreatedLesson(null)
            }
          }
        } catch (error) {
          console.error('Error checking for existing lesson:', error)
        } finally {
          setIsCheckingLesson(false)
        }
      }, 500) // Wait 500ms after user stops typing
    }
  }

  const handleUpdateCourse = async (course: Course) => {
    // Reload course with latest data from database
    const updatedCourse = await getCourseById(course.id) || course
    setEditingCourse(updatedCourse)
    setShowUpdateModal(true)
    setUpdateDifficultyView('Easy')
  }

  const handleDeleteCourse = (course: Course) => {
    setCourseToDelete(course)
    setShowDeleteModal(true)
  }

  const handleRemoveLanguage = (course: Course) => {
    setCourseToRemove(course)
  }

  const confirmRemoveLanguage = async () => {
    if (!courseToRemove) return

    setIsLoading(true)
    const result = await deleteCourse(courseToRemove.id)
    
    if (result.success) {
      const allCourses = await getAllCourses()
      setCourses(allCourses)
      setFailedIcons(new Set()) // Reset failed icons when courses are updated
      showMessage('success', `${courseToRemove.name} language removed successfully!`)
      setShowRemoveLanguageModal(false)
      setCourseToRemove(null)
    } else {
      showMessage('error', result.error || 'Failed to remove language')
    }
    
    setIsLoading(false)
  }

  const confirmDeleteCourse = async () => {
    if (!courseToDelete) return

    setIsLoading(true)
    const result = await deleteCourse(courseToDelete.id)
    
    if (result.success) {
      const allCourses = await getAllCourses()
      setCourses(allCourses)
      showMessage('success', `${courseToDelete.name} course deleted successfully!`)
    } else {
      showMessage('error', result.error || 'Failed to delete course')
    }
    
    setIsLoading(false)
    setShowDeleteModal(false)
    setCourseToDelete(null)
  }

  const confirmDeleteLesson = async () => {
    if (!lessonToDelete || !courseToDelete) return

    setIsLoading(true)
    const result = await deleteLesson(lessonToDelete.id)
    
    if (result.success) {
      const allCourses = await getAllCourses()
      setCourses(allCourses)
      showMessage('success', `Lesson "${lessonToDelete.title}" deleted successfully!`)
    } else {
      showMessage('error', result.error || 'Failed to delete lesson')
    }
    
    setIsLoading(false)
    setShowDeleteModal(false)
    setCourseToDelete(null)
    setLessonToDelete(null)
  }

  const refreshCourses = () => {
    setCourses(getAllCourses())
  }

  const handleIconError = (courseId: string) => {
    setFailedIcons(prev => new Set(prev).add(courseId))
  }

  return (
    <div className="admin-courses">
      <div className="page-header">
        <div>
          <h1 className="page-title">Language Management</h1>
          <p className="page-subtitle">Create and manage languages and lessons</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button
            className="btn-primary btn-compact"
            onClick={() => setShowAddCourseModal(true)}
            disabled={isLoading || isCreatingCourse}
          >
            Add Language
          </button>
          <button
            className="btn-delete btn-compact"
            onClick={() => setShowRemoveLanguageModal(true)}
            disabled={isLoading || isCreatingCourse || courses.length === 0}
            style={{
              padding: '8px 18px',
              fontSize: '13px',
              minWidth: 'auto'
            }}
          >
            Remove Language
          </button>
        </div>
      </div>
      <div className="courses-content">
        {message && (
          <div className={`${message.type === 'success' ? 'success-message' : 'error-message'}`}>
            {message.text}
          </div>
        )}

        <div className="courses-list">
          {courses.map(course => (
            <div key={course.id} className="course-item">
              <div className="course-info">
                <div className="course-header">
                  <div className="course-icon">
                    {failedIcons.has(course.id) ? (
                      <div
                        style={{
                          width: '100%',
                          height: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: 'linear-gradient(135deg, #7b5cff 0%, #5a3fd8 100%)',
                          color: '#fff',
                          fontSize: '18px',
                          fontWeight: 'bold',
                          borderRadius: '8px'
                        }}
                      >
                        {course.name.charAt(0).toUpperCase()}
                      </div>
                    ) : (
                      <img
                        src={course.icon}
                        alt={`${course.name} logo`}
                        onError={() => handleIconError(course.id)}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'contain',
                          objectPosition: 'center',
                          borderRadius: '8px'
                        }}
                      />
                    )}
                  </div>
                  <div className="course-details">
                    <div className="course-name">{course.name}</div>
                    <div className="course-stats">{course.students} students • {course.status}</div>
                    <div className="course-summary">{course.summary}</div>
                  </div>
                </div>
              </div>
              <div className="course-actions">
                <button 
                  className="btn-update"
                  onClick={() => handleUpdateCourse(course)}
                  disabled={isLoading}
                >
                  Update
                </button>
                <button 
                  className="btn-create"
                  onClick={() => handleCreateCourse(course)}
                  disabled={isLoading}
                >
                  Create
                </button>
                <button 
                  className="btn-delete"
                  onClick={() => handleDeleteCourse(course)}
                  disabled={isLoading}
                >
                  Override
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Add Course Modal */}
        {showAddCourseModal && (
          <div className="modal-overlay">
            <div className="modal-content add-course-modal">
              <h3>Add New Language</h3>
              <p className="course-info">Define the basic details for the new course.</p>

              <form onSubmit={handleCreateLanguage} className="lesson-form">
                <div className="form-group">
                  <label htmlFor="newCourseName">Language Name</label>
                  <input
                    id="newCourseName"
                    name="name"
                    type="text"
                    className="form-input"
                    placeholder="e.g. Go, Rust, Kotlin"
                    value={newCourseForm.name}
                    onChange={handleLanguageNameChange}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="newCourseSummary">Summary</label>
                  <textarea
                    id="newCourseSummary"
                    name="summary"
                    className="form-textarea"
                    placeholder="Short course summary..."
                    rows={3}
                    value={newCourseForm.summary}
                    onChange={handleSummaryChange}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="newCourseIcon">Icon URL / path</label>
                  <div style={{ position: 'relative', width: '100%' }}>
                    <input
                      id="newCourseIcon"
                      name="icon"
                      type="text"
                      className="form-input"
                      placeholder="e.g. /rust-logo.png"
                      value={newCourseForm.icon}
                      onChange={handleIconPathChange}
                      required
                      style={{ paddingRight: '90px' }}
                    />
                    <input
                      ref={iconFileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleIconFileSelect}
                      style={{ display: 'none' }}
                    />
                    <button
                      type="button"
                      onClick={handleBrowseIcon}
                      className="btn-secondary"
                      style={{
                        position: 'absolute',
                        right: '4px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        padding: '6px 12px',
                        fontSize: '12px',
                        whiteSpace: 'nowrap',
                        minWidth: 'auto',
                        height: 'auto',
                        margin: 0
                      }}
                    >
                      Browse
                    </button>
                  </div>
                  <small style={{ color: '#8f8aa2' }}>
                    Use a relative path from the `public` folder or a full URL. Click Browse to select a file.
                  </small>
                </div>

                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setShowAddCourseModal(false)
                      setNewCourseForm({
                        name: '',
                        summary: '',
                        icon: ''
                      })
                      if (iconFileInputRef.current) {
                        iconFileInputRef.current.value = ''
                      }
                    }}
                    disabled={isCreatingCourse}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-primary"
                    onClick={handleCreateLanguage}
                    disabled={
                      isCreatingCourse ||
                      !newCourseForm.name.trim() ||
                      !newCourseForm.summary.trim() ||
                      !newCourseForm.icon.trim()
                    }
                  >
                    {isCreatingCourse ? 'Creating...' : 'Create Language'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Lesson Creation Modal */}
        {showCreateModal && selectedCourse && (
          <div className="modal-overlay">
            <div className="modal-content lesson-modal">
              <h3>Create New Lesson</h3>
              <p className="course-info">For: <strong>{selectedCourse.name}</strong></p>
              
              <form onSubmit={handleLessonSubmit} className="lesson-form">
                <div className="form-group">
                  <label htmlFor="lessonDifficulty">Lesson Difficulty</label>
                  <select
                    id="lessonDifficulty"
                    name="difficulty"
                    className="form-input"
                    value={lessonForm.difficulty}
                    onChange={(e) => setLessonForm(prev => ({ ...prev, difficulty: e.target.value as 'Beginner' | 'Intermediate' | 'Advanced' }))}
                    disabled={!!createdLesson}
                    style={createdLesson ? { opacity: 0.7, cursor: 'not-allowed' } : {}}
                  >
                    <option value="Beginner">Beginner</option>
                    <option value="Intermediate">Intermediate</option>
                    <option value="Advanced">Advanced</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="difficultyView">Level Difficulty View</label>
                  <select
                    id="difficultyView"
                    className="form-input"
                    value={createDifficultyView}
                    onChange={(e) => setCreateDifficultyView(e.target.value as Level['difficulty'])}
                  >
                    {difficultyVariants.map((variant) => (
                      <option key={variant.difficulty} value={variant.difficulty}>
                        {variant.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="title">Lesson Title</label>
                  <input
                    type="text"
                    id="title"
                    name="title"
                    value={lessonForm.title}
                    onChange={handleLessonInputChange}
                    className="form-input"
                    placeholder="Enter lesson title..."
                    required
                    disabled={!!createdLesson}
                    style={createdLesson ? { opacity: 0.7, cursor: 'not-allowed' } : {}}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="description">Lesson Description</label>
                  <textarea
                    id="description"
                    name="description"
                    value={lessonForm.description}
                    onChange={handleLessonInputChange}
                    className="form-textarea"
                    placeholder="Enter lesson description..."
                    rows={3}
                    required
                    disabled={!!createdLesson}
                    style={createdLesson ? { opacity: 0.7, cursor: 'not-allowed' } : {}}
                  />
                </div>

                <div className="levels-preview">
                  {createdLesson || existingLesson ? (
                    (() => {
                      const activeLesson = createdLesson || existingLesson
                      if (!activeLesson) return null
                      return (
                    <>
                      <h4>Levels created for {difficultyVariants.find(v => v.difficulty === createDifficultyView)?.label}:</h4>
                      {existingLesson && (
                        <p style={{ fontSize: '12px', color: '#7b5cff', marginBottom: '12px', padding: '8px', background: 'rgba(123, 92, 255, 0.1)', borderRadius: '4px' }}>
                          ✓ Existing lesson loaded. You can now add Medium and Hard mode levels to this lesson.
                        </p>
                      )}
                      <p style={{ fontSize: '12px', color: '#8f8aa2', marginBottom: '12px' }}>
                        Click on a level card to add code. Levels are created automatically when you save code for them.
                      </p>
                      {(() => {
                        const levelsForDifficulty = activeLesson.levels.filter(l => l.difficulty === createDifficultyView)
                        
                        return (
                          <div className="levels-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
                        {Array.from({ length: 10 }, (_, idx) => {
                          const levelNumber = idx + 1
                          const level = levelsForDifficulty.find(l => l.levelNumber === levelNumber)
                          const variant = levelBlueprints[levelNumber - 1]?.[variantOrder[createDifficultyView]]
                          
                          if (level) {
                            const hasCode = levelHasCode(level)
                            const validationStatus = level.id ? levelValidationStatus[level.id] : undefined
                            const hasError = validationStatus === 'error'
                            const errorStyle = hasError
                              ? {
                                  borderColor: '#ff4d6a',
                                  boxShadow: '0 0 18px rgba(255, 64, 64, 0.5)',
                                  background: 'linear-gradient(135deg, rgba(255, 70, 70, 0.25) 0%, rgba(255, 45, 80, 0.12) 100%)'
                                }
                              : undefined
                            
                            const isEditableInCreateModal = !hasCode
                            
                            return (
                              <div
                                key={`created-${level.id}`}
                                className={`level-preview ${isEditableInCreateModal ? 'clickable' : ''} ${hasCode ? 'has-code' : ''} ${hasError ? 'has-error' : ''}`}
                                style={{
                                  ...(errorStyle || {}),
                                  cursor: isEditableInCreateModal ? 'pointer' : 'not-allowed',
                                  opacity: isEditableInCreateModal ? 1 : 0.8
                                }}
                                title={
                                  isEditableInCreateModal
                                    ? 'Click to load code for this level'
                                    : 'Code already loaded. Use the Update button to edit existing levels.'
                                }
                                onClick={
                                  !isEditableInCreateModal
                                    ? undefined
                                    : async () => {
                                        setIsEditMode(false)
                                        setSelectedLesson(activeLesson)
                                        const levelMeta = { 
                                          ...variant, 
                                          id: level.id,
                                          levelNumber: level.levelNumber,
                                          difficulty: level.difficulty,
                                          points: 20, // All lesson levels give 20 EXP
                                          title: level.title || variant?.title
                                        }
                                        setSelectedLevelMeta(levelMeta)
                                        const levelData = await getLevel(level.id)
                                        setLevelCode(levelData?.initialCode || '')
                                        setLevelOutput(levelData?.expectedOutput || '')
                                        setShowLevelCodeModal(true)
                                      }
                                }
                              >
                                <span className="level-number">{level.levelNumber}</span>
                                <span className="level-difficulty">{difficultyVariants.find(v => v.difficulty === level.difficulty)?.label || 'EASY MODE'}</span>
                                <span className="level-points">20 pts</span>
                              </div>
                            )
                          }
                          
                          return (
                            <div
                              key={`placeholder-${levelNumber}-${createDifficultyView}`}
                              className="level-preview clickable"
                              style={{ opacity: 0.6, borderStyle: 'dashed' }}
                              onClick={async () => {
                                setIsEditMode(false)
                                setSelectedLesson(activeLesson)
                                setSelectedLevelMeta({ 
                                  ...variant,
                                  levelNumber,
                                  difficulty: createDifficultyView
                                })
                                setLevelCode('')
                                setLevelOutput('')
                                setOutputNotice(null)
                                setShowLevelCodeModal(true)
                              }}
                            >
                              <span className="level-number">{levelNumber}</span>
                              <span className="level-difficulty">{variant?.label || 'EASY MODE'}</span>
                              <span className="level-points">{variant?.points || 20} pts</span>
                            </div>
                          )
                        })}
                          </div>
                        )
                      })()}
                    </>
                      )
                    })()
                  ) : (
                    <>
                      <h4>This lesson can include up to 10 levels for {difficultyVariants.find(v => v.difficulty === createDifficultyView)?.label}:</h4>
                      <p style={{ fontSize: '12px', color: '#8f8aa2', marginBottom: '12px' }}>
                        Levels will be created automatically when you add code to them. Click "Create Lesson" first, then click on a level card to add code.
                      </p>
                      <div className="levels-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
                        {levelBlueprints.map((variants) => {
                          const variant = variants[variantOrder[createDifficultyView]]
                          
                          return (
                            <div
                              key={`preview-${variant.levelNumber}-${variant.difficulty}`}
                              className="level-preview"
                              style={{ opacity: 0.5, borderStyle: 'dashed', cursor: 'not-allowed' }}
                              title="Create the lesson first, then click to add code"
                            >
                              <span className="level-number">{variant.levelNumber}</span>
                              <span className="level-difficulty">{variant.label}</span>
                              <span className="level-points">20 pts</span>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}
                </div>

                <div className="modal-actions">
                  <button 
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      // Clear timeout if it exists
                      if (checkLessonTimeoutRef.current) {
                        clearTimeout(checkLessonTimeoutRef.current)
                        checkLessonTimeoutRef.current = null
                      }
                      setShowCreateModal(false)
                      setSelectedCourse(null)
                      setLessonForm({ title: '', description: '', difficulty: 'Beginner' })
                      setCreateDifficultyView('Easy')
                      setCreatedLesson(null) // Reset created lesson
                      setExistingLesson(null) // Reset existing lesson
                    }}
                    disabled={isLoading}
                  >
                    {createdLesson ? 'Close' : 'Cancel'}
                  </button>
                  {!createdLesson ? (
                    <button 
                      type="submit"
                      className="btn-primary"
                      disabled={isLoading || !lessonForm.title.trim() || !lessonForm.description.trim()}
                    >
                      {isLoading ? 'Creating...' : 'Create Lesson'}
                    </button>
                  ) : (
                    <button 
                      type="button"
                      className="btn-primary"
                      onClick={() => {
                        // Clear timeout if it exists
                        if (checkLessonTimeoutRef.current) {
                          clearTimeout(checkLessonTimeoutRef.current)
                          checkLessonTimeoutRef.current = null
                        }
                        setShowCreateModal(false)
                        setSelectedCourse(null)
                        setLessonForm({ title: '', description: '', difficulty: 'Beginner' })
                        setCreateDifficultyView('Easy')
                        setCreatedLesson(null)
                        setExistingLesson(null) // Reset existing lesson
                      }}
                    >
                      Done
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Update Course Modal */}
        {showUpdateModal && editingCourse && !showSuccessModal && (
          <div className="modal-overlay" style={{ zIndex: 1065 }}>
            <div className="modal-content update-course-modal">
              <h3>Update Course: {editingCourse.name}</h3>
              <p className="course-info">
                Manage lessons and levels for this course
              </p>
              
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label htmlFor="updateDifficultyView">Difficulty view</label>
                <select
                  id="updateDifficultyView"
                  className="form-input"
                  value={updateDifficultyView}
                  onChange={(e) => setUpdateDifficultyView(e.target.value as Level['difficulty'])}
                >
                  {difficultyVariants.map((variant) => (
                    <option key={variant.difficulty} value={variant.difficulty}>
                      {variant.label}
                    </option>
                  ))}
                </select>
              </div>

              {editingCourse.lessons && editingCourse.lessons.length > 0 ? (
                <div className="lessons-list">
                  {editingCourse.lessons.map((lesson) => {
                    // First, filter the levels to only those matching the selected difficulty
                    const matchingLevels = lesson.levels.filter(level => level.difficulty === updateDifficultyView)
                    
                    // If no levels match the selected difficulty, don't show this lesson at all
                    if (matchingLevels.length === 0) {
                      return null
                    }
                    
                    return (
                    <div key={lesson.id} className="lesson-card">
                      <div className="lesson-header">
                        <h4>{lesson.title}</h4>
                        <span className="lesson-levels-count">
                          {matchingLevels.length} {updateDifficultyView} level{matchingLevels.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <p className="lesson-description">{lesson.description}</p>
                      
                      <div className="levels-grid-update" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
                        {Array.from(
                          matchingLevels.reduce((acc, level) => {
                            const meta: LevelVariantMeta = {
                              id: level.id,
                              levelNumber: level.levelNumber,
                              difficulty: level.difficulty,
                              points: 20, // All lesson levels give 20 EXP
                              label: `${level.difficulty} Mode`,
                              title: level.title || `Level ${level.levelNumber} - ${level.difficulty}`
                            }
                            const bucket = acc.get(level.levelNumber) || []
                            bucket.push(meta)
                            acc.set(level.levelNumber, bucket)
                            return acc
                          }, new Map<number, LevelVariantMeta[]>())
                        )
                          .sort((a, b) => a[0] - b[0])
                          .map(([levelNumber, variants]) => {
                            // All variants should already match the selected difficulty, but filter again to be safe
                            const filteredVariants = variants.filter((variant) => variant.difficulty === updateDifficultyView)
                            
                            if (!filteredVariants.length) return null
                            
                            // Return all variants horizontally, not grouped by level number
                            return filteredVariants
                              .sort((a, b) => variantOrder[a.difficulty] - variantOrder[b.difficulty])
                              .map((variant) => {
                                // Check if this level has code saved
                                const level = lesson.levels.find(
                                  l => l.id === variant.id
                                )
                                const hasCode = levelHasCode(level)
                                const validationStatus = variant.id ? levelValidationStatus[variant.id] : undefined
                                const hasError = validationStatus === 'error'
                                const errorStyle = hasError
                                  ? {
                                      borderColor: '#ff4d6a',
                                      boxShadow: '0 0 18px rgba(255, 64, 64, 0.5)',
                                      background: 'linear-gradient(135deg, rgba(255, 70, 70, 0.25) 0%, rgba(255, 45, 80, 0.12) 100%)'
                                    }
                                  : undefined
                                
                                // Get the label from difficultyVariants to ensure correct formatting
                                const difficultyLabel = difficultyVariants.find(v => v.difficulty === variant.difficulty)?.label || `${variant.difficulty} Mode`
                                
                                return (
                                <div
                                  key={variant.id}
                                  className={`level-preview clickable ${hasCode ? 'has-code' : ''} ${hasError ? 'has-error' : ''}`}
                                  style={errorStyle}
                                  onClick={async () => {
                                    console.log('Opening level code modal for update. Variant:', variant)
                                    console.log('Lesson:', lesson)
                                    console.log('Level ID in variant:', variant.id)
                                    
                                    // Ensure we have the level ID - if variant doesn't have it, try to get it from the lesson
                                    let levelId = variant.id
                                    if (!levelId && lesson) {
                                      const levelFromLesson = lesson.levels.find(
                                        l => l.levelNumber === variant.levelNumber && 
                                             l.difficulty === variant.difficulty
                                      )
                                      if (levelFromLesson) {
                                        levelId = levelFromLesson.id
                                        console.log('Found level ID from lesson:', levelId)
                                        variant.id = levelId
                                      }
                                    }
                                    
                                    // Set state with the lesson and variant (now with guaranteed ID)
                                    setSelectedLesson(lesson)
                                    setSelectedLevelMeta({ ...variant, id: levelId })
                                    setIsEditMode(true)
                                    setIsLoadingLevelCode(true)
                                    
                                    // Load level data from database
                                    if (levelId) {
                                      try {
                                        const level = await getLevel(levelId)
                                        const loadedCode = level?.initialCode || ''
                                        const loadedOutput = level?.expectedOutput || ''
                                        setLevelCode(loadedCode)
                                        setLevelOutput(loadedOutput)
                                        console.log('Loaded level data. Code length:', loadedCode.length)
                                        console.log('Loaded code preview:', loadedCode.substring(0, 50))
                                        if (!loadedCode.trim()) {
                                          console.log('No code found in database for this level')
                                        }
                                      } catch (error) {
                                        console.error('Error loading level:', error)
                                        setLevelCode('')
                                        setLevelOutput('')
                                        setOutputNotice(null)
                                      }
                                    } else {
                                      console.warn('No level ID available, cannot load level data')
                                      setLevelCode('')
                                      setLevelOutput('')
                                      setOutputNotice(null)
                                    }
                                    
                                    setIsLoadingLevelCode(false)
                                    setShowLevelCodeModal(true)
                                    setShowUpdateModal(false)
                                  }}
                                >
                                  <span className="level-number">{variant.levelNumber}</span>
                                  <span className="level-difficulty">{difficultyLabel}</span>
                                  <span className="level-points">20 pts</span>
                                </div>
                                )
                              })
                          })
                          .flat()
                          .filter(Boolean)}
                      </div>
                    </div>
                    )
                  }).filter(Boolean)}
                </div>
              ) : (
                <p className="no-lessons">No lessons available. Create a lesson first.</p>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setShowUpdateModal(false)
                    setEditingCourse(null)
  setUpdateDifficultyView('Easy')
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Level Code Modal */}
        {showLevelCodeModal && selectedLevelMeta && (
          <div 
            className="modal-overlay" 
            style={{ zIndex: 1070 }}
            onClick={(e) => {
              // Close modal if clicking on overlay (not the modal content)
              if (e.target === e.currentTarget) {
                setShowLevelCodeModal(false)
                setSelectedLevelMeta(null)
                setLevelCode('')
                setLevelOutput('')
                setOutputNotice(null)
                setIsEditMode(false)
                // Don't clear selectedLesson if we have createdLesson - we need it for saving
                // setSelectedLesson(null)
              }
            }}
          >
            <div className="modal-content level-code-modal">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: 0 }}>{isEditMode ? 'Update Code for' : 'Load Code for'} {selectedLevelMeta.title}</h3>
                  {isEditMode && levelCode && (
                    <p style={{ fontSize: '12px', color: '#8f8aa2', marginTop: '4px', marginBottom: '0' }}>
                      Current code is displayed below. Paste your new code to replace it.
                    </p>
                  )}
                  <p className="course-info" style={{ marginTop: '8px', marginBottom: 0 }}>
                    {selectedLevelMeta.label} • 20 pts
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const wasEditMode = isEditMode
                    setShowLevelCodeModal(false)
                    setSelectedLevelMeta(null)
                    setLevelCode('')
                    setLevelOutput('')
                    setOutputNotice(null)
                    setIsEditMode(false)
                    setSelectedLesson(null)
                    setIsLoadingLevelCode(false)
                    // Return to the appropriate modal
                    if (wasEditMode && editingCourse) {
                      setShowUpdateModal(true)
                    }
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#8f8aa2',
                    fontSize: '24px',
                    cursor: 'pointer',
                    padding: '0',
                    width: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '4px',
                    transition: 'all 0.2s ease',
                    marginLeft: '16px',
                    flexShrink: 0
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = '#ffffff'
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = '#8f8aa2'
                    e.currentTarget.style.background = 'transparent'
                  }}
                  disabled={isLoading}
                >
                  ×
                </button>
              </div>
              
              {/* Current Code Display (Read-only) - Always show in edit mode */}
              {isEditMode && (
                <div style={{ 
                  marginBottom: '20px', 
                  padding: '16px', 
                  background: 'rgba(123, 92, 255, 0.1)', 
                  border: '1px solid rgba(123, 92, 255, 0.3)', 
                  borderRadius: '8px' 
                }}>
                  <label style={{ 
                    display: 'block', 
                    color: '#cfcbe6', 
                    fontSize: '14px', 
                    fontWeight: 600, 
                    marginBottom: '8px' 
                  }}>
                    Current Syntax Code:
                  </label>
                  <pre style={{
                    margin: 0,
                    padding: '12px 16px',
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid rgba(123, 92, 255, 0.2)',
                    borderRadius: '8px',
                    color: '#e5e7eb',
                    fontFamily: "'Courier New', Courier, monospace",
                    fontSize: '13px',
                    lineHeight: '1.6',
                    whiteSpace: 'pre-wrap',
                    wordWrap: 'break-word',
                    maxHeight: '200px',
                    overflowY: 'auto',
                    minHeight: '60px'
                  }}>
                    {isLoadingLevelCode ? 'Loading...' : (levelCode && levelCode.trim() ? levelCode : '(No code saved yet)')}
                  </pre>
                </div>
              )}

              <div className="code-split-container">
                <div className="code-input-panel">
                  <label htmlFor="levelCode">Code Input:</label>
                  <textarea
                    id="levelCode"
                    name="levelCode"
                    value={levelCode}
                    onChange={(e) => setLevelCode(e.target.value)}
                    className="form-textarea code-input"
                    placeholder={isEditMode ? "Paste your new code here to replace the current code..." : "Enter code for this level..."}
                    rows={15}
                  />
                </div>

                <div className="code-output-panel">
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                      marginBottom: outputNotice ? '8px' : '12px'
                    }}
                  >
                    <label htmlFor="levelOutput" style={{ marginBottom: 0 }}>
                      Expected Output:
                    </label>
                    {outputNotice && outputNotice.type !== 'error' && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '4px 10px',
                          borderRadius: '999px',
                          background:
                            outputNotice.type === 'manual'
                              ? 'rgba(255, 198, 109, 0.15)'
                              : 'rgba(141, 208, 255, 0.12)',
                          color:
                            outputNotice.type === 'manual'
                              ? '#ffc66d'
                              : '#8dd0ff',
                          fontSize: '12px',
                          fontWeight: 500,
                          whiteSpace: 'nowrap'
                        }}
                      >
                        <span style={{ opacity: 0.8 }}>Syntax status:</span>
                        <span style={{ fontWeight: 600 }}>{outputNotice.text}</span>
                      </div>
                    )}
                    {hasSyntaxError && (
                      <div
                        style={{
                          fontSize: '12px',
                          color: '#f3d08c',
                          fontWeight: 500
                        }}
                      >
                        Fix syntax issues to enable saving.
                      </div>
                    )}
                  </div>
                  <textarea
                    id="levelOutput"
                    name="levelOutput"
                    value={levelOutput}
                    onChange={(e) => {
                      setLevelOutput(e.target.value)
                      outputManuallyEdited.current = true // Mark as manually edited
                      setOutputNotice({
                        type: 'manual',
                        text: 'Using manual expected output.'
                      })
                      updateValidationStatusForCurrentLevel('manual')
                    }}
                    className="form-textarea output-input"
                    placeholder="Enter expected output for this level..."
                    rows={15}
                  />
                </div>
              </div>

              <div className="modal-actions">
                {(hasSyntaxError || isCodeEmpty) && (
                  <p style={{ color: '#f3d08c', margin: '0 0 8px', fontSize: '12px' }}>
                    {hasSyntaxError
                      ? 'Resolve syntax errors in the code editor to turn the Save button back on.'
                      : 'Enter some code before saving this level.'}
                  </p>
                )}
                <button 
                  type="button"
                  className="btn-secondary"
                    onClick={() => {
                      const wasEditMode = isEditMode
                      setShowLevelCodeModal(false)
                      setSelectedLevelMeta(null)
                      setLevelCode('')
                      setLevelOutput('')
                      setOutputNotice(null)
                      setIsEditMode(false)
                      setSelectedLesson(null)
                      setIsLoadingLevelCode(false)
                      // Return to the appropriate modal
                      if (wasEditMode && editingCourse) {
                        setShowUpdateModal(true)
                      }
                      // If we came from create modal, it's already open, so just stay there
                    }}
                  disabled={isLoading}
                >
                  Cancel
                </button>
                <button 
                  type="button"
                  className="btn-primary"
                  onClick={async () => {
                    if (hasSyntaxError) {
                      showMessage('error', 'Fix syntax errors before saving.')
                      return
                    }
                    if (isCodeEmpty) {
                      showMessage('error', 'Code cannot be empty.')
                      return
                    }
                    if (!selectedLevelMeta) {
                      console.error('No selectedLevelMeta')
                      return
                    }
                    
                    if (isLoading) {
                      console.log('Already loading, ignoring click')
                      return
                    }
                    
                    setIsLoading(true)
                    const wasEditMode = isEditMode
                    const scopeCourseId = selectedCourse?.id || editingCourse?.id || null
                    const validationKeyBeforeSave = getLevelValidationKey(selectedLevelMeta, scopeCourseId)
                    const metaToSave = { ...selectedLevelMeta } // Store a copy
                    const codeToSave = levelCode
                    const outputToSave = levelOutput
                    
                    console.log('=== SAVE CODE CLICKED ===')
                    console.log('Initial levelId:', selectedLevelMeta.id)
                    console.log('selectedLevelMeta:', selectedLevelMeta)
                    console.log('selectedLesson:', selectedLesson)
                    console.log('createdLesson:', createdLesson)
                    console.log('selectedCourse:', selectedCourse)
                    console.log('editingCourse:', editingCourse)
                    
                    // Ensure we have createdLesson or selectedLesson preserved
                    if (!selectedLesson && createdLesson) {
                      console.log('Restoring selectedLesson from createdLesson')
                      setSelectedLesson(createdLesson)
                    }
                    
                    try {
                      let levelId = selectedLevelMeta.id
                      let foundLesson = selectedLesson || createdLesson
                      
                      console.log('Starting level ID lookup. Initial levelId:', levelId)
                      console.log('Initial foundLesson:', foundLesson ? foundLesson.id : 'null')
                      
                      // If level ID is missing, try to find it from the lesson
                      if (!levelId && foundLesson) {
                        console.log('Looking for level in lesson:', foundLesson.id)
                        console.log('Lesson levels:', foundLesson.levels)
                        const level = foundLesson.levels.find(
                          l => l.levelNumber === selectedLevelMeta.levelNumber && 
                               l.difficulty === selectedLevelMeta.difficulty
                        )
                        if (level) {
                          levelId = level.id
                          console.log('Found level ID from lesson:', levelId)
                        } else {
                          console.log('Level not found in lesson. Looking for:', {
                            levelNumber: selectedLevelMeta.levelNumber,
                            difficulty: selectedLevelMeta.difficulty
                          })
                        }
                      }
                      
                      // If still no ID, try to find it from the course by reloading
                      if (!levelId) {
                        const currentCourse = selectedCourse || editingCourse
                        if (currentCourse) {
                          console.log('Reloading course to find level:', currentCourse.id)
                          // Reload course to get latest lesson data
                          const updatedCourse = await getCourseById(currentCourse.id)
                          if (updatedCourse?.lessons && updatedCourse.lessons.length > 0) {
                            console.log('Course has', updatedCourse.lessons.length, 'lessons')
                            
                            // First, try to find lesson by selectedLesson/createdLesson ID
                            let lesson = null
                            if (selectedLesson) {
                              lesson = updatedCourse.lessons.find(l => l.id === selectedLesson.id)
                              console.log('Looking for lesson by selectedLesson ID:', selectedLesson.id, 'Found:', !!lesson)
                            }
                            if (!lesson && createdLesson) {
                              lesson = updatedCourse.lessons.find(l => l.id === createdLesson.id)
                              console.log('Looking for lesson by createdLesson ID:', createdLesson.id, 'Found:', !!lesson)
                            }
                            
                            // If we still don't have a lesson, use the most recent one (likely the one just created)
                            if (!lesson && updatedCourse.lessons.length > 0) {
                              lesson = updatedCourse.lessons[updatedCourse.lessons.length - 1]
                              console.log('Using most recent lesson as fallback:', lesson.id)
                            }
                            
                            // If we still don't have a lesson, search through ALL lessons to find the level
                            if (!lesson) {
                              console.log('Searching through all lessons for the level...')
                              for (const courseLesson of updatedCourse.lessons) {
                                const level = courseLesson.levels.find(
                                  l => l.levelNumber === selectedLevelMeta.levelNumber && 
                                       l.difficulty === selectedLevelMeta.difficulty
                                )
                                if (level) {
                                  lesson = courseLesson
                                  levelId = level.id
                                  console.log('Found level in lesson:', lesson.id, 'Level ID:', levelId)
                                  break
                                }
                              }
                            } else {
                              // We found the lesson, now find the level in it
                              console.log('Checking lesson:', lesson.id, 'with', lesson.levels.length, 'levels')
                              const level = lesson.levels.find(
                                l => l.levelNumber === selectedLevelMeta.levelNumber && 
                                     l.difficulty === selectedLevelMeta.difficulty
                              )
                              if (level) {
                                levelId = level.id
                                console.log('Found level ID from reloaded course:', levelId)
                              } else {
                                console.log('Level still not found. Available levels:', lesson.levels.map(l => ({
                                  id: l.id,
                                  levelNumber: l.levelNumber,
                                  difficulty: l.difficulty
                                })))
                              }
                            }
                            
                            // Update the lesson state if we found it
                            if (lesson) {
                              foundLesson = lesson
                              // Always update createdLesson if we're in create mode
                              if (selectedCourse && !wasEditMode) {
                                setCreatedLesson(lesson)
                                setSelectedLesson(lesson)
                                console.log('Set createdLesson and selectedLesson to found lesson')
                              } else if (selectedLesson && lesson.id === selectedLesson.id) {
                                setSelectedLesson(lesson)
                              } else if (!selectedLesson && !createdLesson) {
                                // If we found a lesson but didn't have one before, set it
                                setSelectedLesson(lesson)
                                if (selectedCourse) {
                                  setCreatedLesson(lesson)
                                }
                              }
                              
                              // Update selectedLevelMeta with the found ID
                              if (levelId) {
                                setSelectedLevelMeta({ ...selectedLevelMeta, id: levelId })
                              }
                            } else {
                              console.log('No lesson found in updated course')
                            }
                          } else {
                            console.log('Course has no lessons or lessons array is empty')
                            showMessage('error', 'No lessons found. Please create the lesson first by clicking "Create Lesson" button.')
                            setIsLoading(false)
                            return
                          }
                        } else {
                          console.log('No current course available')
                          showMessage('error', 'No course selected. Please select a course first.')
                          setIsLoading(false)
                          return
                        }
                      }
                      
                      // If levelId is not found, we'll create the level on-demand
                      // We need foundLesson, selectedLevelMeta.levelNumber, and selectedLevelMeta.difficulty
                      if (!levelId) {
                        if (!foundLesson) {
                          console.error('Level ID not found and no lesson available')
                          showMessage('error', 'Level not found. Please make sure you have created the lesson first by clicking "Create Lesson" button.')
                          setIsLoading(false)
                          return
                        }
                        console.log('Level ID not found, will create level on-demand')
                        console.log('Lesson ID:', foundLesson.id)
                        console.log('Level Number:', selectedLevelMeta.levelNumber)
                        console.log('Difficulty:', selectedLevelMeta.difficulty)
                      }
                      
                      console.log('Attempting to save with levelId:', levelId || 'null (will create)')
                      console.log('Code length:', codeToSave.length)
                      console.log('Output length:', outputToSave.length)
                      
                      console.log('Calling updateLevel API...')
                      // Save both the syntax code and the expected output
                      // Pass lessonId, levelNumber, and difficulty so the backend can create the level if it doesn't exist
                      const result = await updateLevel(levelId || null, {
                        initialCode: codeToSave,
                        expectedOutput: outputToSave, // Save the expected output to the database
                        lessonId: foundLesson?.id,
                        levelNumber: selectedLevelMeta.levelNumber,
                        difficulty: selectedLevelMeta.difficulty,
                        title: selectedLevelMeta.title,
                        points: 20 // All lesson levels give 20 EXP
                      })
                      
                      console.log('Update result received:', result)
                      console.log('Result success:', result?.success)
                      console.log('Result error:', result?.error)
                      console.log('Result type:', typeof result)
                      console.log('Result keys:', result ? Object.keys(result) : 'null')
                      
                      // Check if the update was successful
                      const isSuccess = result && (result.success === true || (result.level && result.level.id))
                      
                      console.log('Update result check:', {
                        result,
                        hasResult: !!result,
                        resultSuccess: result?.success,
                        hasLevel: !!result?.level,
                        levelId: result?.level?.id,
                        isSuccess
                      })
                      
                      if (isSuccess) {
                        console.log('✅ Save successful! Preparing to show success modal...')
                        console.log('Result object:', JSON.stringify(result, null, 2))
                        
                        // If a new level was created, update the levelId
                        if (result.level && result.level.id) {
                          const newLevelId = result.level.id
                          if (!levelId || levelId !== newLevelId) {
                            console.log('New level created with ID:', newLevelId)
                            levelId = newLevelId
                            // Update selectedLevelMeta with the new ID
                            setSelectedLevelMeta({ ...selectedLevelMeta, id: newLevelId })
                            transferValidationStatusKey(validationKeyBeforeSave, newLevelId)
                          }
                        }
                        
                        // Immediately update createdLesson/selectedLesson with the saved code
                        // This ensures the green indicator shows right away
                        // Use foundLesson which might have been set during the lookup
                        const lessonToUpdate = foundLesson || createdLesson || selectedLesson
                        
                        if (lessonToUpdate) {
                          console.log('Updating lesson. levelId:', levelId, 'lesson.levels.length:', lessonToUpdate.levels.length)
                          console.log('Level IDs in lesson:', lessonToUpdate.levels.map(l => ({ id: l.id, levelNumber: l.levelNumber, difficulty: l.difficulty })))
                          console.log('Looking for level:', { levelId, levelNumber: metaToSave.levelNumber, difficulty: metaToSave.difficulty })
                          
                          let levelUpdated = false
                          let updatedLevels = lessonToUpdate.levels.map(level => {
                            // Try to match by ID first
                            if (level.id === levelId) {
                              console.log('Found matching level by ID to update:', level.id, 'Code length:', codeToSave.length)
                              levelUpdated = true
                              return {
                                ...level,
                                initialCode: codeToSave
                              }
                            }
                            // Fallback: match by levelNumber and difficulty if ID doesn't match
                            if (!levelUpdated && level.levelNumber === metaToSave.levelNumber && level.difficulty === metaToSave.difficulty) {
                              console.log('Found matching level by levelNumber/difficulty to update:', level.id, 'Code length:', codeToSave.length)
                              levelUpdated = true
                              return {
                                ...level,
                                initialCode: codeToSave
                              }
                            }
                            return level
                          })
                          
                          // If level wasn't found in existing levels, add it (new level was created)
                          if (!levelUpdated && result.level) {
                            console.log('Adding new level to lesson:', result.level.id)
                            updatedLevels = [...updatedLevels, result.level]
                            levelUpdated = true
                          }
                          
                          // Check if we actually updated a level
                          // Use the new levelId if it was created, otherwise use the original
                          const finalLevelId = result.level?.id || levelId
                          transferValidationStatusKey(validationKeyBeforeSave, finalLevelId || null)
                          const updatedLevel = updatedLevels.find(l => 
                            (l.id === finalLevelId) || 
                            (l.levelNumber === metaToSave.levelNumber && l.difficulty === metaToSave.difficulty)
                          )
                          if (updatedLevel) {
                            console.log('Updated level found:', updatedLevel.id, 'Has code:', !!(updatedLevel.initialCode && updatedLevel.initialCode.trim().length > 0))
                          } else {
                            console.warn('WARNING: Level not found in updatedLevels! levelId:', levelId, 'metaToSave:', metaToSave)
                          }
                          
                          if (!levelUpdated) {
                            console.error('ERROR: Failed to update any level in lesson!')
                          }
                          
                          const updatedLesson = {
                            ...lessonToUpdate,
                            levels: updatedLevels
                          }
                          
                          // Update both createdLesson and selectedLesson to ensure state is consistent
                          if (selectedCourse && !wasEditMode) {
                            setCreatedLesson(updatedLesson)
                            setSelectedLesson(updatedLesson)
                            console.log('Updated createdLesson and selectedLesson with saved code immediately. Updated lesson has', updatedLesson.levels.length, 'levels')
                          } else {
                            setSelectedLesson(updatedLesson)
                            if (createdLesson && lessonToUpdate.id === createdLesson.id) {
                              setCreatedLesson(updatedLesson)
                            }
                            console.log('Updated selectedLesson with saved code immediately')
                          }
                          
                          // Also update editingCourse if we're in edit mode
                          if (wasEditMode && editingCourse && editingCourse.lessons && lessonToUpdate) {
                            const updatedCourseLessons = editingCourse.lessons.map(lesson => {
                              if (lesson.id === lessonToUpdate.id) {
                                return updatedLesson
                              }
                              return lesson
                            })
                            setEditingCourse({
                              ...editingCourse,
                              lessons: updatedCourseLessons
                            })
                            console.log('Updated editingCourse with saved code immediately')
                          }
                        } else {
                          console.warn('WARNING: No lesson found to update state! This should not happen if level was found.')
                        }
                        
                        // Prepare success message
                        const message = `Code successfully saved for ${metaToSave.title}!`
                        console.log('Success message:', message)
                        setSuccessMessage(message)
                        
                        // Close the modal first - clear all state
                        console.log('Closing level code modal...')
                        setShowLevelCodeModal(false)
                        setSelectedLevelMeta(null)
                        setLevelCode('')
                        setLevelOutput('')
                        setIsEditMode(false)
                        // Don't clear selectedLesson here - we need it for the green indicator
                        // setSelectedLesson(null)
                        setIsLoading(false)
                        
                        // If we're in edit mode, close the update modal too so it doesn't show behind the success modal
                        if (wasEditMode && editingCourse) {
                          console.log('Closing update modal to show success modal first')
                          setShowUpdateModal(false)
                          setShouldReturnToUpdateModal(true)
                        } else {
                          setShouldReturnToUpdateModal(false)
                        }
                        
                        // Show success confirmation popup after a brief delay to ensure modals are closed
                        setTimeout(() => {
                          console.log('Showing success modal now...')
                          setShowSuccessModal(true)
                          console.log('showSuccessModal state set to true')
                        }, 300)
                        
                        // Then refresh data in the background (don't await, let it run async)
                        getAllCourses().then(allCourses => {
                          setCourses(allCourses)
                          
                          // Update editingCourse if we're in edit mode
                          if (wasEditMode && editingCourse) {
                            getCourseById(editingCourse.id).then(updatedCourse => {
                              if (updatedCourse) {
                                setEditingCourse(updatedCourse)
                                // Also update selectedLesson if it exists
                                if (selectedLesson && updatedCourse.lessons) {
                                  const updatedLesson = updatedCourse.lessons.find(l => l.id === selectedLesson.id)
                                  if (updatedLesson) {
                                    setSelectedLesson(updatedLesson)
                                  }
                                }
                              }
                            }).catch(err => console.error('Error updating editingCourse:', err))
                          }
                          
                          // Update createdLesson if we came from create modal
                          // Only refresh if we didn't just update it immediately (to avoid overwriting)
                          // We'll refresh after a delay to ensure database has the latest data
                          if (createdLesson && selectedCourse) {
                            // Delay the refresh to ensure database has updated, and merge intelligently
                            setTimeout(() => {
                              getCourseById(selectedCourse.id).then(updatedCourse => {
                                if (updatedCourse?.lessons) {
                                  const updatedLesson = updatedCourse.lessons.find(l => l.id === createdLesson.id)
                                  if (updatedLesson) {
                                    // Merge: keep our immediate update for levels that have code, use DB for others
                                    const mergedLevels = updatedLesson.levels.map(dbLevel => {
                                      // Find if we have an immediate update for this level
                                      const immediateLevel = createdLesson.levels.find(l => l.id === dbLevel.id)
                                      // If immediate level has code, prefer it (it's fresher)
                                      if (immediateLevel && immediateLevel.initialCode && immediateLevel.initialCode.trim().length > 0) {
                                        return immediateLevel
                                      }
                                      // Otherwise use database version
                                      return dbLevel
                                    })
                                    
                                    const mergedLesson = {
                                      ...updatedLesson,
                                      levels: mergedLevels
                                    }
                                    setCreatedLesson(mergedLesson)
                                    setSelectedLesson(mergedLesson)
                                    console.log('Merged createdLesson with database data')
                                  }
                                }
                              }).catch(err => console.error('Error updating createdLesson:', err))
                            }, 1000) // Wait 1 second for database to update
                          }
                        }).catch(refreshError => {
                          console.error('Error refreshing data:', refreshError)
                          // Don't show error to user, data refresh is not critical
                        })
                      } else {
                        console.error('❌ Update failed:', result)
                        const errorMsg = result?.error || 'Failed to save code'
                        console.error('Error message:', errorMsg)
                        showMessage('error', errorMsg)
                        
                        // Still close modal on error so user can try again
                        setShowLevelCodeModal(false)
                        setSelectedLevelMeta(null)
                        setLevelCode('')
                        setLevelOutput('')
                        setIsEditMode(false)
                        setSelectedLesson(null)
                        setIsLoading(false)
                      }
                    } catch (error: any) {
                      console.error('❌ Exception caught:', error)
                      console.error('Error stack:', error.stack)
                      showMessage('error', error.message || 'Failed to save code')
                      
                      // Close modal even on error
                      setShowLevelCodeModal(false)
                      setSelectedLevelMeta(null)
                      setLevelCode('')
                      setLevelOutput('')
                      setIsEditMode(false)
                      setSelectedLesson(null)
                      setIsLoading(false)
                    }
                  }}
                  disabled={isLoading || hasSyntaxError || isCodeEmpty}
                >
                  {isLoading ? 'Saving...' : (isEditMode ? 'Update Code' : 'Save Code')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Remove Language Modal */}
        {showRemoveLanguageModal && (
          <div className="modal-overlay" style={{ zIndex: 1065 }}>
            <div className="modal-content delete-lesson-modal">
              <h3>Remove Language</h3>
              <p className="course-info">
                Select a language to remove. All lessons and levels in this language will also be deleted.
              </p>
              
              {courses.length > 0 ? (
                <div className="lessons-list-delete">
                  {courses.map((course) => (
                    <div 
                      key={course.id} 
                      className="lesson-item-delete"
                      onClick={() => handleRemoveLanguage(course)}
                    >
                      <div className="lesson-info-delete">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                          <div className="course-icon" style={{ width: '32px', height: '32px' }}>
                            {failedIcons.has(course.id) ? (
                              <div
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  background: 'linear-gradient(135deg, #7b5cff 0%, #5a3fd8 100%)',
                                  color: '#fff',
                                  fontSize: '14px',
                                  fontWeight: 'bold',
                                  borderRadius: '6px'
                                }}
                              >
                                {course.name.charAt(0).toUpperCase()}
                              </div>
                            ) : (
                              <img
                                src={course.icon}
                                alt={`${course.name} logo`}
                                onError={() => handleIconError(course.id)}
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  objectFit: 'contain',
                                  objectPosition: 'center',
                                  borderRadius: '6px'
                                }}
                              />
                            )}
                          </div>
                          <h4 style={{ margin: 0 }}>{course.name}</h4>
                        </div>
                        <p style={{ margin: '4px 0', color: '#8f8aa2', fontSize: '13px' }}>{course.summary}</p>
                        <span className="lesson-meta">
                          {course.students} students • {course.lessons?.length || 0} lesson{course.lessons?.length !== 1 ? 's' : ''} will be deleted
                        </span>
                      </div>
                      <div className={`checkbox-delete ${courseToRemove?.id === course.id ? 'checked' : ''}`}>
                        {courseToRemove?.id === course.id ? '✓' : ''}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="no-lessons">No languages available to remove.</p>
              )}

              <div className="modal-actions">
                <button 
                  className="btn-secondary"
                  onClick={() => {
                    setShowRemoveLanguageModal(false)
                    setCourseToRemove(null)
                  }}
                  disabled={isLoading}
                >
                  Cancel
                </button>
                <button 
                  className="btn-delete"
                  onClick={confirmRemoveLanguage}
                  disabled={isLoading || !courseToRemove}
                >
                  {isLoading ? 'Removing...' : 'Remove Language'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Lesson Modal */}
        {showDeleteModal && courseToDelete && (
          <div className="modal-overlay" style={{ zIndex: 1065 }}>
            <div className="modal-content delete-lesson-modal">
              <h3>Delete Lesson from {courseToDelete.name}</h3>
              <p className="course-info">
                Select a lesson to delete. All levels in this lesson will also be deleted.
              </p>
              
              {courseToDelete.lessons && courseToDelete.lessons.length > 0 ? (
                <div className="lessons-list-delete">
                  {courseToDelete.lessons.map((lesson) => (
                    <div 
                      key={lesson.id} 
                      className="lesson-item-delete"
                      onClick={() => setLessonToDelete(lesson)}
                    >
                      <div className="lesson-info-delete">
                        <h4>{lesson.title}</h4>
                        <p>{lesson.description}</p>
                        <span className="lesson-meta">
                          {lesson.levels.length} levels will be deleted
                        </span>
                      </div>
                      <div className={`checkbox-delete ${lessonToDelete?.id === lesson.id ? 'checked' : ''}`}>
                        {lessonToDelete?.id === lesson.id ? '✓' : ''}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="no-lessons">No lessons available to delete.</p>
              )}

              <div className="modal-actions">
                <button 
                  className="btn-secondary"
                  onClick={() => {
                    setShowDeleteModal(false)
                    setCourseToDelete(null)
                    setLessonToDelete(null)
                  }}
                  disabled={isLoading}
                >
                  Cancel
                </button>
                <button 
                  className="btn-delete"
                  onClick={confirmDeleteLesson}
                  disabled={isLoading || !lessonToDelete}
                >
                  {isLoading ? 'Deleting...' : 'Delete Lesson'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Success Confirmation Modal */}
        {showSuccessModal && (
          <div 
            className="modal-overlay" 
            style={{ 
              zIndex: 9999, 
              position: 'fixed', 
              top: 0, 
              left: 0, 
              right: 0, 
              bottom: 0,
              width: '100vw',
              height: '100vh',
              background: 'rgba(0, 0, 0, 0.8)'
            }}
            onClick={() => {
              console.log('Success modal overlay clicked, closing...')
              setShowSuccessModal(false)
            }}
          >
            <div 
              className="modal-content" 
              style={{ 
                maxWidth: '450px', 
                textAlign: 'center',
                position: 'relative',
                zIndex: 10000
              }}
              onClick={(e) => {
                e.stopPropagation()
                console.log('Success modal content clicked')
              }}
            >
              <div style={{ marginBottom: '20px' }}>
                <div style={{
                  width: '64px',
                  height: '64px',
                  margin: '0 auto 16px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #7b5cff 0%, #5a3fd8 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '32px',
                  color: '#fff'
                }}>
                  ✓
                </div>
                <h3 style={{ margin: '0 0 12px', color: '#fff' }}>Success!</h3>
                <p style={{ margin: 0, color: '#cfcbe6', fontSize: '15px', lineHeight: '1.5' }}>
                  {successMessage || 'Code successfully saved!'}
                </p>
              </div>
              <div className="modal-actions" style={{ justifyContent: 'center' }}>
                <button 
                  className="btn-primary"
                  onClick={() => {
                    console.log('OK button clicked, closing success modal')
                    setShowSuccessModal(false)
                    // Return to update modal if we were in edit mode
                    if (shouldReturnToUpdateModal && editingCourse) {
                      setTimeout(() => {
                        setShowUpdateModal(true)
                        setShouldReturnToUpdateModal(false)
                      }, 100)
                    }
                  }}
                  style={{ minWidth: '120px' }}
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
