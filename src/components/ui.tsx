import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Info,
  X,
  XCircle,
} from 'lucide-react';
import React, { useEffect } from 'react';

export const StatCard: React.FC<{
  label: string;
  value: string;
  sublabel?: string;
  icon: React.ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'gold';
  onClick?: () => void;
}> = ({ label, value, sublabel, icon, tone = 'neutral', onClick }) => {
  const iconColors: Record<string, string> = {
    neutral: 'bg-[#F6F8F7] text-[#185C46]',
    success: 'bg-[#EBF5F0] text-[#185C46]',
    warning: 'bg-[#FDF6E9] text-[#B87716]',
    danger: 'bg-[#FDECEC] text-[#D94B4B]',
    gold: 'bg-[#FBF6E8] text-[#9A7422]',
  };

  const Wrapper = onClick ? 'button' : 'div';

  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`w-full text-left rounded-xl border border-[#E8EEEB] bg-white p-4 transition-colors ${
        onClick ? 'hover:border-[#247A5B] cursor-pointer' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-[#66736D] truncate">{label}</p>
          <p className="mt-1.5 font-display text-xl font-bold tracking-tight text-[#123C32] tabular-nums truncate">
            {value}
          </p>
          {sublabel && <p className="mt-1 text-xs text-[#66736D] truncate">{sublabel}</p>}
        </div>
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconColors[tone]}`}>
          {icon}
        </div>
      </div>
    </Wrapper>
  );
};

export const StatusIndicator: React.FC<{ status: string }> = ({ status }) => {
  const map: Record<string, { label: string; color: string; Icon: React.ComponentType<{ className?: string }> }> = {
    paye: { label: 'Payé', color: 'text-[#185C46]', Icon: CheckCircle2 },
    confirme: { label: 'Confirmé', color: 'text-[#185C46]', Icon: CheckCircle2 },
    validee: { label: 'Validée', color: 'text-[#185C46]', Icon: CheckCircle2 },
    actif: { label: 'Actif', color: 'text-[#185C46]', Icon: CheckCircle2 },
    active: { label: 'Actif', color: 'text-[#185C46]', Icon: CheckCircle2 },
    occupe: { label: 'Occupé', color: 'text-[#185C46]', Icon: CheckCircle2 },
    resolu: { label: 'Résolu', color: 'text-[#185C46]', Icon: CheckCircle2 },
    disponible: { label: 'Disponible', color: 'text-[#247A5B]', Icon: Info },
    partiel: { label: 'Partiel', color: 'text-[#B87716]', Icon: Clock },
    en_attente: { label: 'En attente', color: 'text-[#B87716]', Icon: Clock },
    en_attente_validation: { label: 'À valider', color: 'text-[#B87716]', Icon: Clock },
    en_cours: { label: 'En cours', color: 'text-[#B87716]', Icon: Clock },
    maintenance: { label: 'Maintenance', color: 'text-[#B87716]', Icon: AlertTriangle },
    preavis: { label: 'Préavis', color: 'text-[#B87716]', Icon: AlertTriangle },
    trial: { label: 'Essai 14j', color: 'text-[#9A7422]', Icon: Info },
    en_retard: { label: 'En retard', color: 'text-[#D94B4B]', Icon: AlertCircle },
    urgente: { label: 'Urgente', color: 'text-[#D94B4B]', Icon: AlertCircle },
    haute: { label: 'Haute', color: 'text-[#D94B4B]', Icon: AlertTriangle },
    expire: { label: 'Expiré', color: 'text-[#66736D]', Icon: XCircle },
    resilie: { label: 'Résilié', color: 'text-[#66736D]', Icon: XCircle },
    rejete: { label: 'Rejeté', color: 'text-[#D94B4B]', Icon: XCircle },
    rejetee: { label: 'Rejetée', color: 'text-[#D94B4B]', Icon: XCircle },
    annule: { label: 'Annulé', color: 'text-[#66736D]', Icon: XCircle },
    suspended: { label: 'Suspendu', color: 'text-[#D94B4B]', Icon: XCircle },
    nouveau: { label: 'Nouveau', color: 'text-[#185C46]', Icon: Info },
    moyenne: { label: 'Moyenne', color: 'text-[#B87716]', Icon: Info },
    basse: { label: 'Basse', color: 'text-[#66736D]', Icon: Info },
    inactif: { label: 'Inactif', color: 'text-[#66736D]', Icon: XCircle },
    indisponible: { label: 'Indisponible', color: 'text-[#66736D]', Icon: XCircle },
  };

  const entry = map[status] || { label: status, color: 'text-[#66736D]', Icon: Info };
  const Icon = entry.Icon;

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${entry.color}`}>
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span>{entry.label}</span>
    </span>
  );
};

export const Modal: React.FC<{
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  maxWidth?: string;
  children: React.ReactNode;
}> = ({ open, onClose, title, subtitle, maxWidth = 'max-w-xl', children }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#123C32]/40 backdrop-blur-[2px] p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`w-full ${maxWidth} rounded-xl border border-[#E8EEEB] bg-white shadow-lg my-auto`}>
        <div className="flex items-start justify-between gap-4 border-b border-[#E8EEEB] px-6 py-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-[#123C32]">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-[#66736D]">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#66736D] hover:bg-[#F6F8F7] hover:text-[#123C32] transition-colors cursor-pointer"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-6 max-h-[80vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
};

export const ConfirmDialog: React.FC<{
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ open, title, message, confirmLabel = 'Confirmer', danger = false, loading = false, onConfirm, onCancel }) => {
  if (!open) return null;
  return (
    <Modal open={open} onClose={onCancel} title={title} maxWidth="max-w-md">
      <p className="text-sm text-[#66736D] leading-relaxed">{message}</p>
      <div className="mt-6 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-[#E8EEEB] bg-white px-4 py-2 text-sm font-medium text-[#123C32] hover:bg-[#F6F8F7] cursor-pointer whitespace-nowrap"
        >
          Annuler
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={onConfirm}
          className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 ${
            danger ? 'bg-[#D94B4B] hover:bg-[#b83838]' : 'bg-[#185C46] hover:bg-[#123C32]'
          }`}
        >
          {loading ? 'Traitement...' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
};

export const EmptyState: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}> = ({ icon, title, description, actionLabel, onAction }) => (
  <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#E8EEEB] bg-white px-6 py-12 text-center">
    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#F6F8F7] text-[#185C46]">
      {icon}
    </div>
    <h3 className="mt-4 font-display text-base font-semibold text-[#123C32]">{title}</h3>
    <p className="mt-1.5 max-w-md text-sm text-[#66736D]">{description}</p>
    {actionLabel && onAction && (
      <button
        type="button"
        onClick={onAction}
        className="mt-5 rounded-lg bg-[#185C46] px-4 py-2 text-sm font-medium text-white hover:bg-[#123C32] transition-colors cursor-pointer"
      >
        {actionLabel}
      </button>
    )}
  </div>
);

export const SkeletonRows: React.FC<{ rows?: number }> = ({ rows = 5 }) => (
  <div className="divide-y divide-[#E8EEEB] rounded-xl border border-[#E8EEEB] bg-white">
    {Array.from({ length: rows }).map((_, idx) => (
      <div key={idx} className="flex items-center justify-between gap-4 px-5 py-4 animate-pulse">
        <div className="h-4 w-44 rounded bg-[#E8EEEB]" />
        <div className="h-4 w-28 rounded bg-[#F6F8F7]" />
        <div className="h-4 w-24 rounded bg-[#E8EEEB]" />
      </div>
    ))}
  </div>
);
