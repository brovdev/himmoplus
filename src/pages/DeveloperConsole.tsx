import {
  Activity,
  AlertCircle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  Clock,
  CreditCard,
  Database,
  FileText,
  HardDrive,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  Lock,
  LogOut,
  Menu,
  RefreshCw,
  Search,
  Server,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Wrench,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { BrandLogo } from '../components/BrandLogo';
import { ConfirmDialog, EmptyState, Modal, SkeletonRows, StatCard } from '../components/ui';
import { apiFetch } from '../lib/api';
import type { AuthState } from '../types';

type DevSection =
  | 'overview'
  | 'errors'
  | 'logs'
  | 'api'
  | 'database'
  | 'payments'
  | 'jobs'
  | 'security'
  | 'backups'
  | 'diagnostic'
  | 'settings';

interface DeveloperConsoleProps {
  auth: AuthState | null;
  onAuthenticated: (nextAuth: AuthState) => void;
  onRefreshAuth: () => Promise<void>;
  onLogout: () => Promise<void>;
  onExitToPublic: () => void;
}

const NAV_ITEMS: Array<{ id: DevSection; label: string; Icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'overview', label: 'Vue générale', Icon: LayoutDashboard },
  { id: 'errors', label: 'Erreurs', Icon: AlertCircle },
  { id: 'logs', label: 'Journaux', Icon: FileText },
  { id: 'api', label: 'API', Icon: Activity },
  { id: 'database', label: 'Base de données', Icon: Database },
  { id: 'payments', label: 'Paiements', Icon: CreditCard },
  { id: 'jobs', label: 'Tâches', Icon: ListChecks },
  { id: 'security', label: 'Sécurité', Icon: ShieldCheck },
  { id: 'backups', label: 'Sauvegardes', Icon: HardDrive },
  { id: 'diagnostic', label: 'Assistant de diagnostic', Icon: Bot },
  { id: 'settings', label: 'Paramètres techniques', Icon: Settings },
];

function formatBytes(bytes: number): string {
  if (!bytes) return '0 o';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(2)} Mo`;
}

function formatUptime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}h ${m}m ${s}s`;
}

