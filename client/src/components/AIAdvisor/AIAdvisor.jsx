import React, { useEffect, useRef, useState } from 'react';
import { api } from '../../utils/api.js';
import { useCurrency } from '../../hooks/useCurrency.jsx';
import '../Workspace/Workspace.css';
import './AIAdvisor.css';

const QUICK_PROMPTS = [
  'Quanto eu realmente gastei no ultimo mes importado?',
  'Quanto foi transferencia interna versus gasto real?',
  'Que entradas parecem ser reembolsos e nao receita?',
  'O que mais pressiona meu resultado economico?',
  'Resuma o ultimo mes com foco em gasto liquido e investimentos.',
  'Quais movimentos eu deveria revisar primeiro?',
];

function MessageBubble({ msg }) {
  return (
    <div className={`ai-bubble ai-bubble-${msg.role}`}>
      {msg.role === 'assistant' && <div className="ai-bubble-avatar">AI</div>}
      <div className="ai-bubble-text">
        {msg.content.split('\n').map((line, index, lines) => (
          <React.Fragment key={`${msg.role}-${index}`}>
            {line}
            {index < lines.length - 1 ? <br /> : null}
          </React.Fragment>
        ))}
      </div>
      {msg.role === 'user' && <div className="ai-bubble-avatar ai-bubble-avatar-user">VOCE</div>}
    </div>
  );
}

export default function AIAdvisor() {
  const { fmt } = useCurrency();
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'Eu leio o workspace reconciliado: gasto real, reembolsos, transferencias internas, pagamentos de fatura e investimento. Pergunte sobre o seu resultado economico de verdade.',
    },
  ]);
  const [overview, setOverview] = useState(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [apiMissing, setApiMissing] = useState(false);
  const bottomRef = useRef();

  useEffect(() => {
    api.get('/workspace/overview').then(setOverview).catch(() => setOverview(null));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const send = async (text) => {
    const nextMessage = text || input.trim();
    if (!nextMessage || loading) return;

    setInput('');
    setMessages((current) => [...current, { role: 'user', content: nextMessage }]);
    setLoading(true);

    try {
      const response = await api.post('/ai/chat', { message: nextMessage });
      setMessages((current) => [...current, { role: 'assistant', content: response.reply }]);
    } catch (error) {
      if (error.message.includes('not configured') || error.message.includes('503')) {
        setApiMissing(true);
        setMessages((current) => [
          ...current,
          {
            role: 'assistant',
            content: 'Gemini ainda nao esta configurado. Adicione GEMINI_API_KEY ao arquivo .env na raiz do projeto e reinicie o servidor.',
          },
        ]);
      } else {
        setMessages((current) => [
          ...current,
          {
            role: 'assistant',
            content: `Encontrei um erro ao consultar a IA: ${error.message}`,
          },
        ]);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };

  const summary = overview?.summary || {};

  return (
    <div className="page-content" style={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 40px)' }}>
      <section className="workspace-hero">
        <span className="workspace-kicker">AI Analyst</span>
        <h1>Converse com o workspace reconciliado.</h1>
        <p>
          A resposta leva em conta o mes mais recente importado, o historico reconciliado, as categorias homologadas
          e os itens ainda abertos na review queue.
        </p>
        <div className="workspace-chip-row">
          <span className="workspace-chip">{overview?.focusLabel || 'Sem periodo'}</span>
          <span className="workspace-chip">Resultado {fmt(summary.economicResult || 0)}</span>
          <span className="workspace-chip">Pendencias {summary.reviewCount || 0}</span>
        </div>
      </section>

      <div className="workspace-summary-banner mb-4">
        <div>
          <strong>Como esta conversa funciona</strong>
          <p>A IA recebe sua pergunta junto com o contexto reconciliado deste app. Assim ela fala de gasto real, nao so de entradas e saidas brutas.</p>
        </div>
        <div className="workspace-inline-actions">
          <span className="badge badge-green">Receita real {fmt(summary.grossIncome || 0)}</span>
          <span className="badge badge-red">Gasto liquido {fmt(summary.netPersonalSpend || 0)}</span>
        </div>
      </div>

      <div className="mini-stats mb-4">
        <div className="mini-stat">
          <span>Receita real</span>
          <strong className="text-green">{fmt(summary.grossIncome || 0)}</strong>
        </div>
        <div className="mini-stat">
          <span>Gasto liquido</span>
          <strong className="text-red">{fmt(summary.netPersonalSpend || 0)}</strong>
        </div>
        <div className="mini-stat">
          <span>Reembolsos</span>
          <strong>{fmt((summary.reimbursements || 0) + (summary.refunds || 0))}</strong>
        </div>
      </div>

      {apiMissing ? (
        <div style={{ background: 'var(--yellow-soft)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 'var(--radius-md)', padding: '12px 16px', marginBottom: 16, fontSize: '0.85rem', color: 'var(--yellow)' }}>
          <strong>Setup:</strong> adicione <code style={{ background: 'rgba(0,0,0,0.2)', padding: '1px 6px', borderRadius: 4 }}>GEMINI_API_KEY=...</code> ao seu <code>.env</code> e reinicie o servidor.
        </div>
      ) : null}

      <div className="ai-quick-prompts">
        {QUICK_PROMPTS.map((prompt) => (
          <button key={prompt} className="ai-quick-btn" onClick={() => send(prompt)} disabled={loading}>
            {prompt}
          </button>
        ))}
      </div>

      <div className="ai-chat-window card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div className="ai-messages">
          {messages.map((message, index) => <MessageBubble key={`${message.role}-${index}`} msg={message} />)}
          {loading ? (
            <div className="ai-bubble ai-bubble-assistant">
              <div className="ai-bubble-avatar">AI</div>
              <div className="ai-typing">
                <span /><span /><span />
              </div>
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>
        <div className="ai-input-bar">
          <textarea
            id="ai-chat-input"
            className="form-textarea ai-textarea"
            placeholder="Pergunte sobre gasto real, reembolsos, investimentos ou o que merece revisao..."
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKey}
            rows={2}
            disabled={loading}
          />
          <button id="ai-send-btn" className="btn btn-primary ai-send-btn" onClick={() => send()} disabled={loading || !input.trim()}>
            {loading ? <span className="spinner" /> : 'ENVIAR'}
          </button>
        </div>
      </div>
    </div>
  );
}
