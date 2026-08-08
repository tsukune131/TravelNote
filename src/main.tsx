import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { hideSplash } from './lib/splash';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App onReady={() => void hideSplash()} />
  </StrictMode>,
);
