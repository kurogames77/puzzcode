import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { Lesson, Level } from '../utils/courseManager'

type Props = {
  lesson: Lesson
  languageSlug: string
  onClose: () => void
  onStart: () => void
}

type Example = { title: string; body: string }

// Build simple, lesson-related examples from the first few levels; fall back to generic ones
const buildExamples = (languageSlug: string, levels: Level[], lessonTitle: string): Example[] => {
  const lang = languageSlug.toLowerCase()
  const titleLower = lessonTitle.toLowerCase()

  // Hand-crafted examples for common patterns / topics
  if (lang === 'csharp') {
    if (titleLower.includes('interface')) {
      return [
        {
          title: 'Basic interface',
          body:
            'public interface IAnimal {\n' +
            '    void Speak();\n' +
            '}\n\n' +
            'public class Dog : IAnimal {\n' +
            '    public void Speak() {\n' +
            '        Console.WriteLine("Woof");\n' +
            '    }\n' +
            '}'
        },
        {
          title: 'Using an interface reference',
          body:
            'IAnimal pet = new Dog();\n' +
            'pet.Speak();   // Uses Dog implementation via the IAnimal interface'
        },
        {
          title: 'Why interfaces help',
          body:
            '// Interfaces let you swap implementations.\n' +
            'void Feed(IAnimal animal) { /* ... */ }\n' +
            '// Any class that implements IAnimal can be passed in.'
        }
      ]
    }

    if (titleLower.includes('inheritance')) {
      return [
        {
          title: 'Simple class inheritance',
          body:
            'class Shape {\n' +
            '    public virtual double Area() => 0;\n' +
            '}\n\n' +
            'class Rectangle : Shape {\n' +
            '    public double Width { get; set; }\n' +
            '    public double Height { get; set; }\n' +
            '    public override double Area() => Width * Height;\n' +
            '}'
        },
        {
          title: 'Polymorphic call',
          body:
            'Shape s = new Rectangle { Width = 4, Height = 3 };\n' +
            'Console.WriteLine(s.Area());   // Calls Rectangle.Area at runtime'
        }
      ]
    }
  }

  if (lang === 'python') {
    return [
      {
        title: 'Looping over a list',
        body:
          'numbers = [1, 2, 3]\n' +
          'total = 0\n' +
          'for n in numbers:\n' +
          '    total += n\n' +
          'print(total)  # 6'
      },
      {
        title: 'Simple function',
        body:
          'def greet(name):\n' + '    print(f"Hello, {name}!")\n\n' + 'greet("Student")'
      },
      {
        title: 'If / else decision',
        body:
          'score = 85\n' +
          'if score >= 80:\n' +
          '    print("Great job!")\n' +
          'else:\n' +
          '    print("Keep practicing!")'
      }
    ]
  }

  if (Array.isArray(levels) && levels.length > 0) {
    const sorted = [...levels].sort((a, b) => a.levelNumber - b.levelNumber)
    const firstFew = sorted.slice(0, 3)

    return firstFew.map(level => ({
      title: `Level ${level.levelNumber}: ${level.title || lessonTitle}`,
      body:
        level.description?.trim() ||
        `A short ${languageSlug} exercise that practices ${lessonTitle.toLowerCase()}.`
    }))
  }

  // Fallback when we don't have level metadata
  return [
    {
      title: 'Inputs and outputs',
      body: 'Take some values, do a small calculation, and show the answer.'
    },
    {
      title: 'Decisions',
      body: 'Use a simple condition (if) to choose between two outputs.'
    }
  ]
}

