import React, { useEffect, useState } from 'react';
import { api } from '../../utils/api.js';
import { useCurrency } from '../../hooks/useCurrency.jsx';
import { CATEGORIES, PAYMENT_METHODS } from '../../utils/categories.js';

const EMPTY = { description:'', amount:'', category:'Food', date: new Date().toISOString().slice(0,10), payment_method:'credit', notes:'', account_id: null, is_transfer: false, to_account_id: null, ignore_dashboard: false };

export default function Expenses() {
  const { fmt } = useCurrency();
  const [items, setItems]     = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]   = useState(null);
  const [form, setForm]         = useState(EMPTY);
  const [saving, setSaving]     = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [filterCat, setFilterCat] = useState('');
  const [search, setSearch]     = useState('');
  const [filterMonth, setFilterMonth] = useState('');

  const load = () => {
    Promise.all([api.get('/expenses'), api.get('/accounts')]).then(([exp, acc]) => {
      setItems(exp);
      setAccounts(acc);
    }).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const filtered = items.filter(e => {
    const matchCat = !filterCat || e.category === filterCat;
    const matchSearch = !search || e.description.toLowerCase().includes(search.toLowerCase());
    const matchMonth = !filterMonth || e.date.startsWith(filterMonth);
    return matchCat && matchSearch && matchMonth;
  });

  const total = filtered.reduce((s, e) => s + e.amount, 0);

  const openAdd  = () => { setEditing(null); setForm(EMPTY); setShowModal(true); };
  const openEdit = (item) => { setEditing(item); setForm({...item}); setShowModal(true); };
  const close    = () => { setShowModal(false); setEditing(null); };

  const save = async () => {
    if (!form.description || !form.amount || !form.category || !form.date) return;
    if (form.is_transfer && !form.account_id) { alert("Please select an Account for the transfer."); return; }
    if (form.is_transfer && !editing?.is_transfer && !form.to_account_id) { alert("Please select a Destination Account for the transfer."); return; }
    
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/expenses/${editing.id}`, form);
        
        if (form.is_transfer && !editing.is_transfer && form.to_account_id) {
          const fromAccountName = accounts.find(a => a.id === form.account_id)?.name || 'Account';
          await api.post('/income', {
            source: `Transfer from ${fromAccountName} (${form.description})`,
            amount: form.amount,
            date: form.date,
            account_id: form.to_account_id,
            is_transfer: 1,
            recurrence: 'one-time',
            notes: form.notes
          });
        }
      } else {
        await api.post('/expenses', form);
        
        if (form.is_transfer && form.to_account_id) {
          const fromAccountName = accounts.find(a => a.id === form.account_id)?.name || 'Account';
          await api.post('/income', {
            source: `Transfer from ${fromAccountName} (${form.description})`,
            amount: form.amount,
            date: form.date,
            account_id: form.to_account_id,
            is_transfer: 1,
            recurrence: 'one-time',
            notes: form.notes
          });
        }
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
          <input className="form-input" type="month" style={{maxWidth:200}} value={filterMonth}
            onChange={e => setFilterMonth(e.target.value)} />
          <select className="form-select" style={{maxWidth:200}} value={filterCat}
            onChange={e => setFilterCat(e.target.value)}>
            <option value="">All Categories</option>
            {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
          </select>
          {(filterCat || search || filterMonth) && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setFilterCat(''); setSearch(''); setFilterMonth(''); }}>Clear</button>
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
                <tr><th>Date</th><th>Description</th><th>Account</th><th>Category</th><th>Payment</th><th style={{textAlign:'right'}}>Amount</th><th></th></tr>
              </thead>
              <tbody>
                {filtered.map(item => (
                  <tr key={item.id}>
                    <td className="text-muted" style={{whiteSpace:'nowrap'}}>{item.date}</td>
                    <td>
                      <div>{item.description}</div>
                      {item.notes && <div style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>{item.notes}</div>}
                    </td>
                    <td><span className="badge badge-muted">{accounts.find(a => a.id === item.account_id)?.name || '-'}</span></td>
                    <td>
                      <span className="badge badge-muted">
                        {CATEGORIES.find(c=>c.id===item.category)?.icon} {item.category}
                      </span>
                      {!!item.is_transfer ? <span className="badge badge-blue" style={{marginLeft: 4, fontSize: '0.7rem'}}>Transfer</span> : null}
                      {!!item.ignore_dashboard && !item.is_transfer ? <span className="badge badge-muted" style={{marginLeft: 4, fontSize: '0.7rem'}}>Hidden</span> : null}
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
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Description *</label>
                  <input id="expense-desc" className="form-input" placeholder="e.g. iFood, Mercado" value={form.description}
                    onChange={e => setForm(f=>({...f, description:e.target.value}))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Account</label>
                  <select className="form-select" value={form.account_id || ''}
                    onChange={e => setForm(f=>({...f, account_id: e.target.value ? parseInt(e.target.value) : null}))}>
                    <option value="">-- No Account --</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
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
              <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '1rem' }}>
                <input type="checkbox" id="expense-is-transfer" checked={!!form.is_transfer} 
                  onChange={e => {
                    const isChecked = e.target.checked;
                    setForm(f=>({
                      ...f, 
                      is_transfer: isChecked, 
                      category: isChecked ? 'Transfer' : f.category 
                    }));
                  }} 
                  style={{ width: 'auto', margin: 0 }} />
                <label htmlFor="expense-is-transfer" style={{ margin: 0, fontWeight: 'bold', cursor: 'pointer', color: 'var(--blue)' }} className="form-label">
                  🔄 Mark as Transfer between accounts
                </label>
              </div>

              {!form.is_transfer && (
                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '0.5rem' }}>
                  <input type="checkbox" id="expense-ignore-dashboard" checked={!!form.ignore_dashboard} 
                    onChange={e => setForm(f=>({...f, ignore_dashboard: e.target.checked}))} style={{ width: 'auto', margin: 0 }} />
                  <label htmlFor="expense-ignore-dashboard" style={{ margin: 0, fontWeight: 'normal', cursor: 'pointer' }} className="form-label">
                    Hide from Dashboard statistics
                  </label>
                </div>
              )}

              {form.is_transfer && (
                <div className="form-group" style={{ padding: '12px', background: 'var(--bg-body)', borderRadius: '8px', border: '1px solid var(--border)', marginTop: '0.5rem' }}>
                  {editing?.is_transfer ? (
                    <div style={{color: 'var(--text-muted)', fontSize: '0.85rem'}}>
                      ℹ️ This is a transfer record. Editing it here will only update this side of the transaction.
                    </div>
                  ) : (
                    <>
                      <label className="form-label" style={{ color: 'var(--accent)' }}>Transfer To (Destination Account) *</label>
                      <select className="form-select" value={form.to_account_id || ''}
                        onChange={e => setForm(f=>({...f, to_account_id: e.target.value ? parseInt(e.target.value) : null}))}>
                        <option value="">-- Select Destination Account --</option>
                        {accounts.filter(a => a.id !== form.account_id).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </>
                  )}
                </div>
              )}
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
