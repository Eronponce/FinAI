import React, { useState } from 'react';
import { CurrencyProvider } from './hooks/useCurrency.jsx';
import Sidebar from './components/Sidebar/Sidebar.jsx';
import Overview from './components/Overview/Overview.jsx';
import AuditTrail from './components/AuditTrail/AuditTrail.jsx';
import CSVImport from './components/CSVImport/CSVImport.jsx';
import ReviewQueue from './components/ReviewQueue/ReviewQueue.jsx';
import Reports from './components/Reports/Reports.jsx';
import Rules from './components/Rules/Rules.jsx';
import AIAdvisor from './components/AIAdvisor/AIAdvisor.jsx';
import Settings from './components/Settings/Settings.jsx';

const PAGES = {
  overview: Overview,
  audit: AuditTrail,
  'import-center': CSVImport,
  'review-queue': ReviewQueue,
  reports: Reports,
  rules: Rules,
  'ai-analyst': AIAdvisor,
  settings: Settings,
};

export default function App() {
  const [page, setPage] = useState('overview');

  const navigate = (nextPage) => {
    setPage(nextPage);
  };

  const ActivePage = PAGES[page] || PAGES.overview;

  return (
    <CurrencyProvider>
      <div className="app-layout">
        <Sidebar active={page} onNavigate={navigate} />
        <main className="app-main">
          <div className="app-main-glow app-main-glow-left" />
          <div className="app-main-glow app-main-glow-right" />
          <div className="page-shell" key={page}>
            <ActivePage onNavigate={navigate} />
          </div>
        </main>
      </div>
    </CurrencyProvider>
  );
}
