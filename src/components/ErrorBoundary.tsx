import React from 'react';

let lastReportedMsg = '';
let lastReportedAt = 0;

export function reportClientError(payload: {
  message: string;
  stack?: string;
  componentStack?: string;
}) {
  const now = Date.now();
  if (payload.message === lastReportedMsg && now - lastReportedAt < 5000) return;
  lastReportedMsg = payload.message;
  lastReportedAt = now;

  fetch('/api/telemetry/client-error', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      message: payload.message,
      stack: payload.stack || null,
      componentStack: payload.componentStack || null,
      routePath: window.location.pathname,
      url: window.location.pathname,
    }),
  }).catch(() => {});
}

export function installGlobalClientErrorTelemetry(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('error', (event) => {
    reportClientError({
      message: event.message || 'Erreur JavaScript non interceptée',
      stack: event.error?.stack || `${event.filename}:${event.lineno}:${event.colno}`,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason || 'Promesse rejetée non gérée');
    const stack = reason instanceof Error ? reason.stack : undefined;
    if (
      message.includes('WebSocket closed without opened') ||
      (stack && stack.includes('/@vite/client'))
    ) {
      return;
    }
    reportClientError({
      message,
      stack,
    });
  });
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    reportClientError({
      message: error.message || 'Erreur de rendu interface',
      stack: error.stack,
      componentStack: info.componentStack || undefined,
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F6F8F7] flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-xl border border-[#E8EEEB] bg-white p-8 text-center">
            <h1 className="font-display text-xl font-bold text-[#123C32]">
              Une interruption momentanée est survenue
            </h1>
            <p className="mt-2 text-sm text-[#66736D]">
              L’incident a été transmis automatiquement à notre équipe technique. Aucune donnée n’a été perdue.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-6 rounded-lg bg-[#185C46] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#123C32] transition-colors cursor-pointer"
            >
              Recharger l’application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
