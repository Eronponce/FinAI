import React, { useEffect, useState } from 'react';
import { api } from '../../utils/api.js';
import { useCurrency } from '../../hooks/useCurrency.jsx';
import { CATEGORIES, PAYMENT_METHODS } from '../../utils/categories.js';

const EMPTY = { description:'', amount:'', category:'Food', date: new Date().toISOString().slice(0,10), payment_method:'credit', notes:'' };

export default function Expenses() {
  const { fmt } = useCurrency();
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]   = useState(null);
  const [form, setForm]         = useState(EMPTY);
  const [saving, setSaving]     = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [filterCat, setFilterCat] = useState('');
  const [search, setSearch]     = useState('');

  const load = () => api.get('/expenses').then(setItems).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const filtered = items.filter(e => {
    const matchCat = !filterCat || e.category === filterCat;
    const matchSearch = !search || e.description.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const total = filtered.reduce((s, e) => s + e.amount, 0);

  const openAdd  = () => { setEditing(null); setForm(EMPTY); setShowModal(true); };
  const openEdit = (item) => { setEditing(item); setForm({...item}); setShowModal(true); };
  const close    = () => { setShowModal(false); setEditing(null); };

  const save = async () => {
    if (!form.description || !form.amount || !form.category || !form.date) return;
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/expenses/${editing.id}`, form);
      } else {
        await api.post('/expenses', form);
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
    await api.delete(`/expenses/${deleteConfirm}`);
    setItems(prev => prev.filter(i => i.id !== deleteConfirm));
    setDeleteConfirm(null);
  };

  const pmLabel = (v) => PAYMENT_METHODS.find(p => p.value === v)?.label || v;

  return (
    <div className="page-content">
      <div className="page-header flex justify-between items-center">
        <div><h1>Expenses</h1><p>Log and manage your spending</p></div>
        <button className="btn btn-primary" id="add-expense-btn" onClick={openAdd}>+ Add Expense</button>
      </div>

      <div className="card mb-4">
        <div className="card-body" style={{display:'flex', gap:12, flexWrap:'wrap', alignItems:'center'}}>
          <input className="form-input" style={{maxWidth:280}} placeholder="🔍 Search expenses…"
            value={search} onChange={e => setSearch(e.target.value)} />
          <select className="form-select" style={{maxWidth:200}} value={filterCat}
            onChange={e => setFilterCat(e.target.value)}>
            <option value="">All Categories</option>
            {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
          </select>
          {(filterCat || search) && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setFilterCat(''); setSearch(''); }}>Clear</button>
          )}
          <div style={{marginLeft:'auto'}} className="flex items-center gap-2">
            <span className="text-muted" style={{fontSize:'0.8rem'}}>{filtered.length} entries</span>
            <span className="badge badge-red">{fmt(total)}</span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          {loading ? (
            <div className="empty-state"><div className="spinner" /></div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">💳</div>
              <h3>{items.length === 0 ? 'No expenses yet' : 'No results'}</h3>
              <p>{items.length === 0 ? 'Start by adding an expense or importing a CSV' : 'Try a different filter'}</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr><th>Date</th><th>Description</th><th>Category</th><th>Payment</th><th style={{textAlign:'right'}}>Amount</th><th></th></tr>
              </thead>
              <tbody>
                {filtered.map(item => (
                  <tr key={item.id}>
                    <td className="text-muted" style={{whiteSpace:'nowrap'}}>{item.date}</td>
                    <td>
                      <div>{item.description}</div>
                      {item.notes && <div style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>{item.notes}</div>}
                    </td>
                    <td>
                      <span className="badge badge-muted">
                        {CATEGORIES.find(c=>c.id===item.category)?.icon} {item.category}
                      </span>
                    </td>
                    <td className="text-muted" style={{fontSize:'0.8rem'}}>{pmLabel(item.payment_method)}</td>
                    <td style={{textAlign:'right'}} className="text-red"><strong>{fmt(item.amount)}</strong></td>
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
              <p>Are you sure you want to delete this expense?</p>
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
              <span className="modal-title">{editing ? 'Edit Expense' : 'Add Expense'}</span>
              <button className="btn btn-ghost btn-icon" onClick={close}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Description *</label>
                <input id="expense-desc" className="form-input" placeholder="e.g. iFood, Mercado" value={form.description}
                  onChange={e => setForm(f=>({...f, description:e.target.value}))} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Amount *</label>
                  <input id="expense-amount" type="number" step="0.01" className="form-input" placeholder="0.00" value={form.amount}
                    onChange={e => setForm(f=>({...f, amount:e.target.value}))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Date *</label>
                  <input id="expense-date" type="date" className="form-input" value={form.date}
                    onChange={e => setForm(f=>({...f, date:e.target.value}))} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Category *</label>
                  <select id="expense-category" className="form-select" value={form.category}
                    onChange={e => setForm(f=>({...f, category:e.target.value}))}>
                    {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Payment Method</label>
                  <select id="expense-payment" className="form-select" value={form.payment_method}
                    onChange={e => setForm(f=>({...f, payment_method:e.target.value}))}>
                    {PAYMENT_METHODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
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
              <button id="save-expense-btn" className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? <span className="spinner" /> : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
