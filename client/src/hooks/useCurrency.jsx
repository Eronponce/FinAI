/* eslint-disable react-refresh/only-export-components */

import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { api } from '../utils/api.js';

const CurrencyCtx = createContext({ symbol: 'R$', code: 'BRL', fmt: (n) => `R$ ${n}` });

export function CurrencyProvider({ children }) {
  const [symbol, setSymbol] = useState('R$');
  const [code, setCode]   = useState('BRL');

  useEffect(() => {
    api.get('/settings').then(s => {
      if (s.currency_symbol) setSymbol(s.currency_symbol);
      if (s.currency) setCode(s.currency);
    }).catch(() => {});
  }, []);

  const fmt = useCallback((n) => {
    const num = parseFloat(n) || 0;
    return `${symbol} ${num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }, [symbol]);

  return (
    <CurrencyCtx.Provider value={{ symbol, code, fmt, setSymbol, setCode }}>
      {children}
    </CurrencyCtx.Provider>
  );
}

export function useCurrency() {
  return useContext(CurrencyCtx);
}
