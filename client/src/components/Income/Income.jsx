import React, { useEffect, useState } from 'react';
import { api } from '../../utils/api.js';
import { useCurrency } from '../../hooks/useCurrency.jsx';
import { RECURRENCE_OPTIONS } from '../../utils/categories.js';

const EMPTY = { source:'', amount:'', date: new Date().toISOString().slice(0,10), recurrence:'one-time', notes:'', account_id: null, is_transfer: false, from_account_id: null, ignore_dashboard: false };

export default function Income() {
  const { fmt } = useCurrency();
  const [items, setItems]   = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]   = useState(null);
  const [form, setForm]         = useState(EMPTY);
  const [saving, setSaving]     = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [search, setSearch]     = useState('');
  const [filterMonth, setFilterMonth] = useState('');

  const load = () => {
    Promise.all([api.get('/income'), api.get('/accounts')]).then(([inc, acc]) => {
      setItems(inc);
      setAccounts(acc);
    }).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const totalMonthly = items.reduce((s, i) => {
    if (i.recurrence === 'monthly') return s + i.amount;
    if (i.recurrence === 'yearly')  return s + i.amount / 12;
    if (i.recurrence === 'weekly')  return s + i.amount * 4.33;
    if (i.recurrence === 'bi-weekly') return s + i.amount * 2.17;
    return s; // one-time not counted in monthly
  }, 0);

  const totalAllTime = items.reduce((s, i) => s + i.amount, 0);

  const filtered = items.filter(i => {
    const matchSearch = !search || i.source.toLowerCase().includes(search.toLowerCase());
    const matchMonth = !filterMonth || i.date.startsWith(filterMonth);
    return matchSearch && matchMonth;
  });

  const filteredTotal = filtered.reduce((s, i) => s + i.amount, 0);

  const openAdd  = () => { setEditing(null); setForm(EMPTY); setShowModal(true); };
  const openEdit = (item) => { setEditing(item); setForm({ ...item }); setShowModal(true); };
  const close    = () => { setShowModal(false); setEditing(null); };

  const save = async () => {
    if (!form.source || !form.amount || !form.date) return;
    if (form.is_transfer && !form.account_id) { alert("Please select a Destination Account for the transfer."); return; }
    if (form.is_transfer && !editing?.is_transfer && !form.from_account_id) { alert("Please select a Source Account where the money came from."); return; }

    setSaving(true);
    try {
      if (editing) {
        await api.put(`/income/${editing.id}`, form);
        
        if (form.is_transfer && !editing.is_transfer && form.from_account_id) {
          const toAccountName = accounts.find(a => a.id === form.account_id)?.name || 'Account';
          await api.post('/expenses', {
            description: `Transfer to ${toAccountName} (${form.source})`,
            amount: form.amount,
            date: form.date,
            account_id: form.from_account_id,
            category: 'Transfer',
            is_transfer: 1,
            payment_method: 'transfer',
            notes: form.notes
          });
        }
      } else {
        await api.post('/income', form);
        
        if (form.is_transfer && form.from_account_id) {
          const toAccountName = accounts.find(a => a.id === form.account_id)?.name || 'Account';
          await api.post('/expenses', {
            description: `Transfer to ${toAccountName} (${form.source})`,
            amount: form.amount,
            date: form.date,
            account_id: form.from_account_id,
            category: 'Transfer',
            is_transfer: 1,
            payment_method: 'transfer',
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

      <div className="card mb-4">
        <div className="card-body" style={{display:'flex', gap:12, flexWrap:'wrap', alignItems:'center'}}>
          <input className="form-input" style={{maxWidth:280}} placeholder="🔍 Search source…"
            value={search} onChange={e => setSearch(e.target.value)} />
          <input className="form-input" type="month" style={{maxWidth:200}} value={filterMonth}
            onChange={e => setFilterMonth(e.target.value)} />
          {(search || filterMonth) && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFilterMonth(''); }}>Clear</button>
          )}
          <div style={{marginLeft:'auto'}} className="flex items-center gap-2">
            <span className="text-muted" style={{fontSize:'0.8rem'}}>{filtered.length} entries</span>
            <span className="badge badge-green">{fmt(filteredTotal)}</span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          {loading ? (
            <div className="empty-state"><div className="spinner" /></div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">💸</div>
              <h3>{items.length === 0 ? 'No income entries yet' : 'No results'}</h3>
              <p>{items.length === 0 ? 'Add your salary, freelance work, or any income source' : 'Try a different filter'}</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr><th>Source</th><th>Account</th><th>Date</th><th>Recurrence</th><th>Notes</th><th style={{textAlign:'right'}}>Amount</th><th></th></tr>
              </thead>
              <tbody>
                {filtered.map(item => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.source}</strong>
                      {!!item.is_transfer ? <span className="badge badge-blue" style={{marginLeft: 6, fontSize: '0.7rem'}}>Transfer</span> : null}
                      {!!item.ignore_dashboard && !item.is_transfer ? <span className="badge badge-muted" style={{marginLeft: 6, fontSize: '0.7rem'}}>Hidden</span> : null}
                    </td>
                    <td><span className="badge badge-muted">{accounts.find(a => a.id === item.account_id)?.name || '-'}</span></td>
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
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Source *</label>
                  <input id="income-source" className="form-input" placeholder="e.g. Salary, Freelance" value={form.source}
                    onChange={e => setForm(f=>({...f, source:e.target.value}))} />
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
              <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '1rem' }}>
                <input type="checkbox" id="income-is-transfer" checked={!!form.is_transfer} 
                  onChange={e => setForm(f=>({...f, is_transfer: e.target.checked}))} style={{ width: 'auto', margin: 0 }} />
                <label htmlFor="income-is-transfer" style={{ margin: 0, fontWeight: 'bold', cursor: 'pointer', color: 'var(--blue)' }} className="form-label">
                  🔄 Mark as Transfer between accounts
                </label>
              </div>

              {!form.is_transfer && (
                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '0.5rem' }}>
                  <input type="checkbox" id="income-ignore-dashboard" checked={!!form.ignore_dashboard} 
                    onChange={e => setForm(f=>({...f, ignore_dashboard: e.target.checked}))} style={{ width: 'auto', margin: 0 }} />
                  <label htmlFor="income-ignore-dashboard" style={{ margin: 0, fontWeight: 'normal', cursor: 'pointer' }} className="form-label">
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
                      <label className="form-label" style={{ color: 'var(--accent)' }}>Transfer From (Source Account) *</label>
                      <select className="form-select" value={form.from_account_id || ''}
                        onChange={e => setForm(f=>({...f, from_account_id: e.target.value ? parseInt(e.target.value) : null}))}>
                        <option value="">-- Select Source Account --</option>
                        {accounts.filter(a => a.id !== form.account_id).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </>
                  )}
                </div>
              )}
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
