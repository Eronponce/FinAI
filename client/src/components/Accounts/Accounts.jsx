import React, { useEffect, useState } from 'react';
import { api } from '../../utils/api.js';
import { useCurrency } from '../../hooks/useCurrency.jsx';

const EMPTY = { name: '', type: 'Checking', balance: '' };

const ACCOUNT_TYPES = [
  { value: 'Checking', label: 'Checking' },
  { value: 'Savings', label: 'Savings' },
  { value: 'Credit', label: 'Credit Card' },
  { value: 'Investment', label: 'Investment' },
  { value: 'Cash', label: 'Cash' }
];

export default function Accounts() {
  const { fmt } = useCurrency();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const load = () => api.get('/accounts').then(setItems).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const totalBalance = items.reduce((s, i) => s + (i.type === 'Credit' ? -i.balance : i.balance), 0);
  const totalAssets = items.reduce((s, i) => s + (i.type !== 'Credit' ? i.balance : 0), 0);
  const totalDebt = items.reduce((s, i) => s + (i.type === 'Credit' ? i.balance : 0), 0);

  const openAdd = () => { setEditing(null); setForm(EMPTY); setShowModal(true); };
  const openEdit = (item) => { setEditing(item); setForm({ ...item }); setShowModal(true); };
  const close = () => { setShowModal(false); setEditing(null); };

  const save = async () => {
    if (!form.name || !form.type || form.balance === '') return;
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/accounts/${editing.id}`, form);
      } else {
        await api.post('/accounts', form);
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
    await api.delete(`/accounts/${deleteConfirm}`);
    setItems((prev) => prev.filter((i) => i.id !== deleteConfirm));
    setDeleteConfirm(null);
  };

  return (
    <div className="page-content">
      <div className="page-header flex justify-between items-center">
        <div>
          <h1>Accounts</h1>
          <p>Manage your bank accounts, credit cards, and cash</p>
        </div>
        <button className="btn btn-primary" onClick={openAdd} id="add-account-btn">
          + Add Account
        </button>
      </div>

      <div className="grid-3 mb-4">
        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: 'var(--green-soft)' }}>🏦</div>
          <div className="stat-card-label">Total Assets</div>
          <div className="stat-card-value text-green">{fmt(totalAssets)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: 'var(--red-soft)' }}>💳</div>
          <div className="stat-card-label">Total Debt</div>
          <div className="stat-card-value text-red">{fmt(totalDebt)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon" style={{ background: 'var(--blue-soft)' }}>⚖️</div>
          <div className="stat-card-label">Net Net Worth</div>
          <div className="stat-card-value text-accent">{fmt(totalBalance)}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">🏛 Your Accounts</span>
        </div>
        <div className="table-wrap">
          {loading ? (
            <div className="empty-state">
              <div className="spinner" />
            </div>
          ) : items.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🏦</div>
              <h3>No accounts created yet</h3>
              <p>Add your first bank account or wallet</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th style={{ textAlign: 'right' }}>Balance</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.name}</strong>
                    </td>
                    <td>
                      <span className="badge badge-accent">{item.type}</span>
                    </td>
                    <td
                      style={{ textAlign: 'right' }}
                      className={item.type === 'Credit' ? 'text-red' : 'text-green'}
                    >
                      <strong>{fmt(item.balance)}</strong>
                    </td>
                    <td>
                      <div className="flex gap-2">
                        <button
                          className="btn btn-ghost btn-sm btn-icon"
                          onClick={() => openEdit(item)}
                        >
                          ✏️
                        </button>
                        <button
                          className="btn btn-danger btn-sm btn-icon"
                          onClick={() => remove(item.id)}
                        >
                          🗑️
                        </button>
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
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setDeleteConfirm(null)}
        >
          <div className="modal" style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <span className="modal-title">Confirm Delete</span>
              <button className="btn btn-ghost btn-icon" onClick={() => setDeleteConfirm(null)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to delete this account?</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setDeleteConfirm(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={confirmDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && close()}
        >
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">{editing ? 'Edit Account' : 'Add Account'}</span>
              <button className="btn btn-ghost btn-icon" onClick={close}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Account Name *</label>
                <input
                  id="account-name"
                  className="form-input"
                  placeholder="e.g. Main Checking, Chase Sapphie"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Type *</label>
                  <select
                    id="account-type"
                    className="form-select"
                    value={form.type}
                    onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                  >
                    {ACCOUNT_TYPES.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Balance *</label>
                  <input
                    id="account-balance"
                    type="number"
                    step="0.01"
                    className="form-input"
                    placeholder="0.00"
                    value={form.balance}
                    onChange={(e) => setForm((f) => ({ ...f, balance: e.target.value }))}
                  />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={close}>
                Cancel
              </button>
              <button id="save-account-btn" className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? <span className="spinner" /> : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
