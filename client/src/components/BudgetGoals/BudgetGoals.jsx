import React, { useEffect, useState } from 'react';
import { api } from '../../utils/api.js';
import { useCurrency } from '../../hooks/useCurrency.jsx';
import { CATEGORIES, getCategoryColor } from '../../utils/categories.js';

export default function BudgetGoals() {
  const { fmt } = useCurrency();
  const [goals, setGoals]       = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]   = useState(null);
  const [form, setForm]         = useState({ category:'Food', monthly_limit:'' });
  const [saving, setSaving]     = useState(false);

  const now = new Date();
  const thisMonth = String(now.getMonth() + 1);
  const thisYear  = String(now.getFullYear());

  const load = () => Promise.all([
    api.get('/goals'),
    api.get(`/expenses?month=${thisMonth}&year=${thisYear}`),
  ]).then(([g, e]) => { setGoals(g); setExpenses(e); }).finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const spentByCategory = {};
  expenses.forEach(e => {
    spentByCategory[e.category] = (spentByCategory[e.category] || 0) + e.amount;
  });

  const openAdd  = () => { setEditing(null); setForm({ category:'Food', monthly_limit:'' }); setShowModal(true); };
  const openEdit = (g) => { setEditing(g); setForm({...g}); setShowModal(true); };
  const close    = () => { setShowModal(false); setEditing(null); };

  const save = async () => {
    if (!form.category || !form.monthly_limit) return;
    setSaving(true);
    try {
      if (editing) await api.put(`/goals/${editing.id}`, form);
      else          await api.post('/goals', form);
      await load(); close();
    } finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!confirm('Delete this budget goal?')) return;
    await api.delete(`/goals/${id}`);
    setGoals(prev => prev.filter(g => g.id !== id));
  };

  const usedCategories = goals.map(g => g.category);

  return (
    <div className="page-content">
      <div className="page-header flex justify-between items-center">
        <div><h1>Budget Goals</h1><p>Monthly spending limits by category</p></div>
        <button className="btn btn-primary" id="add-goal-btn" onClick={openAdd}>+ Add Goal</button>
      </div>

      <div className="card mb-4">
        <div className="card-header">
          <span className="card-title">🎯 Monthly Limits — {new Date().toLocaleString('en', {month:'long', year:'numeric'})}</span>
        </div>
        <div className="card-body" style={{display:'flex', flexDirection:'column', gap:20}}>
          {loading ? (
            <div className="empty-state"><div className="spinner" /></div>
          ) : goals.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🎯</div>
              <h3>No budget goals yet</h3>
              <p>Set monthly limits per category to track your spending</p>
            </div>
          ) : (
            goals.map(goal => {
              const spent  = spentByCategory[goal.category] || 0;
              const pct    = Math.min((spent / goal.monthly_limit) * 100, 100);
              const over   = spent > goal.monthly_limit;
              const warn   = !over && pct >= 75;
              const color  = over ? 'var(--red)' : warn ? 'var(--yellow)' : getCategoryColor(goal.category);
              const cat    = CATEGORIES.find(c => c.id === goal.category);

              return (
                <div key={goal.id}>
                  <div className="flex justify-between items-center mb-4" style={{marginBottom:8}}>
                    <div className="flex items-center gap-2">
                      <span>{cat?.icon || '📦'}</span>
                      <span style={{fontWeight:600}}>{goal.category}</span>
                      {over   && <span className="badge badge-red">Over budget</span>}
                      {warn   && <span className="badge badge-yellow">Careful</span>}
                      {!over && !warn && pct > 0 && <span className="badge badge-green">On track</span>}
                    </div>
                    <div className="flex items-center gap-3">
                      <span style={{fontSize:'0.85rem', color: over ? 'var(--red)' : 'var(--text-secondary)'}}>
                        {fmt(spent)} / {fmt(goal.monthly_limit)}
                      </span>
                      <span style={{fontSize:'0.8rem', color, fontWeight:600}}>{pct.toFixed(0)}%</span>
                      <button className="btn btn-ghost btn-sm btn-icon" onClick={() => openEdit(goal)}>✏️</button>
                      <button className="btn btn-danger btn-sm btn-icon" onClick={() => remove(goal.id)}>🗑️</button>
                    </div>
                  </div>
                  <div className="progress-bar-track">
                    <div className="progress-bar-fill" style={{
                      width: `${pct}%`,
                      background: over
                        ? 'var(--red)'
                        : warn
                        ? 'var(--yellow)'
                        : `linear-gradient(90deg, ${color}aa, ${color})`
                    }} />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && close()}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">{editing ? 'Edit Budget Goal' : 'Add Budget Goal'}</span>
              <button className="btn btn-ghost btn-icon" onClick={close}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Category *</label>
                <select id="goal-category" className="form-select" value={form.category}
                  onChange={e => setForm(f=>({...f, category:e.target.value}))}>
                  {CATEGORIES.map(c => (
                    <option key={c.id} value={c.id} disabled={!editing && usedCategories.includes(c.id)}>
                      {c.icon} {c.label} {!editing && usedCategories.includes(c.id) ? '(already set)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Monthly Limit *</label>
                <input id="goal-limit" type="number" step="0.01" className="form-input" placeholder="e.g. 800.00" value={form.monthly_limit}
                  onChange={e => setForm(f=>({...f, monthly_limit:e.target.value}))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={close}>Cancel</button>
              <button id="save-goal-btn" className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? <span className="spinner" /> : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
