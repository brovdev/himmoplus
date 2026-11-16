import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import { ErrorBoundary, installGlobalClientErrorTelemetry } from './components/ErrorBoundary.tsx';
import './index.css';

registerSW({ immediate: true });
installGlobalClientErrorTelemetry();

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
