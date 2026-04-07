import React, { useEffect, useState } from 'react';
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';
import { api } from '../../utils/api.js';
import { useCurrency } from '../../hooks/useCurrency.jsx';
import { getEconomicTypeLabel } from '../../utils/economicTypes.js';
import '../Workspace/Workspace.css';

function TrendTooltip({ active, payload, label, fmt }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">{label}</div>
      {payload.map((item) => (
        <div key={item.name} className="chart-tooltip-row" style={{ color: item.color }}>
          <span>{item.name}</span>
          <span>{fmt(item.value)}</span>
        </div>
      ))}
    </div>
  );
}

export default function Overview({ onNavigate }) {
  const { fmt } = useCurrency();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/workspace/overview')
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="page-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
        <div className="spinner" style={{ width: 40, height: 40 }} />
      </div>
    );
  }

  const summary = data?.summary || {};
  const spendByCategory = data?.spendByCategory || [];
  const otherSpendDiagnostics = data?.otherSpendDiagnostics || [];
  const topCategory = spendByCategory[0];
  const categoryMax = Math.max(...spendByCategory.map((item) => item.total), 1);
  const uncategorizedTotal = otherSpendDiagnostics.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const highlightedMovements = (data?.importantMovements || []).slice(0, 4);
  const recentImports = (data?.recentBatches || []).slice(0, 4);
  const categoryHighlights = spendByCategory.slice(0, 6);
  const otherHighlights = otherSpendDiagnostics.slice(0, 5);

  return (
    <div className="page-content">
      <section className="workspace-hero">
        <span className="workspace-kicker">Workspace Overview</span>
        <h1>Seu painel economico em uma leitura so.</h1>
        <p>
          Esta home resume o periodo mais recente importado sem te jogar direto em uma parede de detalhes.
          O foco aqui e mostrar o que mudou, o que pesa mais e o que ainda precisa de limpeza.
        </p>
        <div className="workspace-chip-row">
          <span className="workspace-chip">{data?.focusLabel || 'Sem periodo'}</span>
          <span className="workspace-chip">{data?.trackedMonths || 0} meses rastreados</span>
          <span className="workspace-chip">{summary.reviewCount || 0} itens aguardando revisao</span>
        </div>
        <div className="workspace-hero-actions">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => onNavigate?.('reports')}>
            Abrir reports
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onNavigate?.('audit')}>
            Abrir auditoria
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onNavigate?.('import-center')}>
            Importar CSV
          </button>
        </div>
      </section>

      <div className="grid-4 mb-4">
        <div className="stat-card">
          <div className="stat-card-label">Resultado Economico</div>
          <div className={`stat-card-value ${Number(summary.economicResult || 0) >= 0 ? 'text-green' : 'text-red'}`}>
            {fmt(summary.economicResult || 0)}
          </div>
          <div className="stat-card-sub">Receita real menos gasto pessoal liquido</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Gasto Pessoal Liquido</div>
          <div className="stat-card-value text-red">{fmt(summary.netPersonalSpend || 0)}</div>
          <div className="stat-card-sub">Bruto {fmt(summary.grossSpend || 0)} menos reembolsos e estornos</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Reembolsos Recuperados</div>
          <div className="stat-card-value text-green">{fmt((summary.reimbursements || 0) + (summary.refunds || 0))}</div>
          <div className="stat-card-sub">Pix de amigos e estornos detectados</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Movimentos Neutros</div>
          <div className="stat-card-value">{fmt((summary.cardPayments || 0) + (summary.internalTransferOut || 0) + (summary.investmentOut || 0))}</div>
          <div className="stat-card-sub">Fatura, transferencias e alocacao em investimento</div>
        </div>
      </div>

      <div className="workspace-summary-banner mb-4">
        <div>
          <strong>
            {topCategory
              ? `${topCategory.category} e a categoria que mais pesa agora`
              : 'Assim que houver gasto real importado, esta faixa destaca o principal sinal do periodo'}
          </strong>
          <p>
            {topCategory
              ? `${fmt(topCategory.total)} no periodo atual. ${summary.reviewCount || 0} itens ainda podem mexer na leitura e ${fmt(uncategorizedTotal)} continuam em Other.`
              : 'Use o Import Center para trazer extratos e destravar a leitura reconciliada.'}
          </p>
        </div>
        <div className="workspace-inline-actions">
          <span className="badge badge-muted">{data?.focusLabel || 'Sem periodo'}</span>
          <span className={`badge ${Number(summary.economicResult || 0) >= 0 ? 'badge-green' : 'badge-red'}`}>
            Resultado {fmt(summary.economicResult || 0)}
          </span>
        </div>
      </div>

      <div className="report-split mb-4">
        <div className="card">
          <div className="card-header">
            <span className="card-title">Tendencia de Resultado</span>
          </div>
          <div className="card-body" style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.monthlySeries || []} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="resultGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#90be78" stopOpacity={0.32} />
                    <stop offset="95%" stopColor="#90be78" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#d66b52" stopOpacity={0.26} />
                    <stop offset="95%" stopColor="#d66b52" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(212,175,55,0.08)" />
                <XAxis dataKey="label" tick={{ fill: '#9b906d', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#9b906d', fontSize: 11 }} axisLine={false} tickLine={false} width={60} />
                <Tooltip content={<TrendTooltip fmt={fmt} />} />
                <Area type="monotone" dataKey="economicResult" stroke="#90be78" fill="url(#resultGrad)" strokeWidth={2.5} />
                <Area type="monotone" dataKey="netPersonalSpend" stroke="#d66b52" fill="url(#spendGrad)" strokeWidth={2.2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Categorias que puxam o mes</span>
          </div>
          <div className="card-body">
            {categoryHighlights.length === 0 ? (
              <div className="empty-state" style={{ padding: 24 }}>
                <div className="empty-state-icon">0</div>
                <h3>Sem gasto real ainda</h3>
                <p>Importe um CSV para destravar os relatorios.</p>
              </div>
            ) : (
              <div className="workspace-meter-list">
                {categoryHighlights.map((item) => (
                  <div key={item.category} className="workspace-meter-row">
                    <div className="workspace-meter-head">
                      <span>{item.category}</span>
                      <strong>{fmt(item.total)}</strong>
                    </div>
                    <div className="workspace-meter-track">
                      <div className="workspace-meter-fill" style={{ width: `${Math.max((item.total / categoryMax) * 100, 6)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="workspace-note" style={{ marginTop: 18 }}>
              {topCategory
                ? `A categoria que mais pesa no periodo atual e ${topCategory.category}.`
                : 'As categorias aparecem aqui assim que houver gasto pessoal importado.'}
            </div>
          </div>
        </div>
      </div>

      <div className="workspace-panel-grid mb-4">
        <div className="card">
          <div className="card-header">
            <span className="card-title">O que merece atencao</span>
          </div>
          <div className="card-body">
            {highlightedMovements.length ? (
              <div className="workspace-list">
                {highlightedMovements.map((item) => (
                  <div key={item.id} className="workspace-list-item">
                    <div className="workspace-list-copy">
                      <strong>{item.description}</strong>
                      <p>{item.date} - {getEconomicTypeLabel(item.economic_type)} - {item.reason}</p>
                    </div>
                    <div className="workspace-list-meta">
                      <span className={`badge ${item.needs_review ? 'badge-red' : 'badge-blue'}`}>
                        {item.needs_review ? 'Revisar' : 'Acompanhado'}
                      </span>
                      <strong className={item.transaction_type === 'income' ? 'text-green' : 'text-red'}>
                        {fmt(item.amount)}
                      </strong>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state" style={{ padding: 24 }}>
                <div className="empty-state-icon">OK</div>
                <h3>Nenhum destaque especial</h3>
                <p>Quando houver reembolsos, investimentos ou pendencias, eles aparecem aqui.</p>
              </div>
            )}
            {data?.importantMovements?.length > highlightedMovements.length ? (
              <div className="workspace-note" style={{ marginTop: 14 }}>
                Existem mais {data.importantMovements.length - highlightedMovements.length} movimentos relevantes na auditoria.
              </div>
            ) : null}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Base importada</span>
          </div>
          <div className="card-body">
            {recentImports.length ? (
              <div className="workspace-list">
                {recentImports.map((batch) => (
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
                <h3>Nenhum lote ainda</h3>
                <p>Os imports mais recentes aparecem aqui para dar contexto ao workspace.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Other e itens difusos</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onNavigate?.('audit')}>
            Abrir Audit Trail
          </button>
        </div>
        <div className="card-body">
          {otherHighlights.length ? (
            <>
              <div className="workspace-note" style={{ marginBottom: 16 }}>
                Ainda existe {fmt(uncategorizedTotal)} sem categoria final forte. Estes merchants sao os melhores candidatos para virar regra pessoal.
              </div>
              <div className="workspace-panel-grid">
                <div className="workspace-list">
                  {otherHighlights.map((item) => (
                    <div key={item.name} className="workspace-list-item">
                      <div className="workspace-list-copy">
                        <strong>{item.name}</strong>
                        <p>{item.count} ocorrencias ainda em Other</p>
                      </div>
                      <div className="workspace-list-meta">
                        <strong className="text-red">{fmt(item.total)}</strong>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="workspace-section-stack">
                  <div className="workspace-summary-banner">
                    <div>
                      <strong>Use a auditoria para limpar o que esta difuso</strong>
                      <p>
                        Sempre que um merchant continua em Other, o relatorio perde clareza.
                        Confirmar uma vez aqui costuma melhorar o historico inteiro.
                      </p>
                    </div>
                    <div className="workspace-inline-actions">
                      <span className="badge badge-red">{otherSpendDiagnostics.length} merchants</span>
                      <span className="badge badge-muted">{fmt(uncategorizedTotal)}</span>
                    </div>
                  </div>
                  <div className="workspace-summary-banner">
                    <div>
                      <strong>Melhor proximo passo</strong>
                      <p>Abra a Audit Trail e filtre abaixo de 100% para transformar os maiores restos em regra.</p>
                    </div>
                    <div className="workspace-inline-actions">
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => onNavigate?.('audit')}>
                        Revisar agora
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="empty-state" style={{ padding: 24 }}>
              <div className="empty-state-icon">OK</div>
              <h3>Other sob controle</h3>
              <p>Os gastos principais ja estao distribuidos em categorias mais uteis.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
