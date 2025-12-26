import React, { useState, useEffect, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

export default function Navbar() {
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [filteredCourses, setFilteredCourses] = useState<Array<{ id: string; title: string; description: string; icon: string }>>([])
  const [scrolled, setScrolled] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)

  // Shrink navbar on scroll
  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 10)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const allCourses: Array<{ id: string; title: string; description: string; icon: string }> = [
    { id: 'python', title: 'Python', description: 'Learn programming fundamentals such as variables, loops, and functions...', icon: '/python-logo.png' },
    { id: 'csharp', title: 'C#', description: 'Robust object-oriented programming for web, game, and enterprise development...', icon: '/csharp_logo-221dcba91bfe189e98c562b90269b16f.png' },
    { id: 'javascript', title: 'JavaScript', description: 'Learn variables, loops, functions, and events to start building interactive websites...', icon: '/javascript-logo-javascript-icon-transparent-free-png.webp' },
    { id: 'cpp', title: 'C++', description: 'High performance systems programming and game development...', icon: '/c-logo-a2fa.png' },
    { id: 'php', title: 'PHP', description: 'Server-side scripting for dynamic web applications...', icon: '/php_PNG43.png' },
    { id: 'mysql', title: 'MySQL', description: 'Relational database management and SQL query optimization...', icon: '/269-2693201_mysql-logo-circle-png.png' },
    { id: 'html', title: 'HTML', description: 'Create your first website with HTML, the building blocks of the web...', icon: '/c-logo-a2fa.png' }
  ]

  // Filter immediately on each keystroke
  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredCourses(allCourses.slice(0, 3)) // Show first 3 as "popular"
    } else {
      const filtered = allCourses.filter(course => 
        course.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        course.description.toLowerCase().includes(searchQuery.toLowerCase())
      )
      setFilteredCourses(filtered)
    }
  }, [searchQuery])

  // Manage body scroll lock and focus when search opens
  useEffect(() => {
    if (showSearch) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      // Focus input after next paint
      requestAnimationFrame(() => inputRef.current?.focus())

      const onKeyDown = (e: KeyboardEvent) => {
        // ESC to close
        if (e.key === 'Escape') {
          e.preventDefault()
          setShowSearch(false)
        }
        // Prevent Enter from triggering unintended navigation while searching
        if (e.key === 'Enter') {
          e.preventDefault()
        }
      }
      window.addEventListener('keydown', onKeyDown)

      return () => {
        document.body.style.overflow = prev
        window.removeEventListener('keydown', onKeyDown)
      }
    }
  }, [showSearch])

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value)
  }

  const clearSearch = () => {
    setSearchQuery('')
  }

  return (
    <>
      <nav className={`navbar navbar-expand-lg nav-glass ${scrolled ? 'nav-shrink' : ''}`}>
        <div className={`container ${scrolled ? 'py-1' : 'py-2'}`}>
          <Link to="/" className="navbar-brand fw-bold text-light">
            <span className="logo-dot" />
            PuzzCode
          </Link>
          <button className="navbar-toggler text-light" type="button" data-bs-toggle="collapse" data-bs-target="#pcNav" aria-controls="pcNav" aria-expanded="false" aria-label="Toggle navigation">
            ☰
          </button>
          <div className="collapse navbar-collapse" id="pcNav">
            <ul className="navbar-nav ms-auto gap-lg-3 align-items-lg-center">
              <li className="nav-item"><a className="nav-link" href="#languages">Languages</a></li>
              <li className="nav-item"><a className="nav-link" href="#features">Features</a></li>
            </ul>
          </div>
          {location.pathname.startsWith('/lang/') ? (
            <button
              className="btn btn-outline-light btn-sm"
              onClick={() => navigate(-1)}
            >
              ← Back
            </button>
          ) : (
            <button 
              className="btn btn-outline-light btn-sm ms-3 ms-lg-4"
              onClick={() => setShowSearch(true)}
            >
              <img src="/searchicon.png" alt="Search" style={{ width: 18, height: 18, display: 'block' }} />
            </button>
          )}
        </div>
      </nav>

      {showSearch && (
        <div className="search-overlay" onClick={() => setShowSearch(false)}>
          <div className="search-modal" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
            <div className="search-header">
              <div className="search-input-container">
                <span className="search-icon">🔍</span>
                <input 
                  type="text" 
                  placeholder="Search courses, users, and more..." 
                  className="search-input"
                  value={searchQuery}
                  onChange={handleSearchChange}
                  ref={inputRef}
                />
                {searchQuery && (
                  <button 
                    className="clear-btn"
                    onClick={clearSearch}
                  >
                    ✕
                  </button>
                )}
              </div>
              <button 
                className="close-btn"
                onClick={() => setShowSearch(false)}
              >
                Close
              </button>
            </div>
            <div className="search-content">
              <h6 className="popular-courses-title">
                {searchQuery.trim() === '' ? 'POPULAR COURSES' : 'SEARCH RESULTS'}
              </h6>
              <div className="course-list">
                {filteredCourses.length > 0 ? (
                filteredCourses.map((course: { id: string; title: string; description: string; icon: string }) => (
                  <Link key={course.id} to={`/lang/${course.id}`} className="text-decoration-none">
                      <div className={`course-item`}>
                        <div className="course-icon">
                          <img src={course.icon} alt={`${course.title} logo`} />
                        </div>
                        <div className="course-info">
                          <h6 className="course-title">{course.title}</h6>
                          <p className="course-description">{course.description}</p>
                        </div>
                      </div>
                    </Link>
                  ))
                ) : (
                  <div className="no-results">
                    <p className="text-muted">No courses found for "{searchQuery}"</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}


