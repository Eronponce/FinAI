import React, { useEffect, useState } from 'react';
import { api } from '../../utils/api.js';
import { useCurrency } from '../../hooks/useCurrency.jsx';
import { CURRENCIES } from '../../utils/categories.js';

export default function Settings() {
  const { symbol, code, setSymbol, setCode } = useCurrency();
  const [settings, setSettings] = useState({ currency:'BRL', currency_symbol:'R$' });
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [clearing, setClearing] = useState(false);

  const clearDatabase = async () => {
    if (!window.confirm("WARNING: This will permanently delete ALL data (Income, Expenses, Subscriptions, Goals) and reset all settings. This action cannot be undone. Are you absolutely sure?")) {
      return;
    }
    setClearing(true);
    try {
      await api.post('/settings/reset');
      window.location.href = '/'; // Redirect to home so they get a fresh state
    } catch (e) {
      alert("Failed to clear database: " + e.message);
      setClearing(false);
    }
  };

  useEffect(() => {
    api.get('/settings').then(s => { setSettings(s); }).catch(() => {});
  }, []);

  const handleCurrencyChange = (e) => {
    const cur = CURRENCIES.find(c => c.code === e.target.value);
    if (cur) setSettings(s => ({ ...s, currency: cur.code, currency_symbol: cur.symbol }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const updated = await api.put('/settings', settings);
      setSymbol(updated.currency_symbol);
      setCode(updated.currency);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally { setSaving(false); }
  };

  return (
    <div className="page-content">
      <div className="page-header">
        <h1>Settings</h1>
        <p>Configure your dashboard preferences</p>
      </div>

      <div className="card" style={{maxWidth:560}}>
        <div className="card-header">
          <span className="card-title">💱 Currency</span>
        </div>
        <div className="card-body" style={{display:'flex', flexDirection:'column', gap:20}}>
          <div className="form-group">
            <label className="form-label">Display Currency</label>
            <select id="currency-select" className="form-select" value={settings.currency} onChange={handleCurrencyChange}>
              {CURRENCIES.map(c => (
                <option key={c.code} value={c.code}>{c.label}</option>
              ))}
            </select>
            <div style={{fontSize:'0.78rem', color:'var(--text-muted)', marginTop:4}}>
              All amounts will display in {settings.currency_symbol} {settings.currency}
            </div>
          </div>
          <div style={{display:'flex', alignItems:'center', gap:12}}>
            <button id="save-settings-btn" className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? <span className="spinner" /> : 'Save Settings'}
            </button>
            {saved && <span className="badge badge-green">✓ Saved</span>}
          </div>
        </div>
      </div>

      <div className="card" style={{maxWidth:560, marginTop:20}}>
        <div className="card-header">
          <span className="card-title">🤖 AI Advisor Setup</span>
        </div>
        <div className="card-body" style={{display:'flex', flexDirection:'column', gap:16}}>
          <div style={{background:'var(--accent-gradient-soft)', border:'1px solid var(--border-accent)', borderRadius:'var(--radius-md)', padding:16}}>
            <div style={{fontWeight:600, marginBottom:8}}>How to get your Gemini API key</div>
            <ol style={{listStyle:'decimal', paddingLeft:18, display:'flex', flexDirection:'column', gap:6, fontSize:'0.875rem', color:'var(--text-secondary)'}}>
              <li>Visit <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" style={{color:'var(--text-accent)'}}>aistudio.google.com/app/apikey</a></li>
              <li>Sign in with your Google account</li>
              <li>Click <strong style={{color:'var(--text-primary)'}}>Create API Key</strong></li>
              <li>Copy the key and add it to your <code style={{background:'var(--bg-input)',padding:'1px 6px',borderRadius:4}}>.env</code> file:</li>
            </ol>
            <div style={{background:'var(--bg-base)', borderRadius:'var(--radius-sm)', padding:'10px 14px', marginTop:12, fontFamily:'monospace', fontSize:'0.85rem', color:'var(--text-accent)', border:'1px solid var(--border)'}}>
              GEMINI_API_KEY=your_key_here
            </div>
            <div style={{fontSize:'0.78rem', color:'var(--text-muted)', marginTop:8}}>
              Free tier: 1,500 requests/day — more than enough for personal use. Restart the server after adding the key.
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{maxWidth:560, marginTop:20}}>
        <div className="card-header">
          <span className="card-title">💾 Data</span>
        </div>
        <div className="card-body" style={{display:'flex', flexDirection:'column', gap:12}}>
          <div style={{fontSize:'0.875rem', color:'var(--text-secondary)'}}>
            Your data is stored locally in <code style={{background:'var(--bg-input)',padding:'1px 6px',borderRadius:4}}>server/finances.db</code> — a SQLite file on your machine. Nothing is sent to any cloud service.
          </div>
          <div style={{gap:8, display:'flex'}}>
            <span className="badge badge-green">✓ 100% Local</span>
            <span className="badge badge-muted">No Account Required</span>
            <span className="badge badge-muted">No Internet Needed</span>
          </div>
        </div>
      </div>

      <div className="card" style={{maxWidth:560, marginTop:20, borderColor:'rgba(239, 68, 68, 0.4)'}}>
        <div className="card-header" style={{borderBottomColor:'rgba(239, 68, 68, 0.2)'}}>
          <span className="card-title text-red">⚠️ Danger Zone</span>
        </div>
        <div className="card-body" style={{display:'flex', flexDirection:'column', gap:12}}>
          <div style={{fontSize:'0.875rem', color:'var(--text-secondary)'}}>
            This action will permanently delete all your data including income, expenses, subscriptions, and budget goals. This action cannot be undone.
          </div>
          <div>
            <button className="btn btn-danger" onClick={clearDatabase} disabled={clearing}>
              {clearing ? <span className="spinner" /> : 'Delete All Data & Reset Application'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
