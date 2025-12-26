import React, { useState } from 'react'
import { motion } from 'framer-motion'

type Props = {
  title: string
  copy: string
  children?: React.ReactNode
  icon?: React.ReactNode
}

export default function FeatureBlock({ title, copy, children, icon }: Props) {
  const [isHovered, setIsHovered] = useState(false)

  // Get icon based on title if not provided
  const getIcon = () => {
    if (icon) return icon
    if (title.toLowerCase().includes('multiplayer') || title.toLowerCase().includes('battle')) {
      return (
        <motion.div
          animate={{ 
            rotate: isHovered ? [0, -10, 10, -10, 0] : 0,
            scale: isHovered ? 1.1 : 1
          }}
          transition={{ duration: 0.5 }}
          style={{
            fontSize: '48px',
            filter: 'drop-shadow(0 0 20px rgba(123, 92, 255, 0.6))'
          }}
        >
          ⚔️
        </motion.div>
      )
    }
    if (title.toLowerCase().includes('puzzle') || title.toLowerCase().includes('challenge')) {
      return (
        <motion.div
          animate={{ 
            rotate: isHovered ? [0, 15, -15, 15, 0] : 0,
            scale: isHovered ? 1.1 : 1
          }}
          transition={{ duration: 0.5 }}
          style={{
            fontSize: '48px',
            filter: 'drop-shadow(0 0 20px rgba(34, 225, 255, 0.6))'
          }}
        >
          🧩
        </motion.div>
      )
    }
    if (title.toLowerCase().includes('leaderboard')) {
      return (
        <motion.div
          animate={{ 
            rotate: isHovered ? [0, -5, 5, -5, 0] : 0,
            scale: isHovered ? 1.1 : 1
          }}
          transition={{ duration: 0.5 }}
          style={{
            fontSize: '48px',
            filter: 'drop-shadow(0 0 20px rgba(255, 215, 0, 0.6))'
          }}
        >
          🏆
        </motion.div>
      )
    }
    if (title.toLowerCase().includes('achievement')) {
      return (
        <motion.div
          animate={{ 
            rotate: isHovered ? [0, 10, -10, 10, 0] : 0,
            scale: isHovered ? 1.1 : 1
          }}
          transition={{ duration: 0.5 }}
          style={{
            fontSize: '48px',
            filter: 'drop-shadow(0 0 20px rgba(34, 225, 255, 0.6))'
          }}
        >
          🏅
        </motion.div>
      )
    }
    return null
  }

  return (
    <motion.div
      className="card-neon rounded-3 p-4 h-100 position-relative"
      style={{ overflow: 'hidden' }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      whileHover={{ 
        scale: 1.02,
        transition: { duration: 0.3 }
      }}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
    >
      {/* Animated background gradient */}
      <motion.div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: isHovered 
            ? 'radial-gradient(circle at 50% 50%, rgba(123, 92, 255, 0.15), transparent 70%)'
            : 'radial-gradient(circle at 50% 50%, rgba(123, 92, 255, 0.05), transparent 70%)',
          opacity: isHovered ? 1 : 0.5,
          transition: 'opacity 0.3s ease',
          pointerEvents: 'none',
          zIndex: 0
        }}
        animate={{
          scale: isHovered ? [1, 1.2, 1] : 1,
        }}
        transition={{
          duration: 3,
          repeat: isHovered ? Infinity : 0,
          ease: 'easeInOut'
        }}
      />

      {/* Floating particles effect */}
      {isHovered && (
        <>
          {[...Array(6)].map((_, i) => (
            <motion.div
              key={i}
              style={{
                position: 'absolute',
                width: '4px',
                height: '4px',
                background: 'rgba(123, 92, 255, 0.8)',
                borderRadius: '50%',
                left: `${20 + i * 15}%`,
                top: `${10 + i * 10}%`,
                zIndex: 1,
                boxShadow: '0 0 8px rgba(123, 92, 255, 0.8)'
              }}
              animate={{
                y: [0, -30, -60],
                opacity: [0, 1, 0],
                scale: [0.5, 1, 0.5]
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                delay: i * 0.2,
                ease: 'easeOut'
              }}
            />
          ))}
        </>
      )}

      {/* Content */}
      <div style={{ position: 'relative', zIndex: 10 }}>
        {/* Icon */}
        <motion.div
          style={{
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-start'
          }}
          whileHover={{ scale: 1.1 }}
          transition={{ type: 'spring', stiffness: 300 }}
        >
          {getIcon()}
        </motion.div>

        {/* Title with animated color and glow - always visible */}
        <motion.h5 
          className="fw-semibold mb-3"
          style={{
            fontSize: '1.5rem',
            position: 'relative',
            display: 'inline-block',
            margin: 0,
            zIndex: 20,
            color: isHovered ? '#7b5cff' : '#eae6ff',
            transition: 'color 0.3s ease'
          }}
          animate={{
            textShadow: isHovered 
              ? '0 0 20px rgba(123, 92, 255, 0.6), 0 0 40px rgba(34, 225, 255, 0.4), 0 0 60px rgba(123, 92, 255, 0.2)' 
              : '0 0 0px rgba(123, 92, 255, 0)'
          }}
        >
          {title}
        </motion.h5>

        {/* Description */}
        <motion.p 
          className="muted mb-3"
          style={{ 
            lineHeight: '1.6',
            fontSize: '0.95rem'
          }}
          animate={{
            color: isHovered ? 'rgba(234, 230, 255, 0.9)' : 'rgba(188, 178, 217, 0.8)'
          }}
          transition={{ duration: 0.3 }}
        >
          {copy}
        </motion.p>

        {/* Decorative line */}
        <motion.div
          style={{
            height: '2px',
            background: 'linear-gradient(90deg, transparent, rgba(123, 92, 255, 0.5), transparent)',
            marginTop: '16px',
            borderRadius: '2px'
          }}
          animate={{
            width: isHovered ? '100%' : '60%',
            opacity: isHovered ? 1 : 0.6
          }}
          transition={{ duration: 0.3 }}
        />

      {children}
    </div>

      {/* Corner accent */}
      <motion.div
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: '60px',
          height: '60px',
          background: 'linear-gradient(135deg, rgba(123, 92, 255, 0.2), transparent)',
          borderBottomLeftRadius: '12px',
          borderTopRightRadius: '12px',
          zIndex: 1
        }}
        animate={{
          opacity: isHovered ? 1 : 0.3,
          scale: isHovered ? 1.2 : 1
        }}
        transition={{ duration: 0.3 }}
      />
    </motion.div>
  )
}


