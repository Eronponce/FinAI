import React, { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../../utils/api.js';
import { useCurrency } from '../../hooks/useCurrency.jsx';
import { getCategoryColor } from '../../utils/categories.js';
import '../Workspace/Workspace.css';

const DEFAULT_FILTERS = {
  period: 'focus',
  analysisMode: 'spend',
  confidence: 'all',
  statementType: 'all',
  category: 'all',
};

const DEFAULT_OPTIONS = {
  availableMonths: [{ value: 'focus', label: 'Mes mais recente' }],
  analysisModes: [
    { value: 'spend', label: 'Gasto real' },
    { value: 'income', label: 'Entradas e reembolsos' },
    { value: 'neutral', label: 'Movimentos neutros' },
    { value: 'all', label: 'Tudo' },
  ],
  confidenceOptions: [
    { value: 'all', label: 'Qualquer confianca' },
    { value: 'exact100', label: 'So 100%' },
    { value: 'under100', label: 'Abaixo de 100%' },
  ],
  statementTypeOptions: [{ value: 'all', label: 'Todas as origens' }],
  categoryOptions: [{ value: 'all', label: 'Todas as categorias' }],
};

const REPORT_SECTIONS = [
  { id: 'summary', label: 'Panorama', sub: 'Mes e comparacao' },
  { id: 'routine', label: 'Rotina', sub: 'Dias e categorias' },
  { id: 'weekly', label: 'Semanas', sub: 'Heatmap e ritmo' },
  { id: 'merchants', label: 'Merchants', sub: 'Habito e picos' },
  { id: 'quality', label: 'Qualidade', sub: 'Cobertura e buckets' },
];

const BUCKET_GUIDE = {
  'Real spend': 'Gasto que o sistema considera custo pessoal real.',
  'Real income': 'Entrada que realmente melhora o resultado economico.',
  'Reimbursement in': 'Valor que voltou para voce e reduz gasto liquido.',
  'Reimbursement out': 'Valor que saiu como repasse para terceiros.',
  'Internal transfer in': 'Movimento entre suas estruturas, sem ganho real.',
  'Internal transfer out': 'Saida interna entre contas ou estruturas suas.',
  'Investment contribution': 'Alocacao de caixa para investimento.',
  'Investment redemption': 'Resgate de investimento para caixa.',
  'Card payment': 'Liquidacao de fatura, nao gasto novo.',
  Refund: 'Estorno que volta caixa ou reduz o gasto real.',
  Unknown: 'Movimento sem classificacao economica conclusiva.',
};

function buildQuery(filters) {
  const params = new URLSearchParams();
  params.set('period', filters.period);
  params.set('analysis_mode', filters.analysisMode);
  params.set('confidence', filters.confidence);
  params.set('statement_type', filters.statementType);
  params.set('category', filters.category);
  return params.toString();
}

function getOptionLabel(options, value, fallback = value) {
  return options.find((option) => option.value === value)?.label || fallback;
}

function formatInteger(value) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(Number(value || 0));
}

function formatMetricValue(value, dataKey, fmt) {
  if (String(dataKey || '').toLowerCase().includes('count')) return formatInteger(value);
  return fmt(Number(value || 0));
}

function MetricTooltip({ active, payload, label, fmt }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">{label}</div>
      {payload.map((entry) => (
        <div key={`${entry.dataKey}-${entry.name}`} className="chart-tooltip-row" style={{ color: entry.color }}>
          <span>{entry.name}</span>
          <span>{formatMetricValue(entry.value, entry.dataKey, fmt)}</span>
        </div>
      ))}
    </div>
  );
}

function deltaTone(value) {
  if (value > 0) return 'text-red';
  if (value < 0) return 'text-green';
  return '';
}

function formatDelta(value, fmt) {
  const numeric = Number(value || 0);
  if (numeric === 0) return fmt(0);
  return `${numeric > 0 ? '+' : '-'}${fmt(Math.abs(numeric))}`;
}

function getSeriesConfig(mode) {
  if (mode === 'income') return [
    { key: 'grossIncome', label: 'Receita real', color: '#90be78' },
    { key: 'reimbursements', label: 'Reembolsos', color: '#d4af37' },
    { key: 'refunds', label: 'Estornos', color: '#bcd7a1' },
  ];
  if (mode === 'neutral') return [
    { key: 'cardPayments', label: 'Fatura', color: '#8e8572' },
    { key: 'investmentOut', label: 'Investimento out', color: '#5e8d78' },
    { key: 'internalTransferOut', label: 'Transferencia out', color: '#b6823c' },
  ];
  if (mode === 'all') return [
    { key: 'grossIncome', label: 'Receita real', color: '#90be78' },
    { key: 'netPersonalSpend', label: 'Gasto liquido', color: '#d66b52' },
    { key: 'economicResult', label: 'Resultado', color: '#d4af37' },
  ];
  return [
    { key: 'grossSpend', label: 'Gasto bruto', color: '#c8845c' },
    { key: 'netPersonalSpend', label: 'Gasto liquido', color: '#d66b52' },
  ];
}

function ListEmpty({ icon = '0', title, copy }) {
  return (
    <div className="empty-state" style={{ padding: 24 }}>
      <div className="empty-state-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{copy}</p>
    </div>
  );
}

function StatBox({ label, value, note = '', tone = '', compact = false }) {
  return (
    <div className={`mini-stat ${compact ? 'is-compact' : ''}`}>
      <span>{label}</span>
      <strong className={tone}>{value}</strong>
      {note ? <p className="workspace-note" style={{ marginTop: 4 }}>{note}</p> : null}
    </div>
  );
}