export const DeveloperConsole: React.FC<DeveloperConsoleProps> = ({
  auth,
  onAuthenticated,
  onRefreshAuth,
  onLogout,
  onExitToPublic,
}) => {
  // Auth + 2FA gate state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const [totpCode, setTotpCode] = useState('');
  const [twoFaInfo, setTwoFaInfo] = useState<{ devPreviewCode?: string; otpauthUri?: string } | null>(null);
  const [twoFaError, setTwoFaError] = useState<string | null>(null);
  const [verifying2Fa, setVerifying2Fa] = useState(false);

  // Console state
  const [section, setSection] = useState<DevSection>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Section payloads
  const [overview, setOverview] = useState<any>(null);
  const [errorsData, setErrorsData] = useState<any[]>([]);
  const [errorFilters, setErrorFilters] = useState({ q: '', severity: 'all', source: 'all', status: 'all', date: '' });
  const [selectedError, setSelectedError] = useState<any | null>(null);
  const [resolutionNote, setResolutionNote] = useState('');
  const [logsData, setLogsData] = useState<any>(null);
  const [logSearch, setLogSearch] = useState('');
  const [apiMonitor, setApiMonitor] = useState<any>(null);
  const [apiFilter, setApiFilter] = useState('all');
  const [dbData, setDbData] = useState<any>(null);
  const [jobsData, setJobsData] = useState<any[]>([]);
  const [backupsData, setBackupsData] = useState<any[]>([]);
  const [securityData, setSecurityData] = useState<any>(null);
  const [settingsData, setSettingsData] = useState<any>(null);

  // Diagnostic assistant
  const [diagErrorId, setDiagErrorId] = useState<string>('');
  const [diagSymptom, setDiagSymptom] = useState('');
  const [diagResult, setDiagResult] = useState<any>(null);
  const [diagLoading, setDiagLoading] = useState(false);

  // Confirmation modal for sensitive tools
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    message: string;
    danger?: boolean;
    run: () => Promise<void>;
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [toolOutput, setToolOutput] = useState<string | null>(null);

  const isDeveloper = auth?.user?.role_type === 'developer';
  const is2FaReady = Boolean(isDeveloper && auth?.twoFactorVerified);

  useEffect(() => {
    if (isDeveloper && !is2FaReady) {
      apiFetch<{ devPreviewCode?: string; otpauthUri?: string }>('/api/developer/auth/2fa-status')
        .then(setTwoFaInfo)
        .catch(() => {});
    }
  }, [isDeveloper, is2FaReady]);

  const loadSectionData = useCallback(async () => {
    if (!is2FaReady) return;
    setLoading(true);
    try {
      if (section === 'overview') {
        const res = await apiFetch('/api/developer/overview');
        setOverview(res);
      } else if (section === 'errors') {
        const params = new URLSearchParams();
        if (errorFilters.q) params.set('q', errorFilters.q);
        if (errorFilters.severity !== 'all') params.set('severity', errorFilters.severity);
        if (errorFilters.source !== 'all') params.set('source', errorFilters.source);
        if (errorFilters.status !== 'all') params.set('status', errorFilters.status);
        if (errorFilters.date) params.set('date', errorFilters.date);
        const res = await apiFetch<{ errors: any[] }>(`/api/developer/errors?${params.toString()}`);
        setErrorsData(res.errors);
      } else if (section === 'logs') {
        const res = await apiFetch(`/api/developer/logs?q=${encodeURIComponent(logSearch)}`);
        setLogsData(res);
      } else if (section === 'api' || section === 'payments') {
        const res = await apiFetch(`/api/developer/api-monitor?status=${apiFilter}`);
        setApiMonitor(res);
      } else if (section === 'database') {
        const res = await apiFetch('/api/developer/database');
        setDbData(res);
      } else if (section === 'jobs') {
        const res = await apiFetch<{ jobs: any[] }>('/api/developer/jobs');
        setJobsData(res.jobs);
      } else if (section === 'backups') {
        const res = await apiFetch<{ backups: any[] }>('/api/developer/backups');
        setBackupsData(res.backups);
      } else if (section === 'security') {
        const res = await apiFetch('/api/developer/security');
        setSecurityData(res);
      } else if (section === 'diagnostic') {
        const res = await apiFetch<{ errors: any[] }>('/api/developer/errors');
        setErrorsData(res.errors);
      } else if (section === 'settings') {
        const res = await apiFetch('/api/developer/settings');
        setSettingsData(res);
      }
    } catch (err) {
      setFeedback({ type: 'err', text: (err as Error).message });
    } finally {
      setLoading(false);
    }
  }, [is2FaReady, section, errorFilters, logSearch, apiFilter]);

  useEffect(() => {
    loadSectionData();
  }, [loadSectionData]);

  const handleDevLogin = async (e: React.FormEvent, overrideEmail?: string, overridePass?: string) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);
    try {
      const next = await apiFetch<AuthState>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: overrideEmail ?? email,
          password: overridePass ?? password,
        }),
      });
      if (next.user.role_type !== 'developer') {
        setAuthError('Ce compte ne possède pas le rôle Développeur requis.');
        return;
      }
      onAuthenticated(next);
    } catch (err) {
      setAuthError((err as Error).message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleVerify2Fa = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifying2Fa(true);
    setTwoFaError(null);
    try {
      await apiFetch('/api/developer/auth/verify-2fa', {
        method: 'POST',
        body: JSON.stringify({ code: totpCode }),
      });
      await onRefreshAuth();
    } catch (err) {
      setTwoFaError((err as Error).message);
    } finally {
      setVerifying2Fa(false);
    }
  };

  const handleUpdateErrorStatus = async (errorId: number, status: 'en_cours' | 'resolu') => {
    try {
      await apiFetch(`/api/developer/errors/${errorId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, resolutionNote: resolutionNote || undefined }),
      });
      setFeedback({ type: 'ok', text: `Erreur marquée comme « ${status === 'resolu' ? 'Résolue' : 'En cours'} ».` });
      setSelectedError(null);
      setResolutionNote('');
      loadSectionData();
    } catch (err) {
      setFeedback({ type: 'err', text: (err as Error).message });
    }
  };

  const runDiagnostic = async (errId?: number, symptomText?: string) => {
    setDiagLoading(true);
    try {
      const res = await apiFetch('/api/developer/diagnose', {
        method: 'POST',
        body: JSON.stringify({
          errorId: errId || (diagErrorId ? Number(diagErrorId) : undefined),
          symptom: symptomText ?? diagSymptom,
        }),
      });
      setDiagResult(res);
      setSection('diagnostic');
    } catch (err) {
      setFeedback({ type: 'err', text: (err as Error).message });
    } finally {
      setDiagLoading(false);
    }
  };

  const executeSensitiveTool = (action: string, title: string, message: string, danger = false) => {
    setConfirmAction({
      title,
      message,
      danger,
      run: async () => {
        const res = await apiFetch<{ message: string }>('/api/developer/tools/execute', {
          method: 'POST',
          body: JSON.stringify({ action, confirmed: true }),
        });
        setToolOutput(JSON.stringify(res, null, 2));
        setFeedback({ type: 'ok', text: res.message });
        loadSectionData();
      },
    });
  };

  // -------------------------------------------------------------------------
  // ACCESS GATE: NON-DEVELOPER BLOCKED, LOGIN, OR 2FA STEP
  // -------------------------------------------------------------------------

  if (auth && auth.user.role_type !== 'developer') {
    return (
      <div className="min-h-screen bg-[#F6F8F7] flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-xl border border-[#D94B4B]/30 bg-white p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#FDECEC] text-[#D94B4B]">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h1 className="mt-4 font-display text-xl font-bold text-[#123C32]">Accès refusé</h1>
          <p className="mt-2 text-sm text-[#66736D]">
            La route <span className="font-mono text-[#123C32]">/developer</span> est strictement réservée aux comptes
            disposant du rôle technique <span className="font-mono">developer</span>. Les propriétaires, agences,
            locataires et administrateurs métier n’y ont pas accès.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={onExitToPublic}
              className="rounded-lg border border-[#E8EEEB] bg-white px-4 py-2 text-sm font-medium text-[#123C32] hover:bg-[#F6F8F7] cursor-pointer"
            >
              Retour à mon espace
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="rounded-lg bg-[#185C46] px-4 py-2 text-sm font-medium text-white hover:bg-[#123C32] cursor-pointer"
            >
              Changer de compte
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!auth || !is2FaReady) {
    return (
      <div className="min-h-screen bg-[#123C32] flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-xl border border-white/15 bg-white p-7 sm:p-8">
          <div className="flex items-center justify-between">
            <BrandLogo variant="dark" />
            <button
              type="button"
              onClick={onExitToPublic}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#66736D] hover:text-[#123C32] cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Site public</span>
            </button>
          </div>

          <div className="mt-6 border-t border-[#E8EEEB] pt-5">
            <p className="text-xs font-semibold text-[#185C46]">Console Développeur IMMOPAY CI · Accès restreint</p>
            <h1 className="mt-1 font-display text-xl font-bold text-[#123C32]">
              {!auth ? 'Authentification Ingénierie' : 'Vérification 2FA obligatoire'}
            </h1>
            <p className="mt-1 text-xs text-[#66736D]">
              {!auth
                ? 'Authentification obligatoire avec rôle developer et journalisation complète des actions.'
                : 'Saisissez le code TOTP à 6 chiffres généré par votre application d’authentification.'}
            </p>
          </div>

          {!auth ? (
            <form onSubmit={handleDevLogin} className="mt-5 space-y-4">
              {authError && (
                <div className="rounded-lg border border-[#D94B4B]/30 bg-[#FDECEC] px-3.5 py-2.5 text-xs font-medium text-[#D94B4B]">
                  {authError}
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-[#123C32] mb-1">E-mail développeur</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="dev@immopay.ci"
                  className="w-full rounded-lg border border-[#E8EEEB] px-3.5 py-2 text-sm focus:border-[#185C46] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#123C32] mb-1">Mot de passe</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-[#E8EEEB] px-3.5 py-2 text-sm focus:border-[#185C46] focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={authLoading}
                className="w-full rounded-lg bg-[#185C46] py-2.5 text-sm font-semibold text-white hover:bg-[#123C32] transition-colors cursor-pointer disabled:opacity-50"
              >
                {authLoading ? 'Vérification...' : 'Continuer vers 2FA'}
              </button>

              <div className="border-t border-[#E8EEEB] pt-4">
                <button
                  type="button"
                  onClick={(e) => {
                    setEmail('dev@immopay.ci');
                    setPassword('DevConsole2026!');
                    handleDevLogin(e, 'dev@immopay.ci', 'DevConsole2026!');
                  }}
                  className="flex w-full items-center justify-between rounded-lg border border-[#E8EEEB] bg-[#F6F8F7] px-3.5 py-2 text-xs hover:border-[#185C46] transition-colors cursor-pointer"
                >
                  <span className="inline-flex items-center gap-2 font-semibold text-[#123C32]">
                    <Terminal className="h-3.5 w-3.5 text-[#185C46]" />
                    Compte Développeur (dev@immopay.ci)
                  </span>
                  <span className="text-[#185C46] font-medium">Étape 1 →</span>
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleVerify2Fa} className="mt-5 space-y-4">
              {twoFaError && (
                <div className="rounded-lg border border-[#D94B4B]/30 bg-[#FDECEC] px-3.5 py-2.5 text-xs font-medium text-[#D94B4B]">
                  {twoFaError}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-[#123C32] mb-1">Code TOTP (6 chiffres)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className="w-full rounded-lg border border-[#E8EEEB] px-3.5 py-2.5 text-center font-mono text-lg font-bold tracking-[0.35em] text-[#123C32] focus:border-[#185C46] focus:outline-none"
                />
              </div>

              {twoFaInfo?.devPreviewCode && (
                <div className="rounded-lg border border-[#D6AE55]/40 bg-[#FBF6E8] p-3 text-xs text-[#123C32]">
                  <p className="font-semibold">Assistant TOTP (environnement de développement) :</p>
                  <p className="mt-1 text-[#66736D]">
                    Code RFC 6238 actif :{' '}
                    <button
                      type="button"
                      onClick={() => setTotpCode(twoFaInfo.devPreviewCode || '')}
                      className="font-mono font-bold text-[#185C46] underline cursor-pointer"
                    >
                      {twoFaInfo.devPreviewCode}
                    </button>{' '}
                    (cliquez pour remplir)
                  </p>
                </div>
              )}

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onLogout}
                  className="rounded-lg border border-[#E8EEEB] px-4 py-2.5 text-xs font-medium text-[#66736D] hover:bg-[#F6F8F7] cursor-pointer"
                >
                  Déconnexion
                </button>
                <button
                  type="submit"
                  disabled={verifying2Fa || totpCode.length !== 6}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-[#185C46] py-2.5 text-sm font-semibold text-white hover:bg-[#123C32] transition-colors cursor-pointer disabled:opacity-50"
                >
                  <KeyRound className="h-4 w-4" />
                  <span>{verifying2Fa ? 'Validation...' : 'Déverrouiller la console'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    );
  }

  const currentNavLabel = NAV_ITEMS.find((n) => n.id === section)?.label || 'Vue générale';

  return (
    <div className="min-h-screen bg-[#F6F8F7] flex">
      {/* Mobile Sidebar Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-[#123C32]/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Left Sidebar (260px) */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[264px] bg-[#123C32] text-white flex flex-col transition-transform duration-200 lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div>
            <BrandLogo variant="light" />
            <p className="mt-1 text-[11px] font-medium text-[#F0D99A]">Console Développeur · /developer</p>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden rounded-lg p-1.5 text-white/75 hover:bg-white/10"
            aria-label="Fermer le menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {NAV_ITEMS.map(({ id, label, Icon }) => {
            const active = section === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setSection(id);
                  setSidebarOpen(false);
                }}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  active ? 'bg-[#185C46] text-white' : 'text-white/75 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-[#F0D99A]' : 'text-white/60'}`} />
                <span className="truncate">{label}</span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-4 space-y-2 text-xs">
          <div className="flex items-center gap-2 text-white/85">
            <Lock className="h-3.5 w-3.5 text-[#D6AE55] shrink-0" />
            <span className="truncate font-medium">{auth.user.email}</span>
          </div>
          <p className="text-[11px] text-white/60">2FA TOTP vérifiée · Rôle developer</p>
          <button
            type="button"
            onClick={onLogout}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-white/15 py-2 text-xs font-medium text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Déconnexion sécurisée</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract */}
        <header className="sticky top-0 z-30 bg-white border-b border-[#E8EEEB] px-5 sm:px-7 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden rounded-lg border border-[#E8EEEB] p-2 text-[#123C32] hover:bg-[#F6F8F7]"
              aria-label="Ouvrir le menu"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-[#66736D] hidden sm:inline">Console Développeur</span>
              <span className="text-[#66736D] hidden sm:inline">/</span>
              <h1 className="font-display font-semibold text-[#123C32] truncate">{currentNavLabel}</h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={loadSectionData}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E8EEEB] bg-white px-3 py-1.5 text-xs font-medium text-[#123C32] hover:bg-[#F6F8F7] cursor-pointer whitespace-nowrap"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Actualiser</span>
            </button>
            <button
              type="button"
              onClick={() =>
                executeSensitiveTool(
                  'cache_clear',
                  'Vider le cache technique',
                  'Confirmez-vous le vidage du cache mémoire applicatif et des compteurs de limitation de débit ?',
                  false
                )
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#185C46] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#123C32] cursor-pointer whitespace-nowrap"
            >
              <Wrench className="h-3.5 w-3.5" />
              <span>Vider le cache</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-5 sm:p-7 space-y-6 max-w-[1380px] w-full mx-auto">
          {feedback && (
            <div
              className={`flex items-center justify-between gap-4 rounded-xl border px-4 py-3 text-xs font-medium ${
                feedback.type === 'ok'
                  ? 'border-[#185C46]/30 bg-[#EBF5F0] text-[#185C46]'
                  : 'border-[#D94B4B]/30 bg-[#FDECEC] text-[#D94B4B]'
              }`}
            >
              <span>{feedback.text}</span>
              <button type="button" onClick={() => setFeedback(null)} className="cursor-pointer">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* 1. VUE GÉNÉRALE */}
          {section === 'overview' && (
            <div className="space-y-6">
              {loading && !overview ? (
                <SkeletonRows rows={6} />
              ) : overview ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatCard
                      label="État du serveur"
                      value="Opérationnel"
                      sublabel={`Node ${overview.server.nodeVersion} · Uptime ${formatUptime(overview.server.uptimeSeconds)}`}
                      icon={<Server className="h-4 w-4" />}
                      tone="success"
                    />
                    <StatCard
                      label="Base de données"
                      value={overview.database.status === 'connecte' ? 'Connectée' : 'Alerte'}
                      sublabel={`${overview.database.pingMs} ms · ${formatBytes(overview.database.sizeBytes)}`}
                      icon={<Database className="h-4 w-4" />}
                      tone="success"
                      onClick={() => setSection('database')}
                    />
                    <StatCard
                      label="État de l’API (24h)"
                      value={`${overview.api.avgLatencyMs} ms`}
                      sublabel={`${overview.api.totalRequests24h} req · ${overview.api.failedRequests24h} échec(s)`}
                      icon={<Activity className="h-4 w-4" />}
                      tone={overview.api.serverErrors5xx24h > 0 ? 'warning' : 'success'}
                      onClick={() => setSection('api')}
                    />
                    <StatCard
                      label="Ressources système"
                      value={`${overview.server.heapUsedMb} Mo`}
                      sublabel={`RSS ${overview.server.rssMb} Mo · Libre ${overview.server.osFreeMemMb} Mo`}
                      icon={<Terminal className="h-4 w-4" />}
                      tone="neutral"
                    />
                    <StatCard
                      label="Erreurs ouvertes"
                      value={String(overview.counts.openErrors)}
                      sublabel={`${overview.counts.criticalErrors} critique(s)`}
                      icon={<AlertCircle className="h-4 w-4" />}
                      tone={overview.counts.openErrors > 0 ? 'danger' : 'success'}
                      onClick={() => setSection('errors')}
                    />
                    <StatCard
                      label="Requêtes échouées (24h)"
                      value={String(overview.api.failedRequests24h)}
                      sublabel={`${overview.api.serverErrors5xx24h} erreur(s) HTTP 5xx`}
                      icon={<ShieldAlert className="h-4 w-4" />}
                      tone={overview.api.serverErrors5xx24h > 0 ? 'danger' : 'neutral'}
                      onClick={() => setSection('api')}
                    />
                    <StatCard
                      label="Tâches (File d’attente)"
                      value={`${overview.counts.pendingJobs} en attente`}
                      sublabel={`${overview.counts.failedJobs} tâche(s) en échec`}
                      icon={<ListChecks className="h-4 w-4" />}
                      tone={overview.counts.failedJobs > 0 ? 'warning' : 'success'}
                      onClick={() => setSection('jobs')}
                    />
                    <StatCard
                      label="Dernière sauvegarde"
                      value={overview.lastBackup ? formatBytes(overview.lastBackup.size_bytes) : 'Aucune'}
                      sublabel={overview.lastBackup ? overview.lastBackup.created_at : 'Créer une sauvegarde SQLite'}
                      icon={<HardDrive className="h-4 w-4" />}
                      tone={overview.lastBackup ? 'gold' : 'warning'}
                      onClick={() => setSection('backups')}
                    />
                  </div>

                  {/* Services de paiement & Dernières erreurs/requêtes */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="rounded-xl border border-[#E8EEEB] bg-white p-5">
                      <div className="flex items-center justify-between border-b border-[#E8EEEB] pb-3">
                        <h2 className="font-display text-sm font-semibold text-[#123C32]">
                          État des services de paiement & passerelles
                        </h2>
                        <button
                          type="button"
                          onClick={() => setSection('payments')}
                          className="text-xs font-medium text-[#185C46] hover:underline cursor-pointer"
                        >
                          Détails →
                        </button>
                      </div>
                      <div className="mt-3 divide-y divide-[#E8EEEB]">
                        {overview.integrations.map((item: any) => (
                          <div key={item.provider} className="flex items-center justify-between py-2.5 text-xs">
                            <div>
                              <p className="font-semibold text-[#123C32]">{item.label}</p>
                              <p className="text-[#66736D]">{item.mode}</p>
                            </div>
                            <span
                              className={`inline-flex items-center gap-1 font-medium ${
                                item.configured ? 'text-[#185C46]' : 'text-[#B87716]'
                              }`}
                            >
                              {item.configured ? (
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              ) : (
                                <Clock className="h-3.5 w-3.5" />
                              )}
                              <span>{item.configured ? 'Configuré' : 'Clés requises'}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-xl border border-[#E8EEEB] bg-white p-5">
                      <div className="flex items-center justify-between border-b border-[#E8EEEB] pb-3">
                        <h2 className="font-display text-sm font-semibold text-[#123C32]">
                          Inspecteur temps réel (Requêtes récentes)
                        </h2>
                        <button
                          type="button"
                          onClick={() => setSection('api')}
                          className="text-xs font-medium text-[#185C46] hover:underline cursor-pointer"
                        >
                          Historique API →
                        </button>
                      </div>
                      <div className="mt-3 overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="text-[#66736D] border-b border-[#E8EEEB]">
                              <th className="py-2 font-medium">Méthode</th>
                              <th className="py-2 font-medium">Route</th>
                              <th className="py-2 font-medium text-right">Code</th>
                              <th className="py-2 font-medium text-right">Durée</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#E8EEEB]">
                            {overview.recentRequests.slice(0, 7).map((r: any) => (
                              <tr key={r.id}>
                                <td className="py-2 font-mono font-semibold text-[#123C32]">{r.method}</td>
                                <td className="py-2 font-mono text-[#66736D] truncate max-w-[200px]">{r.path}</td>
                                <td
                                  className={`py-2 text-right font-mono tabular-nums font-semibold ${
                                    r.status_code >= 500
                                      ? 'text-[#D94B4B]'
                                      : r.status_code >= 400
                                      ? 'text-[#B87716]'
                                      : 'text-[#185C46]'
                                  }`}
                                >
                                  {r.status_code}
                                </td>
                                <td className="py-2 text-right font-mono tabular-nums text-[#66736D]">{r.duration_ms} ms</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          )}

          {/* 2. ERREURS */}
          {section === 'errors' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-[#E8EEEB] bg-white p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <div className="relative">
                  <Search className="h-3.5 w-3.5 text-[#66736D] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={errorFilters.q}
                    onChange={(e) => setErrorFilters((f) => ({ ...f, q: e.target.value }))}
                    placeholder="Rechercher message, fichier..."
                    className="w-full rounded-lg border border-[#E8EEEB] pl-8 pr-3 py-1.5 text-xs focus:border-[#185C46] focus:outline-none"
                  />
                </div>
                <select
                  value={errorFilters.source}
                  onChange={(e) => setErrorFilters((f) => ({ ...f, source: e.target.value }))}
                  className="rounded-lg border border-[#E8EEEB] bg-white px-3 py-1.5 text-xs"
                >
                  <option value="all">Toutes sources</option>
                  <option value="backend_node">Backend Node / Express</option>
                  <option value="backend_sqlite">Base SQLite</option>
                  <option value="frontend_js">Frontend JavaScript</option>
                  <option value="webhook">Webhooks</option>
                  <option value="php_laravel">PHP / Laravel (Import)</option>
                </select>
                <select
                  value={errorFilters.severity}
                  onChange={(e) => setErrorFilters((f) => ({ ...f, severity: e.target.value }))}
                  className="rounded-lg border border-[#E8EEEB] bg-white px-3 py-1.5 text-xs"
                >
                  <option value="all">Toutes gravités</option>
                  <option value="critique">Critique</option>
                  <option value="elevee">Élevée</option>
                  <option value="moyenne">Moyenne</option>
                  <option value="faible">Faible</option>
                </select>
                <select
                  value={errorFilters.status}
                  onChange={(e) => setErrorFilters((f) => ({ ...f, status: e.target.value }))}
                  className="rounded-lg border border-[#E8EEEB] bg-white px-3 py-1.5 text-xs"
                >
                  <option value="all">Tous statuts</option>
                  <option value="ouvert">Ouvert</option>
                  <option value="en_cours">En cours</option>
                  <option value="resolu">Résolu</option>
                </select>
                <input
                  type="date"
                  value={errorFilters.date}
                  onChange={(e) => setErrorFilters((f) => ({ ...f, date: e.target.value }))}
                  className="rounded-lg border border-[#E8EEEB] px-3 py-1.5 text-xs"
                />
              </div>

              {errorsData.length === 0 ? (
                <EmptyState
                  icon={<CheckCircle2 className="h-6 w-6" />}
                  title="Aucune erreur correspondante"
                  description="Aucune exception technique n’a été enregistrée pour ces critères."
                />
              ) : (
                <div className="rounded-xl border border-[#E8EEEB] bg-white overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-[#E8EEEB] bg-[#F6F8F7] text-[#66736D]">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Code</th>
                        <th className="px-4 py-3 font-semibold">Source & Module</th>
                        <th className="px-4 py-3 font-semibold">Message & Fichier</th>
                        <th className="px-4 py-3 font-semibold">Gravité</th>
                        <th className="px-4 py-3 font-semibold text-right">Occ.</th>
                        <th className="px-4 py-3 font-semibold">Statut</th>
                        <th className="px-4 py-3 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E8EEEB]">
                      {errorsData.map((err) => (
                        <tr key={err.id} className="hover:bg-[#F6F8F7]/60">
                          <td className="px-4 py-3 font-mono font-semibold text-[#123C32] whitespace-nowrap">{err.error_code}</td>
                          <td className="px-4 py-3">
                            <p className="font-medium text-[#123C32]">{err.source}</p>
                            <p className="text-[#66736D]">{err.module}</p>
                          </td>
                          <td className="px-4 py-3 max-w-md">
                            <p className="font-medium text-[#123C32] truncate">{err.message}</p>
                            <p className="font-mono text-[11px] text-[#66736D] truncate">
                              {err.file_path || 'N/A'}
                              {err.line_number ? `:${err.line_number}` : ''}
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`font-medium ${
                                err.severity === 'critique' || err.severity === 'elevee'
                                  ? 'text-[#D94B4B]'
                                  : err.severity === 'moyenne'
                                  ? 'text-[#B87716]'
                                  : 'text-[#66736D]'
                              }`}
                            >
                              {err.severity}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums">{err.occurrences}</td>
                          <td className="px-4 py-3">
                            <span className={err.status === 'resolu' ? 'text-[#185C46] font-medium' : 'text-[#B87716] font-medium'}>
                              {err.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap space-x-2">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedError(err);
                                setResolutionNote(err.resolution_note || '');
                              }}
                              className="font-medium text-[#185C46] hover:underline cursor-pointer"
                            >
                              Inspecter
                            </button>
                            <button
                              type="button"
                              onClick={() => runDiagnostic(err.id)}
                              className="font-medium text-[#123C32] hover:underline cursor-pointer"
                            >
                              Diagnostiquer
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* 3. JOURNAUX */}
          {section === 'logs' && logsData && (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="relative max-w-sm w-full">
                  <Search className="h-3.5 w-3.5 text-[#66736D] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                    placeholder="Filtrer par route ou erreur..."
                    className="w-full rounded-lg border border-[#E8EEEB] bg-white pl-8 pr-3 py-2 text-xs focus:border-[#185C46] focus:outline-none"
                  />
                </div>
                <p className="text-xs text-[#66736D]">
                  Secrets, mots de passe, tokens et cookies automatiquement masqués.
                </p>
              </div>

              <div className="rounded-xl border border-[#E8EEEB] bg-white p-5">
                <h2 className="font-display text-sm font-semibold text-[#123C32] mb-3">
                  Journal d’audit des actions développeur
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-[#E8EEEB] text-[#66736D]">
                      <tr>
                        <th className="py-2 font-medium">Date</th>
                        <th className="py-2 font-medium">Développeur</th>
                        <th className="py-2 font-medium">Action</th>
                        <th className="py-2 font-medium">Cible</th>
                        <th className="py-2 font-medium">Détails</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E8EEEB]">
                      {logsData.devAudit.map((a: any) => (
                        <tr key={a.id}>
                          <td className="py-2 font-mono tabular-nums text-[#66736D] whitespace-nowrap">{a.created_at}</td>
                          <td className="py-2 text-[#123C32]">{a.developer_email}</td>
                          <td className="py-2 font-mono font-semibold text-[#185C46]">{a.action}</td>
                          <td className="py-2 font-mono text-[#66736D]">{a.target_type}{a.target_id ? ` #${a.target_id}` : ''}</td>
                          <td className="py-2 font-mono text-[11px] text-[#66736D] max-w-md truncate">{a.details_json}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 4. API */}
          {section === 'api' && apiMonitor && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Total requêtes tracées" value={String(apiMonitor.summary.total)} icon={<Activity className="h-4 w-4" />} />
                <StatCard label="Succès 2xx/3xx" value={String(apiMonitor.summary.ok_2xx_3xx)} icon={<CheckCircle2 className="h-4 w-4" />} tone="success" />
                <StatCard label="Erreurs client 4xx" value={String(apiMonitor.summary.err_4xx)} icon={<AlertCircle className="h-4 w-4" />} tone="warning" />
                <StatCard label="Latence moyenne / max" value={`${apiMonitor.summary.avg_ms} ms`} sublabel={`Pic : ${apiMonitor.summary.max_ms} ms`} icon={<Clock className="h-4 w-4" />} />
              </div>

              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-1 p-1 bg-white border border-[#E8EEEB] rounded-lg">
                  {[
                    { id: 'all', label: 'Toutes' },
                    { id: 'errors', label: 'Échecs (4xx/5xx)' },
                    { id: '5xx', label: 'Erreurs serveur (5xx)' },
                    { id: 'slow', label: 'Lentes (>= 150 ms)' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setApiFilter(tab.id)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap ${
                        apiFilter === tab.id ? 'bg-[#185C46] text-white' : 'text-[#66736D] hover:text-[#123C32]'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    executeSensitiveTool(
                      'check_routes',
                      'Vérifier les routes API',
                      'Confirmez-vous la vérification des routes critiques montées sur le serveur Express ?'
                    )
                  }
                  className="rounded-lg border border-[#E8EEEB] bg-white px-3.5 py-2 text-xs font-medium text-[#123C32] hover:bg-[#F6F8F7] cursor-pointer"
                >
                  Vérifier les routes API
                </button>
              </div>

              <div className="rounded-xl border border-[#E8EEEB] bg-white overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-[#E8EEEB] bg-[#F6F8F7] text-[#66736D]">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Horodatage</th>
                      <th className="px-4 py-3 font-semibold">Méthode</th>
                      <th className="px-4 py-3 font-semibold">Endpoint</th>
                      <th className="px-4 py-3 font-semibold">Rôle</th>
                      <th className="px-4 py-3 font-semibold text-right">HTTP</th>
                      <th className="px-4 py-3 font-semibold text-right">Temps</th>
                      <th className="px-4 py-3 font-semibold">En-têtes (masqués)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8EEEB]">
                    {apiMonitor.requests.map((r: any) => (
                      <tr key={r.id}>
                        <td className="px-4 py-2.5 font-mono tabular-nums text-[#66736D] whitespace-nowrap">{r.created_at}</td>
                        <td className="px-4 py-2.5 font-mono font-semibold text-[#123C32]">{r.method}</td>
                        <td className="px-4 py-2.5 font-mono text-[#123C32]">{r.path}</td>
                        <td className="px-4 py-2.5 text-[#66736D]">{r.user_role || 'public'}</td>
                        <td
                          className={`px-4 py-2.5 text-right font-mono tabular-nums font-semibold ${
                            r.status_code >= 500 ? 'text-[#D94B4B]' : r.status_code >= 400 ? 'text-[#B87716]' : 'text-[#185C46]'
                          }`}
                        >
                          {r.status_code}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums">{r.duration_ms} ms</td>
                        <td className="px-4 py-2.5 font-mono text-[11px] text-[#66736D] max-w-xs truncate">
                          {r.headers_redacted_json}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 5. BASE DE DONNÉES */}
          {section === 'database' && dbData && (
            <div className="space-y-5">
              <div className="rounded-xl border border-[#185C46]/25 bg-[#EBF5F0] px-4 py-3 text-xs text-[#123C32]">
                <strong>Protection des données financières :</strong> La console développeur fonctionne en lecture seule
                diagnostique sur les tables financières (<span className="font-mono">rent_invoices</span>,{' '}
                <span className="font-mono">rent_payments</span>, <span className="font-mono">receipts</span>,{' '}
                <span className="font-mono">expenses</span>). Aucune modification ou suppression directe n’est exposée.
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Connexion SQLite" value={dbData.connection.status === 'connecte' ? 'Active' : 'Alerte'} sublabel={`Ping ${dbData.connection.pingMs} ms`} icon={<Database className="h-4 w-4" />} tone="success" />
                <StatCard label="Intégrité PRAGMA" value={dbData.connection.integrityCheck.toUpperCase()} sublabel={`Mode ${dbData.connection.journalMode.toUpperCase()}`} icon={<ShieldCheck className="h-4 w-4" />} tone="success" />
                <StatCard label="Clés étrangères" value={dbData.connection.foreignKeysEnabled ? 'Activées' : 'Désactivées'} icon={<Lock className="h-4 w-4" />} tone="success" />
                <StatCard label="Requêtes lentes / err." value={String(dbData.slowQueries.length)} icon={<Clock className="h-4 w-4" />} tone={dbData.slowQueries.length > 0 ? 'warning' : 'success'} />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="rounded-xl border border-[#E8EEEB] bg-white p-5">
                  <h2 className="font-display text-sm font-semibold text-[#123C32] mb-3">Migrations exécutées (schema_migrations)</h2>
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-[#E8EEEB] text-[#66736D]">
                      <tr>
                        <th className="py-2 font-medium">Version</th>
                        <th className="py-2 font-medium">Migration</th>
                        <th className="py-2 font-medium text-right">Lot</th>
                        <th className="py-2 font-medium text-right">Statut</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E8EEEB]">
                      {dbData.migrations.map((m: any) => (
                        <tr key={m.id}>
                          <td className="py-2 font-mono text-[#123C32]">{m.version}</td>
                          <td className="py-2 text-[#66736D]">{m.name}</td>
                          <td className="py-2 text-right font-mono tabular-nums">{m.batch}</td>
                          <td className="py-2 text-right font-medium text-[#185C46]">{m.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="rounded-xl border border-[#E8EEEB] bg-white p-5">
                  <h2 className="font-display text-sm font-semibold text-[#123C32] mb-3">Volumétrie des tables SQLite</h2>
                  <div className="max-h-72 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-[#E8EEEB] text-[#66736D]">
                        <tr>
                          <th className="py-2 font-medium">Table</th>
                          <th className="py-2 font-medium text-right">Lignes</th>
                          <th className="py-2 font-medium text-right">Accès Console</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E8EEEB]">
                        {dbData.tableStats.map((t: any) => (
                          <tr key={t.name}>
                            <td className="py-2 font-mono text-[#123C32]">{t.name}</td>
                            <td className="py-2 text-right font-mono tabular-nums font-semibold">{t.rows}</td>
                            <td className="py-2 text-right text-[11px] text-[#66736D]">{t.protection}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 6. PAIEMENTS & WEBHOOKS */}
          {section === 'payments' && apiMonitor && (
            <div className="space-y-5">
              <div className="rounded-xl border border-[#E8EEEB] bg-white p-5">
                <h2 className="font-display text-sm font-semibold text-[#123C32] mb-3">
                  Connecteurs Mobile Money & Notifications
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {apiMonitor.integrations.map((item: any) => (
                    <div key={item.provider} className="rounded-lg border border-[#E8EEEB] p-4">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-sm text-[#123C32]">{item.label}</p>
                        <span className={`text-xs font-medium ${item.configured ? 'text-[#185C46]' : 'text-[#B87716]'}`}>
                          {item.configured ? 'Actif' : 'Non configuré'}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-[#66736D]">{item.mode}</p>
                      <p className="mt-2 font-mono text-[11px] text-[#66736D]">Vars : {item.envVars.join(', ')}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-[#E8EEEB] bg-white p-5">
                <h2 className="font-display text-sm font-semibold text-[#123C32] mb-3">
                  Historique des webhooks & tentatives
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-[#E8EEEB] text-[#66736D]">
                      <tr>
                        <th className="py-2 font-medium">Fournisseur</th>
                        <th className="py-2 font-medium">Événement</th>
                        <th className="py-2 font-medium">HTTP</th>
                        <th className="py-2 font-medium text-right">Tentatives</th>
                        <th className="py-2 font-medium">Statut</th>
                        <th className="py-2 font-medium">Motif / Payload masqué</th>
                        <th className="py-2 font-medium text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E8EEEB]">
                      {apiMonitor.webhooks.map((w: any) => (
                        <tr key={w.id}>
                          <td className="py-2.5 font-semibold text-[#123C32]">{w.provider}</td>
                          <td className="py-2.5 font-mono text-[#66736D]">{w.event_type}</td>
                          <td className="py-2.5 font-mono tabular-nums">{w.http_status || '-'}</td>
                          <td className="py-2.5 text-right font-mono tabular-nums">{w.attempts}</td>
                          <td className="py-2.5 font-medium text-[#B87716]">{w.status}</td>
                          <td className="py-2.5 text-[#66736D] max-w-sm truncate">{w.error_message || w.payload_redacted_json}</td>
                          <td className="py-2.5 text-right">
                            <button
                              type="button"
                              onClick={async () => {
                                const res = await apiFetch<{ message: string }>(`/api/developer/webhooks/${w.id}/retry`, { method: 'POST' });
                                setFeedback({ type: 'ok', text: res.message });
                                loadSectionData();
                              }}
                              className="font-medium text-[#185C46] hover:underline cursor-pointer"
                            >
                              Retester
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 7. TÂCHES */}
          {section === 'jobs' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-[#66736D]">File d’exécution des tâches techniques et planifiées.</p>
                <button
                  type="button"
                  onClick={async () => {
                    const res = await apiFetch<{ executed: number; failed: number }>('/api/developer/jobs/run-pending', {
                      method: 'POST',
                    });
                    setFeedback({
                      type: res.failed > 0 ? 'err' : 'ok',
                      text: `${res.executed} tâche(s) exécutée(s), ${res.failed} en échec.`,
                    });
                    loadSectionData();
                  }}
                  className="rounded-lg bg-[#185C46] px-4 py-2 text-xs font-semibold text-white hover:bg-[#123C32] cursor-pointer"
                >
                  Exécuter les tâches en attente
                </button>
              </div>

              <div className="rounded-xl border border-[#E8EEEB] bg-white overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-[#E8EEEB] bg-[#F6F8F7] text-[#66736D]">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Tâche</th>
                      <th className="px-4 py-3 font-semibold">Statut</th>
                      <th className="px-4 py-3 font-semibold text-right">Essais</th>
                      <th className="px-4 py-3 font-semibold text-right">Durée</th>
                      <th className="px-4 py-3 font-semibold">Motif d’échec / Résultat</th>
                      <th className="px-4 py-3 font-semibold text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8EEEB]">
                    {jobsData.map((j) => (
                      <tr key={j.id}>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-[#123C32]">{j.name}</p>
                          <p className="font-mono text-[11px] text-[#66736D]">{j.job_type}</p>
                        </td>
                        <td className="px-4 py-3 font-medium">
                          <span className={j.status === 'execute' ? 'text-[#185C46]' : j.status === 'echoue' ? 'text-[#D94B4B]' : 'text-[#B87716]'}>
                            {j.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums">
                          {j.attempts}/{j.max_attempts}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums">{j.duration_ms} ms</td>
                        <td className="px-4 py-3 text-[#66736D] max-w-md truncate">{j.error_reason || j.payload_json}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={async () => {
                              const res = await apiFetch<{ status: string; errorReason: string | null }>(
                                `/api/developer/jobs/${j.id}/retry`,
                                { method: 'POST' }
                              );
                              setFeedback({
                                type: res.status === 'execute' ? 'ok' : 'err',
                                text: res.errorReason || `Tâche « ${j.name} » relancée avec succès.`,
                              });
                              loadSectionData();
                            }}
                            className="font-medium text-[#185C46] hover:underline cursor-pointer"
                          >
                            Relancer
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 8. SÉCURITÉ */}
          {section === 'security' && securityData && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {securityData.securityChecks.map((c: any) => (
                  <div key={c.name} className="rounded-xl border border-[#E8EEEB] bg-white p-4 flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-sm text-[#123C32]">{c.name}</p>
                      <p className="mt-1 text-xs text-[#66736D]">{c.detail}</p>
                    </div>
                    <span className={`text-xs font-semibold whitespace-nowrap ${c.status === 'actif' ? 'text-[#185C46]' : 'text-[#B87716]'}`}>
                      {c.status === 'actif' ? 'Conforme' : 'À vérifier'}
                    </span>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-[#E8EEEB] bg-white p-5">
                <h2 className="font-display text-sm font-semibold text-[#123C32] mb-3">
                  Traçabilité des connexions récentes (données sensibles masquées)
                </h2>
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-[#E8EEEB] text-[#66736D]">
                    <tr>
                      <th className="py-2 font-medium">Date</th>
                      <th className="py-2 font-medium">Rôle</th>
                      <th className="py-2 font-medium">IP</th>
                      <th className="py-2 font-medium">Détails</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8EEEB]">
                    {securityData.recentLogins.map((l: any) => (
                      <tr key={l.id}>
                        <td className="py-2 font-mono tabular-nums text-[#66736D]">{l.created_at}</td>
                        <td className="py-2 font-mono text-[#123C32]">{l.role_type || 'N/A'}</td>
                        <td className="py-2 font-mono text-[#66736D]">{l.ip_address || '-'}</td>
                        <td className="py-2 font-mono text-[11px] text-[#66736D] truncate max-w-md">{l.details_json}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 9. SAUVEGARDES */}
          {section === 'backups' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-[#66736D]">
                  Sauvegardes physiques SQLite vérifiées par empreinte SHA-256 et contrôle <span className="font-mono">PRAGMA quick_check</span>.
                </p>
                <button
                  type="button"
                  onClick={() =>
                    setConfirmAction({
                      title: 'Créer une sauvegarde complète SQLite',
                      message:
                        'Cette action va copier l’intégralité de la base immopay.db dans /backups/ et vérifier son intégrité SHA-256. Confirmer ?',
                      run: async () => {
                        const res = await apiFetch<{ message: string }>('/api/developer/backups/create', {
                          method: 'POST',
                          body: JSON.stringify({ confirmed: true }),
                        });
                        setFeedback({ type: 'ok', text: res.message });
                        loadSectionData();
                      },
                    })
                  }
                  className="rounded-lg bg-[#185C46] px-4 py-2 text-xs font-semibold text-white hover:bg-[#123C32] cursor-pointer"
                >
                  Créer une sauvegarde maintenant
                </button>
              </div>

              {backupsData.length === 0 ? (
                <EmptyState
                  icon={<HardDrive className="h-6 w-6" />}
                  title="Aucune sauvegarde enregistrée"
                  description="Générez un instantané SQLite vérifié avant toute opération de maintenance."
                />
              ) : (
                <div className="rounded-xl border border-[#E8EEEB] bg-white overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-[#E8EEEB] bg-[#F6F8F7] text-[#66736D]">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Fichier</th>
                        <th className="px-4 py-3 font-semibold text-right">Taille</th>
                        <th className="px-4 py-3 font-semibold">SHA-256</th>
                        <th className="px-4 py-3 font-semibold">Intégrité</th>
                        <th className="px-4 py-3 font-semibold">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E8EEEB]">
                      {backupsData.map((b) => (
                        <tr key={b.id}>
                          <td className="px-4 py-3 font-mono font-semibold text-[#123C32]">{b.filename}</td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums">{formatBytes(b.size_bytes)}</td>
                          <td className="px-4 py-3 font-mono text-[11px] text-[#66736D]">{b.sha256.slice(0, 20)}...</td>
                          <td className="px-4 py-3 font-medium text-[#185C46]">{b.integrity_status.toUpperCase()}</td>
                          <td className="px-4 py-3 font-mono tabular-nums text-[#66736D]">{b.created_at}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* 10. ASSISTANT DE DIAGNOSTIC INTELLIGENT */}
          {section === 'diagnostic' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-5 rounded-xl border border-[#E8EEEB] bg-white p-5 space-y-4">
                <h2 className="font-display text-sm font-semibold text-[#123C32]">
                  Analyser un incident ou une erreur
                </h2>
                <div>
                  <label className="block text-xs font-medium text-[#123C32] mb-1">Sélectionner une erreur capturée</label>
                  <select
                    value={diagErrorId}
                    onChange={(e) => setDiagErrorId(e.target.value)}
                    className="w-full rounded-lg border border-[#E8EEEB] bg-white px-3 py-2 text-xs"
                  >
                    <option value="">-- Ou saisir un symptôme libre ci-dessous --</option>
                    {errorsData.map((err) => (
                      <option key={err.id} value={err.id}>
                        [{err.error_code}] {err.message.slice(0, 65)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#123C32] mb-1">Trace technique ou symptôme libre</label>
                  <textarea
                    rows={5}
                    value={diagSymptom}
                    onChange={(e) => setDiagSymptom(e.target.value)}
                    placeholder="Collez ici un message d’erreur SQLite, Express, React ou webhook..."
                    className="w-full rounded-lg border border-[#E8EEEB] p-3 font-mono text-xs focus:border-[#185C46] focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  disabled={diagLoading || (!diagErrorId && !diagSymptom.trim())}
                  onClick={() => runDiagnostic()}
                  className="w-full rounded-lg bg-[#185C46] py-2.5 text-xs font-semibold text-white hover:bg-[#123C32] cursor-pointer disabled:opacity-50"
                >
                  {diagLoading ? 'Analyse en cours...' : 'Lancer le diagnostic technique'}
                </button>
              </div>

              <div className="lg:col-span-7 rounded-xl border border-[#E8EEEB] bg-white p-5">
                {!diagResult ? (
                  <EmptyState
                    icon={<Bot className="h-6 w-6" />}
                    title="Assistant de diagnostic prêt"
                    description="Sélectionnez une erreur enregistrée ou décrivez un symptôme pour obtenir la cause probable, les fichiers concernés et les commandes de vérification."
                  />
                ) : (
                  <div className="space-y-4 text-xs">
                    <div className="border-b border-[#E8EEEB] pb-3">
                      <p className="font-semibold text-[#185C46]">{diagResult.analysis.category}</p>
                      <p className="mt-1 text-[#66736D]">{diagResult.environmentNotice}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-[#123C32]">Explication</p>
                      <p className="mt-1 text-[#66736D] leading-relaxed">{diagResult.analysis.explanation}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-[#123C32]">Cause probable</p>
                      <p className="mt-1 text-[#66736D] leading-relaxed">{diagResult.analysis.probableCause}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-[#123C32]">Fichiers concernés</p>
                      <p className="mt-1 font-mono text-[#185C46]">
                        {diagResult.analysis.affectedFiles.join(' · ')}
                        {diagResult.analysis.lineNumber ? ` (ligne ${diagResult.analysis.lineNumber})` : ''}
                      </p>
                    </div>
                    <div>
                      <p className="font-semibold text-[#123C32]">Solution proposée</p>
                      <p className="mt-1 text-[#66736D] leading-relaxed">{diagResult.analysis.solution}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-[#123C32]">Commandes de vérification</p>
                      <pre className="mt-1 rounded-lg bg-[#123C32] text-[#F0D99A] p-3 font-mono text-[11px] overflow-x-auto">
                        {diagResult.analysis.verificationCommands.join('\n')}
                      </pre>
                    </div>
                    <div>
                      <p className="font-semibold text-[#123C32]">Étapes de correction (préproduction obligatoire)</p>
                      <ul className="mt-1 space-y-1 text-[#66736D]">
                        {diagResult.analysis.remediationSteps.map((s: string) => (
                          <li key={s}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 11. PARAMÈTRES TECHNIQUES & OUTILS */}
          {section === 'settings' && settingsData && (
            <div className="space-y-6">
              <div className="rounded-xl border border-[#E8EEEB] bg-white p-5">
                <h2 className="font-display text-sm font-semibold text-[#123C32] mb-2">
                  Outils techniques sécurisés (confirmation obligatoire)
                </h2>
                <p className="text-xs text-[#66736D] mb-4">
                  Chaque opération ci-dessous exige une confirmation explicite et est enregistrée dans le journal d’audit développeur.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {[
                    { action: 'cache_clear', label: 'Vider le cache mémoire', msg: 'Vider le cache et les compteurs anti-brute-force ?' },
                    { action: 'check_routes', label: 'Vérifier les routes API', msg: 'Lancer le contrôle des endpoints montés sur Express ?' },
                    { action: 'check_migrations', label: 'Vérifier les migrations', msg: 'Contrôler la table schema_migrations ?' },
                    { action: 'check_queues', label: 'Contrôler les files d’attente', msg: 'Inspecter les compteurs de tâches en file ?' },
                    { action: 'test_connections', label: 'Tester les connexions', msg: 'Tester la connexion SQLite et les connecteurs externes ?' },
                    { action: 'check_services', label: 'Vérifier les services', msg: 'Contrôler l’état Express, SQLite et du build Vite ?' },
                    { action: 'wal_checkpoint', label: 'Checkpoint SQLite WAL', msg: 'Exécuter un checkpoint WAL PASSIVE sur immopay.db ?' },
                  ].map((tool) => (
                    <button
                      key={tool.action}
                      type="button"
                      onClick={() => executeSensitiveTool(tool.action, tool.label, tool.msg)}
                      className="rounded-lg border border-[#E8EEEB] bg-[#F6F8F7] px-4 py-3 text-left text-xs font-semibold text-[#123C32] hover:border-[#185C46] transition-colors cursor-pointer"
                    >
                      {tool.label}
                    </button>
                  ))}
                </div>
                {toolOutput && (
                  <pre className="mt-4 rounded-lg bg-[#123C32] text-[#F0D99A] p-4 font-mono text-[11px] overflow-x-auto">
                    {toolOutput}
                  </pre>
                )}
              </div>

              <div className="rounded-xl border border-[#E8EEEB] bg-white p-5 space-y-4">
                <h2 className="font-display text-sm font-semibold text-[#123C32]">
                  Observabilité & Configuration technique ({settingsData.observability.environment})
                </h2>
                <p className="text-xs text-[#66736D]">{settingsData.observability.devInspector}</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div>
                    <label className="block font-medium text-[#123C32] mb-1">Seuil requête SQL lente (ms)</label>
                    <input
                      type="number"
                      value={settingsData.settings.slow_sql_threshold_ms || '80'}
                      onChange={(e) =>
                        setSettingsData((prev: any) => ({
                          ...prev,
                          settings: { ...prev.settings, slow_sql_threshold_ms: e.target.value },
                        }))
                      }
                      className="w-full rounded-lg border border-[#E8EEEB] px-3 py-2 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-[#123C32] mb-1">Rétention des journaux (jours)</label>
                    <input
                      type="number"
                      value={settingsData.settings.log_retention_days || '30'}
                      onChange={(e) =>
                        setSettingsData((prev: any) => ({
                          ...prev,
                          settings: { ...prev.settings, log_retention_days: e.target.value },
                        }))
                      }
                      className="w-full rounded-lg border border-[#E8EEEB] px-3 py-2 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-[#123C32] mb-1">Capture erreurs JS client</label>
                    <select
                      value={settingsData.settings.capture_js_errors || 'true'}
                      onChange={(e) =>
                        setSettingsData((prev: any) => ({
                          ...prev,
                          settings: { ...prev.settings, capture_js_errors: e.target.value },
                        }))
                      }
                      className="w-full rounded-lg border border-[#E8EEEB] bg-white px-3 py-2"
                    >
                      <option value="true">Activée</option>
                      <option value="false">Désactivée</option>
                    </select>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await apiFetch('/api/developer/settings', {
                      method: 'PUT',
                      body: JSON.stringify({ settings: settingsData.settings }),
                    });
                    setFeedback({ type: 'ok', text: 'Paramètres techniques enregistrés.' });
                  }}
                  className="rounded-lg bg-[#185C46] px-4 py-2 text-xs font-semibold text-white hover:bg-[#123C32] cursor-pointer"
                >
                  Enregistrer les paramètres techniques
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Error Inspection Modal */}
      <Modal
        open={Boolean(selectedError)}
        onClose={() => setSelectedError(null)}
        title={selectedError ? `Incident ${selectedError.error_code}` : ''}
        subtitle={selectedError ? `${selectedError.source} · ${selectedError.module}` : ''}
        maxWidth="max-w-2xl"
      >
        {selectedError && (
          <div className="space-y-4 text-xs">
            <div>
              <p className="font-semibold text-[#123C32]">Message</p>
              <p className="mt-1 text-[#123C32]">{selectedError.message}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-[#66736D]">
              <p>
                Fichier : <span className="font-mono text-[#123C32]">{selectedError.file_path || 'N/A'}</span>
              </p>
              <p>
                Ligne : <span className="font-mono text-[#123C32]">{selectedError.line_number || 'N/A'}</span>
              </p>
            </div>
            {selectedError.stack_trace && (
              <div>
                <p className="font-semibold text-[#123C32] mb-1">Trace détaillée</p>
                <pre className="rounded-lg bg-[#123C32] text-[#F0D99A] p-3 font-mono text-[11px] overflow-x-auto max-h-48">
                  {selectedError.stack_trace}
                </pre>
              </div>
            )}
            {selectedError.context_json && (
              <div>
                <p className="font-semibold text-[#123C32] mb-1">Contexte technique (masqué)</p>
                <pre className="rounded-lg bg-[#F6F8F7] border border-[#E8EEEB] p-3 font-mono text-[11px] overflow-x-auto">
                  {selectedError.context_json}
                </pre>
              </div>
            )}
            <div>
              <label className="block font-semibold text-[#123C32] mb-1">Commentaire de résolution</label>
              <textarea
                rows={3}
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
                placeholder="Décrivez le correctif appliqué et les tests effectués..."
                className="w-full rounded-lg border border-[#E8EEEB] p-2.5 text-xs focus:border-[#185C46] focus:outline-none"
              />
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => handleUpdateErrorStatus(selectedError.id, 'en_cours')}
                className="rounded-lg border border-[#E8EEEB] px-4 py-2 font-medium text-[#123C32] hover:bg-[#F6F8F7] cursor-pointer"
              >
                Enregistrer en cours
              </button>
              <button
                type="button"
                onClick={() => handleUpdateErrorStatus(selectedError.id, 'resolu')}
                className="rounded-lg bg-[#185C46] px-4 py-2 font-semibold text-white hover:bg-[#123C32] cursor-pointer"
              >
                Marquer comme résolue
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Explicit Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={confirmAction?.title || ''}
        message={confirmAction?.message || ''}
        danger={confirmAction?.danger}
        loading={confirmBusy}
        onCancel={() => setConfirmAction(null)}
        onConfirm={async () => {
          if (!confirmAction) return;
          setConfirmBusy(true);
          try {
            await confirmAction.run();
            setConfirmAction(null);
          } catch (err) {
            setFeedback({ type: 'err', text: (err as Error).message });
          } finally {
            setConfirmBusy(false);
          }
        }}
      />
    </div>
  );
};
