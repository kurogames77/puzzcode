import React, { useEffect, useRef } from 'react'

interface PuzzleBlock {
  x: number
  y: number
  width: number
  height: number
  speed: number
  opacity: number
  colorScheme: { start: string; end: string; stroke: string; glow: string }
  topShape: 'tab' | 'slot' | 'flat'
  bottomShape: 'tab' | 'slot' | 'flat'
  leftShape: 'tab' | 'slot' | 'flat'
  rightShape: 'tab' | 'slot' | 'flat'
  rotation: number
}

export default function MatrixEffect() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationFrameRef = useRef<number>()
  const blocksRef = useRef<PuzzleBlock[]>([])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas size
    const resizeCanvas = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)

    // Block size - make them bigger and more visible
    const blockSize = 65
    const maxBlocks = 22 // Maximum number of blocks on screen

    // Color gradients for puzzle blocks - more vibrant and game-like
    const blockColorSchemes = [
      { 
        start: 'rgba(123, 92, 255, 0.9)', 
        end: 'rgba(88, 60, 220, 0.9)',
        stroke: 'rgba(60, 40, 180, 0.95)',
        glow: 'rgba(123, 92, 255, 0.6)'
      },   // Purple gradient
      { 
        start: 'rgba(34, 225, 255, 0.9)', 
        end: 'rgba(20, 180, 220, 0.9)',
        stroke: 'rgba(15, 140, 180, 0.95)',
        glow: 'rgba(34, 225, 255, 0.6)'
      },   // Cyan gradient
      { 
        start: 'rgba(179, 136, 255, 0.85)', 
        end: 'rgba(140, 100, 220, 0.85)',
        stroke: 'rgba(110, 70, 190, 0.9)',
        glow: 'rgba(179, 136, 255, 0.5)'
      },   // Light purple gradient
      { 
        start: 'rgba(30, 76, 255, 0.85)', 
        end: 'rgba(20, 50, 200, 0.85)',
        stroke: 'rgba(15, 35, 160, 0.9)',
        glow: 'rgba(30, 76, 255, 0.5)'
      },   // Blue gradient
    ]

    // Function to randomly select tab, slot, or flat
    const randomShape = (): 'tab' | 'slot' | 'flat' => {
      const rand = Math.random()
      if (rand < 0.4) return 'tab'
      if (rand < 0.7) return 'slot'
      return 'flat'
    }

    // Function to create a new puzzle block
    const createBlock = (): PuzzleBlock => {
      return {
        x: Math.random() * (canvas.width - blockSize * 2),
        y: -blockSize - Math.random() * 300,
        width: blockSize,
        height: blockSize,
        speed: 0.6 + Math.random() * 1.4,
        opacity: 0.75 + Math.random() * 0.2,
        colorScheme: blockColorSchemes[Math.floor(Math.random() * blockColorSchemes.length)],
        topShape: randomShape(),
        bottomShape: randomShape(),
        leftShape: randomShape(),
        rightShape: randomShape(),
        rotation: (Math.random() - 0.5) * 0.05, // Small random rotation for variety (subtle)
      }
    }

    // Initialize blocks
    blocksRef.current = []
    for (let i = 0; i < maxBlocks; i++) {
      blocksRef.current.push(createBlock())
    }

    // Function to draw a puzzle block with jigsaw tabs (matching game style)
    const drawPuzzleBlock = (
      ctx: CanvasRenderingContext2D,
      x: number,
      y: number,
      width: number,
      height: number,
      colorScheme: { start: string; end: string; stroke: string; glow: string },
      opacity: number,
      shapes: { top: 'tab' | 'slot' | 'flat'; bottom: 'tab' | 'slot' | 'flat'; left: 'tab' | 'slot' | 'flat'; right: 'tab' | 'slot' | 'flat' },
      rotation: number
    ) => {
      const tabSize = 14
      const tabRadius = 6
      const w = width
      const h = height
      const centerX = w / 2
      const centerY = h / 2
      const t = tabSize
      const r = tabRadius

      ctx.save()
      
      // Apply rotation around center
      ctx.translate(x + centerX, y + centerY)
      ctx.rotate(rotation)
      ctx.translate(-(x + centerX), -(y + centerY))
      
      // Create gradient
      const gradient = ctx.createLinearGradient(x, y, x + w, y + h)
      gradient.addColorStop(0, colorScheme.start)
      gradient.addColorStop(1, colorScheme.end)
      
      // Draw glow/shadow effect
      ctx.shadowBlur = 8
      ctx.shadowColor = colorScheme.glow
      ctx.shadowOffsetX = 0
      ctx.shadowOffsetY = 2
      
      ctx.globalAlpha = opacity
      ctx.fillStyle = gradient
      ctx.strokeStyle = colorScheme.stroke
      ctx.lineWidth = 2.5

      ctx.beginPath()

      // Start at top-left corner with rounded corner
      ctx.moveTo(x, y + r)
      ctx.quadraticCurveTo(x, y, x + r, y)

      // Top edge
      if (shapes.top === 'tab') {
        // Top tab (protrusion outward)
        ctx.lineTo(x + centerX - t / 2 - r, y)
        ctx.quadraticCurveTo(x + centerX - t / 2, y, x + centerX - t / 2, y - r)
        ctx.lineTo(x + centerX - t / 2, y - t + r)
        ctx.quadraticCurveTo(x + centerX - t / 2, y - t, x + centerX - t / 2 + r, y - t)
        ctx.lineTo(x + centerX + t / 2 - r, y - t)
        ctx.quadraticCurveTo(x + centerX + t / 2, y - t, x + centerX + t / 2, y - t + r)
        ctx.lineTo(x + centerX + t / 2, y - r)
        ctx.quadraticCurveTo(x + centerX + t / 2, y, x + centerX + t / 2 + r, y)
      } else if (shapes.top === 'slot') {
        // Top slot (indentation inward)
        ctx.lineTo(x + centerX - t / 2 - r, y)
        ctx.quadraticCurveTo(x + centerX - t / 2, y, x + centerX - t / 2, y + r)
        ctx.lineTo(x + centerX - t / 2, y + t - r)
        ctx.quadraticCurveTo(x + centerX - t / 2, y + t, x + centerX - t / 2 + r, y + t)
        ctx.lineTo(x + centerX + t / 2 - r, y + t)
        ctx.quadraticCurveTo(x + centerX + t / 2, y + t, x + centerX + t / 2, y + t - r)
        ctx.lineTo(x + centerX + t / 2, y + r)
        ctx.quadraticCurveTo(x + centerX + t / 2, y, x + centerX + t / 2 + r, y)
      }
      // else flat - just continue

      ctx.lineTo(x + w - r, y)
      ctx.quadraticCurveTo(x + w, y, x + w, y + r)

      // Right edge
      if (shapes.right === 'tab') {
        // Right tab (protrusion outward)
        ctx.lineTo(x + w, y + centerY - t / 2 - r)
        ctx.quadraticCurveTo(x + w, y + centerY - t / 2, x + w + r, y + centerY - t / 2)
        ctx.lineTo(x + w + t - r, y + centerY - t / 2)
        ctx.quadraticCurveTo(x + w + t, y + centerY - t / 2, x + w + t, y + centerY - t / 2 + r)
        ctx.lineTo(x + w + t, y + centerY + t / 2 - r)
        ctx.quadraticCurveTo(x + w + t, y + centerY + t / 2, x + w + t - r, y + centerY + t / 2)
        ctx.lineTo(x + w + r, y + centerY + t / 2)
        ctx.quadraticCurveTo(x + w, y + centerY + t / 2, x + w, y + centerY + t / 2 + r)
      } else if (shapes.right === 'slot') {
        // Right slot (indentation inward)
        ctx.lineTo(x + w, y + centerY - t / 2 - r)
        ctx.quadraticCurveTo(x + w, y + centerY - t / 2, x + w - r, y + centerY - t / 2)
        ctx.lineTo(x + w - t + r, y + centerY - t / 2)
        ctx.quadraticCurveTo(x + w - t, y + centerY - t / 2, x + w - t, y + centerY - t / 2 + r)
        ctx.lineTo(x + w - t, y + centerY + t / 2 - r)
        ctx.quadraticCurveTo(x + w - t, y + centerY + t / 2, x + w - t + r, y + centerY + t / 2)
        ctx.lineTo(x + w - r, y + centerY + t / 2)
        ctx.quadraticCurveTo(x + w, y + centerY + t / 2, x + w, y + centerY + t / 2 + r)
      }
      // else flat - just continue

      ctx.lineTo(x + w, y + h - r)
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)

      // Bottom edge
      if (shapes.bottom === 'tab') {
        // Bottom tab (protrusion outward)
        ctx.lineTo(x + centerX + t / 2 + r, y + h)
        ctx.quadraticCurveTo(x + centerX + t / 2, y + h, x + centerX + t / 2, y + h + r)
        ctx.lineTo(x + centerX + t / 2, y + h + t - r)
        ctx.quadraticCurveTo(x + centerX + t / 2, y + h + t, x + centerX + t / 2 - r, y + h + t)
        ctx.lineTo(x + centerX - t / 2 + r, y + h + t)
        ctx.quadraticCurveTo(x + centerX - t / 2, y + h + t, x + centerX - t / 2, y + h + t - r)
        ctx.lineTo(x + centerX - t / 2, y + h + r)
        ctx.quadraticCurveTo(x + centerX - t / 2, y + h, x + centerX - t / 2 - r, y + h)
      } else if (shapes.bottom === 'slot') {
        // Bottom slot (indentation inward)
        ctx.lineTo(x + centerX + t / 2 + r, y + h)
        ctx.quadraticCurveTo(x + centerX + t / 2, y + h, x + centerX + t / 2, y + h - r)
        ctx.lineTo(x + centerX + t / 2, y + h - t + r)
        ctx.quadraticCurveTo(x + centerX + t / 2, y + h - t, x + centerX + t / 2 - r, y + h - t)
        ctx.lineTo(x + centerX - t / 2 + r, y + h - t)
        ctx.quadraticCurveTo(x + centerX - t / 2, y + h - t, x + centerX - t / 2, y + h - t + r)
        ctx.lineTo(x + centerX - t / 2, y + h - r)
        ctx.quadraticCurveTo(x + centerX - t / 2, y + h, x + centerX - t / 2 - r, y + h)
      }
      // else flat - just continue

      ctx.lineTo(x + r, y + h)
      ctx.quadraticCurveTo(x, y + h, x, y + h - r)

      // Left edge
      if (shapes.left === 'tab') {
        // Left tab (protrusion outward)
        ctx.lineTo(x, y + centerY + t / 2 + r)
        ctx.quadraticCurveTo(x, y + centerY + t / 2, x - r, y + centerY + t / 2)
        ctx.lineTo(x - t + r, y + centerY + t / 2)
        ctx.quadraticCurveTo(x - t, y + centerY + t / 2, x - t, y + centerY + t / 2 - r)
        ctx.lineTo(x - t, y + centerY - t / 2 + r)
        ctx.quadraticCurveTo(x - t, y + centerY - t / 2, x - t + r, y + centerY - t / 2)
        ctx.lineTo(x - r, y + centerY - t / 2)
        ctx.quadraticCurveTo(x, y + centerY - t / 2, x, y + centerY - t / 2 - r)
      } else if (shapes.left === 'slot') {
        // Left slot (indentation inward)
        ctx.lineTo(x, y + centerY + t / 2 + r)
        ctx.quadraticCurveTo(x, y + centerY + t / 2, x + r, y + centerY + t / 2)
        ctx.lineTo(x + t - r, y + centerY + t / 2)
        ctx.quadraticCurveTo(x + t, y + centerY + t / 2, x + t, y + centerY + t / 2 - r)
        ctx.lineTo(x + t, y + centerY - t / 2 + r)
        ctx.quadraticCurveTo(x + t, y + centerY - t / 2, x + t - r, y + centerY - t / 2)
        ctx.lineTo(x + r, y + centerY - t / 2)
        ctx.quadraticCurveTo(x, y + centerY - t / 2, x, y + centerY - t / 2 - r)
      }
      // else flat - just continue

      ctx.lineTo(x, y + r)
      ctx.closePath()
      
      // Fill with gradient
      ctx.fill()
      
      // Draw inner highlight for 3D effect
      ctx.save()
      ctx.globalAlpha = opacity * 0.3
      const highlightGradient = ctx.createLinearGradient(x, y, x, y + h * 0.4)
      highlightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.4)')
      highlightGradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
      ctx.fillStyle = highlightGradient
      ctx.fill()
      ctx.restore()
      
      // Draw stroke
      ctx.shadowBlur = 0
      ctx.stroke()
      
      // Draw inner shadow for depth
      ctx.save()
      ctx.globalAlpha = opacity * 0.2
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)'
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.restore()
      
      ctx.restore()
    }

    let lastTime = 0
    const animate = (currentTime: number) => {
      if (!lastTime) lastTime = currentTime
      const deltaTime = currentTime - lastTime
      lastTime = currentTime

      // Clear canvas completely (no fade trail)
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Update and draw blocks
      blocksRef.current.forEach((block, index) => {
        // Update position
        block.y += block.speed * (deltaTime / 16)

        // Reset block if it falls off screen
        if (block.y > canvas.height + blockSize) {
          blocksRef.current[index] = createBlock()
        }

        // Draw block if visible
        if (block.y > -blockSize * 2 && block.y < canvas.height + blockSize * 2) {
          drawPuzzleBlock(ctx, block.x, block.y, block.width, block.height, block.colorScheme, block.opacity, {
            top: block.topShape,
            bottom: block.bottomShape,
            left: block.leftShape,
            right: block.rightShape
          }, block.rotation)
        }
      })

      animationFrameRef.current = requestAnimationFrame(animate)
    }

    animationFrameRef.current = requestAnimationFrame(animate)

    return () => {
      window.removeEventListener('resize', resizeCanvas)
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="matrix-effect"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        pointerEvents: 'none',
        opacity: 0.8
      }}
    />
  )
}