export default function LessonIntroModal({ lesson, languageSlug, onClose, onStart }: Props) {
  const examples = useMemo(
    () => buildExamples(languageSlug, lesson.levels || [], lesson.title),
    [languageSlug, lesson.levels, lesson.title]
  )

  const friendlyLanguage =
    languageSlug.charAt(0).toUpperCase() + languageSlug.slice(1).toLowerCase()
  const [voiceEnabled, setVoiceEnabled] = useState(true)
  const [typedText, setTypedText] = useState('')
  const typingIndexRef = useRef(0)

  // Build a single narration string for text‑to‑speech
  const narrationText = useMemo(() => {
    const baseDescription =
      (lesson.description || '').split('\n')[0] ||
      `We will start with very basic examples so you can focus on the logic, not on memorizing syntax.`

    const base =
      `Boot sequence complete. Today we will train on ${lesson.title} in ${friendlyLanguage}. ` +
      `You will see tiny code moments with variables, conditions, and loops, then rebuild them with puzzle blocks. `

    return `${base}${baseDescription}`
  }, [lesson.title, lesson.description, friendlyLanguage])

  // Typewriter effect for the CodeBot text, with soft key sounds
  useEffect(() => {
    setTypedText('')
    typingIndexRef.current = 0

    if (!narrationText) return

    let animationFrame: number | null = null
    const typingSpeedMs = 25

    // Simple click sound using Web Audio API (no external assets)
    const AudioContextImpl: typeof AudioContext | undefined =
      typeof window !== 'undefined'
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ((window as any).AudioContext || (window as any).webkitAudioContext)
        : undefined
    const audioCtxRef = { current: AudioContextImpl ? new AudioContextImpl() : null }

    const playKeySound = () => {
      if (!voiceEnabled || !audioCtxRef.current) return
      const ctx = audioCtxRef.current
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => undefined)
      }
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'square'
      osc.frequency.value = 600
      gain.gain.value = 0.02
      osc.connect(gain)
      gain.connect(ctx.destination)
      const now = ctx.currentTime
      osc.start(now)
      osc.stop(now + 0.03)
    }

    let lastSoundIndex = 0

    const step = () => {
      const i = typingIndexRef.current
      if (i >= narrationText.length) {
        return
      }
      const nextIndex = i + 1
      typingIndexRef.current = nextIndex
      setTypedText(narrationText.slice(0, nextIndex))

      // Play a soft click every few characters
      if (nextIndex - lastSoundIndex >= 4) {
        lastSoundIndex = nextIndex
        playKeySound()
      }

      animationFrame = window.setTimeout(step, typingSpeedMs) as unknown as number
    }

    animationFrame = window.setTimeout(step, typingSpeedMs) as unknown as number

    return () => {
      if (animationFrame !== null) {
        window.clearTimeout(animationFrame)
      }
    }
  }, [narrationText, voiceEnabled])

  // Speak narration when modal opens
  useEffect(() => {
    if (!voiceEnabled) return
    if (typeof window === 'undefined' || typeof window.speechSynthesis === 'undefined') {
      return
    }

    const synth = window.speechSynthesis

    // Stop any existing speech
    if (synth.speaking) {
      synth.cancel()
    }

    const utterance = new SpeechSynthesisUtterance(narrationText)
    utterance.rate = 1
    utterance.pitch = 1

    // Try to pick a slightly more "assistant"‑like voice if available
    const voices = synth.getVoices()
    const preferred = voices.find(v =>
      /en/i.test(v.lang || '') && /female|girl|woman|zira|aria/i.test(v.name || '')
    )
    if (preferred) {
      utterance.voice = preferred
    }

    synth.speak(utterance)

    return () => {
      if (synth.speaking) {
        synth.cancel()
      }
    }
  }, [narrationText, voiceEnabled])

  return (
    <div className="auth-overlay" onClick={onClose} style={{ zIndex: 10000 }}>
      {/* Inject lightweight keyframes for bot animation once */}
      <style>
        {`@keyframes codebot-pulse {
            0% { transform: translateY(0px) scale(1); box-shadow: 0 0 14px rgba(56,189,248,0.7); }
            50% { transform: translateY(-4px) scale(1.04); box-shadow: 0 0 24px rgba(129,140,248,0.95); }
            100% { transform: translateY(0px) scale(1); box-shadow: 0 0 14px rgba(56,189,248,0.7); }
          }
          
          @keyframes codebot-sound-wave {
            0% {
              transform: scale(1);
              opacity: 0.7;
            }
            70% {
              transform: scale(1.7);
              opacity: 0.15;
            }
            100% {
              transform: scale(1.9);
              opacity: 0;
            }
          }`}
      </style>
      <div
        className="auth-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 1280,
          width: '98vw',
          maxHeight: '95vh',
          height: 'auto',
          minHeight: '600px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'auto',
          background:
            'radial-gradient(circle at top left, rgba(129, 140, 248, 0.25), transparent 55%), rgba(15, 23, 42, 0.98)'
        }}
      >
        <div className="auth-header" style={{ borderBottom: '1px solid rgba(148, 163, 184, 0.35)' }}>
          <h3 className="auth-title">CodeBot Briefing</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={() => setVoiceEnabled(prev => !prev)}
              style={{
                background: 'transparent',
                border: 'none',
                color: voiceEnabled ? '#a5b4fc' : '#6b7280',
                cursor: 'pointer',
                fontSize: 18
              }}
              title={voiceEnabled ? 'Mute narration' : 'Play narration'}
            >
              {voiceEnabled ? '🔊' : '🔈'}
            </button>
            <button className="auth-close-btn" onClick={onClose}>
              ✕
            </button>
          </div>
        </div>

        <div
          className="auth-body"
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1.5fr)',
            gap: 28,
            alignItems: 'stretch',
            padding: '24px',
            overflowY: 'auto',
            flex: 1
          }}
        >
          {/* Robot + cinematic intro text */}
          <div
            style={{
              borderRight: '1px solid rgba(148, 163, 184, 0.25)',
              paddingRight: 16,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between'
            }}
          >
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  marginBottom: 16
                }}
              >
                <div
                  style={{
                    position: 'relative',
                    width: 100,
                    height: 100,
                    borderRadius: '999px',
                    background:
                      'radial-gradient(circle at 30% 20%, #4ade80, transparent 55%), rgba(15,23,42,1)',
                    border: '3px solid rgba(96, 165, 250, 0.7)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 12px 40px rgba(56, 189, 248, 0.5)',
                    fontSize: 48,
                    animation: 'codebot-pulse 2s ease-in-out infinite',
                    marginLeft: 4,
                    flexShrink: 0
                  }}
                >
                  {voiceEnabled && (
                    <>
                      <span
                        style={{
                          position: 'absolute',
                          left: -8,
                          right: -8,
                          top: -8,
                          bottom: -8,
                          borderRadius: '999px',
                          border: '2px solid rgba(96,165,250,0.65)',
                          animation: 'codebot-sound-wave 1.7s ease-out infinite'
                        }}
                      />
                      <span
                        style={{
                          position: 'absolute',
                          left: -8,
                          right: -8,
                          top: -8,
                          bottom: -8,
                          borderRadius: '999px',
                          border: '2px solid rgba(56,189,248,0.5)',
                          animation: 'codebot-sound-wave 1.7s ease-out infinite',
                          animationDelay: '0.4s'
                        }}
                      />
                    </>
                  )}
                  <span style={{ position: 'relative', zIndex: 1 }}>🤖</span>
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 13,
                      textTransform: 'uppercase',
                      letterSpacing: '0.12em',
                      color: '#a5b4fc',
                      marginBottom: 4
                    }}
                  >
                    CodeBot • Lesson Briefing
                  </div>
                  <h2
                    style={{
                      fontSize: 20,
                      margin: 0,
                      color: '#e5e7eb'
                    }}
                  >
                    {lesson.title}
                  </h2>
                  <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 4 }}>
                    Track: <strong>{friendlyLanguage}</strong>
                  </div>
                </div>
              </div>

              <div
                style={{
                  marginTop: 8,
                  padding: '12px 14px',
                  background: 'rgba(15, 23, 42, 0.9)',
                  borderRadius: 10,
                  border: '1px solid rgba(129, 140, 248, 0.5)',
                  boxShadow: '0 8px 30px rgba(79, 70, 229, 0.4)',
                  fontFamily:
                    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                  fontSize: 13,
                  lineHeight: 1.6,
                  color: '#e5e7eb'
                }}
              >
                <span style={{ color: '#4ade80' }}>CodeBot:</span>{' '}
                <span>{typedText}</span>
              </div>

              <div
                style={{
                  marginTop: 14,
                  fontSize: 14,
                  color: '#cbd5f5',
                  lineHeight: 1.7
                }}
              >
                {(lesson.description || '')
                  .split('\n')[0]
                  .trim() ||
                  `In this lesson you will practice reading small snippets of ${friendlyLanguage} code, predicting what they do, and then rebuilding them in the puzzle view. We start with very basic patterns so you can focus on logic, not memorizing syntax.`}
              </div>
            </div>

            <div
              style={{
                marginTop: 18,
                paddingTop: 10,
                borderTop: '1px dashed rgba(148, 163, 184, 0.4)',
                fontSize: 12,
                color: '#9ca3af'
              }}
            >
              Tip: You can exit the battle at any time, but completed levels will push your skill
              graph forward.
            </div>
          </div>

          {/* Example cards */}
          <div>
            <div
              style={{
                fontSize: 13,
                textTransform: 'uppercase',
                letterSpacing: '0.16em',
                color: '#a5b4fc',
                marginBottom: 8
              }}
            >
              Preview examples
            </div>

            {examples.length === 0 ? (
              <div
                style={{
                  padding: 16,
                  borderRadius: 10,
                  border: '1px dashed rgba(148, 163, 184, 0.5)',
                  color: '#9ca3af',
                  fontSize: 13
                }}
              >
                No concrete level examples yet. You&apos;ll still see a guided puzzle once you
                start the lesson.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '400px', overflowY: 'auto', paddingRight: 8 }}>
                {examples.map((ex, index) => (
                  <div
                    key={index}
                    style={{
                      padding: 12,
                      borderRadius: 10,
                      border: '1px solid rgba(55, 65, 81, 0.9)',
                      background:
                        'linear-gradient(135deg, rgba(15,23,42,0.95), rgba(30,64,175,0.55))'
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 6
                      }}
                    >
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: '#e5e7eb'
                        }}
                      >
                        {ex.title}
                      </div>
                      <span
                        style={{
                          fontSize: 11,
                          padding: '3px 8px',
                          borderRadius: 999,
                          background: 'rgba(15, 118, 110, 0.35)',
                          color: '#a7f3d0',
                          textTransform: 'uppercase',
                          letterSpacing: '0.12em'
                        }}
                      >
                        Example
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        color: '#d1d5db',
                        lineHeight: 1.6
                      }}
                    >
                      {ex.body}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div
              style={{
                marginTop: 18,
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 10
              }}
            >
              <button
                className="btn-secondary"
                type="button"
                onClick={onClose}
                style={{ minWidth: 110 }}
              >
                Not now
              </button>
              <button
                className="btn-primary"
                type="button"
                onClick={onStart}
                style={{ minWidth: 140 }}
              >
                Start Lesson
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}


