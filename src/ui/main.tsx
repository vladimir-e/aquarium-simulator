import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import App from './App';
import { UnitsProvider } from './hooks/useUnits';
import { ConfigProvider } from './hooks/useConfig';
import { ThemeProvider } from './hooks/useTheme';
import { PersistenceProvider, handleResetQueryParam } from './persistence/index.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import './index.css';

// Handle ?reset query parameter before rendering
// This clears all persisted state and redirects to clean URL
if (handleResetQueryParam()) {
  // Redirect is in progress, don't render
} else {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ErrorBoundary>
        <ThemeProvider>
          <PersistenceProvider>
            <ConfigProvider>
              <UnitsProvider>
                <BrowserRouter>
                  <App />
                </BrowserRouter>
              </UnitsProvider>
            </ConfigProvider>
          </PersistenceProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </React.StrictMode>
  );
}
