import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../../utils/api.js';
import '../Workspace/Workspace.css';

export default function Rules({ onNavigate }) {
  const [data, setData] = useState({ importRules: [], economicRules: [] });
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api.get('/workspace/rules')
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const removeRule = async (kind, id) => {
    setDeleting(`${kind}-${id}`);
    try {
      await api.delete(`/workspace/rules/${kind}/${id}`);
      load();
    } finally {
      setDeleting('');
    }
  };

  if (loading) {
    return (
      <div className="page-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
        <div className="spinner" style={{ width: 40, height: 40 }} />
      </div>
    );
  }

  const term = search.trim().toLowerCase();
  const importRules = (data.importRules || []).filter((rule) => {
    if (!term) return true;
    return [
      rule.sample_description,
      rule.transaction_type,
      rule.category,
      rule.subscription_name,
    ].some((value) => String(value || '').toLowerCase().includes(term));
  });
  const economicRules = (data.economicRules || []).filter((rule) => {
    if (!term) return true;
    return [
      rule.sample_description,
      rule.transaction_type,
      rule.statement_type,
      rule.economic_type,
      rule.category,
      rule.counterparty,
    ].some((value) => String(value || '').toLowerCase().includes(term));
  });

  return (
    <div className="page-content">
      <section className="workspace-hero">
        <span className="workspace-kicker">Rules</span>
        <h1>Memoria simples para os proximos imports.</h1>
        <p>
          Esta tela mostra apenas o que o sistema reaprende para frente. Se a necessidade for corrigir o passado,
          o lugar certo continua sendo a Audit Trail.
        </p>
        <div className="workspace-chip-row">
          <span className="workspace-chip">{data.importRules.length} regras de categoria</span>
          <span className="workspace-chip">{data.economicRules.length} regras economicas</span>
        </div>
        <div className="workspace-hero-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onNavigate?.('audit')}>
            Abrir Audit Trail
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onNavigate?.('import-center')}>
            Importar CSV
          </button>
        </div>
      </section>

      <div className="workspace-summary-banner mb-4">
        <div>
          <strong>Regra de negocio recomendada</strong>
          <p>Use a Audit Trail para ajustar o passado e deixe Rules apenas para ensinar o sistema a classificar os proximos CSVs.</p>
        </div>
        <div className="workspace-inline-actions" style={{ minWidth: 'min(100%, 320px)' }}>
          <input
            className="form-input"
            style={{ minWidth: 240 }}
            placeholder="Buscar regra..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>

      <div className="rules-shell">
        <div className="card">
          <div className="card-header">
            <span className="card-title">Regras de Categoria</span>
          </div>
          <div className="card-body">
            {importRules.length ? (
              <div className="rules-list">
                {importRules.map((rule) => (
                  <div key={rule.id} className="rule-row">
                    <div>
                      <strong>{rule.sample_description}</strong>
                      <p>{rule.transaction_type} · proximo import cai em {rule.category || 'sem categoria'}</p>
                    </div>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => removeRule('import', rule.id)}
                      disabled={deleting === `import-${rule.id}`}
                    >
                      {deleting === `import-${rule.id}` ? <span className="spinner" /> : 'Excluir'}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state" style={{ padding: 24 }}>
                <div className="empty-state-icon">0</div>
                <h3>Sem regras de categoria</h3>
                <p>Elas aparecem depois que voce confirma categorias no import ou na auditoria.</p>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Regras Economicas</span>
          </div>
          <div className="card-body">
            {economicRules.length ? (
              <div className="rules-list">
                {economicRules.map((rule) => (
                  <div key={rule.id} className="rule-row">
                    <div>
                      <strong>{rule.sample_description}</strong>
                      <p>{rule.transaction_type} · {rule.statement_type || 'qualquer origem'} · futuro significado {rule.economic_type}</p>
                    </div>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => removeRule('economic', rule.id)}
                      disabled={deleting === `economic-${rule.id}`}
                    >
                      {deleting === `economic-${rule.id}` ? <span className="spinner" /> : 'Excluir'}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state" style={{ padding: 24 }}>
                <div className="empty-state-icon">0</div>
                <h3>Sem regras economicas</h3>
                <p>Elas aparecem quando voce confirma se um movimento e gasto, reembolso, fatura ou investimento.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
