import React from 'react';
import './Sidebar.css';

const NAV = [
  { id: 'dashboard',     icon: '◈',  label: 'Dashboard' },
  { id: 'income',        icon: '↑',  label: 'Income' },
  { id: 'expenses',      icon: '↓',  label: 'Expenses' },
  { id: 'subscriptions', icon: '⟳',  label: 'Subscriptions' },
  { id: 'csv-import',    icon: '⊞',  label: 'Import CSV' },
  { id: 'budget-goals',  icon: '◎',  label: 'Budget Goals' },
  { id: 'ai-advisor',    icon: '✦',  label: 'AI Advisor' },
  { id: 'settings',      icon: '⚙',  label: 'Settings' },
];

export default function Sidebar({ active, onNavigate }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <span className="sidebar-logo-icon">◈</span>
        <span className="sidebar-logo-text">Finance<span className="gradient-text">AI</span></span>
      </div>

      <nav className="sidebar-nav">
        {NAV.map(item => (
          <button
            key={item.id}
            className={`sidebar-item ${active === item.id ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <span className="sidebar-item-icon">{item.icon}</span>
            <span className="sidebar-item-label">{item.label}</span>
            {active === item.id && <span className="sidebar-active-bar" />}
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-footer-text">FinanceAI v1.0</div>
        <div className="sidebar-footer-sub">Local & Private</div>
      </div>
    </aside>
  );
}
