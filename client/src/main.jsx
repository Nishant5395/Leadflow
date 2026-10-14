import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import App from './App.jsx';
import { ToastProvider } from './components/Toast.jsx';
import { createQueryClient } from './lib/queryClient.js';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={createQueryClient()}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
