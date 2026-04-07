import React, { useEffect, useState } from 'react';
import { api } from '../../utils/api.js';
import { useCurrency } from '../../hooks/useCurrency.jsx';
import { CURRENCIES } from '../../utils/categories.js';
import '../Workspace/Workspace.css';

const RESET_CONFIRMATION = 'RESET-ALL-DATA';

export default function Settings() {
  const { setSymbol, setCode } = useCurrency();
  const [settings, setSettings] = useState({ currency: 'BRL', currency_symbol: 'R$' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    api.get('/settings').then(setSettings).catch(() => {});
  }, []);

  const handleCurrencyChange = (event) => {
    const currency = CURRENCIES.find((item) => item.code === event.target.value);
    if (currency) {
      setSettings((current) => ({
        ...current,
        currency: currency.code,
        currency_symbol: currency.symbol,
      }));
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const updated = await api.put('/settings', settings);
      setSymbol(updated.currency_symbol);
      setCode(updated.currency);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  const clearDatabase = async () => {
    setShowConfirm(false);
    setClearing(true);
    try {
      await api.post(
        '/settings/reset',
        { confirmation: RESET_CONFIRMATION },
        { headers: { 'X-Reset-Confirmation': RESET_CONFIRMATION } }
      );
      window.location.href = '/';
    } catch (error) {
      alert(`Falha ao limpar a base: ${error.message}`);
      setClearing(false);
    }
  };

  return (
    <div className="page-content">
      <section className="workspace-hero">
        <span className="workspace-kicker">Settings</span>
        <h1>Configuracoes do workspace local.</h1>
        <p>Esta tela ficou focada no essencial: moeda, uso da IA, armazenamento local e o reset completo da base.</p>
        <div className="workspace-chip-row">
          <span className="workspace-chip">{settings.currency_symbol} {settings.currency}</span>
          <span className="workspace-chip">Local-first</span>
        </div>
      </section>

      <div className="workspace-summary-banner mb-4">
        <div>
          <strong>Leitura rapida</strong>
          <p>Quase tudo aqui e local. A unica integracao externa opcional hoje e a consulta da IA.</p>
        </div>
        <div className="workspace-inline-actions">
          <span className="badge badge-green">Base local</span>
          <span className="badge badge-muted">IA opcional</span>
        </div>
      </div>

      <div className="grid-2">
        <div className="workspace-section-stack">
          <div className="card">
            <div className="card-header">
              <span className="card-title">Moeda</span>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div className="form-group">
                <label className="form-label">Display Currency</label>
                <select id="currency-select" className="form-select" value={settings.currency} onChange={handleCurrencyChange}>
                  {CURRENCIES.map((currency) => (
                    <option key={currency.code} value={currency.code}>{currency.label}</option>
                  ))}
                </select>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>
                  Todos os valores aparecem em {settings.currency_symbol} {settings.currency}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <button id="save-settings-btn" className="btn btn-primary" onClick={save} disabled={saving}>
                  {saving ? <span className="spinner" /> : 'Salvar configuracoes'}
                </button>
                {saved ? <span className="badge badge-green">Salvo</span> : null}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">Dados locais</span>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                Seus dados ficam locais em <code style={{ background: 'var(--bg-input)', padding: '1px 6px', borderRadius: 4 }}>server/finances.db</code>.
                O workspace guarda lotes importados, movimentos semanticos, regras pessoais e a fila de revisao. Se voce usar IA,
                a pergunta e o contexto reconciliado sao enviados ao Gemini.
              </div>
              <div style={{ gap: 8, display: 'flex', flexWrap: 'wrap' }}>
                <span className="badge badge-green">Local-First</span>
                <span className="badge badge-muted">Sem conta online</span>
                <span className="badge badge-muted">IA usa internet</span>
              </div>
            </div>
          </div>
        </div>

        <div className="workspace-section-stack">
          <div className="card">
            <div className="card-header">
              <span className="card-title">AI Analyst Setup</span>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ background: 'var(--accent-gradient-soft)', border: '1px solid var(--border-accent)', borderRadius: 'var(--radius-md)', padding: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Como obter sua chave do Gemini</div>
                <ol style={{ listStyle: 'decimal', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                  <li>Acesse <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" style={{ color: 'var(--text-accent)' }}>aistudio.google.com/app/apikey</a></li>
                  <li>Entre com sua conta Google</li>
                  <li>Clique em <strong style={{ color: 'var(--text-primary)' }}>Create API Key</strong></li>
                  <li>Adicione a chave ao arquivo <code style={{ background: 'var(--bg-input)', padding: '1px 6px', borderRadius: 4 }}>.env</code> na raiz do projeto</li>
                </ol>
                <div style={{ background: 'var(--bg-base)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', marginTop: 12, fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--text-accent)', border: '1px solid var(--border)' }}>
                  GEMINI_API_KEY=your_key_here
                </div>
              </div>
            </div>
          </div>

          <div className="card" style={{ borderColor: 'rgba(239, 68, 68, 0.4)' }}>
            <div className="card-header" style={{ borderBottomColor: 'rgba(239, 68, 68, 0.2)' }}>
              <span className="card-title text-red">Danger Zone</span>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                Esta acao apaga todos os dados locais: lotes importados, movimentos reconciliados, regras pessoais, contas legadas,
                assinaturas e configuracoes. Nao existe desfazer.
              </div>
              <div>
                <button className="btn btn-danger" onClick={() => setShowConfirm(true)} disabled={clearing}>
                  {clearing ? <span className="spinner" /> : 'Apagar todos os dados e resetar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showConfirm ? (
        <div className="modal-overlay" onClick={(event) => event.target === event.currentTarget && setShowConfirm(false)}>
          <div className="modal" style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <span className="modal-title text-red">Confirm Full Reset</span>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowConfirm(false)}>X</button>
            </div>
            <div className="modal-body">
              <p>WARNING: isso vai apagar TODO o workspace local, incluindo imports, regras, review queue, relatorios e configuracoes.</p>
              <p style={{ marginTop: 10, fontWeight: 600 }}>Tem certeza absoluta?</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowConfirm(false)}>Cancelar</button>
              <button className="btn btn-danger" onClick={clearDatabase}>Confirmar reset</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