function SectionNav({ activeSection, onChange }) {
  return (
    <div className="reports-section-nav">
      {REPORT_SECTIONS.map((section) => (
        <button
          key={section.id}
          type="button"
          className={`reports-section-tab ${activeSection === section.id ? 'is-active' : ''}`}
          onClick={() => onChange(section.id)}
        >
          <strong>{section.label}</strong>
          <span>{section.sub}</span>
        </button>
      ))}
    </div>
  );
}

function SelectableListRow({ active, title, description, value, tone = '', badge, onClick }) {
  return (
    <button type="button" className={`reports-select-row ${active ? 'is-active' : ''}`} onClick={onClick}>
      <div className="reports-select-copy">
        <strong>{title}</strong>
        {description ? <p>{description}</p> : null}
      </div>
      <div className="reports-select-meta">
        {badge ? <span className="badge badge-muted">{badge}</span> : null}
        <strong className={tone}>{value}</strong>
      </div>
    </button>
  );
}

function HeatmapGrid({ heatmap, fmt, selectedWeekStart, selectedCell, onSelectWeek, onSelectCell }) {
  const rows = heatmap?.rows || [];

  if (!rows.length) {
    return (
      <ListEmpty
        icon="MAP"
        title="Sem mapa semanal ainda"
        copy="Quando houver pelo menos uma semana com movimentos nessa lente, o heatmap aparece aqui."
      />
    );
  }

  return (
    <div className="reports-heatmap">
      <div className="reports-heatmap-header">
        <span className="reports-heatmap-anchor">Semana</span>
        {(heatmap?.weekdays || []).map((weekday) => (
          <span key={weekday}>{weekday}</span>
        ))}
      </div>

      {rows.map((week) => (
        <div key={week.weekStart} className="reports-heatmap-row">
          <button
            type="button"
            className={`reports-heatmap-week ${selectedWeekStart === week.weekStart ? 'is-active' : ''}`}
            onClick={() => onSelectWeek(week.weekStart)}
          >
            <strong>{week.weekLabel}</strong>
            <span>{fmt(week.total || 0)} · {formatInteger(week.count || 0)} mov</span>
          </button>

          {week.days.map((day) => {
            const intensity = Math.max(Number(day.amountIntensity || 0), Number(day.countIntensity || 0));
            const alpha = 0.08 + (intensity / 100) * 0.52;
            const isActive = selectedCell?.weekStart === week.weekStart && selectedCell?.weekday === day.weekday;

            return (
              <button
                key={`${week.weekStart}-${day.weekday}`}
                type="button"
                className={`reports-heatmap-cell ${isActive ? 'is-active' : ''}`}
                style={{
                  background: `linear-gradient(180deg, rgba(212, 175, 55, ${alpha.toFixed(2)}), rgba(15, 12, 9, 0.96))`,
                  borderColor: isActive
                    ? 'rgba(244, 223, 155, 0.42)'
                    : intensity >= 60
                      ? 'rgba(244, 223, 155, 0.24)'
                      : 'rgba(255, 255, 255, 0.05)',
                }}
                title={`${week.weekLabel} · ${day.weekday} · ${formatInteger(day.count || 0)} movimentos · ${fmt(day.total || 0)}`}
                onClick={() => onSelectCell(week.weekStart, day.weekday)}
              >
                <strong>{day.count ? formatInteger(day.count) : '·'}</strong>
                <span>{day.total ? fmt(day.total || 0) : '—'}</span>
              </button>
            );
          })}
        </div>
      ))}

      <div className="reports-heatmap-legend">
        <span>Mais escuro = pouca ou nenhuma atividade</span>
        <span>Mais dourado = concentracao forte naquela combinacao semana + dia</span>
      </div>
    </div>
  );
}

function getMonthDetail(monthlySeries, selectedKey) {
  if (!monthlySeries.length) return null;
  return monthlySeries.find((item) => item.month === selectedKey) || monthlySeries[monthlySeries.length - 1];
}

function getWeekdayMix(categoryStack, weekday) {
  const row = categoryStack.rows?.find((item) => item.weekday === weekday);
  if (!row) return [];

  return (categoryStack.categories || [])
    .map((category) => ({ category, total: Number(row[category] || 0) }))
    .filter((item) => item.total > 0)
    .sort((left, right) => right.total - left.total);
}

function buildMerchantLookup(merchantBehavior, merchantFrequency, merchantHighlights) {
  const map = new Map();
  const merge = (name, payload) => {
    if (!name) return;
    map.set(name, { name, ...(map.get(name) || {}), ...payload });
  };

  for (const item of merchantBehavior.recurring || []) merge(item.name, { ...item, recurring: true });
  for (const item of merchantBehavior.impulsive || []) merge(item.name, { ...item, impulsive: true });
  for (const item of merchantFrequency || []) merge(item.name, item);
  for (const item of merchantHighlights || []) merge(item.name, { highlightTotal: item.total, highlightCount: item.count });

  return map;
}

function getActiveWeekdayFromChart(state) {
  return state?.activePayload?.[0]?.payload?.weekday || state?.activeLabel || '';
}

function getBarTone(selectedKey, itemKey, activeColor, baseColor) {
  if (!selectedKey) return { fill: baseColor, opacity: 1 };
  if (selectedKey === itemKey) return { fill: activeColor, opacity: 1 };
  return { fill: baseColor, opacity: 0.28 };
}

