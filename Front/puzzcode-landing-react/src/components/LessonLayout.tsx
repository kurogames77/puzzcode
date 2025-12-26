import React from 'react'
import { Outlet } from 'react-router-dom'

export default function LessonLayout() {
  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
      padding: '20px'
    }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <Outlet />
      </div>
    </div>
  )
}

