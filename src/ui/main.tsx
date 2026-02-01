import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { UnitsProvider } from './hooks/useUnits';
import { ConfigProvider } from './hooks/useConfig';
import { ThemeProvider } from './hooks/useTheme';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <ConfigProvider>
        <UnitsProvider>
          <App />
        </UnitsProvider>
      </ConfigProvider>
    </ThemeProvider>
  </React.StrictMode>
);
