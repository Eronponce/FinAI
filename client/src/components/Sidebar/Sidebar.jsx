import React from 'react';
import './Sidebar.css';

const NAV = [
  { id: 'dashboard',     icon: '◈',  label: 'Dashboard' },
  { id: 'accounts',      icon: '🏛',  label: 'Accounts' },
  { id: 'income',        icon: '↑',  label: 'Income' },
  { id: 'expenses',      icon: '↓',  label: 'Expenses' },
  { id: 'subscriptions', icon: '⟳',  label: 'Subscriptions' },
  { id: 'csv-import',    icon: '⊞',  label: 'Import CSV' },
  { id: 'budget-goals',  icon: '◎',  label: 'Budget Goals' },
  { id: 'ai-advisor',    icon: '✦',  label: 'AI Advisor' },
  { id: 'settings',      icon: '⚙',  label: 'Settings' },
];

export default function Sidebar({ active, onNavigate, open, onClose }) {
  return (
    <aside className={`sidebar ${open ? 'is-open' : ''}`}>
      <div className="sidebar-shell">
        <div className="sidebar-topbar">
          <div className="sidebar-logo">
            <span className="sidebar-logo-icon">◈</span>
            <span className="sidebar-logo-text">Finance<span className="gradient-text">AI</span></span>
          </div>
          <button className="sidebar-close" type="button" onClick={onClose} aria-label="Close navigation">
            ✕
          </button>
        </div>

        <div className="sidebar-intro">
          <span className="sidebar-chip">Private Wealth Desk</span>
          <h2>Obsidian ledger, gold signal.</h2>
          <p>Track every balance, trend, and recurring drag inside a local-first finance studio.</p>
        </div>

        <nav className="sidebar-nav">
          {NAV.map(item => (
            <button
              key={item.id}
              className={`sidebar-item ${active === item.id ? 'active' : ''}`}
              onClick={() => onNavigate(item.id)}
            >
              <span className="sidebar-item-icon">{item.icon}</span>
              <span className="sidebar-item-copy">
                <span className="sidebar-item-label">{item.label}</span>
                <span className="sidebar-item-sub">
                  {item.id === 'dashboard' && 'Overview'}
                  {item.id === 'accounts' && 'Assets & liabilities'}
                  {item.id === 'income' && 'Cash in'}
                  {item.id === 'expenses' && 'Cash out'}
                  {item.id === 'subscriptions' && 'Recurring'}
                  {item.id === 'csv-import' && 'Bring data in'}
                  {item.id === 'budget-goals' && 'Targets'}
                  {item.id === 'ai-advisor' && 'Guidance'}
                  {item.id === 'settings' && 'Preferences'}
                </span>
              </span>
              {active === item.id && <span className="sidebar-active-bar" />}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-footer-panel">
            <div className="sidebar-footer-label">Mode</div>
            <div className="sidebar-footer-value">Local-first</div>
          </div>
          <div className="sidebar-footer-panel">
            <div className="sidebar-footer-label">Security</div>
            <div className="sidebar-footer-value">Private ledger</div>
          </div>
          <div className="sidebar-footer-meta">
            <div className="sidebar-footer-text">FinanceAI v1.0</div>
            <div className="sidebar-footer-sub">Designed for calm, deliberate money management</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