export default function Reports({ onNavigate }) {
  const { fmt } = useCurrency();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [activeSection, setActiveSection] = useState('summary');
  const [selection, setSelection] = useState({
    month: '',
    weekday: '',
    weekStart: '',
    weekCell: null,
    weekOfMonth: '',
    merchantName: '',
    qualityBucket: '',
  });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.get(`/workspace/reports?${buildQuery(filters)}`)
      .then((response) => {
        if (cancelled) return;
        setData(response);
        setError('');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || 'Falha ao carregar reports');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filters]);

  const options = data?.filters || DEFAULT_OPTIONS;
  const analysisModeLabel = getOptionLabel(options.analysisModes, filters.analysisMode, 'Gasto real');
  const confidenceLabel = getOptionLabel(options.confidenceOptions, filters.confidence, 'Qualquer confianca');
  const statementTypeLabel = getOptionLabel(options.statementTypeOptions, filters.statementType, 'Todas as origens');
  const categoryLabel = getOptionLabel(options.categoryOptions, filters.category, 'Todas as categorias');
  const seriesConfig = useMemo(() => getSeriesConfig(filters.analysisMode), [filters.analysisMode]);

  const updateFilter = (key, value) => {
    setLoading(true);
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const resetFilters = () => {
    setLoading(true);
    setFilters(DEFAULT_FILTERS);
  };

  const updateSelection = (updates) => {
    setSelection((current) => ({ ...current, ...updates }));
  };

  if (loading) {
    return (
      <div className="page-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
        <div className="spinner" style={{ width: 40, height: 40 }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-content">
        <div className="card">
          <ListEmpty icon="!" title="Nao foi possivel montar os reports" copy={error} />
        </div>
      </div>
    );
  }

  const summary = data?.summary || {};
  const analysisSummary = data?.analysisSummary || {};
  const insights = data?.insights || {};
  const monthlySeries = data?.monthlySeries || [];
  const weeklyTrend = data?.weeklyTrend || [];
  const weeklyHeatmap = data?.weeklyHeatmap || { weekdays: [], rows: [] };
  const categoryStack = data?.weekdayCategoryStack || { categories: [], rows: [] };
  const weekOverWeek = data?.weekOverWeek || insights.weekOverWeek || null;
  const merchantBehavior = data?.merchantBehavior || { recurring: [], impulsive: [], summary: {} };
  const topWeek = [...(data?.weekOfMonthRhythm || [])].sort((left, right) => right.total - left.total)[0] || null;
  const selectedMonth = getMonthDetail(monthlySeries, selection.month);
  const selectedWeekday = (data?.weekdayRhythm || []).find((item) => item.weekday === selection.weekday)
    || insights.busiestWeekday
    || (data?.weekdayRhythm || [])[0]
    || null;
  const selectedWeekdayMix = getWeekdayMix(categoryStack, selectedWeekday?.weekday);
  const selectedWeek = weeklyTrend.find((item) => item.weekStart === selection.weekStart)
    || weekOverWeek?.currentWeek
    || weeklyTrend[weeklyTrend.length - 1]
    || null;
  const selectedHeatWeek = weeklyHeatmap.rows?.find((item) => item.weekStart === (selection.weekCell?.weekStart || selectedWeek?.weekStart)) || null;
  const selectedHeatCell = selectedHeatWeek?.days.find((day) => day.weekday === selection.weekCell?.weekday) || null;
  const selectedWeekOfMonth = (data?.weekOfMonthRhythm || []).find((item) => item.week === selection.weekOfMonth)
    || topWeek
    || (data?.weekOfMonthRhythm || [])[0]
    || null;
  const merchantLookup = buildMerchantLookup(merchantBehavior, data?.merchantFrequency || [], data?.merchantHighlights || []);
  const selectedMerchant = merchantLookup.get(selection.merchantName)
    || insights.routineMerchant
    || merchantBehavior.recurring?.[0]
    || merchantBehavior.impulsive?.[0]
    || data?.merchantFrequency?.[0]
    || null;
  const selectedBucket = (data?.bucketBreakdown || []).find((item) => item.label === selection.qualityBucket)
    || (data?.bucketBreakdown || [])[0]
    || null;

  const summarySection = (
    <>
      <div className="grid-4 mb-4">
        <div className="stat-card">
          <div className="stat-card-label">Resultado do periodo</div>
          <div className={`stat-card-value ${Number(summary.economicResult || 0) >= 0 ? 'text-green' : 'text-red'}`}>{fmt(summary.economicResult || 0)}</div>
          <div className="stat-card-sub">Leitura economica do periodo selecionado</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Valor analisado</div>
          <div className="stat-card-value">{fmt(analysisSummary.total || 0)}</div>
          <div className="stat-card-sub">Volume dentro da lente atual</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Frequencia</div>
          <div className="stat-card-value">{formatInteger(analysisSummary.count || 0)}</div>
          <div className="stat-card-sub">Ticket medio {fmt(analysisSummary.averageTicket || 0)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Cobertura 100%</div>
          <div className={`stat-card-value ${Number(analysisSummary.confidence100Share || 0) >= 80 ? 'text-green' : 'text-red'}`}>{Number(analysisSummary.confidence100Share || 0)}%</div>
          <div className="stat-card-sub">Share da lente atual com confianca total</div>
        </div>
      </div>

      <div className="mini-stats mb-4">
        <StatBox label="Dia frequente" value={insights.busiestWeekday?.weekday || '-'} note={insights.busiestWeekday ? `${formatInteger(insights.busiestWeekday.count)} mov` : ''} compact />
        <StatBox label="Dia pesado" value={insights.spendiestWeekday?.weekday || '-'} note={insights.spendiestWeekday ? fmt(insights.spendiestWeekday.total || 0) : ''} compact />
        <StatBox label="Categoria" value={insights.topCategory?.category || '-'} note={insights.topCategory ? `${insights.topCategory.sharePct}%` : ''} compact />
        <StatBox label="Rotina" value={insights.routineMerchant?.name || '-'} note={insights.routineMerchant ? `${insights.routineMerchant.weeksActive} sem` : ''} compact />
      </div>

      <div className="reports-subpage-shell mb-4">
        <div className="report-stack">
          <div className="card">
            <div className="card-header">
              <span className="card-title">Painel mensal filtrado</span>
            </div>
            <div className="card-body" style={{ height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={monthlySeries}
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                  onClick={(state) => {
                    const month = state?.activePayload?.[0]?.payload?.month;
                    if (month) updateSelection({ month });
                  }}
                >
                  <defs>
                    {seriesConfig.map((series) => (
                      <linearGradient key={series.key} id={`reports-grad-${series.key}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={series.color} stopOpacity={0.26} />
                        <stop offset="95%" stopColor={series.color} stopOpacity={0} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(212,175,55,0.08)" />
                  <XAxis dataKey="label" tick={{ fill: '#9b906d', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#9b906d', fontSize: 11 }} axisLine={false} tickLine={false} width={72} />
                  <Tooltip content={<MetricTooltip fmt={fmt} />} />
                  <Legend />
                  {seriesConfig.map((series) => (
                    <Area key={series.key} type="monotone" dataKey={series.key} name={series.label} stroke={series.color} fill={`url(#reports-grad-${series.key})`} strokeWidth={2.4} activeDot={{ r: 4 }} />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="workspace-panel-grid">
            <div className="card">
              <div className="card-header">
                <span className="card-title">Top categorias</span>
              </div>
              <div className="card-body">
                {data?.categoryFrequency?.length ? (
                  <div className="workspace-list">
                    {data.categoryFrequency.slice(0, 6).map((item) => (
                      <SelectableListRow
                        key={item.category}
                        active={filters.category === item.category}
                        title={item.category}
                        description={`${formatInteger(item.count)} ocorrencias · ticket ${fmt(item.averageTicket || 0)}`}
                        value={fmt(item.total || 0)}
                        onClick={() => updateFilter('category', filters.category === item.category ? 'all' : item.category)}
                      />
                    ))}
                  </div>
                ) : <ListEmpty icon="CAT" title="Sem categorias nessa lente" copy="Ajuste os filtros para ver a distribuicao por categoria." />}
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <span className="card-title">Top merchants</span>
              </div>
              <div className="card-body">
                {data?.merchantHighlights?.length ? (
                  <div className="workspace-list">
                    {data.merchantHighlights.slice(0, 6).map((item) => (
                      <SelectableListRow
                        key={item.name}
                        active={selectedMerchant?.name === item.name}
                        title={item.name}
                        description={`${formatInteger(item.count)} lanc`}
                        value={fmt(item.total || 0)}
                        onClick={() => {
                          setActiveSection('merchants');
                          updateSelection({ merchantName: item.name });
                        }}
                      />
                    ))}
                  </div>
                ) : <ListEmpty icon="SHOP" title="Sem merchants nessa lente" copy="Assim que houver movimentos nessa visao, o ranking aparece aqui." />}
              </div>
            </div>
          </div>
        </div>

        <div className="card reports-detail-card">
          <div className="card-header">
            <span className="card-title">Drilldown do mes</span>
          </div>
          <div className="card-body">
            {selectedMonth ? (
              <>
                <h3 className="reports-detail-title">{selectedMonth.label}</h3>
                <div className="mini-stats mt-4">
                  <StatBox label="Resultado" value={fmt(selectedMonth.economicResult || 0)} tone={Number(selectedMonth.economicResult || 0) >= 0 ? 'text-green' : 'text-red'} compact />
                  <StatBox label="Liquido" value={fmt(selectedMonth.netPersonalSpend || 0)} compact />
                  <StatBox label="Revisoes" value={formatInteger(selectedMonth.reviewCount || 0)} compact />
                  <StatBox label="Neutros" value={fmt((selectedMonth.cardPayments || 0) + (selectedMonth.internalTransferOut || 0) + (selectedMonth.investmentOut || 0))} compact />
                </div>
              </>
            ) : <ListEmpty icon="MES" title="Sem mes selecionado" copy="Importe mais dados para abrir um historico mensal navegavel." />}
          </div>
        </div>
      </div>
    </>
  );

  const routineSection = (
    <div className="reports-subpage-shell">
      <div className="report-stack">
        <div className="card">
          <div className="card-header">
            <span className="card-title">Ritmo semanal por valor</span>
          </div>
          <div className="card-body" style={{ height: 224 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.weekdayRhythm || []} margin={{ top: 10, right: 12, left: 0, bottom: 0 }} onClick={(state) => {
                const weekday = getActiveWeekdayFromChart(state);
                if (weekday) updateSelection({ weekday });
              }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(212,175,55,0.08)" />
                <XAxis dataKey="weekday" tick={{ fill: '#9b906d', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#9b906d', fontSize: 11 }} axisLine={false} tickLine={false} width={72} />
                <Tooltip content={<MetricTooltip fmt={fmt} />} />
                <Bar dataKey="total" name="Valor" radius={[10, 10, 0, 0]}>
                  {(data?.weekdayRhythm || []).map((item) => {
                    const tone = getBarTone(selectedWeekday?.weekday, item.weekday, '#f4df9b', '#d4af37');
                    return <Cell key={`value-${item.weekday}`} fill={tone.fill} fillOpacity={tone.opacity} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Ritmo semanal por frequencia</span>
          </div>
          <div className="card-body" style={{ height: 224 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.weekdayRhythm || []} margin={{ top: 10, right: 12, left: 0, bottom: 0 }} onClick={(state) => {
                const weekday = getActiveWeekdayFromChart(state);
                if (weekday) updateSelection({ weekday });
              }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(212,175,55,0.08)" />
                <XAxis dataKey="weekday" tick={{ fill: '#9b906d', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#9b906d', fontSize: 11 }} axisLine={false} tickLine={false} width={52} />
                <Tooltip content={<MetricTooltip fmt={fmt} />} />
                <Bar dataKey="count" name="Movimentos" radius={[10, 10, 0, 0]}>
                  {(data?.weekdayRhythm || []).map((item) => {
                    const tone = getBarTone(selectedWeekday?.weekday, item.weekday, '#c9b8ff', '#8f6bff');
                    return <Cell key={`count-${item.weekday}`} fill={tone.fill} fillOpacity={tone.opacity} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Categorias por dia da semana</span>
          </div>
          <div className="card-body" style={{ height: 244 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryStack.rows || []} margin={{ top: 10, right: 12, left: 0, bottom: 0 }} onClick={(state) => {
                const weekday = getActiveWeekdayFromChart(state);
                if (weekday) updateSelection({ weekday });
              }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(212,175,55,0.08)" />
                <XAxis dataKey="weekday" tick={{ fill: '#9b906d', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#9b906d', fontSize: 11 }} axisLine={false} tickLine={false} width={72} />
                <Tooltip content={<MetricTooltip fmt={fmt} />} />
                <Legend />
                {(categoryStack.categories || []).map((category) => (
                  <Bar key={category} dataKey={category} name={category} stackId="weekday-categories" radius={[4, 4, 0, 0]}>
                    {(categoryStack.rows || []).map((item) => {
                      const baseColor = category === 'Outros' ? '#706756' : getCategoryColor(category);
                      const tone = getBarTone(selectedWeekday?.weekday, item.weekday, baseColor, baseColor);
                      return <Cell key={`${category}-${item.weekday}`} fill={tone.fill} fillOpacity={tone.opacity} />;
                    })}
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="card reports-detail-card">
        <div className="card-header">
          <span className="card-title">Drilldown do dia</span>
        </div>
        <div className="card-body">
          {selectedWeekday ? (
            <>
              <h3 className="reports-detail-title">{selectedWeekday.weekday}</h3>
              <div className="mini-stats mt-4">
                <StatBox label="Valor" value={fmt(selectedWeekday.total || 0)} compact />
                <StatBox label="Movimentos" value={formatInteger(selectedWeekday.count || 0)} compact />
                <StatBox label="Ticket" value={fmt(selectedWeekday.averageTicket || 0)} compact />
                <StatBox label="Status" value={insights.busiestWeekday?.weekday === selectedWeekday.weekday ? 'Frequente' : insights.spendiestWeekday?.weekday === selectedWeekday.weekday ? 'Pesado' : 'Regular'} compact />
              </div>
              <div className="workspace-list mt-4">
                {selectedWeekdayMix.length ? selectedWeekdayMix.map((item) => (
                  <SelectableListRow
                    key={item.category}
                    active={filters.category === item.category}
                    title={item.category}
                    description={`${Math.round((item.total / Math.max(selectedWeekday.total || 1, 1)) * 100)}%`}
                    value={fmt(item.total || 0)}
                    onClick={() => updateFilter('category', filters.category === item.category ? 'all' : item.category)}
                  />
                )) : <ListEmpty icon="DAY" title="Sem mistura de categorias" copy="Nao houve gasto suficiente nesse dia para abrir composicao util." />}
              </div>
            </>
          ) : <ListEmpty icon="DAY" title="Sem dia selecionado" copy="Clique nos graficos desta pagina para abrir o drilldown do dia da semana." />}
        </div>
      </div>
    </div>
  );

  const weeklySection = (
    <div className="reports-subpage-shell">
      <div className="report-stack">
        <div className="card">
          <div className="card-header">
            <span className="card-title">Heatmap semanal</span>
          </div>
          <div className="card-body">
            <HeatmapGrid
              heatmap={weeklyHeatmap}
              fmt={fmt}
              selectedWeekStart={selectedWeek?.weekStart}
              selectedCell={selection.weekCell}
              onSelectWeek={(weekStart) => updateSelection({ weekStart, weekCell: null })}
              onSelectCell={(weekStart, weekday) => updateSelection({ weekStart, weekCell: { weekStart, weekday } })}
            />
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Semana contra semana</span>
          </div>
          <div className="card-body" style={{ height: 228 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyTrend} margin={{ top: 10, right: 12, left: 0, bottom: 0 }} onClick={(state) => {
                const weekStart = state?.activePayload?.[0]?.payload?.weekStart;
                if (weekStart) updateSelection({ weekStart, weekCell: null });
              }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(212,175,55,0.08)" />
                <XAxis dataKey="weekLabel" tick={{ fill: '#9b906d', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#9b906d', fontSize: 11 }} axisLine={false} tickLine={false} width={72} />
                <Tooltip content={<MetricTooltip fmt={fmt} />} />
                <Bar dataKey="total" name="Valor semanal" radius={[10, 10, 0, 0]}>
                  {weeklyTrend.map((item) => {
                    const isActive = selectedWeek?.weekStart === item.weekStart;
                    return <Cell key={`week-${item.weekStart}`} fill="#f0d58a" fillOpacity={selectedWeek?.weekStart ? (isActive ? 1 : 0.28) : 1} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Ritmo dentro do mes</span>
          </div>
          <div className="card-body" style={{ height: 224 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.weekOfMonthRhythm || []} margin={{ top: 10, right: 12, left: 0, bottom: 0 }} onClick={(state) => {
                const week = state?.activePayload?.[0]?.payload?.week;
                if (week) updateSelection({ weekOfMonth: week });
              }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(212,175,55,0.08)" />
                <XAxis dataKey="week" tick={{ fill: '#9b906d', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#9b906d', fontSize: 11 }} axisLine={false} tickLine={false} width={72} />
                <Tooltip content={<MetricTooltip fmt={fmt} />} />
                <Bar dataKey="total" name="Valor" radius={[10, 10, 0, 0]}>
                  {(data?.weekOfMonthRhythm || []).map((item) => {
                    const isActive = selectedWeekOfMonth?.week === item.week;
                    return <Cell key={`monthweek-${item.week}`} fill="#90be78" fillOpacity={selectedWeekOfMonth?.week ? (isActive ? 1 : 0.28) : 1} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="card reports-detail-card">
        <div className="card-header">
          <span className="card-title">Drilldown da semana</span>
        </div>
        <div className="card-body">
          {selectedWeek ? (
            <>
              <h3 className="reports-detail-title">{selectedWeek.weekLabel}</h3>
              <div className="mini-stats mt-4">
                <StatBox label="Valor" value={fmt(selectedWeek.total || 0)} compact />
                <StatBox label="Movimentos" value={formatInteger(selectedWeek.count || 0)} compact />
                <StatBox label="Ticket" value={fmt(selectedWeek.averageTicket || 0)} compact />
                <StatBox label="Delta" value={selectedWeek.deltaTotal !== undefined ? formatDelta(selectedWeek.deltaTotal, fmt) : fmt(0)} tone={deltaTone(selectedWeek.deltaTotal || 0)} compact />
              </div>
              <div className="workspace-list mt-4">
                <SelectableListRow active={false} title={selectedWeek.topCategory?.category || 'Sem categoria'} description="" value={selectedWeek.topCategory ? fmt(selectedWeek.topCategory.total || 0) : fmt(0)} onClick={() => {}} />
                <SelectableListRow active={selectedMerchant?.name === selectedWeek.topMerchant?.name} title={selectedWeek.topMerchant?.name || 'Sem merchant'} description="" value={selectedWeek.topMerchant ? fmt(selectedWeek.topMerchant.total || 0) : fmt(0)} onClick={() => {
                  if (!selectedWeek.topMerchant?.name) return;
                  setActiveSection('merchants');
                  updateSelection({ merchantName: selectedWeek.topMerchant.name });
                }} />
              </div>
              {selectedHeatCell ? (
                <div className="mini-stats mt-4">
                  <StatBox label="Dia" value={selectedHeatCell.weekday} compact />
                  <StatBox label="Valor" value={fmt(selectedHeatCell.total || 0)} compact />
                  <StatBox label="Mov" value={formatInteger(selectedHeatCell.count || 0)} compact />
                  <StatBox label="Ticket" value={fmt(selectedHeatCell.averageTicket || 0)} compact />
                </div>
              ) : null}
            </>
          ) : <ListEmpty icon="WOW" title="Sem semana selecionada" copy="Clique no heatmap ou na comparacao semana a semana para abrir o detalhe." />}
        </div>
      </div>
    </div>
  );

  const merchantsSection = (
    <div className="reports-subpage-shell">
      <div className="report-stack">
        <div className="card">
          <div className="card-header">
            <span className="card-title">Frequencia por merchant</span>
          </div>
          <div className="card-body" style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={(data?.merchantFrequency || []).slice(0, 8)} margin={{ top: 10, right: 12, left: 0, bottom: 0 }} onClick={(state) => {
                const name = state?.activePayload?.[0]?.payload?.name;
                if (name) updateSelection({ merchantName: name });
              }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(212,175,55,0.08)" />
                <XAxis dataKey="name" tick={{ fill: '#9b906d', fontSize: 11 }} axisLine={false} tickLine={false} hide />
                <YAxis tick={{ fill: '#9b906d', fontSize: 11 }} axisLine={false} tickLine={false} width={52} />
                <Tooltip content={<MetricTooltip fmt={fmt} />} />
                <Bar dataKey="count" name="Ocorrencias" fill="#d4af37" radius={[12, 12, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="workspace-note" style={{ marginTop: 12 }}>Clique numa barra ou numa lista abaixo para abrir o perfil daquele merchant.</div>
          </div>
        </div>

        <div className="workspace-panel-grid">
          <div className="card">
            <div className="card-header">
              <span className="card-title">Merchants de rotina</span>
            </div>
            <div className="card-body">
              {merchantBehavior.recurring?.length ? (
                <div className="workspace-list">
                  {merchantBehavior.recurring.map((item) => (
                    <SelectableListRow
                      key={item.name}
                      active={selectedMerchant?.name === item.name}
                      title={item.name}
                      description={`${item.primaryCategory} · ${item.weeksActive} semanas · ${formatInteger(item.count)} ocorrencias`}
                      value={fmt(item.total || 0)}
                      onClick={() => updateSelection({ merchantName: item.name })}
                    />
                  ))}
                </div>
              ) : <ListEmpty icon="LOOP" title="Sem merchants recorrentes fortes" copy="Assim que um merchant aparecer em varias semanas, ele entra aqui." />}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">Picos e impulsos</span>
            </div>
            <div className="card-body">
              {merchantBehavior.impulsive?.length ? (
                <div className="workspace-list">
                  {merchantBehavior.impulsive.map((item) => (
                    <SelectableListRow
                      key={item.name}
                      active={selectedMerchant?.name === item.name}
                      title={item.name}
                      description={`${item.primaryCategory} · ${item.weeksActive} semana · ${formatInteger(item.count)} ocorrencia`}
                      value={fmt(item.total || 0)}
                      tone="text-red"
                      onClick={() => updateSelection({ merchantName: item.name })}
                    />
                  ))}
                </div>
              ) : <ListEmpty icon="SPIKE" title="Sem pico isolado relevante" copy="Quando houver gasto bem fora da rotina, ele aparece neste radar." />}
            </div>
          </div>
        </div>
      </div>

      <div className="card reports-detail-card">
        <div className="card-header">
          <span className="card-title">Drilldown do merchant</span>
        </div>
        <div className="card-body">
          {selectedMerchant ? (
            <>
              <h3 className="reports-detail-title">{selectedMerchant.name}</h3>
              <p className="workspace-note">Este card junta frequencia, semanas ativas e concentracao para separar rotina de pico.</p>
              <div className="mini-stats mt-4">
                <StatBox label="Total" value={fmt(selectedMerchant.total || selectedMerchant.highlightTotal || 0)} note="Quanto esse merchant puxou" />
                <StatBox label="Ocorrencias" value={formatInteger(selectedMerchant.count || selectedMerchant.highlightCount || 0)} note="Quantas vezes apareceu" />
                <StatBox label="Ticket medio" value={fmt(selectedMerchant.averageTicket || 0)} note="Valor medio por lancamento" />
                <StatBox label="Semanas ativas" value={formatInteger(selectedMerchant.weeksActive || 0)} note="Espalhamento no periodo" />
              </div>
              <div className="workspace-chip-row" style={{ marginTop: 18 }}>
                {selectedMerchant.recurring ? <span className="workspace-chip">Padrao de rotina</span> : null}
                {selectedMerchant.impulsive ? <span className="workspace-chip">Pico isolado</span> : null}
                {selectedMerchant.primaryCategory ? <span className="workspace-chip">{selectedMerchant.primaryCategory}</span> : null}
              </div>
            </>
          ) : <ListEmpty icon="SHOP" title="Sem merchant selecionado" copy="Clique no grafico ou nas listas desta pagina para abrir o perfil do merchant." />}
        </div>
      </div>
    </div>
  );

  const qualitySection = (
    <>
      <div className="mini-stats mb-4">
        <StatBox label="Cobertura 100%" value={`${Number(analysisSummary.confidence100Share || 0)}%`} note="Share da lente atual com confianca total" tone={Number(analysisSummary.confidence100Share || 0) >= 80 ? 'text-green' : 'text-red'} />
        <StatBox label="Review queue" value={formatInteger(summary.reviewCount || 0)} note="Itens ainda esperando confirmacao humana" />
        <StatBox label="Other visivel" value={fmt((data?.otherSpendDiagnostics || []).reduce((sum, item) => sum + Number(item.total || 0), 0))} note="Valor ainda preso em merchants difusos" />
        <StatBox label="Buckets" value={formatInteger((data?.bucketBreakdown || []).length)} note="Tipos economicos presentes na lente" />
      </div>

      <div className="reports-subpage-shell">
        <div className="report-stack">
          <div className="card">
            <div className="card-header">
              <span className="card-title">Buckets economicos</span>
            </div>
            <div className="card-body" style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.bucketBreakdown || []} margin={{ top: 10, right: 12, left: 0, bottom: 0 }} onClick={(state) => {
                  const label = state?.activePayload?.[0]?.payload?.label;
                  if (label) updateSelection({ qualityBucket: label });
                }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(212,175,55,0.08)" />
                  <XAxis dataKey="label" tick={{ fill: '#9b906d', fontSize: 11 }} axisLine={false} tickLine={false} hide />
                  <YAxis tick={{ fill: '#9b906d', fontSize: 11 }} axisLine={false} tickLine={false} width={72} />
                  <Tooltip content={<MetricTooltip fmt={fmt} />} />
                  <Bar dataKey="total" name="Valor" fill="#f0d58a" radius={[12, 12, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="workspace-panel-grid">
            <div className="card">
              <div className="card-header">
                <span className="card-title">Pontos ainda difusos</span>
              </div>
              <div className="card-body">
                {data?.otherSpendDiagnostics?.length ? (
                  <div className="workspace-list">
                    {data.otherSpendDiagnostics.map((item) => (
                      <SelectableListRow key={item.name} active={false} title={item.name} description={`${formatInteger(item.count)} ocorrencias ainda em Other`} value={fmt(item.total || 0)} tone="text-red" onClick={() => onNavigate?.('audit')} />
                    ))}
                  </div>
                ) : <ListEmpty icon="OK" title="Nothing major in Other" copy="Os gastos dessa lente ja estao bem distribuidos entre categorias mais fortes." />}
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <span className="card-title">Acao recomendada</span>
              </div>
              <div className="card-body">
                <div className="workspace-note" style={{ marginBottom: 16 }}>Quando a cobertura 100% cair ou o Other subir, a melhor proxima acao e revisar a trilha e ensinar o sistema.</div>
                <div className="reports-actions" style={{ justifyContent: 'flex-start' }}>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => onNavigate?.('audit')}>Abrir Audit Trail</button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => onNavigate?.('review-queue')}>Abrir Review Queue</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="card reports-detail-card">
          <div className="card-header">
            <span className="card-title">Drilldown de qualidade</span>
          </div>
          <div className="card-body">
            {selectedBucket ? (
              <>
                <h3 className="reports-detail-title">{selectedBucket.label}</h3>
                <p className="workspace-note">{BUCKET_GUIDE[selectedBucket.label] || 'Esse bucket ajuda a separar o que e gasto real, fluxo neutro e ajustes do periodo.'}</p>
                <div className="mini-stats mt-4">
                  <StatBox label="Valor" value={fmt(selectedBucket.total || 0)} note="Total capturado neste bucket" />
                  <StatBox label="Confianca" value={`${Number(analysisSummary.confidence100Share || 0)}%`} note="Cobertura atual da lente" />
                  <StatBox label="Pendencias" value={formatInteger(summary.reviewCount || 0)} note="Itens que ainda podem distorcer a leitura" />
                </div>
              </>
            ) : <ListEmpty icon="QLT" title="Sem bucket selecionado" copy="Clique no grafico desta pagina para abrir a explicacao do bucket economico." />}
          </div>
        </div>
      </div>
    </>
  );

  const renderSection = () => {
    if (activeSection === 'routine') return routineSection;
    if (activeSection === 'weekly') return weeklySection;
    if (activeSection === 'merchants') return merchantsSection;
    if (activeSection === 'quality') return qualitySection;
    return summarySection;
  };

  return (
    <div className="page-content">
      <section className="workspace-hero reports-hero">
        <span className="workspace-kicker">Reports Studio</span>
        <h1>Analise sua rotina sem perder o fio.</h1>
        <p>Filtre o periodo e clique nos graficos para abrir o contexto de dia, semana, merchant e qualidade.</p>
        <div className="workspace-chip-row">
          <span className="workspace-chip">{data?.focusLabel || 'Sem periodo'}</span>
          <span className="workspace-chip">{analysisModeLabel}</span>
          <span className="workspace-chip">{confidenceLabel}</span>
          <span className="workspace-chip">{statementTypeLabel}</span>
          <span className="workspace-chip">{categoryLabel}</span>
        </div>
      </section>

      <div className="workspace-summary-banner reports-summary-banner mb-4">
        <div>
          <strong>Leitura atual</strong>
          <p>
            {insights.topCategory
              ? `${insights.topCategory.category} lidera a leitura atual com ${insights.topCategory.sharePct}% do total filtrado.`
              : 'Assim que houver massa suficiente, esta faixa destaca a principal leitura do periodo.'}
          </p>
        </div>
        <div className="workspace-inline-actions">
          <span className={`badge ${Number(summary.economicResult || 0) >= 0 ? 'badge-green' : 'badge-red'}`}>
            Resultado {fmt(summary.economicResult || 0)}
          </span>
          <span className="badge badge-muted">{formatInteger(analysisSummary.count || 0)} movimentos</span>
        </div>
      </div>

      <div className="card mb-4">
        <div className="card-header">
          <span className="card-title">Controles da analise</span>
        </div>
        <div className="card-body">
          <div className="reports-toolbar">
            <div className="reports-filter-grid">
              <div className="reports-filter-item">
                <label className="form-label" htmlFor="reports-period">Periodo</label>
                <select id="reports-period" className="form-select" value={filters.period} onChange={(event) => updateFilter('period', event.target.value)}>
                  {options.availableMonths.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div className="reports-filter-item">
                <label className="form-label" htmlFor="reports-analysis-mode">Lente</label>
                <select id="reports-analysis-mode" className="form-select" value={filters.analysisMode} onChange={(event) => updateFilter('analysisMode', event.target.value)}>
                  {options.analysisModes.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div className="reports-filter-item">
                <label className="form-label" htmlFor="reports-confidence">Confianca</label>
                <select id="reports-confidence" className="form-select" value={filters.confidence} onChange={(event) => updateFilter('confidence', event.target.value)}>
                  {options.confidenceOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div className="reports-filter-item">
                <label className="form-label" htmlFor="reports-statement-type">Origem</label>
                <select id="reports-statement-type" className="form-select" value={filters.statementType} onChange={(event) => updateFilter('statementType', event.target.value)}>
                  {options.statementTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div className="reports-filter-item">
                <label className="form-label" htmlFor="reports-category">Categoria</label>
                <select id="reports-category" className="form-select" value={filters.category} onChange={(event) => updateFilter('category', event.target.value)}>
                  {options.categoryOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="reports-actions">
              <button type="button" className="btn btn-secondary btn-sm" onClick={resetFilters}>Resetar filtros</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onNavigate?.('review-queue')}>Review Queue</button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => onNavigate?.('audit')}>Abrir auditoria</button>
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <SectionNav activeSection={activeSection} onChange={setActiveSection} />
          </div>
        </div>
      </div>

      {renderSection()}
    </div>
  );
}
