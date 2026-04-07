import React from 'react';
import './Sidebar.css';

const NAV = [
  { id: 'overview', label: 'Overview' },
  { id: 'reports', label: 'Reports' },
  { id: 'ai-analyst', label: 'AI Analyst' },
  { id: 'audit', label: 'Audit Trail' },
  { id: 'review-queue', label: 'Review Queue' },
  { id: 'import-center', label: 'Import Center' },
  { id: 'settings', label: 'Settings' },
];

export default function Sidebar({ active, onNavigate }) {
  return (
    <header className="sidebar">
      <div className="sidebar-shell">
        <button className="sidebar-logo" type="button" onClick={() => onNavigate('overview')}>
          <span className="sidebar-logo-icon">FA</span>
          <span className="sidebar-logo-text">Fin<span className="gradient-text">AI</span></span>
        </button>

        <nav className="sidebar-nav" aria-label="Primary">
          {NAV.map((item) => (
            <button
              key={item.id}
              className={`sidebar-item ${active === item.id ? 'active' : ''}`}
              onClick={() => onNavigate(item.id)}
            >
              <span className="sidebar-item-label">{item.label}</span>
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}
