import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { startMocks } from './mocks/browser';
import './ui/theme.css';
import './ui/screens.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

// The mock API must be listening before the first request, so render only after the worker is ready.
void startMocks()
  .catch((err: unknown) => {
    // Without the worker only ranking/history are affected; the game itself keeps working.
    console.warn('Mock API failed to start', err);
  })
  .then(() => {
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
