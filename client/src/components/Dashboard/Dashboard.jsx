import React, { useEffect, useState } from 'react';
import { api } from '../../utils/api.js';
import { useCurrency } from '../../hooks/useCurrency.jsx';
import { CATEGORIES, getCategoryColor } from '../../utils/categories.js';
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Legend, AreaChart, Area
} from 'recharts';
import './Dashboard.css';

const now = new Date();
const THIS_MONTH = String(now.getMonth() + 1);
const THIS_YEAR  = String(now.getFullYear());

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function Dashboard() {
  const { fmt } = useCurrency();
  const [income, setIncome]   = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [subs, setSubs]       = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/income'),
      api.get('/expenses'),
      api.get('/subscriptions'),
    ]).then(([inc, exp, sub]) => {
      setIncome(inc);
      setExpenses(exp);
      setSubs(sub);
    }).finally(() => setLoading(false));
  }, []);

  // This month totals
  const monthIncome = income
    .filter(i => {
      const d = new Date(i.date + 'T12:00:00');
      return d.getMonth() + 1 === parseInt(THIS_MONTH) && d.getFullYear() === parseInt(THIS_YEAR);
    })
    .reduce((s, i) => s + i.amount, 0);

  const monthExpenses = expenses
    .filter(e => {
      const d = new Date(e.date + 'T12:00:00');
      return d.getMonth() + 1 === parseInt(THIS_MONTH) && d.getFullYear() === parseInt(THIS_YEAR);
    })
    .reduce((s, e) => s + e.amount, 0);

  const monthSubCost = subs.filter(s => s.active).reduce((total, s) => {
    if (s.cycle === 'monthly') return total + s.amount;
    if (s.cycle === 'yearly')  return total + s.amount / 12;
    if (s.cycle === 'weekly')  return total + s.amount * 4.33;
    return total + s.amount;
  }, 0);

  const netBalance = monthIncome - monthExpenses - monthSubCost;
  const savingsRate = monthIncome > 0 ? ((netBalance / monthIncome) * 100).toFixed(1) : 0;

  // Spending by category (all time)
  const byCat = {};
  expenses.forEach(e => {
    byCat[e.category] = (byCat[e.category] || 0) + e.amount;
  });
  const pieData = Object.entries(byCat)
    .map(([cat, total]) => ({ name: cat, value: total, color: getCategoryColor(cat) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  // Monthly trend (last 6 months)
  const trendData = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const m = d.getMonth() + 1;
    const y = d.getFullYear();
    const inc = income.filter(x => {
      const xd = new Date(x.date + 'T12:00:00');
      return xd.getMonth() + 1 === m && xd.getFullYear() === y;
    }).reduce((s, x) => s + x.amount, 0);
    const exp = expenses.filter(x => {
      const xd = new Date(x.date + 'T12:00:00');
      return xd.getMonth() + 1 === m && xd.getFullYear() === y;
    }).reduce((s, x) => s + x.amount, 0);
    trendData.push({ month: MONTHS[d.getMonth()], Income: inc, Expenses: exp });
  }

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="chart-tooltip">
        <div className="chart-tooltip-label">{label}</div>
        {payload.map(p => (
          <div key={p.name} className="chart-tooltip-row" style={{ color: p.color }}>
            <span>{p.name}</span><span>{fmt(p.value)}</span>
          </div>
        ))}
      </div>
    );
  };

  const PieTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="chart-tooltip">
        <div className="chart-tooltip-label">{payload[0].name}</div>
        <div className="chart-tooltip-row" style={{ color: payload[0].payload.color }}>
          <span>Total</span><span>{fmt(payload[0].value)}</span>
        </div>
      </div>
    );
  };

  if (loading) return (
    <div className="page-content" style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'50vh' }}>
      <div className="spinner" style={{ width:40, height:40 }} />
    </div>
  );

  return (
    <div className="page-content">
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>Overview for {MONTHS[now.getMonth()]} {now.getFullYear()}</p>
      </div>

      {/* Stat Cards */}
      <div className="grid-4 mb-4">
        <div className="stat-card">
          <div className="stat-card-icon" style={{ background:'var(--green-soft)' }}>💰</div>
          <div className="stat-card-label">Monthly Income</div>
          <div className="stat-card-value text-green">{fmt(monthIncome)}</div>
          <div className="stat-card-sub">{income.length} entries total</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon" style={{ background:'var(--red-soft)' }}>💸</div>
          <div className="stat-card-label">Monthly Expenses</div>
          <div className="stat-card-value text-red">{fmt(monthExpenses)}</div>
          <div className="stat-card-sub">{expenses.filter(e => {
            const d = new Date(e.date + 'T12:00:00');
            return d.getMonth()+1 === parseInt(THIS_MONTH) && d.getFullYear() === parseInt(THIS_YEAR);
          }).length} transactions</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon" style={{ background:'var(--blue-soft)' }}>🔄</div>
          <div className="stat-card-label">Subscriptions/mo</div>
          <div className="stat-card-value" style={{ color:'var(--accent-2)' }}>{fmt(monthSubCost)}</div>
          <div className="stat-card-sub">{subs.filter(s=>s.active).length} active</div>
        </div>
        <div className="stat-card" style={{ borderColor: netBalance >= 0 ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)' }}>
          <div className="stat-card-icon" style={{ background: netBalance >= 0 ? 'var(--green-soft)' : 'var(--red-soft)' }}>
            {netBalance >= 0 ? '📈' : '📉'}
          </div>
          <div className="stat-card-label">Net Balance</div>
          <div className={`stat-card-value ${netBalance >= 0 ? 'text-green' : 'text-red'}`}>{fmt(netBalance)}</div>
          <div className="stat-card-sub">Savings rate: {savingsRate}%</div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid-2 mb-4">
        {/* Trend chart */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">📊 Income vs Expenses</span>
            <span className="badge badge-muted">Last 6 months</span>
          </div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={trendData} margin={{ top:5, right:10, left:10, bottom:5 }}>
                <defs>
                  <linearGradient id="incGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="month" tick={{ fill:'#64748b', fontSize:12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill:'#64748b', fontSize:11 }} axisLine={false} tickLine={false} width={55}
                  tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ color:'#94a3b8', fontSize:'0.8rem' }} />
                <Area type="monotone" dataKey="Income" stroke="#10b981" fill="url(#incGrad)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="Expenses" stroke="#ef4444" fill="url(#expGrad)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pie chart */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">🍩 Spending by Category</span>
            <span className="badge badge-muted">All time</span>
          </div>
          <div className="card-body dash-pie-wrap">
            {pieData.length > 0 ? (
              <div className="dash-pie-inner">
                <ResponsiveContainer width="50%" height={220}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={90}
                      paddingAngle={3} dataKey="value">
                      {pieData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} stroke="none" />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="dash-pie-legend">
                  {pieData.map(d => (
                    <div key={d.name} className="dash-pie-legend-item">
                      <span className="dash-pie-dot" style={{ background: d.color }} />
                      <span className="dash-pie-name">{d.name}</span>
                      <span className="dash-pie-val">{fmt(d.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon">📊</div>
                <h3>No expense data yet</h3>
                <p>Add expenses or import a CSV to see breakdown</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Expenses */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">🕐 Recent Transactions</span>
        </div>
        <div className="table-wrap">
          {expenses.slice(0,8).length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th>Date</th><th>Description</th><th>Category</th><th style={{textAlign:'right'}}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {expenses.slice(0,8).map(e => (
                  <tr key={e.id}>
                    <td className="text-muted">{e.date}</td>
                    <td>{e.description}</td>
                    <td><span className="badge badge-muted">{e.category}</span></td>
                    <td style={{textAlign:'right'}} className="text-red">{fmt(e.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">💳</div>
              <h3>No transactions yet</h3>
              <p>Start by adding expenses or importing a CSV</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
