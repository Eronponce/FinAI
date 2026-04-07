import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../../utils/api.js';
import { useCurrency } from '../../hooks/useCurrency.jsx';
import { CATEGORIES, PAYMENT_METHODS, RECURRENCE_OPTIONS } from '../../utils/categories.js';
import { ECONOMIC_TYPE_OPTIONS, getEconomicTypeLabel } from '../../utils/economicTypes.js';
import '../Workspace/Workspace.css';

const FILTERS = [
  { value: 'all', label: 'Tudo' },
  { value: 'under100', label: 'Abaixo de 100%' },
  { value: 'exact100', label: '100%' },
];
const EXPENSE_CATEGORIES = CATEGORIES.filter((item) => item.id !== 'Transfer');

export default function AuditTrail({ onNavigate }) {
  const { fmt } = useCurrency();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [feedback, setFeedback] = useState('');

  const load = useCallback(() => {
    api.get(`/workspace/audit?filter=${filter}`)
      .then(setData)
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const setDraft = (id, updates) => {
    setDrafts((current) => ({
      ...current,
      [id]: {
        ...(current[id] || {}),
        ...updates,
      },
    }));
  };

  const beginEdit = (item) => {
    setEditingId(item.id);
    setFeedback('');
    setDrafts((current) => ({
      ...current,
      [item.id]: current[item.id] || {
        economic_type: item.economic_type,
        category: item.category || 'Other',
        payment_method: item.payment_method || 'other',
        recurrence: item.recurrence || 'one-time',
        counterparty: item.counterparty || '',
        merchant: item.merchant || '',
        apply_to_matches: true,
        save_rule: true,
      },
    }));
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveMovement = async (item) => {
    const draft = drafts[item.id];
    if (!draft) return;

    setSavingId(item.id);
    try {
      const response = await api.put(`/workspace/movements/${item.id}`, draft);
      setEditingId(null);
      setFeedback(
        Number(response?.affectedCount || 1) > 1
          ? `${response.affectedCount} ocorrencias equivalentes foram atualizadas.`
          : 'Movimento atualizado com sucesso.'
      );
      setLoading(true);
      await load();
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

  const summary = data?.summary || {};
  const uncertainProducts = data?.uncertainProducts || [];
  const recentBatches = data?.recentBatches || [];
  const term = search.trim().toLowerCase();
  const items = (data?.items || []).filter((item) => {
    if (!term) return true;
    return [
      item.description,
      item.category,
      item.economic_type,
      item.statement_type,
      item.source,
      item.source_file,
      item.counterparty,
      item.merchant,
    ].some((value) => String(value || '').toLowerCase().includes(term));
  });
  const under100Visible = items.filter((item) => Number(item.confidence || 0) < 100).length;
  const visibleExact = items.filter((item) => Number(item.confidence || 0) >= 100).length;
  const uncertainHighlights = uncertainProducts.slice(0, 6);
  const recentBatchHighlights = recentBatches.slice(0, 5);

  const bannerText = filter === 'under100'
    ? 'Voce esta vendo apenas os itens que ainda deixam os relatorios mais frageis.'
    : filter === 'exact100'
      ? 'Voce esta vendo apenas o historico com confianca total, util para auditoria completa.'
      : 'Voce esta vendo a trilha completa, com itens perfeitos e os que ainda merecem revisao.';

  return (
    <div className="page-content">
      <section className="workspace-hero">
        <span className="workspace-kicker">Audit Trail</span>
        <h1>Historico completo, com confianca e ajuste manual.</h1>
        <p>
          Esta tela serve como sua mesa de auditoria. Aqui voce enxerga tudo o que entrou no sistema,
          o que esta 100%, o que ainda esta difuso e o que deve virar regra para o futuro.
        </p>
        <div className="workspace-chip-row">
          <span className="workspace-chip">{summary.totalMovements || 0} movimentos</span>
          <span className="workspace-chip">{summary.under100Count || 0} abaixo de 100%</span>
          <span className="workspace-chip">{summary.exact100Count || 0} com 100%</span>
          <span className="workspace-chip">{summary.reviewCount || 0} pendencias humanas</span>
        </div>
      </section>

      {feedback ? (
        <div className="card mb-4" style={{ padding: 16, borderColor: 'rgba(144, 190, 120, 0.28)', background: 'rgba(144, 190, 120, 0.08)' }}>
          <strong style={{ display: 'block', marginBottom: 4 }}>Ajuste aplicado</strong>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{feedback}</span>
        </div>
      ) : null}

      <div className="grid-4 mb-4">
        <div className="stat-card">
          <div className="stat-card-label">Historico Total</div>
          <div className="stat-card-value">{summary.totalMovements || 0}</div>
          <div className="stat-card-sub">Tudo que entrou no workspace</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Abaixo de 100%</div>
          <div className="stat-card-value text-red">{summary.under100Count || 0}</div>
          <div className="stat-card-sub">Itens que ainda merecem auditoria</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">100% Confiantes</div>
          <div className="stat-card-value text-green">{summary.exact100Count || 0}</div>
          <div className="stat-card-sub">Regra, revisao humana ou heuristica fechada</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Visiveis neste filtro</div>
          <div className="stat-card-value">{items.length}</div>
          <div className="stat-card-sub">{under100Visible} abaixo de 100% e {visibleExact} com 100%</div>
        </div>
      </div>

      <div className="workspace-summary-banner mb-4">
        <div>
          <strong>Mantenha a auditoria simples</strong>
          <p>{bannerText}</p>
        </div>
        <div className="workspace-inline-actions" style={{ minWidth: 'min(100%, 340px)' }}>
          <input
            className="form-input"
            style={{ minWidth: 240 }}
            placeholder="Buscar descricao, categoria, origem..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onNavigate?.('review-queue')}>
            Abrir review queue
          </button>
        </div>
      </div>

      <div className="workspace-panel-grid mb-4">
        <div className="card">
          <div className="card-header">
            <span className="card-title">Produtos com menos acuracia</span>
          </div>
          <div className="card-body">
            {uncertainHighlights.length ? (
              <div className="workspace-list">
                {uncertainHighlights.map((item) => (
                  <div key={`${item.name}-${item.latestDate}`} className="workspace-list-item">
                    <div className="workspace-list-copy">
                      <strong>{item.name}</strong>
                      <p>
                        {item.count} ocorrencias - min {item.minConfidence}% - max {item.maxConfidence}%
                        {item.categories.length ? ` - ${item.categories.join(', ')}` : ''}
                      </p>
                    </div>
                    <div className="workspace-list-meta">
                      <span className="badge badge-red">{item.minConfidence}%</span>
                      <strong className="text-red">{fmt(item.total)}</strong>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state" style={{ padding: 24 }}>
                <div className="empty-state-icon">OK</div>
                <h3>Nenhum produto abaixo de 100%</h3>
                <p>Quando surgir alguma inferencia imperfeita, ela vai aparecer aqui.</p>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Lotes rastreados</span>
          </div>
          <div className="card-body">
            {recentBatchHighlights.length ? (
              <div className="workspace-list">
                {recentBatchHighlights.map((batch) => (
                  <div key={batch.id} className="workspace-list-item">
                    <div className="workspace-list-copy">
                      <strong>{batch.source_file || `Lote ${batch.id}`}</strong>
                      <p>{batch.statement_type || 'mixed'} - {batch.period_start || '-'} ate {batch.period_end || '-'}</p>
                    </div>
                    <div className="workspace-list-meta">
                      <span className="badge badge-blue">{batch.row_count} linhas</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state" style={{ padding: 24 }}>
                <div className="empty-state-icon">CSV</div>
                <h3>Sem lotes ainda</h3>
                <p>Os dados vao aparecer aqui depois do primeiro import feito pelo Import Center.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header audit-toolbar">
          <span className="card-title">Historico auditavel</span>
          <div className="audit-toolbar-actions">
            <div className="audit-filter-row">
              {FILTERS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={`audit-filter-chip ${filter === item.value ? 'is-active' : ''}`}
                  onClick={() => {
                    setLoading(true);
                    setFilter(item.value);
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <span className="badge badge-muted">{items.length} visiveis</span>
          </div>
        </div>
        <div className="card-body">
          {items.length ? (
            <div className="workspace-list">
              {items.map((item) => (
                <div key={item.id} className="workspace-list-item audit-item">
                  <div className="workspace-list-copy">
                    <strong>{item.description}</strong>
                    <p>
                      {item.date} - {item.statement_type || 'legacy'} - {item.category || 'Other'} - {getEconomicTypeLabel(item.economic_type)}
                    </p>
                    <p>{item.source_file || 'sem lote'} - {item.reason || 'sem justificativa'}</p>
                  </div>
                  <div className="workspace-list-meta">
                    <div className="workspace-meta-row">
                      <span className={`badge ${Number(item.confidence) >= 100 ? 'badge-green' : 'badge-red'}`}>
                        {item.confidence}% confianca
                      </span>
                      <span className="badge badge-muted">{item.source || 'heuristic'}</span>
                      {Number(item.needs_review) === 1 ? (
                        <span className="badge badge-red">Revisar</span>
                      ) : (
                        <span className="badge badge-blue">Auditado</span>
                      )}
                    </div>
                    <strong className={item.transaction_type === 'income' ? 'text-green' : 'text-red'}>
                      {fmt(item.amount)}
                    </strong>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => beginEdit(item)}
                    >
                      Ajustar
                    </button>
                  </div>

                  {editingId === item.id ? (
                    <div className="audit-editor">
                      <div className="audit-editor-grid">
                        <div className="form-group">
                          <label className="form-label">Significado economico</label>
                          <select
                            className="form-select"
                            value={drafts[item.id]?.economic_type || item.economic_type}
                            onChange={(event) => setDraft(item.id, { economic_type: event.target.value })}
                          >
                            {ECONOMIC_TYPE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </div>

                        {(drafts[item.id]?.economic_type || item.economic_type) === 'consumption_expense' ? (
                          <div className="form-group">
                            <label className="form-label">Categoria final</label>
                            <select
                              className="form-select"
                              value={drafts[item.id]?.category || item.category || 'Other'}
                              onChange={(event) => setDraft(item.id, { category: event.target.value })}
                            >
                              {EXPENSE_CATEGORIES.map((category) => (
                                <option key={category.id} value={category.id}>{category.label}</option>
                              ))}
                            </select>
                          </div>
                        ) : null}

                        {item.transaction_type === 'expense' ? (
                          <div className="form-group">
                            <label className="form-label">Meio de pagamento</label>
                            <select
                              className="form-select"
                              value={drafts[item.id]?.payment_method || item.payment_method || 'other'}
                              onChange={(event) => setDraft(item.id, { payment_method: event.target.value })}
                            >
                              {PAYMENT_METHODS.map((paymentMethod) => (
                                <option key={paymentMethod.value} value={paymentMethod.value}>{paymentMethod.label}</option>
                              ))}
                            </select>
                          </div>
                        ) : null}

                        {item.transaction_type === 'income' ? (
                          <div className="form-group">
                            <label className="form-label">Recorrencia</label>
                            <select
                              className="form-select"
                              value={drafts[item.id]?.recurrence || item.recurrence || 'one-time'}
                              onChange={(event) => setDraft(item.id, { recurrence: event.target.value })}
                            >
                              {RECURRENCE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </div>
                        ) : null}

                        <div className="form-group">
                          <label className="form-label">Contraparte</label>
                          <input
                            className="form-input"
                            value={drafts[item.id]?.counterparty ?? item.counterparty ?? ''}
                            onChange={(event) => setDraft(item.id, { counterparty: event.target.value })}
                          />
                        </div>

                        <div className="form-group">
                          <label className="form-label">Merchant</label>
                          <input
                            className="form-input"
                            value={drafts[item.id]?.merchant ?? item.merchant ?? ''}
                            onChange={(event) => setDraft(item.id, { merchant: event.target.value })}
                          />
                        </div>
                      </div>

                      <div className="audit-editor-options">
                        <label className="audit-checkbox">
                          <input
                            type="checkbox"
                            checked={Boolean(drafts[item.id]?.apply_to_matches)}
                            onChange={(event) => setDraft(item.id, { apply_to_matches: event.target.checked })}
                          />
                          <span>Aplicar tambem nas ocorrencias equivalentes deste historico</span>
                        </label>
                        <label className="audit-checkbox">
                          <input
                            type="checkbox"
                            checked={Boolean(drafts[item.id]?.save_rule)}
                            onChange={(event) => setDraft(item.id, { save_rule: event.target.checked })}
                          />
                          <span>Aprender isso como regra para os proximos imports</span>
                        </label>
                      </div>

                      <div className="audit-editor-actions">
                        <button type="button" className="btn btn-secondary btn-sm" onClick={cancelEdit}>
                          Cancelar
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => saveMovement(item)}
                          disabled={savingId === item.id}
                        >
                          {savingId === item.id ? <span className="spinner" /> : 'Salvar ajuste'}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state" style={{ padding: 24 }}>
              <div className="empty-state-icon">0</div>
              <h3>Nada para mostrar neste filtro</h3>
              <p>Depois do import, o historico completo aparece aqui com a confianca de cada linha.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
