/// <reference types="vite/client" />
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LocalStorageAdapter } from './campaign';
import { RandomDiceRoller } from './dice';
import { App } from './ui/App';
import './ui/styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root not found');

createRoot(rootElement).render(
  <StrictMode>
    <App diceRoller={new RandomDiceRoller()} storageAdapter={new LocalStorageAdapter()} />
  </StrictMode>,
);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}
