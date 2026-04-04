import React, { useState, useRef, useEffect } from 'react';
import { api } from '../../utils/api.js';
import './AIAdvisor.css';

const QUICK_PROMPTS = [
  'Where am I spending the most money?',
  'Which subscriptions should I cancel?',
  'How can I save R$500 this month?',
  'Am I spending too much on food?',
  'What is my savings rate?',
  'Give me a summary of my finances',
];

function MessageBubble({ msg }) {
  return (
    <div className={`ai-bubble ai-bubble-${msg.role}`}>
      {msg.role === 'assistant' && <div className="ai-bubble-avatar">✦</div>}
      <div className="ai-bubble-text">
        {msg.content.split('\n').map((line, i) => (
          <React.Fragment key={i}>{line}{i < msg.content.split('\n').length - 1 && <br/>}</React.Fragment>
        ))}
      </div>
      {msg.role === 'user' && <div className="ai-bubble-avatar ai-bubble-avatar-user">👤</div>}
    </div>
  );
}

export default function AIAdvisor() {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "Hi! I'm your AI Finance Advisor powered by Gemini. I have access to your financial data — income, expenses, and subscriptions.\n\nAsk me anything, like:\n• Where am I overspending?\n• Which subscriptions should I cut?\n• How can I save more this month?" }
  ]);
  const [input, setInput]     = useState('');
  const [loading, setLoading] = useState(false);
  const [apiMissing, setApiMissing] = useState(false);
  const bottomRef = useRef();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const send = async (text) => {
    const msg = text || input.trim();
    if (!msg || loading) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: msg }]);
    setLoading(true);
    try {
      const res = await api.post('/ai/chat', { message: msg });
      setMessages(prev => [...prev, { role: 'assistant', content: res.reply }]);
    } catch (e) {
      if (e.message.includes('not configured') || e.message.includes('503')) {
        setApiMissing(true);
        setMessages(prev => [...prev, { role: 'assistant', content: '⚠️ Gemini API key not set. Add your GEMINI_API_KEY to the .env file in the project root and restart the server.\n\nGet a free key at: https://aistudio.google.com/app/apikey' }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: `Sorry, I ran into an error: ${e.message}` }]);
      }
    } finally { setLoading(false); }
  };

  const handleKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };

  return (
    <div className="page-content" style={{display:'flex', flexDirection:'column', height:'calc(100vh - 40px)'}}>
      <div className="page-header">
        <h1>✦ AI Advisor</h1>
        <p>Ask anything about your finances — powered by Gemini AI</p>
      </div>

      {apiMissing && (
        <div style={{background:'var(--yellow-soft)', border:'1px solid rgba(245,158,11,0.3)', borderRadius:'var(--radius-md)', padding:'12px 16px', marginBottom:16, fontSize:'0.85rem', color:'var(--yellow)'}}>
          <strong>Setup required:</strong> Add <code style={{background:'rgba(0,0,0,0.2)',padding:'1px 6px',borderRadius:4}}>GEMINI_API_KEY=your_key</code> to your <code>.env</code> file and restart the server. Free key at <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" style={{color:'inherit'}}>aistudio.google.com</a>
        </div>
      )}

      <div className="ai-quick-prompts">
        {QUICK_PROMPTS.map(p => (
          <button key={p} className="ai-quick-btn" onClick={() => send(p)} disabled={loading}>{p}</button>
        ))}
      </div>

      <div className="ai-chat-window card" style={{flex:1, display:'flex', flexDirection:'column', minHeight:0}}>
        <div className="ai-messages">
          {messages.map((m, i) => <MessageBubble key={i} msg={m} />)}
          {loading && (
            <div className="ai-bubble ai-bubble-assistant">
              <div className="ai-bubble-avatar">✦</div>
              <div className="ai-typing">
                <span/><span/><span/>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
        <div className="ai-input-bar">
          <textarea
            id="ai-chat-input"
            className="form-textarea ai-textarea"
            placeholder="Ask about your finances…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            rows={2}
            disabled={loading}
          />
          <button id="ai-send-btn" className="btn btn-primary ai-send-btn" onClick={() => send()} disabled={loading || !input.trim()}>
            {loading ? <span className="spinner" /> : '↑'}
          </button>
        </div>
      </div>
    </div>
  );
}
