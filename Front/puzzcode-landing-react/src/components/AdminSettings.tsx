import React from 'react'

export default function AdminSettings() {
  const settings = [
    { key: 'registrationOpen', label: 'Allow new registrations', value: true },
    { key: 'maintenanceMode', label: 'Maintenance mode', value: false },
    { key: 'emailNotifications', label: 'Email notifications', value: true }
  ]

  return (
    <div className="admin-settings">
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Configure platform settings</p>
        </div>
      </div>
      <div className="dashboard-grid">
        <div className="dashboard-card">
          <div className="card-header">
            <h3 className="card-title">Platform Settings</h3>
          </div>
          <div className="card-content">
            <div className="quick-actions">
              {settings.map(s => (
                <button key={s.key} className="action-btn">
                  <span className="action-icon">{s.value ? '✅' : '⛔'}</span>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
