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

export default function App() {
  const [page, setPage] = useState('dashboard');

  return (
    <CurrencyProvider>
      <div className="app-layout">
        <Sidebar active={page} onNavigate={setPage} />
        <main className="app-main">
          {PAGES[page] || PAGES['dashboard']}
        </main>
      </div>
    </CurrencyProvider>
  );
}
