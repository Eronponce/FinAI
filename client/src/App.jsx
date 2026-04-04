import React, { useState } from 'react';
import { CurrencyProvider } from './hooks/useCurrency.jsx';
import Sidebar from './components/Sidebar/Sidebar.jsx';
import Dashboard from './components/Dashboard/Dashboard.jsx';
import Accounts from './components/Accounts/Accounts.jsx';
import Income from './components/Income/Income.jsx';
import Expenses from './components/Expenses/Expenses.jsx';
import Subscriptions from './components/Subscriptions/Subscriptions.jsx';
import CSVImport from './components/CSVImport/CSVImport.jsx';
import BudgetGoals from './components/BudgetGoals/BudgetGoals.jsx';
import AIAdvisor from './components/AIAdvisor/AIAdvisor.jsx';
import Settings from './components/Settings/Settings.jsx';

const PAGES = {
  'dashboard':     <Dashboard />,
  'accounts':      <Accounts />,
  'income':        <Income />,
  'expenses':      <Expenses />,
  'subscriptions': <Subscriptions />,
  'csv-import':    <CSVImport />,
  'budget-goals':  <BudgetGoals />,
  'ai-advisor':    <AIAdvisor />,
  'settings':      <Settings />,
};

const PAGE_META = {
  'dashboard': { title: 'Dashboard', label: 'Command Center' },
  'accounts': { title: 'Accounts', label: 'Balance Sheet' },
  'income': { title: 'Income', label: 'Revenue Ledger' },
  'expenses': { title: 'Expenses', label: 'Spending Ledger' },
  'subscriptions': { title: 'Subscriptions', label: 'Recurring Spend' },
  'csv-import': { title: 'Import CSV', label: 'Data Intake' },
  'budget-goals': { title: 'Budget Goals', label: 'Spend Limits' },
  'ai-advisor': { title: 'AI Advisor', label: 'Analyst Desk' },
  'settings': { title: 'Settings', label: 'Studio Controls' },
};

export default function App() {
  const [page, setPage] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navigate = (nextPage) => {
    setPage(nextPage);
    setSidebarOpen(false);
  };

  const pageMeta = PAGE_META[page] || PAGE_META.dashboard;

  return (
    <CurrencyProvider>
      <div className="app-layout">
        <div
          className={`app-sidebar-backdrop ${sidebarOpen ? 'is-open' : ''}`}
          onClick={() => setSidebarOpen(false)}
        />
        <Sidebar
          active={page}
          onNavigate={navigate}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
        <main className="app-main">
          <div className="app-main-glow app-main-glow-left" />
          <div className="app-main-glow app-main-glow-right" />
          <div className="app-mobile-bar">
            <button
              className="app-mobile-toggle"
              type="button"
              aria-label="Open navigation"
              onClick={() => setSidebarOpen(true)}
            >
              ☰
            </button>
            <div className="app-mobile-meta">
              <span className="app-mobile-kicker">{pageMeta.label}</span>
              <strong>{pageMeta.title}</strong>
            </div>
          </div>
          <div className="page-shell" key={page}>
            {PAGES[page] || PAGES.dashboard}
          </div>
        </main>
      </div>
    </CurrencyProvider>
  );
}
