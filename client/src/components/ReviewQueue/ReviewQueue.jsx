import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../utils/api.js';
import { useCurrency } from '../../hooks/useCurrency.jsx';
import { CATEGORIES } from '../../utils/categories.js';
import { ECONOMIC_TYPE_OPTIONS, getEconomicTypeLabel } from '../../utils/economicTypes.js';
import '../Workspace/Workspace.css';

const REVIEW_DRAFT_KEY = 'finai-review-queue-draft-v1';
const EXPENSE_CATEGORIES = CATEGORIES.filter((item) => item.id !== 'Transfer');

function loadReviewDrafts() {
  try {
    const raw = window.localStorage.getItem(REVIEW_DRAFT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveReviewDrafts(payload) {
  try {
    window.localStorage.setItem(REVIEW_DRAFT_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage failures and keep the current drafts in memory.
  }
}

function clearReviewDrafts() {
  try {
    window.localStorage.removeItem(REVIEW_DRAFT_KEY);
  } catch {
    // Ignore cleanup failures.
  }
}

export default function ReviewQueue({ onNavigate }) {
  const { fmt } = useCurrency();
  const [queue, setQueue] = useState({ total: 0, items: [] });
  const [drafts, setDrafts] = useState(() => loadReviewDrafts());
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [feedback, setFeedback] = useState('');

  const loadQueue = useCallback(() => {
    return api.get('/workspace/review-queue')
      .then((response) => {
        setQueue(response);
        setDrafts((current) => {
          const next = Object.fromEntries(
            (response.items || []).map((item) => [
              item.id,
              current[item.id] || { economic_type: item.economic_type, category: item.category || 'Other' },
            ])
          );
          if (Object.keys(next).length === 0) {
            clearReviewDrafts();
          } else {
            saveReviewDrafts(next);
          }
          return next;
        });
      });
  }, []);

  useEffect(() => {
    loadQueue().finally(() => setLoading(false));
  }, [loadQueue]);

  const pendingItems = queue.items || [];
  const reviewShare = useMemo(() => {
    if (!queue.total) return 0;
    return Math.round((pendingItems.length / queue.total) * 100);
  }, [pendingItems.length, queue.total]);

  const setDraft = (id, updates) => {
    setDrafts((current) => ({
      ...current,
      [id]: {
        ...(current[id] || {}),
        ...updates,
      },
    }));
  };

  useEffect(() => {
    if (Object.keys(drafts).length === 0) {
      clearReviewDrafts();
      return;
    }
    saveReviewDrafts(drafts);
  }, [drafts]);

  const saveItem = async (item) => {
    const draft = drafts[item.id] || { economic_type: item.economic_type, category: item.category || 'Other' };
    setSavingId(item.id);
    try {
      const response = await api.put(`/workspace/review/${item.id}`, {
        economic_type: draft.economic_type,
        category: draft.category,
        save_rule: true,
      });
      await loadQueue();
      const affectedCount = Number(response?.affectedCount || 1);
      setFeedback(
        affectedCount > 1
          ? `${affectedCount} ocorrencias equivalentes foram atualizadas e a regra foi aprendida.`
          : 'A revisao foi aplicada e a regra foi aprendida.'
      );
      return response;
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return (
      <div className="page-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
        <div className="spinner" style={{ width: 40, height: 40 }} />
      </div>
    );
  }

  return (
    <div className="page-content">
      <section className="workspace-hero">
        <span className="workspace-kicker">Review Queue</span>
        <h1>Resolva so o que ainda esta em aberto.</h1>
        <p>
          Esta fila existe para pendencias de classificacao. O objetivo e zerar o que ainda atrapalha os relatorios
          e mandar o resto da edicao historica para a Audit Trail.
        </p>
        <div className="workspace-chip-row">
          <span className="workspace-chip">{queue.total} itens abertos</span>
          <span className="workspace-chip">{reviewShare}% da fila atual carregada</span>
        </div>
        <div className="workspace-hero-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onNavigate?.('audit')}>
            Abrir Audit Trail
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onNavigate?.('reports')}>
            Ver Reports
          </button>
        </div>
      </section>

      <div className="workspace-summary-banner mb-4">
        <div>
          <strong>Regra de negocio recomendada</strong>
          <p>Use esta fila para resolver incertezas e a Audit Trail para revisar ou corrigir o historico ja importado.</p>
        </div>
        <div className="workspace-inline-actions">
          <span className="badge badge-muted">{pendingItems.length} carregados</span>
          <span className="badge badge-red">{queue.total} em aberto</span>
        </div>
      </div>

      {feedback ? (
        <div className="card mb-4" style={{ padding: 16, borderColor: 'rgba(144, 190, 120, 0.28)', background: 'rgba(144, 190, 120, 0.08)' }}>
          <strong style={{ display: 'block', marginBottom: 4 }}>Aprendizado aplicado</strong>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{feedback}</span>
        </div>
      ) : null}

      <div className="mini-stats mb-4">
        <div className="mini-stat">
          <span>Fila aberta</span>
          <strong>{queue.total}</strong>
        </div>
        <div className="mini-stat">
          <span>Carregado</span>
          <strong>{pendingItems.length}</strong>
        </div>
        <div className="mini-stat">
          <span>Objetivo</span>
          <strong>Zerar pendencias</strong>
        </div>
      </div>

      {pendingItems.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">OK</div>
            <h3>Fila limpa</h3>
            <p>Os relatórios ja estao consistentes para o que foi importado ate agora.</p>
          </div>
        </div>
      ) : (
        <div className="workspace-list">
          {pendingItems.map((item) => {
            const draft = drafts[item.id] || { economic_type: item.economic_type, category: item.category || 'Other' };
            const requiresCategory = draft.economic_type === 'consumption_expense';

            return (
              <article key={item.id} className="review-card">
                <div className="review-head">
                  <div>
                    <h3>{item.description}</h3>
                    <p>
                      {item.date} · {getEconomicTypeLabel(item.economic_type)} · {item.reason}
                    </p>
                  </div>
                  <div className={`review-amount ${item.transaction_type === 'income' ? 'text-green' : 'text-red'}`}>
                    {fmt(item.amount)}
                  </div>
                </div>

                <div className="review-choice-grid">
                  {ECONOMIC_TYPE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`review-choice ${draft.economic_type === option.value ? 'is-active' : ''}`}
                      onClick={() => setDraft(item.id, { economic_type: option.value })}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                {requiresCategory ? (
                  <div className="form-group">
                    <label className="form-label">Categoria final</label>
                    <select
                      className="form-select"
                      value={draft.category}
                      onChange={(event) => setDraft(item.id, { category: event.target.value })}
                    >
                      {EXPENSE_CATEGORIES.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                <div className="review-footer">
                  <div className="review-actions">
                    <span className="badge badge-yellow">{item.confidence}% confianca</span>
                    <span className="badge badge-muted">{item.statement_type || 'legacy'}</span>
                    <span className="badge badge-muted">{item.counterparty || 'sem contraparte detectada'}</span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => saveItem(item)}
                    disabled={savingId === item.id}
                  >
                    {savingId === item.id ? <span className="spinner" /> : 'Confirmar e aprender'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
