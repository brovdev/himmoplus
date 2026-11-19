import { ArrowLeft, CheckCircle2, Copy, Download, KeyRound, ShieldAlert, ShieldCheck } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { BrandLogo } from './BrandLogo';

interface TwoFactorStatusResponse {
  twoFactorVerified: boolean;
  enabled: boolean;
  isActivated: boolean;
  isFirstSetup: boolean;
  lastVerifiedAt: string | null;
  remainingRecoveryCodes: number;
  remainingAttempts: number;
  qrDataUrl?: string;
  manualKey?: string;
}

interface Verify2faResponse {
  verified: boolean;
  firstActivation?: boolean;
  recoveryCodes?: string[];
  remainingRecoveryCodes: number;
}

interface TwoFactorGateProps {
  title: string;
  subtitle: string;
  userEmail: string;
  onVerified: () => Promise<void>;
  onLogout: () => Promise<void>;
  onExitToPublic: () => void;
}

export const TwoFactorGate: React.FC<TwoFactorGateProps> = ({
  title,
  subtitle,
  userEmail,
  onVerified,
  onLogout,
  onExitToPublic,
}) => {
  const [status, setStatus] = useState<TwoFactorStatusResponse | null>(null);
  const [mode, setMode] = useState<'totp' | 'recovery'>('totp');
  const [code, setCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Codes de récupération affichés UNE SEULE FOIS après la première activation
  const [issuedRecoveryCodes, setIssuedRecoveryCodes] = useState<string[] | null>(null);
  const [copiedCodes, setCopiedCodes] = useState(false);

  const loadStatus = useCallback(() => {
    apiFetch<TwoFactorStatusResponse>('/api/auth/2fa/status')
      .then(setStatus)
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload =
        mode === 'recovery' ? { recoveryCode: recoveryCode.trim() } : { code: code.trim() };
      const res = await apiFetch<Verify2faResponse>('/api/auth/2fa/verify', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (res.recoveryCodes && res.recoveryCodes.length > 0) {
        setIssuedRecoveryCodes(res.recoveryCodes);
      } else {
        await onVerified();
      }
    } catch (err) {
      setError((err as Error).message);
      loadStatus();
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyRecoveryCodes = async () => {
    if (!issuedRecoveryCodes) return;
    const text = issuedRecoveryCodes.join('\n');
    await navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedCodes(true);
  };

  const handleDownloadRecoveryCodes = () => {
    if (!issuedRecoveryCodes) return;
    const content = [
      'IMMOPAY CI — Codes de récupération 2FA (usage unique)',
      `Compte : ${userEmail}`,
      `Généré le : ${new Date().toISOString()}`,
      '--------------------------------------------------------',
      ...issuedRecoveryCodes,
      '--------------------------------------------------------',
      'Chaque code ne peut être utilisé qu’une seule fois.',
    ].join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `immopay-ci-recovery-codes.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
          <p className="text-xs font-semibold text-[#185C46]">{subtitle}</p>
          <h1 className="mt-1 font-display text-xl font-bold text-[#123C32]">{title}</h1>
          <p className="mt-1 text-xs text-[#66736D]">
            Compte : <span className="font-mono font-medium text-[#123C32]">{userEmail}</span>
          </p>
        </div>

        {issuedRecoveryCodes ? (
          <div className="mt-5 space-y-4">
            <div className="rounded-lg border border-[#185C46]/30 bg-[#EDF5F1] p-4 text-xs text-[#123C32]">
              <div className="flex items-center gap-2 font-semibold text-[#185C46]">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>2FA activée avec succès !</span>
              </div>
              <p className="mt-1.5 text-[#66736D] leading-relaxed">
                Enregistrez ces <strong>8 codes de récupération à usage unique</strong> dès maintenant. Ils ne seront
                plus jamais réaffichés et vous permettront de récupérer l’accès si vous perdez votre téléphone.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 rounded-lg border border-[#E8EEEB] bg-[#F6F8F7] p-3.5">
              {issuedRecoveryCodes.map((rc) => (
                <div
                  key={rc}
                  className="rounded border border-[#E8EEEB] bg-white px-2.5 py-1.5 text-center font-mono text-xs font-bold text-[#123C32] select-all"
                >
                  {rc}
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyRecoveryCodes}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#E8EEEB] bg-white px-3 py-2 text-xs font-semibold text-[#123C32] hover:bg-[#F6F8F7] cursor-pointer"
              >
                <Copy className="h-3.5 w-3.5" />
                <span>{copiedCodes ? 'Copiés' : 'Copier'}</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadRecoveryCodes}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#E8EEEB] bg-white px-3 py-2 text-xs font-semibold text-[#123C32] hover:bg-[#F6F8F7] cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Télécharger (.txt)</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => onVerified()}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#185C46] py-2.5 text-sm font-semibold text-white hover:bg-[#123C32] transition-colors cursor-pointer"
            >
              <ShieldCheck className="h-4 w-4" />
              <span>J’ai sauvegardé mes codes — Continuer</span>
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-[#D94B4B]/30 bg-[#FDECEC] px-3.5 py-2.5 text-xs font-medium text-[#D94B4B]">
                <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {status?.isFirstSetup && status.qrDataUrl && (
              <div className="rounded-lg border border-[#E8EEEB] bg-[#F6F8F7] p-3.5 text-xs text-[#123C32]">
                <p className="font-semibold">
                  Activation individuelle requise (Google Authenticator / Microsoft Authenticator)
                </p>
                <p className="mt-1 text-[#66736D]">
                  Scannez ce QR code unique avec votre application d’authentification, puis saisissez le code à 6 chiffres
                  généré pour activer votre accès.
                </p>
                <div className="mt-3 flex flex-col sm:flex-row items-center gap-3">
                  <img
                    src={status.qrDataUrl}
                    alt="QR Code configuration TOTP individuel IMMOPAY CI"
                    className="h-32 w-32 rounded-lg border border-[#E8EEEB] bg-white p-1 shrink-0"
                  />
                  {status.manualKey && (
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-[11px] font-medium text-[#66736D]">Ou saisie manuelle (clé Base32 unique) :</p>
                      <p className="font-mono text-[11px] font-semibold text-[#123C32] break-all select-all">
                        {status.manualKey}
                      </p>
                      <p className="text-[11px] text-[#66736D]">TOTP SHA-1 · 6 chiffres · 30 s</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {status?.isActivated && (
              <div className="flex rounded-lg border border-[#E8EEEB] bg-[#F6F8F7] p-1 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setMode('totp');
                    setError(null);
                  }}
                  className={`flex-1 rounded-md py-1.5 font-medium transition-colors cursor-pointer ${
                    mode === 'totp' ? 'bg-white text-[#123C32] shadow-xs' : 'text-[#66736D] hover:text-[#123C32]'
                  }`}
                >
                  Code Authenticator
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('recovery');
                    setError(null);
                  }}
                  className={`flex-1 rounded-md py-1.5 font-medium transition-colors cursor-pointer ${
                    mode === 'recovery' ? 'bg-white text-[#123C32] shadow-xs' : 'text-[#66736D] hover:text-[#123C32]'
                  }`}
                >
                  Code de récupération ({status.remainingRecoveryCodes})
                </button>
              </div>
            )}

            {mode === 'totp' ? (
              <div>
                <label className="block text-xs font-medium text-[#123C32] mb-1">
                  Code TOTP (6 chiffres — Google / Microsoft Authenticator)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className="w-full rounded-lg border border-[#E8EEEB] px-3.5 py-2.5 text-center font-mono text-lg font-bold tracking-[0.35em] text-[#123C32] focus:border-[#185C46] focus:outline-none"
                />
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-[#123C32] mb-1">
                  Code de récupération à usage unique (XXXX-XXXX)
                </label>
                <input
                  type="text"
                  maxLength={12}
                  required
                  value={recoveryCode}
                  onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
                  placeholder="ABCD-EFGH"
                  className="w-full rounded-lg border border-[#E8EEEB] px-3.5 py-2.5 text-center font-mono text-base font-bold tracking-[0.2em] text-[#123C32] focus:border-[#185C46] focus:outline-none"
                />
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
                disabled={
                  submitting || (mode === 'totp' ? code.length !== 6 : recoveryCode.replace(/[^A-Z0-9]/g, '').length !== 8)
                }
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-[#185C46] py-2.5 text-sm font-semibold text-white hover:bg-[#123C32] transition-colors cursor-pointer disabled:opacity-50"
              >
                <KeyRound className="h-4 w-4" />
                <span>{submitting ? 'Validation...' : 'Vérifier et accéder'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
