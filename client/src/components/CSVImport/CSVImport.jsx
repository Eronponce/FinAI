import React, { useState, useRef, useCallback } from 'react';
import Papa from 'papaparse';
import { parseNubankCSV } from '../../utils/csvNubank.js';
import { CATEGORIES } from '../../utils/categories.js';
import { api } from '../../utils/api.js';
import { useCurrency } from '../../hooks/useCurrency.jsx';
import './CSVImport.css';

export default function CSVImport() {
  const { fmt } = useCurrency();
  const [stage, setStage]     = useState('upload'); // upload | preview | done
  const [parsed, setParsed]   = useState([]);
  const [edited, setEdited]   = useState([]);
  const [dragging, setDragging] = useState(false);
  const [result, setResult]   = useState(null);
  const [importing, setImporting] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError]     = useState('');
  const fileRef = useRef();

  const processFile = (file) => {
    setError('');
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        if (!res.data?.length) { setError('CSV appears to be empty.'); return; }
        const rows = parseNubankCSV(res.data);
        if (!rows.length) { setError('Could not detect valid rows. Make sure this is a Nubank CSV export.'); return; }
        setParsed(rows);
        setEdited(rows.map((r, i) => ({ ...r, _id: i })));
        setStage('preview');
      },
      error: (err) => setError(`Parse error: ${err.message}`),
    });
  };

  const onFile = (e) => { const f = e.target.files[0]; if (f) processFile(f); };
  const onDrop = useCallback((e) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) processFile(f);
  }, []);

  const updateRow = (idx, key, val) => {
    setEdited(prev => prev.map((r, i) => i === idx ? { ...r, [key]: val } : r));
  };

  const removeRow = (idx) => setEdited(prev => prev.filter((_, i) => i !== idx));

  const doImport = async () => {
    setImporting(true);
    try {
      const expenses = edited.filter(e => e.type === 'expense');
      const incomes = edited.filter(e => e.type === 'income');
      
      let imported = 0;
      let skipped = 0;

      if (expenses.length > 0) {
        const resE = await api.post('/expenses/import', { expenses });
        imported += (resE.imported || 0);
        skipped += (resE.skipped || 0);
      }
      
      if (incomes.length > 0) {
        const mappedIncomes = incomes.map(i => ({ ...i, source: i.description }));
        const resI = await api.post('/income/import', { incomes: mappedIncomes });
        imported += (resI.imported || 0);
        skipped += (resI.skipped || 0);
      }

      setResult({ imported, skipped });
      setStage('done');
    } catch (e) {
      setError(e.message);
    } finally { setImporting(false); }
  };

  const suggestCategories = async () => {
    if (edited.length === 0) return;
    setSuggesting(true);
    setError('');
    try {
      const expensesToSuggest = edited.map(r => ({ id: r._id, description: r.description, amount: r.amount }));
      const res = await api.post('/ai/suggest-categories', { expenses: expensesToSuggest });
      
      if (res.suggestions) {
        setEdited(prev => prev.map(r => {
          const suggested = res.suggestions[r._id];
          return suggested ? { ...r, category: suggested } : r;
        }));
      }
    } catch (e) {
      setError(`AI Error: ${e.message}`);
    } finally {
      setSuggesting(false);
    }
  };

  const reset = () => { setStage('upload'); setParsed([]); setEdited([]); setResult(null); setError(''); };

  return (
    <div className="page-content">
      <div className="page-header">
        <h1>Import CSV</h1>
        <p>Import expenses from Nubank or other bank exports</p>
      </div>

      {stage === 'upload' && (
        <>
          <div className="card mb-4" style={{padding:20, borderColor:'rgba(124,58,237,0.2)', background:'var(--accent-gradient-soft)'}}>
            <div style={{display:'flex', gap:12, alignItems:'flex-start'}}>
              <span style={{fontSize:'1.5rem'}}>💡</span>
              <div>
                <div style={{fontWeight:600, marginBottom:4}}>Nubank Format</div>
                <div style={{fontSize:'0.85rem', color:'var(--text-secondary)'}}>
                  Export from <strong>Nubank app → Minha conta → Extrato → Exportar CSV</strong>.
                  The file should have columns: <code style={{background:'var(--bg-input)',padding:'1px 6px',borderRadius:4,fontSize:'0.8rem'}}>date, category, title, amount</code>
                </div>
              </div>
            </div>
          </div>

          <div
            className={`csv-dropzone ${dragging ? 'csv-dropzone-active' : ''}`}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current.click()}
          >
            <input ref={fileRef} type="file" accept=".csv" style={{display:'none'}} onChange={onFile} id="csv-file-input" />
            <div className="csv-dropzone-icon">📁</div>
            <div className="csv-dropzone-title">Drop your CSV file here</div>
            <div className="csv-dropzone-sub">or click to browse • .csv files only</div>
          </div>
          {error && <div className="csv-error">{error}</div>}
        </>
      )}

      {stage === 'preview' && (
        <>
          <div className="card mb-4">
            <div className="card-header">
              <span className="card-title">
                📋 Preview — {edited.length} rows detected
              </span>
              <div className="flex gap-2">
                <button className="btn btn-secondary btn-sm" onClick={reset}>← Back</button>
                <button 
                  className="btn btn-sm" 
                  style={{background:'var(--accent-gradient)', color:'white', border:'none'}} 
                  onClick={suggestCategories} 
                  disabled={suggesting || importing}
                >
                  {suggesting ? <span className="spinner" style={{width:14,height:14}} /> : '✨ Suggest Categories'}
                </button>
                <button id="confirm-import-btn" className="btn btn-primary btn-sm" onClick={doImport} disabled={importing || suggesting || edited.length === 0}>
                  {importing ? <span className="spinner" /> : `Import ${edited.length} rows`}
                </button>
              </div>
            </div>
            <div style={{padding:'12px 20px', borderBottom:'1px solid var(--border)', fontSize:'0.82rem', color:'var(--text-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
              <span>Review types and categories before importing. Pink ones are expenses, green are income. You can remove any row.</span>
              <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                <span style={{fontWeight: 600}}>Set all to:</span>
                <select 
                  className="form-select" 
                  style={{padding:'4px 8px', fontSize:'0.8rem', width: 'auto'}}
                  onChange={(e) => {
                    const t = e.target.value;
                    if (t) setEdited(prev => prev.map(r => ({ ...r, type: t })));
                    e.target.value = ''; // Reset after selection
                  }}
                >
                  <option value="">--</option>
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </select>
              </div>
            </div>
            {error && <div className="csv-error" style={{margin:'0 20px'}}>{error}</div>}
            <div className="table-wrap" style={{maxHeight:480, overflowY:'auto'}}>
              <table>
                <thead>
                  <tr><th>Date</th><th>Description</th><th>Type</th><th>Category</th><th style={{textAlign:'right'}}>Amount</th><th></th></tr>
                </thead>
                <tbody>
                  {edited.map((row, i) => (
                    <tr key={row._id}>
                      <td style={{whiteSpace:'nowrap'}}>
                        <input type="date" className="form-input" style={{width:140,padding:'4px 8px',fontSize:'0.8rem'}}
                          value={row.date} onChange={e => updateRow(i, 'date', e.target.value)} />
                      </td>
                      <td>
                        <input className="form-input" style={{padding:'4px 8px',fontSize:'0.8rem'}}
                          value={row.description} onChange={e => updateRow(i, 'description', e.target.value)} />
                      </td>
                      <td>
                        <select className="form-select" style={{padding:'4px 8px',fontSize:'0.8rem',width:100}}
                          value={row.type} onChange={e => updateRow(i, 'type', e.target.value)}>
                          <option value="expense">Expense</option>
                          <option value="income">Income</option>
                        </select>
                      </td>
                      <td>
                        <select className="form-select" style={{padding:'4px 8px',fontSize:'0.8rem',width:160}}
                          value={row.category} onChange={e => updateRow(i, 'category', e.target.value)}>
                          {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
                        </select>
                      </td>
                      <td style={{textAlign:'right'}} className={row.type === 'income' ? 'text-green' : 'text-red'}>
                        <input type="number" step="0.01" className="form-input" style={{width:100,padding:'4px 8px',fontSize:'0.8rem',textAlign:'right'}}
                          value={row.amount} onChange={e => updateRow(i, 'amount', e.target.value)} />
                      </td>
                      <td>
                        <button className="btn btn-danger btn-sm btn-icon" onClick={() => removeRow(i)}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {stage === 'done' && result && (
        <div className="card" style={{textAlign:'center', padding:48}}>
          <div style={{fontSize:'4rem',marginBottom:16}}>🎉</div>
          <h2 style={{marginBottom:8}}>Import Complete!</h2>
          <p style={{color:'var(--text-secondary)', marginBottom:24}}>
            <strong className="text-green">{result.imported}</strong> records imported ·{' '}
            <strong className="text-muted">{result.skipped}</strong> duplicates skipped
          </p>
          <button className="btn btn-primary" onClick={reset}>Import Another File</button>
        </div>
      )}
    </div>
  );
}
