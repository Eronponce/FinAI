import React, { useEffect, useState } from 'react';
import { api } from '../../utils/api.js';
import { useCurrency } from '../../hooks/useCurrency.jsx';
import { RECURRENCE_OPTIONS } from '../../utils/categories.js';

const EMPTY = { source:'', amount:'', date: new Date().toISOString().slice(0,10), recurrence:'monthly', notes:'' };

export default function Income() {
  const { fmt } = useCurrency();
  const [items, setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]   = useState(null);
  const [form, setForm]         = useState(EMPTY);
  const [saving, setSaving]     = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const load = () => api.get('/income').then(setItems).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const totalMonthly = items.reduce((s, i) => {
    if (i.recurrence === 'monthly') return s + i.amount;
    if (i.recurrence === 'yearly')  return s + i.amount / 12;
    if (i.recurrence === 'weekly')  return s + i.amount * 4.33;
    if (i.recurrence === 'bi-weekly') return s + i.amount * 2.17;
    return s; // one-time not counted in monthly
  }, 0);

  const totalAllTime = items.reduce((s, i) => s + i.amount, 0);

  const openAdd  = () => { setEditing(null); setForm(EMPTY); setShowModal(true); };
  const openEdit = (item) => { setEditing(item); setForm({ ...item }); setShowModal(true); };
  const close    = () => { setShowModal(false); setEditing(null); };

  const save = async () => {
    if (!form.source || !form.amount || !form.date) return;
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/income/${editing.id}`, form);
      } else {
        await api.post('/income', form);
      }
      await load();
      close();
    } finally { setSaving(false); }
  };

  const remove = async (id) => {
    setDeleteConfirm(id);
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    await api.delete(`/income/${deleteConfirm}`);
    setItems(prev => prev.filter(i => i.id !== deleteConfirm));
    setDeleteConfirm(null);
  };

  return (
    <div className="page-content">
      <div className="page-header flex justify-between items-center">
        <div>
          <h1>Income</h1>
          <p>Track your income sources</p>
        </div>
        <button className="btn btn-primary" onClick={openAdd} id="add-income-btn">+ Add Income</button>
      </div>

      <div className="grid-3 mb-4">
        <div className="stat-card">
          <div className="stat-card-icon" style={{background:'var(--green-soft)'}}>💰</div>
          <div className="stat-card-label">Monthly Recurring</div>
          <div className="stat-card-value text-green">{fmt(totalMonthly)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon" style={{background:'var(--blue-soft)'}}>📋</div>
          <div className="stat-card-label">Total Entries</div>
          <div className="stat-card-value">{items.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon" style={{background:'rgba(124,58,237,0.15)'}}>📊</div>
          <div className="stat-card-label">All Time Total</div>
          <div className="stat-card-value text-accent">{fmt(totalAllTime)}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">💰 Income Sources</span>
        </div>
        <div className="table-wrap">
          {loading ? (
            <div className="empty-state"><div className="spinner" /></div>
          ) : items.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">💸</div>
              <h3>No income entries yet</h3>
              <p>Add your salary, freelance work, or any income source</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr><th>Source</th><th>Date</th><th>Recurrence</th><th>Notes</th><th style={{textAlign:'right'}}>Amount</th><th></th></tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id}>
                    <td><strong>{item.source}</strong></td>
                    <td className="text-muted">{item.date}</td>
                    <td><span className="badge badge-blue">{item.recurrence}</span></td>
                    <td className="text-muted" style={{maxWidth:150,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.notes||'-'}</td>
                    <td style={{textAlign:'right'}} className="text-green"><strong>{fmt(item.amount)}</strong></td>
                    <td>
                      <div className="flex gap-2">
                        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => openEdit(item)}>✏️</button>
                        <button className="btn btn-danger btn-sm btn-icon" onClick={() => remove(item.id)}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {deleteConfirm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setDeleteConfirm(null)}>
          <div className="modal" style={{maxWidth: '400px'}}>
            <div className="modal-header">
              <span className="modal-title">Confirm Delete</span>
              <button className="btn btn-ghost btn-icon" onClick={() => setDeleteConfirm(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to delete this income entry?</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={confirmDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && close()}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">{editing ? 'Edit Income' : 'Add Income'}</span>
              <button className="btn btn-ghost btn-icon" onClick={close}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Source *</label>
                <input id="income-source" className="form-input" placeholder="e.g. Salary, Freelance" value={form.source}
                  onChange={e => setForm(f=>({...f, source:e.target.value}))} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Amount *</label>
                  <input id="income-amount" type="number" step="0.01" className="form-input" placeholder="0.00" value={form.amount}
                    onChange={e => setForm(f=>({...f, amount:e.target.value}))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Date *</label>
                  <input id="income-date" type="date" className="form-input" value={form.date}
                    onChange={e => setForm(f=>({...f, date:e.target.value}))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Recurrence</label>
                <select id="income-recurrence" className="form-select" value={form.recurrence}
                  onChange={e => setForm(f=>({...f, recurrence:e.target.value}))}>
                  {RECURRENCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Notes</label>
                <input className="form-input" placeholder="Optional note" value={form.notes||''}
                  onChange={e => setForm(f=>({...f, notes:e.target.value}))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={close}>Cancel</button>
              <button id="save-income-btn" className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? <span className="spinner" /> : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
