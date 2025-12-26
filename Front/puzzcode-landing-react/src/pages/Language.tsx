import React, { useMemo } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'

export default function Language() {
  const { id } = useParams()
  const langId = (id || '').toLowerCase()
  const navigate = useNavigate()

  const curriculum = useMemo(() => {
    type Section = { level: 'Beginner' | 'Intermediate' | 'Advanced', topics: string[] }
    type Lang = { title: string; intro: string; sections: Section[] }
    const base = (title: string, intro: string, sections: Section[]): Lang => ({ title, intro, sections })
    const data: Record<string, Lang> = {
      python: base('Python', 'Beginner-friendly language great for scripting, data and web.', [
        { level: 'Beginner', topics: ['Syntax, variables, and types', 'Control flow and loops', 'Functions and modules', 'Lists, tuples, dictionaries'] },
        { level: 'Intermediate', topics: ['Files and exceptions', 'OOP basics (classes/objects)', 'Virtual environments and packages', 'List/dict comprehensions'] },
        { level: 'Advanced', topics: ['Generators and iterators', 'Decorators and context managers', 'Asyncio concurrency', 'Testing and packaging'] }
      ]),
      csharp: base('C#', 'Modern, strongly-typed OOP for web, desktop, and games.', [
        { level: 'Beginner', topics: ['Syntax and types', 'Flow control', 'Methods and classes', 'Collections and LINQ basics'] },
        { level: 'Intermediate', topics: ['Interfaces and inheritance', 'Generics', 'Exception handling', 'Async/await'] },
        { level: 'Advanced', topics: ['LINQ deep-dive', 'Dependency injection basics', 'Unit testing', 'Performance tips'] }
      ]),
      javascript: base('JavaScript', 'The language of the web for front-end and back-end.', [
        { level: 'Beginner', topics: ['Syntax and variables', 'DOM basics', 'Functions and scopes', 'Arrays/objects'] },
        { level: 'Intermediate', topics: ['Promises and async/await', 'Modules', 'Fetch and APIs', 'ES6+ features'] },
        { level: 'Advanced', topics: ['Event loop internals', 'Performance and memory', 'Testing', 'Patterns and architecture'] }
      ]),
      cpp: base('C++', 'High-performance systems and game development.', [
        { level: 'Beginner', topics: ['Syntax, I/O', 'Control flow', 'Functions', 'Pointers and references'] },
        { level: 'Intermediate', topics: ['Classes and RAII', 'STL containers and algorithms', 'Templates', 'Compilation and linking'] },
        { level: 'Advanced', topics: ['Smart pointers', 'Move semantics', 'Concurrency', 'Profiling and optimization'] }
      ]),
      php: base('PHP', 'Server-side scripting for web applications.', [
        { level: 'Beginner', topics: ['Syntax and variables', 'Arrays and strings', 'Forms and superglobals', 'Basic CRUD with PDO'] },
        { level: 'Intermediate', topics: ['Sessions and auth', 'OOP basics', 'Composer and autoloading', 'Error handling'] },
        { level: 'Advanced', topics: ['MVC concepts', 'Testing', 'Security best practices', 'Performance'] }
      ]),
      mysql: base('MySQL', 'Relational database fundamentals and SQL.', [
        { level: 'Beginner', topics: ['SELECT, INSERT, UPDATE, DELETE', 'WHERE and ORDER BY', 'Aggregations and GROUP BY', 'Joins basics'] },
        { level: 'Intermediate', topics: ['Subqueries and views', 'Indexes', 'Transactions', 'Schema design'] },
        { level: 'Advanced', topics: ['Stored procedures', 'Query optimization', 'Locking and isolation', 'Backup and replication basics'] }
      ])
    }
    return data[langId] || base(id || 'Language', 'Curriculum coming soon.', [
      { level: 'Beginner', topics: [] },
      { level: 'Intermediate', topics: [] },
      { level: 'Advanced', topics: [] }
    ])
  }, [id])
  return (
    <div className="page-shell">
      <Navbar />
      <div className="container" style={{ paddingTop: 96, paddingBottom: 96 }}>
        <h3 className="mb-2">{curriculum.title}</h3>
        <p className="muted mb-4">{curriculum.intro}</p>

        <div className="dashboard-grid" style={{ marginBottom: 24 }}>
          {curriculum.sections.map((section, idx) => (
            <div key={idx} className="dashboard-card">
              <div className="card-header">
                <h3 className="card-title">{section.level}</h3>
              </div>
              <div className="card-content">
                {section.topics.length > 0 ? (
                  <ul className="mb-3" style={{ paddingLeft: 18 }}>
                    {section.topics.map((t, i) => (
                      <li key={i} style={{ marginBottom: 6 }}>{t}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">Coming soon.</p>
                )}
                <Link to="/" className="btn btn-primary btn-sm">Start Learning</Link>
              </div>
            </div>
          ))}
        </div>
        {/* Removed Courses in <Language> section per request */}

      </div>
    </div>
  )
}


