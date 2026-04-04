import React, { useEffect, useState } from 'react';
import { api } from '../../utils/api.js';
import { useCurrency } from '../../hooks/useCurrency.jsx';
import { CATEGORIES, CYCLE_OPTIONS } from '../../utils/categories.js';
import './Subscriptions.css';

const EMPTY = { name:'', amount:'', cycle:'monthly', category:'Subscriptions', renewal_date:'', notes:'', active:1 };

export default function Subscriptions() {
  const { fmt } = useCurrency();
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]   = useState(null);
  const [form, setForm]         = useState(EMPTY);
  const [saving, setSaving]     = useState(false);

  const load = () => api.get('/subscriptions').then(setItems).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const monthlyTotal = items.filter(s=>s.active).reduce((sum, s) => {
    if (s.cycle === 'monthly') return sum + s.amount;
    if (s.cycle === 'yearly')  return sum + s.amount / 12;
    if (s.cycle === 'weekly')  return sum + s.amount * 4.33;
    return sum + s.amount;
  }, 0);
  const yearlyTotal = monthlyTotal * 12;

  const openAdd  = () => { setEditing(null); setForm(EMPTY); setShowModal(true); };
  const openEdit = (item) => { setEditing(item); setForm({...item}); setShowModal(true); };
  const close    = () => { setShowModal(false); setEditing(null); };

  const save = async () => {
    if (!form.name || !form.amount) return;
    setSaving(true);
    try {
      if (editing) await api.put(`/subscriptions/${editing.id}`, form);
      else          await api.post('/subscriptions', form);
      await load(); close();
    } finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!confirm('Delete this subscription?')) return;
    await api.delete(`/subscriptions/${id}`);
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const toggle = async (item) => {
    const updated = { ...item, active: item.active ? 0 : 1 };
    await api.put(`/subscriptions/${item.id}`, updated);
    setItems(prev => prev.map(i => i.id === item.id ? {...i, active: updated.active} : i));
  };

  return (
    <div className="page-content">
      <div className="page-header flex justify-between items-center">
        <div><h1>Subscriptions</h1><p>Track recurring charges</p></div>
        <button className="btn btn-primary" id="add-sub-btn" onClick={openAdd}>+ Add Subscription</button>
      </div>

      <div className="grid-3 mb-4">
        <div className="stat-card">
          <div className="stat-card-icon" style={{background:'var(--blue-soft)'}}>📱</div>
          <div className="stat-card-label">Monthly Cost</div>
          <div className="stat-card-value" style={{color:'var(--accent-2)'}}>{fmt(monthlyTotal)}</div>
          <div className="stat-card-sub">{items.filter(s=>s.active).length} active</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon" style={{background:'var(--yellow-soft)'}}>📅</div>
          <div className="stat-card-label">Yearly Cost</div>
          <div className="stat-card-value text-yellow">{fmt(yearlyTotal)}</div>
          <div className="stat-card-sub">Projected annual spend</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon" style={{background:'rgba(255,255,255,0.06)'}}>💤</div>
          <div className="stat-card-label">Paused</div>
          <div className="stat-card-value text-muted">{items.filter(s=>!s.active).length}</div>
          <div className="stat-card-sub">Inactive subscriptions</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">🔄 All Subscriptions</span>
        </div>
        <div className="sub-grid">
          {loading ? (
            <div className="empty-state"><div className="spinner" /></div>
          ) : items.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📱</div>
              <h3>No subscriptions yet</h3>
              <p>Add Netflix, Spotify, or any recurring charge</p>
            </div>
          ) : (
            items.map(item => {
              const cat = CATEGORIES.find(c => c.id === item.category);
              return (
                <div key={item.id} className={`sub-card ${!item.active ? 'sub-card-inactive' : ''}`}>
                  <div className="sub-card-top">
                    <div className="sub-card-icon" style={{background: cat ? cat.color + '22' : 'var(--bg-input)'}}>
                      {cat?.icon || '📦'}
                    </div>
                    <div className="sub-card-info">
                      <div className="sub-card-name">{item.name}</div>
                      <div className="sub-card-cat">{item.category} · {item.cycle}</div>
                    </div>
                    <div className="sub-card-amount" style={{color: item.active ? 'var(--text-primary)' : 'var(--text-muted)'}}>
                      {fmt(item.amount)}
                    </div>
                  </div>
                  {item.renewal_date && (
                    <div className="sub-card-renewal">Renews: {item.renewal_date}</div>
                  )}
                  <div className="sub-card-actions">
                    <button className={`btn btn-sm ${item.active ? 'btn-secondary' : 'btn-ghost'}`}
                      onClick={() => toggle(item)}>
                      {item.active ? '⏸ Pause' : '▶ Resume'}
                    </button>
                    <button className="btn btn-ghost btn-sm btn-icon" onClick={() => openEdit(item)}>✏️</button>
                    <button className="btn btn-danger btn-sm btn-icon" onClick={() => remove(item.id)}>🗑️</button>
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
              <span className="modal-title">{editing ? 'Edit Subscription' : 'Add Subscription'}</span>
              <button className="btn btn-ghost btn-icon" onClick={close}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Name *</label>
                <input id="sub-name" className="form-input" placeholder="e.g. Netflix, Spotify" value={form.name}
                  onChange={e => setForm(f=>({...f, name:e.target.value}))} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Amount *</label>
                  <input id="sub-amount" type="number" step="0.01" className="form-input" placeholder="0.00" value={form.amount}
                    onChange={e => setForm(f=>({...f, amount:e.target.value}))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Billing Cycle</label>
                  <select id="sub-cycle" className="form-select" value={form.cycle}
                    onChange={e => setForm(f=>({...f, cycle:e.target.value}))}>
                    {CYCLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Category</label>
                  <select id="sub-cat" className="form-select" value={form.category}
                    onChange={e => setForm(f=>({...f, category:e.target.value}))}>
                    {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Renewal Date</label>
                  <input id="sub-renewal" type="date" className="form-input" value={form.renewal_date||''}
                    onChange={e => setForm(f=>({...f, renewal_date:e.target.value}))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Notes</label>
                <input className="form-input" placeholder="Optional note" value={form.notes||''}
                  onChange={e => setForm(f=>({...f, notes:e.target.value}))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={close}>Cancel</button>
              <button id="save-sub-btn" className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? <span className="spinner" /> : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
