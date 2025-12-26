import React, { useState } from 'react'
import { motion } from 'framer-motion'
import Navbar from '../components/Navbar'
import GlowOrb from '../components/GlowOrb'
import LanguageCarousel from '../components/LanguageCarousel'
import FeatureBlock from '../components/FeatureBlock'
import AuthModal from '../components/AuthModal'
import MatrixEffect from '../components/MatrixEffect'

export default function Landing() {
  const [showAuthModal, setShowAuthModal] = useState(false)
  const fadeUp = {
    hidden: { opacity: 0, y: 24 },
    visible: (i: number = 0) => ({
      opacity: 1,
      y: 0,
      transition: { duration: 0.6, ease: 'easeOut', delay: 0.1 * i }
    })
  }

  return (
    <div className="page-shell">
      <Navbar />
      <header className="hero container position-relative">
        <div className="fx-background" />
        <MatrixEffect />
        <GlowOrb style={{ top: -120, left: '50%', transform: 'translateX(-50%)' }} />
        <motion.h1
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
          className="display-4 hero-title mt-5"
        >
          <span className="typewriter">PuzzCode</span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.6 }}
          className="muted mb-3"
          style={{
            fontSize: '20px',
            fontWeight: 500,
            color: 'rgba(255, 255, 255, 0.95)',
            textShadow: '0 2px 8px rgba(0, 0, 0, 0.5), 0 0 20px rgba(123, 92, 255, 0.4)'
          }}
        >
          Code. Play. Conquer
        </motion.p>
        <motion.button 
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.98 }}
          className="btn btn-lg hero-cta px-4" 
          onClick={() => setShowAuthModal(true)}
        >
          Let's Begin
        </motion.button>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.6 }}
          style={{ 
            marginTop: '24px', 
            fontSize: '18px', 
            color: 'rgba(255, 255, 255, 0.9)',
            fontStyle: 'italic',
            fontWeight: 400,
            textShadow: '0 2px 6px rgba(0, 0, 0, 0.6), 0 0 15px rgba(34, 225, 255, 0.3)',
            padding: '0 20px'
          }}
        >
          "Master coding through puzzles, compete with peers, and level up your skills!"
        </motion.p>
      </header>

      <motion.section
        id="languages"
        className="container py-4 position-relative"
        style={{ paddingTop: '120px', paddingBottom: '90px' }}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-80px' }}
      >
        <GlowOrb style={{ top: -40, left: 60 }} />
        <motion.h5
          variants={fadeUp}
          className="section-title mb-3 text-center"
        >
          Featured Languages
        </motion.h5>
        <motion.div variants={fadeUp} style={{ marginTop: '88px' }}>
          <LanguageCarousel
            items={[
              { id: 'python', title: 'Python', summary: 'Beginner friendly, versatile scripting.', icon: '/python-logo.png' },
              { id: 'csharp', title: 'C#', summary: 'Robust OOP for web, game, and enterprise.', icon: '/csharp_logo-221dcba91bfe189e98c562b90269b16f.png' },
              { id: 'javascript', title: 'JavaScript', summary: 'The language of the web.', icon: '/javascript-logo-javascript-icon-transparent-free-png.webp' },
              { id: 'cpp', title: 'C++', summary: 'High performance systems and games.', icon: '/c-logo-a2fa.png' },
              { id: 'php', title: 'PHP', summary: 'Server-side productivity.', icon: '/php_PNG43.png' },
              { id: 'mysql', title: 'MySQL', summary: 'Relational database fundamentals.', icon: '/269-2693201_mysql-logo-circle-png.png' }
            ]}
          />
        </motion.div>
      </motion.section>

      <motion.section
        id="features"
        className="container py-5 position-relative"
        style={{ paddingTop: '40px', paddingBottom: '120px' }}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-80px' }}
      >
        <GlowOrb style={{ top: 0, right: 60 }} />
        
        {/* Animated title with glow effect */}
        <motion.h5
          variants={fadeUp}
          className="section-title mb-5 text-center"
          style={{ position: 'relative' }}
        >
          <motion.span
            initial={{ opacity: 0, scale: 0.8 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            style={{
              display: 'inline-block',
              background: 'linear-gradient(135deg, #7b5cff, #22e1ff)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              position: 'relative'
            }}
          >
            Features
            <motion.div
              style={{
                position: 'absolute',
                bottom: '-8px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: '60px',
                height: '3px',
                background: 'linear-gradient(90deg, transparent, #7b5cff, #22e1ff, transparent)',
                borderRadius: '2px'
              }}
              initial={{ width: 0, opacity: 0 }}
              whileInView={{ width: '60px', opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: 0.5 }}
            />
          </motion.span>
        </motion.h5>

        <div className="row g-4 align-items-stretch">
          <motion.div 
            className="col-12 col-md-6" 
            variants={fadeUp} 
            custom={0}
            whileHover={{ 
              scale: 1.01,
              transition: { duration: 0.2 }
            }}
          >
            <FeatureBlock 
              title="Multiplayer Coding Battle" 
              copy="Face off with friends or rivals in a fast, competitive coding battle. Join the battle and climb the Leaderboards, Earn Experience Points with each victory, unlock tiers, and display your progress on seasonal leaderboards. Focused on fair, skill-based progression." 
            />
          </motion.div>
          <motion.div 
            className="col-12 col-md-6" 
            variants={fadeUp} 
            custom={1}
            whileHover={{ 
              scale: 1.01,
              transition: { duration: 0.2 }
            }}
          >
            <FeatureBlock 
              title="Puzzle Challenge" 
              copy="Unleash your problem-solving potential! Every puzzle solved is a step closer to coding mastery. Challenge yourself with brain-teasing algorithms, unlock new difficulty levels, and watch your logical thinking skills soar. Join thousands of students who've transformed their coding abilities through our engaging puzzle system!" 
            />
          </motion.div>
          <motion.div 
            className="col-12 col-md-6" 
            variants={fadeUp} 
            custom={2}
            whileHover={{ 
              scale: 1.01,
              transition: { duration: 0.2 }
            }}
          >
            <FeatureBlock 
              title="Leaderboards" 
              copy="Compete for the top spots and see how you rank against other coders! Climb the global leaderboards, track your progress over time, and showcase your coding prowess. With seasonal rankings and skill-based tiers, every victory brings you closer to the top. Join the elite ranks of the best programmers!" 
            />
          </motion.div>
          <motion.div 
            className="col-12 col-md-6" 
            variants={fadeUp} 
            custom={3}
            whileHover={{ 
              scale: 1.01,
              transition: { duration: 0.2 }
            }}
          >
            <FeatureBlock 
              title="Achievements" 
              copy="Unlock badges and achievements as you progress through your coding journey! Celebrate milestones, complete challenges, and earn recognition for your dedication. From first puzzle solved to coding master, track your accomplishments and build your coding legacy. Every achievement tells your story!" 
            />
          </motion.div>
        </div>
      </motion.section>

      <footer className="container py-4 text-center">
        <small className="muted">© {new Date().getFullYear()} PuzzCode</small>
      </footer>

      {showAuthModal && (
        <AuthModal onClose={() => setShowAuthModal(false)} />
      )}
    </div>
  )
}


