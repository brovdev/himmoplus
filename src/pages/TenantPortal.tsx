import {
  AlertTriangle,
  Download,
  FileText,
  Home,
  LogOut,
  Plus,
  Receipt,
  Wrench,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { BrandLogo } from '../components/BrandLogo';
import { PWAInstallButton } from '../components/PWAInstallButton';
import { Modal, SkeletonRows, StatCard, StatusIndicator } from '../components/ui';
import { apiFetch } from '../lib/api';
import { downloadContractPDF, downloadReceiptPDF } from '../lib/exporters';
import { formatDateFR, formatPaymentMethod, formatPeriodFR, formatXOF } from '../lib/format';

interface TenantOverview {
  tenant: { id: number; full_name: string; phone: string; email: string };
  organization: { id: number; name: string; phone: string; address: string; stamp_text: string };
  contract: {
    reference: string;
    property_name: string;
    property_address: string;
    commune: string;
    start_date: string;
    end_date: string;
    monthly_rent_xof: number;
    deposit_xof: number;
    advance_xof: number;
    due_day: number;
    special_terms: string | null;
  } | null;
  invoices: Array<{
    id: number;
    period_label: string;
    due_date: string;
    amount_due_xof: number;
    amount_paid_xof: number;
    status: string;
  }>;
  payments: Array<{
    id: number;
    reference: string;
    amount_xof: number;
    payment_method: string;
    payment_date: string;
    verification_status: string;
    receipt_number: string | null;
    verification_token: string | null;
    balance_remaining_xof: number;
    period_label: string;
    property_name: string;
    property_address: string;
    transaction_ref: string | null;
  }>;
  maintenance: Array<{
    id: number;
    title: string;
    category: string;
    priority: string;
    status: string;
    created_at: string;
  }>;
  notifications: Array<{ id: number; title: string; message: string; created_at: string }>;
}

export const TenantPortal: React.FC<{ onLogout: () => void }> = ({ onLogout }) => {
  const [data, setData] = useState<TenantOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);

  const [mntModal, setMntModal] = useState(false);
  const [mntForm, setMntForm] = useState({ category: 'fuite_eau', title: '', description: '', priority: 'moyenne' });

  const [payModal, setPayModal] = useState(false);
  const [payForm, setPayForm] = useState({ invoiceId: '', amountXof: '', paymentMethod: 'wave', transactionRef: '' });

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<TenantOverview>('/api/tenant-portal/overview');
      setData(res);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSubmitMaintenance = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/api/tenant-portal/maintenance', { method: 'POST', body: JSON.stringify(mntForm) });
    setMntModal(false);
    setMntForm({ category: 'fuite_eau', title: '', description: '', priority: 'moyenne' });
    setBanner('Votre réclamation a été transmise au gestionnaire.');
    await loadData();
  };

  const handleDeclarePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await apiFetch<{ message: string }>('/api/tenant-portal/declare-payment', {
      method: 'POST',
      body: JSON.stringify(payForm),
    });
    setPayModal(false);
    setBanner(res.message);
    await loadData();
  };

  if (loading || !data) {
    return (
      <div className="min-h-screen bg-[#F6F8F7] p-6 max-w-5xl mx-auto">
        <SkeletonRows rows={6} />
      </div>
    );
  }

  const nextUnpaid = data.invoices.find((i) => i.status !== 'paye' && i.status !== 'annule');
  const totalUnpaid = data.invoices
    .filter((i) => i.status !== 'paye' && i.status !== 'annule')
    .reduce((s, i) => s + Math.max(0, i.amount_due_xof - i.amount_paid_xof), 0);

  return (
    <div className="min-h-screen bg-[#F6F8F7]">
      <header className="border-b border-[#E8EEEB] bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 h-16">
          <div className="flex items-center gap-3">
            <BrandLogo variant="dark" />
            <span className="hidden sm:inline text-xs font-medium text-[#66736D]">· Espace Locataire</span>
          </div>
          <div className="flex items-center gap-3">
            <PWAInstallButton compact />
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E8EEEB] px-3 py-1.5 text-xs font-semibold text-[#123C32] hover:bg-[#F6F8F7] cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Déconnexion</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-[#123C32]">Bonjour, {data.tenant.full_name}</h1>
            <p className="text-sm text-[#66736D]">
              Bailleur : {data.organization.name} · {data.contract ? data.contract.property_name : 'Aucun bail'}
            </p>
          </div>

          <div className="flex flex-wrap gap-2.5">
            {nextUnpaid && (
              <button
                type="button"
                onClick={() => {
                  setPayForm({
                    invoiceId: String(nextUnpaid.id),
                    amountXof: String(Math.max(0, nextUnpaid.amount_due_xof - nextUnpaid.amount_paid_xof)),
                    paymentMethod: 'wave',
                    transactionRef: '',
                  });
                  setPayModal(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#185C46] px-4 py-2 text-xs font-semibold text-white hover:bg-[#123C32] cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Déclarer un paiement</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setMntModal(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E8EEEB] bg-white px-4 py-2 text-xs font-semibold text-[#123C32] hover:bg-[#F6F8F7] cursor-pointer"
            >
              <Wrench className="h-3.5 w-3.5 text-[#185C46]" />
              <span>Signaler un incident</span>
            </button>
          </div>
        </div>

        {banner && (
          <div className="rounded-lg border border-[#185C46]/30 bg-[#EBF5F0] px-4 py-3 text-xs font-medium text-[#185C46]">
            {banner}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Logement occupé"
            value={data.contract?.property_name || '—'}
            sublabel={data.contract?.commune || ''}
            icon={<Home className="h-4 w-4" />}
          />
          <StatCard
            label="Loyer mensuel"
            value={data.contract ? formatXOF(data.contract.monthly_rent_xof) : '—'}
            sublabel={data.contract ? `Échéance le ${data.contract.due_day} du mois` : ''}
            icon={<FileText className="h-4 w-4" />}
          />
          <StatCard
            label="Solde dû / Impayés"
            value={formatXOF(totalUnpaid)}
            sublabel={nextUnpaid ? `Prochaine : ${formatDateFR(nextUnpaid.due_date)}` : 'Tout est à jour'}
            icon={<AlertTriangle className="h-4 w-4" />}
            tone={totalUnpaid > 0 ? 'danger' : 'success'}
          />
          <StatCard
            label="Quittances disponibles"
            value={String(data.payments.filter((p) => p.receipt_number).length)}
            sublabel="Téléchargement PDF + QR"
            icon={<Receipt className="h-4 w-4" />}
            tone="gold"
          />
        </div>

        {data.contract && (
          <div className="rounded-xl border border-[#E8EEEB] bg-white p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="text-xs space-y-1">
              <p className="font-display text-sm font-bold text-[#123C32]">
                Contrat de bail {data.contract.reference}
              </p>
              <p className="text-[#66736D]">
                Du {formatDateFR(data.contract.start_date)} au {formatDateFR(data.contract.end_date)} · Caution versée :{' '}
                <strong className="text-[#123C32]">{formatXOF(data.contract.deposit_xof)}</strong>
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                downloadContractPDF({
                  ...data.contract!,
                  tenant_name: data.tenant.full_name,
                  tenant_phone: data.tenant.phone,
                  organization_name: data.organization.name,
                })
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E8EEEB] bg-[#F6F8F7] px-3.5 py-2 text-xs font-semibold text-[#123C32] hover:bg-[#E8EEEB] cursor-pointer self-start sm:self-auto"
            >
              <Download className="h-3.5 w-3.5 text-[#185C46]" />
              <span>Télécharger mon contrat</span>
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 rounded-xl border border-[#E8EEEB] bg-white overflow-x-auto">
            <div className="border-b border-[#E8EEEB] px-5 py-4">
              <h2 className="font-display text-sm font-bold text-[#123C32]">Historique des paiements &amp; quittances</h2>
            </div>
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#E8EEEB] bg-[#F6F8F7] text-[#66736D]">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Période</th>
                  <th className="px-4 py-2.5 font-semibold">Mode &amp; Date</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Montant</th>
                  <th className="px-4 py-2.5 font-semibold">Statut</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Quittance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8EEEB]">
                {data.payments.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-3 font-semibold text-[#123C32]">{formatPeriodFR(p.period_label)}</td>
                    <td className="px-4 py-3 text-[#66736D]">
                      {formatPaymentMethod(p.payment_method)} · {formatDateFR(p.payment_date)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-[#123C32]">{formatXOF(p.amount_xof)}</td>
                    <td className="px-4 py-3">
                      <StatusIndicator status={p.verification_status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      {p.receipt_number && p.verification_token ? (
                        <button
                          type="button"
                          onClick={() =>
                            downloadReceiptPDF({
                              receipt_number: p.receipt_number!,
                              verification_token: p.verification_token!,
                              issued_at: p.payment_date,
                              balance_remaining_xof: p.balance_remaining_xof,
                              payment_ref: p.reference,
                              amount_xof: p.amount_xof,
                              payment_method: p.payment_method,
                              payment_date: p.payment_date,
                              transaction_ref: p.transaction_ref,
                              tenant_name: data.tenant.full_name,
                              tenant_phone: data.tenant.phone,
                              property_name: p.property_name,
                              property_address: p.property_address,
                              period_label: p.period_label,
                              organization_name: data.organization.name,
                              organization_address: data.organization.address,
                              stamp_text: data.organization.stamp_text,
                            })
                          }
                          className="inline-flex items-center gap-1 rounded border border-[#E8EEEB] px-2.5 py-1 text-xs font-semibold text-[#185C46] hover:bg-[#F6F8F7] cursor-pointer"
                        >
                          <Download className="h-3 w-3" />
                          <span>PDF</span>
                        </button>
                      ) : (
                        'En attente'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="lg:col-span-5 space-y-6">
            <div className="rounded-xl border border-[#E8EEEB] bg-white p-5">
              <h2 className="font-display text-sm font-bold text-[#123C32] mb-3">Mes réclamations techniques</h2>
              <div className="space-y-3 text-xs">
                {data.maintenance.length === 0 ? (
                  <p className="text-[#66736D]">Aucun incident signalé.</p>
                ) : (
                  data.maintenance.map((m) => (
                    <div key={m.id} className="flex items-center justify-between border-b border-[#E8EEEB] pb-2.5 last:border-0">
                      <div>
                        <p className="font-semibold text-[#123C32]">{m.title}</p>
                        <p className="text-[#66736D]">{formatDateFR(m.created_at)}</p>
                      </div>
                      <StatusIndicator status={m.status} />
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-xl border border-[#E8EEEB] bg-white p-5">
              <h2 className="font-display text-sm font-bold text-[#123C32] mb-3">Notifications reçues</h2>
              <div className="space-y-3 text-xs">
                {data.notifications.map((n) => (
                  <div key={n.id} className="border-b border-[#E8EEEB] pb-2.5 last:border-0">
                    <p className="font-semibold text-[#123C32]">{n.title}</p>
                    <p className="mt-0.5 text-[#66736D]">{n.message}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      <Modal open={mntModal} onClose={() => setMntModal(false)} title="Signaler un problème dans le logement">
        <form onSubmit={handleSubmitMaintenance} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#123C32] mb-1">Catégorie</label>
              <select
                value={mntForm.category}
                onChange={(e) => setMntForm({ ...mntForm, category: e.target.value })}
                className="w-full rounded-lg border border-[#E8EEEB] bg-white px-3 py-2 text-sm"
              >
                <option value="fuite_eau">Fuite d’eau</option>
                <option value="electricite">Problème électrique</option>
                <option value="serrure">Serrure défectueuse</option>
                <option value="toiture">Toiture</option>
                <option value="degradation">Dégradation</option>
                <option value="autre">Autre incident</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#123C32] mb-1">Urgence</label>
              <select
                value={mntForm.priority}
                onChange={(e) => setMntForm({ ...mntForm, priority: e.target.value })}
                className="w-full rounded-lg border border-[#E8EEEB] bg-white px-3 py-2 text-sm"
              >
                <option value="basse">Basse</option>
                <option value="moyenne">Moyenne</option>
                <option value="haute">Haute</option>
                <option value="urgente">Urgente</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#123C32] mb-1">Titre *</label>
            <input
              type="text"
              required
              value={mntForm.title}
              onChange={(e) => setMntForm({ ...mntForm, title: e.target.value })}
              className="w-full rounded-lg border border-[#E8EEEB] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#123C32] mb-1">Détails *</label>
            <textarea
              rows={3}
              required
              value={mntForm.description}
              onChange={(e) => setMntForm({ ...mntForm, description: e.target.value })}
              className="w-full rounded-lg border border-[#E8EEEB] px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setMntModal(false)} className="rounded-lg border border-[#E8EEEB] px-4 py-2 text-sm">
              Annuler
            </button>
            <button type="submit" className="rounded-lg bg-[#185C46] px-5 py-2 text-sm font-semibold text-white">
              Envoyer
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={payModal}
        onClose={() => setPayModal(false)}
        title="Déclarer une référence de paiement"
        subtitle="Le paiement sera confirmé et quittancé après vérification par votre gestionnaire"
      >
        <form onSubmit={handleDeclarePayment} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#123C32] mb-1">Mode utilisé</label>
              <select
                value={payForm.paymentMethod}
                onChange={(e) => setPayForm({ ...payForm, paymentMethod: e.target.value })}
                className="w-full rounded-lg border border-[#E8EEEB] bg-white px-3 py-2 text-sm"
              >
                <option value="wave">Wave</option>
                <option value="orange_money">Orange Money</option>
                <option value="mtn_money">MTN Mobile Money</option>
                <option value="moov_money">Moov Money</option>
                <option value="virement">Virement bancaire</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#123C32] mb-1">Montant (FCFA)</label>
              <input
                type="number"
                required
                value={payForm.amountXof}
                onChange={(e) => setPayForm({ ...payForm, amountXof: e.target.value })}
                className="w-full rounded-lg border border-[#E8EEEB] px-3 py-2 text-sm font-mono"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#123C32] mb-1">Référence exacte de transaction *</label>
            <input
              type="text"
              required
              value={payForm.transactionRef}
              onChange={(e) => setPayForm({ ...payForm, transactionRef: e.target.value })}
              placeholder="Ex. T261115.1022.B89210"
              className="w-full rounded-lg border border-[#E8EEEB] px-3 py-2 text-sm font-mono"
            />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setPayModal(false)} className="rounded-lg border border-[#E8EEEB] px-4 py-2 text-sm">
              Annuler
            </button>
            <button type="submit" className="rounded-lg bg-[#185C46] px-5 py-2 text-sm font-semibold text-white">
              Transmettre la référence
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
