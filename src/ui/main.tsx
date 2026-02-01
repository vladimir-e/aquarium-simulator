import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { UnitsProvider } from './hooks/useUnits';
import { ConfigProvider } from './hooks/useConfig';
import { PersistenceProvider, ErrorBoundary, clearPersistedState } from './persistence';
import './index.css';

// Check for reset query parameter before React renders
// This clears all persisted state and redirects to clean URL
if (globalThis.location.search.includes('reset')) {
  clearPersistedState();
  globalThis.location.href = globalThis.location.pathname;
} else {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ErrorBoundary>
        <PersistenceProvider>
          <ConfigProvider>
            <UnitsProvider>
              <App />
            </UnitsProvider>
          </ConfigProvider>
        </PersistenceProvider>
      </ErrorBoundary>
    </React.StrictMode>
  );
}
