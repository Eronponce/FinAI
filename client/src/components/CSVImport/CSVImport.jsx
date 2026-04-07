import React, { useEffect, useRef, useState, useCallback } from 'react';
import Papa from 'papaparse';
import { parseNubankCSV } from '../../utils/csvNubank.js';
import { api } from '../../utils/api.js';
import { CATEGORIES, CYCLE_OPTIONS, PAYMENT_METHODS, RECURRENCE_OPTIONS } from '../../utils/categories.js';
import '../Workspace/Workspace.css';
import './CSVImport.css';

const IMPORT_DRAFT_KEY = 'finai-import-draft-v1';
const EXPENSE_CATEGORIES = CATEGORIES.filter((category) => category.id !== 'Transfer');
const SOURCE_LABELS = {
  rule: 'Saved rule',
  manual: 'Confirmed',
  history: 'History',
  heuristic: 'Heuristic',
  csv: 'CSV',
  ai: 'AI',
  unassigned: 'Pending',
  default: 'Default',
};

function loadImportDraft() {
  try {
    const raw = window.localStorage.getItem(IMPORT_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function saveImportDraft(payload) {
  try {
    window.localStorage.setItem(IMPORT_DRAFT_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage failures and keep the in-memory draft.
  }
}

function clearImportDraft() {
  try {
    window.localStorage.removeItem(IMPORT_DRAFT_KEY);
  } catch {
    // Ignore storage cleanup failures.
  }
}

function badgeClassForSource(source) {
  if (source === 'rule' || source === 'manual') return 'badge-green';
  if (source === 'history' || source === 'heuristic') return 'badge-blue';
  if (source === 'csv' || source === 'ai') return 'badge-yellow';
  return 'badge-red';
}

function badgeClassForConfidence(confidence) {
  if (confidence >= 100) return 'badge-green';
  if (confidence >= 80) return 'badge-blue';
  if (confidence >= 1) return 'badge-yellow';
  return 'badge-red';
}

function CategoryChoices({ row, onPick }) {
  return (
    <div className="csv-choice-grid">
      {EXPENSE_CATEGORIES.map((category) => (
        <button
          key={category.id}
          type="button"
          className={`csv-choice-chip ${row.category === category.id ? 'is-active' : ''}`}
          onClick={() => onPick(row.match_key, category.id)}
        >
          <span>{category.icon}</span>
          <strong>{category.label}</strong>
        </button>
      ))}
    </div>
  );
}

function OptionChoices({ options, value, onPick }) {
  return (
    <div className="csv-inline-choices">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`csv-inline-choice ${value === option.value ? 'is-active' : ''}`}
          onClick={() => onPick(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export default function CSVImport({ onNavigate }) {
  const [stage, setStage] = useState(() => loadImportDraft()?.stage || 'upload');
  const [rows, setRows] = useState(() => loadImportDraft()?.rows || []);
  const [accounts, setAccounts] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [analysisMeta, setAnalysisMeta] = useState(() => loadImportDraft()?.analysisMeta || null);
  const [result, setResult] = useState(() => loadImportDraft()?.result || null);
  const [error, setError] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showOnlyReview, setShowOnlyReview] = useState(() => Boolean(loadImportDraft()?.showOnlyReview));
  const [activeFileName, setActiveFileName] = useState(() => loadImportDraft()?.activeFileName || '');
  const [restoredDraft, setRestoredDraft] = useState(() => {
    const draft = loadImportDraft();
    return Boolean(draft?.stage === 'review' && Array.isArray(draft?.rows) && draft.rows.length);
  });
  const fileRef = useRef();

  useEffect(() => {
    api.get('/accounts').then(setAccounts).catch(() => setAccounts([]));
  }, []);

  useEffect(() => {
    if (stage === 'review' && rows.length) {
      saveImportDraft({
        stage,
        rows,
        analysisMeta,
        result: null,
        showOnlyReview,
        activeFileName,
      });
      return;
    }

    if (stage === 'done' && result) {
      clearImportDraft();
      return;
    }

    if (stage === 'upload' && !rows.length && !activeFileName) {
      clearImportDraft();
    }
  }, [stage, rows, analysisMeta, result, showOnlyReview, activeFileName]);

  const expenseRows = rows.filter((row) => row.type === 'expense');
  const incomeRows = rows.filter((row) => row.type === 'income');
  const reviewRequired = expenseRows.filter((row) => row.needs_review).length;
  const syncedSubscriptionCount = new Set(
    expenseRows
      .filter((row) => row.category === 'Subscriptions')
      .map((row) => row.match_key)
  ).size;
  const visibleExpenseRows = showOnlyReview
    ? expenseRows.filter((row) => row.needs_review)
    : expenseRows;

  const updateRows = useCallback((updater) => {
    setRows((current) => current.map((row) => updater(row) || row));
  }, []);

  const analyzeRows = useCallback(async (parsedRows) => {
    setAnalyzing(true);
    setError('');
    setResult(null);
    setRestoredDraft(false);

    try {
      const response = await api.post('/import/analyze', { rows: parsedRows });
      setRows(response.rows || []);
      setAnalysisMeta(response.meta || null);
      setStage('review');
    } catch (analysisError) {
      setError(`Falha na analise: ${analysisError.message}`);
    } finally {
      setAnalyzing(false);
    }
  }, []);

  const processFile = (file) => {
    setError('');
    setActiveFileName(file.name || '');
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: ({ data }) => {
        if (!data?.length) {
          setError('O CSV parece vazio.');
          return;
        }

        const parsedRows = parseNubankCSV(data, { fileName: file.name || '' });
        if (!parsedRows.length) {
          setError('Nao foi possivel detectar linhas validas. Confira se este arquivo e um export suportado do banco.');
          return;
        }

        analyzeRows(parsedRows);
      },
      error: (parseError) => setError(`Erro de leitura: ${parseError.message}`),
    });
  };

  const onFile = (event) => {
    const file = event.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const onDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const applyCategoryToGroup = (matchKey, category) => {
    updateRows((row) => {
      if (row.type !== 'expense' || row.match_key !== matchKey) return null;

      const isSubscription = category === 'Subscriptions';
      return {
        ...row,
        category,
        category_source: 'manual',
        category_confidence: 100,
        category_reason: 'Confirmed by you during import review.',
        needs_review: false,
        is_subscription: isSubscription ? 1 : 0,
        subscription_cycle: isSubscription ? (row.subscription_cycle || 'monthly') : 'monthly',
        subscription_name: isSubscription
          ? (row.subscription_name || row.cleaned_description || row.description).slice(0, 120)
          : '',
      };
    });
  };

  const updateExpenseField = (id, field, value) => {
    updateRows((row) => {
      if (row.id !== id || row.type !== 'expense') return null;

      const nextRow = { ...row, [field]: value };
      if (field === 'category') {
        const isSubscription = value === 'Subscriptions';
        nextRow.is_subscription = isSubscription ? 1 : 0;
        nextRow.subscription_cycle = isSubscription ? (row.subscription_cycle || 'monthly') : 'monthly';
        nextRow.subscription_name = isSubscription
          ? (row.subscription_name || row.cleaned_description || row.description).slice(0, 120)
          : '';
      }
      return nextRow;
    });
  };

  const updateExpenseGroupField = (matchKey, field, value) => {
    updateRows((row) => {
      if (row.type !== 'expense' || row.match_key !== matchKey) return null;
      return {
        ...row,
        [field]: value,
      };
    });
  };

  const updateIncomeField = (matchKey, recurrence) => {
    updateRows((row) => {
      if (row.type !== 'income' || row.match_key !== matchKey) return null;
      return {
        ...row,
        recurrence,
        recurrence_source: 'manual',
        recurrence_confidence: 100,
        recurrence_reason: 'Adjusted by you during import review.',
      };
    });
  };

  const setAllAccounts = (accountId) => {
    setRows((current) => current.map((row) => ({ ...row, account_id: accountId })));
  };

  const doImport = async () => {
    if (reviewRequired > 0) {
      setError(`Review the ${reviewRequired} expense ${reviewRequired === 1 ? 'row' : 'rows'} still marked as pending.`);
      return;
    }

    setImporting(true);
    setError('');

    try {
      const response = await api.post('/import/commit', { rows, fileName: activeFileName });
      setResult(response);
      setStage('done');
      setRestoredDraft(false);
      clearImportDraft();
    } catch (importError) {
      setError(`Falha no import: ${importError.message}`);
    } finally {
      setImporting(false);
    }
  };

  const reset = () => {
    setStage('upload');
    setRows([]);
    setAnalysisMeta(null);
    setResult(null);
    setError('');
    setShowOnlyReview(false);
    setActiveFileName('');
    setRestoredDraft(false);
    clearImportDraft();
    if (fileRef.current) {
      fileRef.current.value = '';
    }
  };

  return (
    <div className="page-content">
      <section className="workspace-hero">
        <span className="workspace-kicker">Import Center</span>
        <h1>Importe, revise e publique no workspace.</h1>
        <p>O CSV entra por aqui, a classificacao passa pela sua revisao quando necessario e o resultado alimenta todo o app.</p>
        <div className="workspace-chip-row">
          <span className="workspace-chip">{activeFileName || 'Nenhum arquivo selecionado'}</span>
          <span className="workspace-chip">{rows.length} linhas em memoria</span>
          <span className="workspace-chip">{reviewRequired} pendencias</span>
        </div>
      </section>

      {restoredDraft ? (
        <div className="card mb-4" style={{ padding: 16, borderColor: 'rgba(59, 130, 246, 0.24)', background: 'rgba(59, 130, 246, 0.08)' }}>
          <strong style={{ display: 'block', marginBottom: 4 }}>Rascunho restaurado</strong>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Seu progresso de revisao foi recuperado automaticamente para o arquivo {activeFileName || 'em andamento'}.
          </span>
        </div>
      ) : null}

      {stage === 'upload' && (
        <>
          <div className="workspace-summary-banner mb-4">
            <div>
              <strong>Import-first flow</strong>
              <p>
                O sistema le o arquivo, aplica regras pessoais, consulta historico, usa IA so quando precisa
                e depois manda os movimentos para a camada de relatorios reconciliados.
              </p>
            </div>
            <div className="workspace-inline-actions">
              <span className="badge badge-green">So entra via Import Center</span>
              <span className="badge badge-muted">Nada e lido automaticamente da pasta do projeto</span>
            </div>
          </div>

          <div
            className={`csv-dropzone ${dragging ? 'csv-dropzone-active' : ''}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              style={{ display: 'none' }}
              onChange={onFile}
            />
            <div className="csv-dropzone-icon">{analyzing ? <span className="spinner" style={{ width: 42, height: 42 }} /> : 'FILE'}</div>
            <div className="csv-dropzone-title">{analyzing ? 'Analisando seu CSV' : 'Solte seu CSV aqui'}</div>
            <div className="csv-dropzone-sub">
              {analyzing ? 'Aplicando regras, historico e IA...' : 'Clique para buscar ou arraste um arquivo exportado do banco'}
            </div>
          </div>
          {error && <div className="csv-error">{error}</div>}
        </>
      )}

      {stage === 'review' && (
        <div className="csv-review-shell">
          <div className="grid-4 mb-4">
            <div className="stat-card">
              <div className="stat-card-label">Linhas lidas</div>
              <div className="stat-card-value">{rows.length}</div>
              <div className="stat-card-sub">{expenseRows.length} despesas e {incomeRows.length} entradas</div>
            </div>
            <div className="stat-card" style={{ borderColor: reviewRequired ? 'rgba(214, 107, 82, 0.35)' : 'rgba(144, 190, 120, 0.28)' }}>
              <div className="stat-card-label">Precisa revisar</div>
              <div className={`stat-card-value ${reviewRequired ? 'text-red' : 'text-green'}`}>{reviewRequired}</div>
              <div className="stat-card-sub">So linhas abaixo de 100% param a publicacao</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Regras reaproveitadas</div>
              <div className="stat-card-value text-green">{analysisMeta?.ruleMatches || 0}</div>
              <div className="stat-card-sub">Regras pessoais antes de recorrer a IA</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Assinaturas</div>
              <div className="stat-card-value text-accent">{syncedSubscriptionCount}</div>
              <div className="stat-card-sub">Grupos unicos a sincronizar no import</div>
            </div>
          </div>

          <div className="card mb-4">
            <div className="card-header">
              <span className="card-title">Controles da revisao</span>
              <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                <button className="btn btn-secondary btn-sm" onClick={reset}>Voltar</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowOnlyReview((value) => !value)}>
                  {showOnlyReview ? 'Mostrar todas as despesas' : 'Mostrar so pendentes'}
                </button>
                <button className="btn btn-primary btn-sm" onClick={doImport} disabled={importing || reviewRequired > 0}>
                  {importing ? <span className="spinner" /> : `Importar ${rows.length} linhas`}
                </button>
              </div>
            </div>
            <div className="card-body csv-toolbar">
              <div className="csv-toolbar-copy">
                <strong>{reviewRequired === 0 ? 'Tudo confirmado.' : `${reviewRequired} despesas ainda precisam da sua confirmacao.`}</strong>
                <p>
                  Clique em uma categoria para confirmar. Se o mesmo merchant voltar neste CSV ou nos proximos,
                  a preferencia salva passa a valer automaticamente.
                </p>
              </div>
              <div className="csv-toolbar-actions">
                <label className="form-label" htmlFor="csv-all-account">Conta padrao</label>
                <select
                  id="csv-all-account"
                  className="form-select"
                  style={{ minWidth: 220 }}
                  defaultValue=""
                  onChange={(event) => setAllAccounts(event.target.value ? parseInt(event.target.value, 10) : null)}
                >
                  <option value="">Manter linhas como estao</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>{account.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {analysisMeta?.warnings?.length ? (
            <div className="csv-warning-panel mb-4">
              {analysisMeta.warnings.map((warning) => (
                <div key={warning}>{warning}</div>
              ))}
            </div>
          ) : null}
          {error && <div className="csv-error">{error}</div>}

          <div className="grid-2 csv-review-grid">
            <div className="card">
              <div className="card-header">
                <span className="card-title">Revisao de despesas</span>
                <span className={`badge ${reviewRequired ? 'badge-red' : 'badge-green'}`}>
                  {visibleExpenseRows.length} visiveis
                </span>
              </div>
              <div className="card-body csv-review-list">
                {visibleExpenseRows.length === 0 ? (
                  <div className="empty-state" style={{ padding: 32 }}>
                    <div className="empty-state-icon">OK</div>
                    <h3>Nenhuma despesa pendente</h3>
                    <p>Todas as despesas desta tela ja foram confirmadas.</p>
                  </div>
                ) : (
                  visibleExpenseRows.map((row) => (
                    <article key={row.id} className={`csv-review-item ${row.needs_review ? 'is-review' : 'is-ready'}`}>
                      <div className="csv-review-head">
                        <div>
                          <h3>{row.description}</h3>
                          <p>{row.date} - {row.duplicate_count > 1 ? `${row.duplicate_count} ocorrencias parecidas neste CSV` : 'Ocorrencia unica'}</p>
                        </div>
                        <div className="csv-review-amount text-red">R$ {Number(row.amount || 0).toFixed(2)}</div>
                      </div>

                      <div className="csv-review-badges">
                        <span className={`badge ${badgeClassForSource(row.category_source)}`}>
                          {SOURCE_LABELS[row.category_source] || row.category_source}
                        </span>
                        <span className={`badge ${badgeClassForConfidence(row.category_confidence)}`}>
                          {row.category_confidence}% confidence
                        </span>
                        {row.needs_review ? (
                          <span className="badge badge-red">Revisao obrigatoria</span>
                        ) : (
                          <span className="badge badge-green">Pronto para importar</span>
                        )}
                      </div>

                      <div className="csv-review-reason">{row.category_reason}</div>

                      <CategoryChoices row={row} onPick={applyCategoryToGroup} />

                      <div className="csv-review-controls">
                        <div className="form-group">
                          <label className="form-label">Account</label>
                          <select
                            className="form-select"
                            value={row.account_id || ''}
                            onChange={(event) => updateExpenseField(row.id, 'account_id', event.target.value ? parseInt(event.target.value, 10) : null)}
                          >
                            <option value="">Sem conta</option>
                            {accounts.map((account) => (
                              <option key={account.id} value={account.id}>{account.name}</option>
                            ))}
                          </select>
                        </div>

                        <div className="form-group">
                          <label className="form-label">Payment Method</label>
                          <select
                            className="form-select"
                            value={row.payment_method}
                            onChange={(event) => updateExpenseField(row.id, 'payment_method', event.target.value)}
                          >
                            {PAYMENT_METHODS.map((paymentMethod) => (
                              <option key={paymentMethod.value} value={paymentMethod.value}>{paymentMethod.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {row.category === 'Subscriptions' && (
                        <div className="csv-subscription-box">
                          <div className="form-group">
                            <label className="form-label">Subscription Name</label>
                            <input
                              className="form-input"
                              value={row.subscription_name || row.cleaned_description || row.description}
                              onChange={(event) => updateExpenseGroupField(row.match_key, 'subscription_name', event.target.value.slice(0, 120))}
                            />
                          </div>
                          <div className="form-group">
                            <label className="form-label">Billing Cycle</label>
                            <OptionChoices
                              options={CYCLE_OPTIONS}
                              value={row.subscription_cycle}
                              onPick={(cycle) => updateExpenseGroupField(row.match_key, 'subscription_cycle', cycle)}
                            />
                          </div>
                        </div>
                      )}
                    </article>
                  ))
                )}
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <span className="card-title">Revisao de entradas</span>
                <span className="badge badge-blue">{incomeRows.length} linhas</span>
              </div>
              <div className="card-body csv-review-list">
                {incomeRows.length === 0 ? (
                  <div className="empty-state" style={{ padding: 32 }}>
                    <div className="empty-state-icon">+</div>
                    <h3>Nenhuma entrada</h3>
                    <p>Este arquivo contem apenas despesas.</p>
                  </div>
                ) : (
                  incomeRows.map((row) => (
                    <article key={row.id} className="csv-review-item is-income">
                      <div className="csv-review-head">
                        <div>
                          <h3>{row.description}</h3>
                          <p>{row.date}</p>
                        </div>
                        <div className="csv-review-amount text-green">R$ {Number(row.amount || 0).toFixed(2)}</div>
                      </div>

                      <div className="csv-review-badges">
                        <span className={`badge ${badgeClassForSource(row.recurrence_source)}`}>
                          {SOURCE_LABELS[row.recurrence_source] || row.recurrence_source}
                        </span>
                        <span className={`badge ${badgeClassForConfidence(row.recurrence_confidence)}`}>
                          {row.recurrence_confidence}% confidence
                        </span>
                      </div>

                      <div className="csv-review-reason">{row.recurrence_reason}</div>

                      <div className="csv-review-controls">
                        <div className="form-group">
                          <label className="form-label">Account</label>
                          <select
                            className="form-select"
                            value={row.account_id || ''}
                            onChange={(event) => updateRows((currentRow) => {
                              if (currentRow.id !== row.id) return null;
                              return {
                                ...currentRow,
                                account_id: event.target.value ? parseInt(event.target.value, 10) : null,
                              };
                            })}
                          >
                            <option value="">Sem conta</option>
                            {accounts.map((account) => (
                              <option key={account.id} value={account.id}>{account.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="form-group">
                          <label className="form-label">Recurrence</label>
                          <OptionChoices
                            options={RECURRENCE_OPTIONS}
                            value={row.recurrence}
                            onPick={(recurrence) => updateIncomeField(row.match_key, recurrence)}
                          />
                        </div>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {stage === 'done' && result && (
        <div className="card csv-result-card">
          <div className="csv-result-icon">DONE</div>
          <h2>Import concluido</h2>
          <p>
            {result.imported?.total || 0} linhas importadas, {result.skipped?.total || 0} duplicadas reaproveitadas
            e {result.rulesSaved || 0} regras pessoais atualizadas.
          </p>
          <div className="csv-result-grid">
            <div>
              <strong>{result.imported?.expenses || 0}</strong>
              <span>despesas importadas</span>
            </div>
            <div>
              <strong>{result.imported?.income || 0}</strong>
              <span>entradas importadas</span>
            </div>
            <div>
              <strong>{(result.subscriptions?.created || 0) + (result.subscriptions?.updated || 0)}</strong>
              <span>assinaturas sincronizadas</span>
            </div>
            <div>
              <strong>{result.subscriptions?.created || 0}</strong>
              <span>assinaturas novas</span>
            </div>
          </div>
          <div className="flex gap-2" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={() => onNavigate?.('review-queue')}>Abrir Review Queue</button>
            <button className="btn btn-secondary" onClick={reset}>Importar outro CSV</button>
          </div>
        </div>
      )}
    </div>
  );
}
