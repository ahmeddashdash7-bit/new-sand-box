import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Dev-only: exposes window.__migrateQuestionImages() for the optional legacy base64 -> image
// provider migration. Kept out of production bundles entirely.
if (import.meta.env.DEV) {
  import('./lib/migrateLegacyImages');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
