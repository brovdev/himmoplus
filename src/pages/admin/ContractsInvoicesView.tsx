import {
  Check,
  Download,
  FileText,
  Plus,
  RefreshCw,
  Share2,
  X,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { EmptyState, Modal, SkeletonRows, StatCard, StatusIndicator } from '../../components/ui';
import { apiFetch } from '../../lib/api';
import { downloadContractPDF, downloadReceiptPDF, type ReceiptExportData } from '../../lib/exporters';
import { formatDateFR, formatPaymentMethod, formatPeriodFR, formatXOF } from '../../lib/format';

interface ContractRow {
  id: number;
  property_id: number;
  tenant_id: number;
  reference: string;
  property_name: string;
  commune: string;
  tenant_name: string;
  tenant_phone: string;
  start_date: string;
  end_date: string;
  monthly_rent_xof: number;
  deposit_xof: number;
  advance_xof: number;
  due_day: number;
  special_terms: string | null;
  status: string;
  days_remaining: number;
}

interface InvoiceRow {
  id: number;
  property_name: string;
  tenant_name: string;
  contract_ref: string;
  period_label: string;
  due_date: string;
  amount_due_xof: number;
  penalty_xof: number;
  discount_xof: number;
  amount_paid_xof: number;
  status: string;
}

interface PaymentRow {
  id: number;
  reference: string;
  amount_xof: number;
  payment_method: string;
  transaction_ref: string | null;
  payment_date: string;
  verification_status: string;
  property_name: string;
  tenant_name: string;
  period_label: string;
  receipt_id: number | null;
  receipt_number: string | null;
}

export const ContractsInvoicesView: React.FC<{
  orgId: number;
  orgName: string;
  section: 'contracts' | 'invoices' | 'payments' | 'receipts';
}> = ({ orgId, orgName, section }) => {
  const [loading, setLoading] = useState(true);
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [receipts, setReceipts] = useState<ReceiptExportData[]>([]);
  const [properties, setProperties] = useState<Array<{ id: number; name: string; monthly_rent_xof: number }>>([]);
  const [tenants, setTenants] = useState<Array<{ id: number; full_name: string }>>([]);

  const [contractFilter, setContractFilter] = useState<'all' | 'actif' | 'expiring' | 'expire'>('all');
  const [invoicePeriodFilter, setInvoicePeriodFilter] = useState('all');
  const [genPeriod, setGenPeriod] = useState('2026-12');
  const [banner, setBanner] = useState<{ ok: boolean; text: string } | null>(null);

  // Modals
  const [contractModal, setContractModal] = useState(false);
  const [renewTarget, setRenewTarget] = useState<ContractRow | null>(null);
  const [payModalInvoice, setPayModalInvoice] = useState<InvoiceRow | null>(null);
  const [saving, setSaving] = useState(false);

  const [contractForm, setContractForm] = useState({
    propertyId: '',
    tenantId: '',
    startDate: '2026-11-15',
    endDate: '2027-11-14',
    monthlyRentXof: '250000',
    depositXof: '500000',
    advanceXof: '500000',
    dueDay: '5',
    specialTerms: '',
  });

  const [renewForm, setRenewForm] = useState({ newEndDate: '', newMonthlyRentXof: '' });
  const [payForm, setPayForm] = useState({
    invoiceId: '',
    amountXof: '',
    paymentMethod: 'wave',
    transactionRef: '',
    paymentDate: new Date().toISOString().slice(0, 10),
    notes: '',
  });

  const loadAll = async () => {
    setLoading(true);
    try {
      const [cRes, iRes, pRes, rRes, propRes, tenRes] = await Promise.all([
        apiFetch<{ contracts: ContractRow[] }>('/api/contracts', {}, orgId),
        apiFetch<{ invoices: InvoiceRow[] }>('/api/invoices', {}, orgId),
        apiFetch<{ payments: PaymentRow[] }>('/api/payments', {}, orgId),
        apiFetch<{ receipts: ReceiptExportData[] }>('/api/receipts', {}, orgId),
        apiFetch<{ properties: Array<{ id: number; name: string; monthly_rent_xof: number }> }>('/api/properties', {}, orgId),
        apiFetch<{ tenants: Array<{ id: number; full_name: string }> }>('/api/tenants', {}, orgId),
      ]);
      setContracts(cRes.contracts);
      setInvoices(iRes.invoices);
      setPayments(pRes.payments);
      setReceipts(rRes.receipts);
      setProperties(propRes.properties);
      setTenants(tenRes.tenants);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [orgId]);

  const handleCreateContract = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setBanner(null);
    try {
      await apiFetch('/api/contracts', { method: 'POST', body: JSON.stringify(contractForm) }, orgId);
      setContractModal(false);
      setBanner({ ok: true, text: 'Contrat de bail enregistré et bien marqué comme occupé.' });
      await loadAll();
    } catch (err) {
      setBanner({ ok: false, text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const handleRenewContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renewTarget) return;
    setSaving(true);
    try {
      await apiFetch(`/api/contracts/${renewTarget.id}/renew`, { method: 'POST', body: JSON.stringify(renewForm) }, orgId);
      setRenewTarget(null);
      setBanner({ ok: true, text: 'Contrat renouvelé avec conservation de l’historique.' });
      await loadAll();
    } catch (err) {
      setBanner({ ok: false, text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateInvoices = async () => {
    setSaving(true);
    setBanner(null);
    try {
      const res = await apiFetch<{ message: string }>('/api/invoices/generate', {
        method: 'POST',
        body: JSON.stringify({ periodLabel: genPeriod }),
      }, orgId);
      setBanner({ ok: true, text: res.message });
      await loadAll();
    } catch (err) {
      setBanner({ ok: false, text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const openPaymentModal = (inv?: InvoiceRow) => {
    const target = inv || invoices.find((i) => i.status !== 'paye' && i.status !== 'annule') || null;
    if (!target) {
      setBanner({ ok: false, text: 'Aucune échéance impayée disponible à encaisser.' });
      return;
    }
    const remaining = Math.max(0, target.amount_due_xof + target.penalty_xof - target.discount_xof - target.amount_paid_xof);
    setPayForm({
      invoiceId: String(target.id),
      amountXof: String(remaining),
      paymentMethod: 'wave',
      transactionRef: '',
      paymentDate: new Date().toISOString().slice(0, 10),
      notes: '',
    });
    setPayModalInvoice(target);
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setBanner(null);
    try {
      const res = await apiFetch<{ receiptNumber: string }>('/api/payments', {
        method: 'POST',
        body: JSON.stringify(payForm),
      }, orgId);
      setPayModalInvoice(null);
      setBanner({ ok: true, text: `Paiement confirmé et quittance ${res.receiptNumber} générée automatiquement.` });
      await loadAll();
    } catch (err) {
      setBanner({ ok: false, text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const handleValidateOffline = async (paymentId: number, action: 'confirme' | 'rejete') => {
    await apiFetch(`/api/payments/${paymentId}/validate`, { method: 'POST', body: JSON.stringify({ action }) }, orgId);
    setBanner({
      ok: true,
      text: action === 'confirme' ? 'Paiement validé et quittance émise.' : 'Déclaration de paiement rejetée.',
    });
    await loadAll();
  };

  const shareWhatsApp = (r: ReceiptExportData) => {
    const text = `Bonjour ${r.tenant_name}, votre quittance IMMOPAY CI N° ${r.receipt_number} d'un montant de ${formatXOF(r.amount_xof)} pour ${r.property_name} (${formatPeriodFR(r.period_label)}) est confirmée. Vérification : ${window.location.origin}/?verify=${r.verification_token}`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  if (loading) return <SkeletonRows rows={6} />;

  const filteredContracts = contracts.filter((c) => {
    if (contractFilter === 'actif') return c.status === 'actif';
    if (contractFilter === 'expiring') return c.status === 'actif' && c.days_remaining <= 90;
    if (contractFilter === 'expire') return c.status === 'expire' || c.status === 'resilie';
    return true;
  });

  const filteredInvoices = invoices.filter((i) => invoicePeriodFilter === 'all' || i.period_label === invoicePeriodFilter);
  const periods = Array.from(new Set(invoices.map((i) => i.period_label)));

  const totalConfirmed = payments.filter((p) => p.verification_status === 'confirme').reduce((s, p) => s + p.amount_xof, 0);
  const pendingValidationCount = payments.filter((p) => p.verification_status === 'en_attente_validation').length;
  const partialCount = invoices.filter((i) => i.status === 'partiel').length;
  const overdueCount = invoices.filter((i) => i.status === 'en_retard').length;

  return (
    <div className="space-y-6">
      {banner && (
        <div
          className={`flex items-center justify-between rounded-lg border px-4 py-3 text-xs font-medium ${
            banner.ok
              ? 'border-[#185C46]/30 bg-[#EBF5F0] text-[#185C46]'
              : 'border-[#D94B4B]/30 bg-[#FDECEC] text-[#D94B4B]'
          }`}
        >
          <span>{banner.text}</span>
          <button type="button" onClick={() => setBanner(null)} className="cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* CONTRACTS */}
      {section === 'contracts' && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl font-bold text-[#123C32]">Contrats de bail</h1>
              <p className="mt-0.5 text-sm text-[#66736D]">
                Suivi des baux actifs, renouvellements et alertes d’expiration (90 / 60 / 30 jours)
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setContractForm({
                  ...contractForm,
                  propertyId: properties[0]?.id ? String(properties[0].id) : '',
                  tenantId: tenants[0]?.id ? String(tenants[0].id) : '',
                  monthlyRentXof: properties[0]?.monthly_rent_xof ? String(properties[0].monthly_rent_xof) : '250000',
                });
                setContractModal(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#185C46] px-4 py-2 text-xs font-semibold text-white hover:bg-[#123C32] cursor-pointer whitespace-nowrap self-start sm:self-auto"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Nouveau contrat</span>
            </button>
          </div>

          <div className="inline-flex flex-wrap gap-1 rounded-lg border border-[#E8EEEB] bg-white p-1">
            {[
              { id: 'all', label: `Tous (${contracts.length})` },
              { id: 'actif', label: 'Actifs' },
              { id: 'expiring', label: 'Expirant bientôt (≤ 90j)' },
              { id: 'expire', label: 'Expirés' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setContractFilter(t.id as typeof contractFilter)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                  contractFilter === t.id ? 'bg-[#123C32] text-white' : 'text-[#66736D] hover:text-[#123C32]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="rounded-xl border border-[#E8EEEB] bg-white overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#E8EEEB] bg-[#F6F8F7] text-[#66736D]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Référence</th>
                  <th className="px-4 py-3 font-semibold">Bien &amp; Locataire</th>
                  <th className="px-4 py-3 font-semibold">Période</th>
                  <th className="px-4 py-3 font-semibold text-right">Loyer</th>
                  <th className="px-4 py-3 font-semibold">Statut</th>
                  <th className="px-4 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8EEEB]">
                {filteredContracts.map((c) => (
                  <tr key={c.id} className="hover:bg-[#F6F8F7]/60">
                    <td className="px-4 py-3 font-mono font-semibold text-[#123C32]">{c.reference}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-[#123C32]">{c.property_name}</p>
                      <p className="text-[#66736D]">{c.tenant_name}</p>
                    </td>
                    <td className="px-4 py-3 text-[#66736D]">
                      <p>
                        {formatDateFR(c.start_date)} → {formatDateFR(c.end_date)}
                      </p>
                      {c.status === 'actif' && c.days_remaining <= 90 && (
                        <p className="text-[11px] font-semibold text-[#B87716]">Expire dans {c.days_remaining} jours</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-[#123C32] tabular-nums">
                      {formatXOF(c.monthly_rent_xof)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusIndicator status={c.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => downloadContractPDF({ ...c, organization_name: orgName })}
                          className="inline-flex items-center gap-1 rounded-lg border border-[#E8EEEB] px-2.5 py-1.5 font-medium text-[#123C32] hover:bg-[#F6F8F7] cursor-pointer"
                          title="Télécharger le contrat PDF"
                        >
                          <Download className="h-3.5 w-3.5 text-[#185C46]" />
                          <span>PDF</span>
                        </button>
                        {c.status === 'actif' && (
                          <button
                            type="button"
                            onClick={() => {
                              setRenewTarget(c);
                              setRenewForm({
                                newEndDate: `${Number(c.end_date.slice(0, 4)) + 1}${c.end_date.slice(4)}`,
                                newMonthlyRentXof: String(c.monthly_rent_xof),
                              });
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-[#E8EEEB] px-2.5 py-1.5 font-medium text-[#185C46] hover:bg-[#EBF5F0] cursor-pointer"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            <span>Renouveler</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* RENT INVOICES */}
      {section === 'invoices' && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl font-bold text-[#123C32]">Loyers &amp; Échéances</h1>
              <p className="mt-0.5 text-sm text-[#66736D]">
                Génération mensuelle sans doublon à partir des contrats actifs et rapprochement des encaissements
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="month"
                value={genPeriod}
                onChange={(e) => setGenPeriod(e.target.value)}
                className="rounded-lg border border-[#E8EEEB] bg-white px-3 py-2 text-xs font-semibold text-[#123C32]"
              />
              <button
                type="button"
                disabled={saving}
                onClick={handleGenerateInvoices}
                className="rounded-lg bg-[#185C46] px-4 py-2 text-xs font-semibold text-white hover:bg-[#123C32] cursor-pointer whitespace-nowrap"
              >
                Générer les loyers
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-xs font-medium text-[#66736D]">Filtrer par mois :</label>
            <select
              value={invoicePeriodFilter}
              onChange={(e) => setInvoicePeriodFilter(e.target.value)}
              className="rounded-lg border border-[#E8EEEB] bg-white px-3 py-1.5 text-xs font-semibold text-[#123C32]"
            >
              <option value="all">Toutes les périodes</option>
              {periods.map((p) => (
                <option key={p} value={p}>
                  {formatPeriodFR(p)}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-xl border border-[#E8EEEB] bg-white overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#E8EEEB] bg-[#F6F8F7] text-[#66736D]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Période</th>
                  <th className="px-4 py-3 font-semibold">Locataire &amp; Bien</th>
                  <th className="px-4 py-3 font-semibold">Échéance</th>
                  <th className="px-4 py-3 font-semibold text-right">Dû</th>
                  <th className="px-4 py-3 font-semibold text-right">Encaissé</th>
                  <th className="px-4 py-3 font-semibold text-right">Reste</th>
                  <th className="px-4 py-3 font-semibold">Statut</th>
                  <th className="px-4 py-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8EEEB]">
                {filteredInvoices.map((inv) => {
                  const netDue = Math.max(0, inv.amount_due_xof + inv.penalty_xof - inv.discount_xof);
                  const remaining = Math.max(0, netDue - inv.amount_paid_xof);
                  return (
                    <tr key={inv.id} className="hover:bg-[#F6F8F7]/60">
                      <td className="px-4 py-3 font-semibold text-[#123C32]">{formatPeriodFR(inv.period_label)}</td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-[#123C32]">{inv.tenant_name}</p>
                        <p className="text-[#66736D]">{inv.property_name}</p>
                      </td>
                      <td className="px-4 py-3 text-[#66736D]">{formatDateFR(inv.due_date)}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">{formatXOF(netDue)}</td>
                      <td className="px-4 py-3 text-right font-mono text-[#185C46] tabular-nums">
                        {formatXOF(inv.amount_paid_xof)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-[#123C32] tabular-nums">
                        {formatXOF(remaining)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusIndicator status={inv.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        {remaining > 0 ? (
                          <button
                            type="button"
                            onClick={() => openPaymentModal(inv)}
                            className="rounded-lg bg-[#185C46] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#123C32] cursor-pointer"
                          >
                            Encaisser
                          </button>
                        ) : (
                          <span className="text-[#66736D]">Soldé</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* PAYMENTS */}
      {section === 'payments' && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl font-bold text-[#123C32]">Paiements</h1>
              <p className="mt-0.5 text-sm text-[#66736D]">
                Wave, Orange Money, MTN Moov, virement, espèces et rapprochement de trésorerie
              </p>
            </div>
            <button
              type="button"
              onClick={() => openPaymentModal()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#185C46] px-4 py-2 text-xs font-semibold text-white hover:bg-[#123C32] cursor-pointer self-start sm:self-auto"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Enregistrer un paiement</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total encaissé confirmé" value={formatXOF(totalConfirmed)} icon={<Check className="h-4 w-4" />} tone="success" />
            <StatCard label="À valider manuellement" value={String(pendingValidationCount)} icon={<FileText className="h-4 w-4" />} tone="warning" />
            <StatCard label="Paiements partiels" value={String(partialCount)} icon={<FileText className="h-4 w-4" />} tone="gold" />
            <StatCard label="Échéances en retard" value={String(overdueCount)} icon={<FileText className="h-4 w-4" />} tone="danger" />
          </div>

          <div className="rounded-xl border border-[#E8EEEB] bg-white overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#E8EEEB] bg-[#F6F8F7] text-[#66736D]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Référence</th>
                  <th className="px-4 py-3 font-semibold">Locataire &amp; Bien</th>
                  <th className="px-4 py-3 font-semibold">Période</th>
                  <th className="px-4 py-3 font-semibold">Mode</th>
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold text-right">Montant</th>
                  <th className="px-4 py-3 font-semibold">Statut</th>
                  <th className="px-4 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8EEEB]">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-[#F6F8F7]/60">
                    <td className="px-4 py-3">
                      <p className="font-mono font-semibold text-[#123C32]">{p.reference}</p>
                      {p.transaction_ref && <p className="font-mono text-[11px] text-[#66736D]">{p.transaction_ref}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-[#123C32]">{p.tenant_name}</p>
                      <p className="text-[#66736D]">{p.property_name}</p>
                    </td>
                    <td className="px-4 py-3 text-[#66736D]">{formatPeriodFR(p.period_label)}</td>
                    <td className="px-4 py-3 font-medium text-[#123C32]">{formatPaymentMethod(p.payment_method)}</td>
                    <td className="px-4 py-3 text-[#66736D]">{formatDateFR(p.payment_date)}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-[#123C32] tabular-nums">
                      {formatXOF(p.amount_xof)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusIndicator status={p.verification_status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      {p.verification_status === 'en_attente_validation' ? (
                        <div className="inline-flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleValidateOffline(p.id, 'confirme')}
                            className="rounded bg-[#185C46] px-2.5 py-1 text-[11px] font-semibold text-white cursor-pointer"
                          >
                            Valider
                          </button>
                          <button
                            type="button"
                            onClick={() => handleValidateOffline(p.id, 'rejete')}
                            className="rounded bg-[#FDECEC] px-2.5 py-1 text-[11px] font-semibold text-[#D94B4B] cursor-pointer"
                          >
                            Rejeter
                          </button>
                        </div>
                      ) : p.receipt_number ? (
                        <button
                          type="button"
                          onClick={() => {
                            const rec = receipts.find((r) => r.receipt_number === p.receipt_number);
                            if (rec) downloadReceiptPDF(rec);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-[#E8EEEB] px-2.5 py-1 text-xs font-medium text-[#123C32] hover:bg-[#F6F8F7] cursor-pointer"
                        >
                          <Download className="h-3.5 w-3.5 text-[#185C46]" />
                          <span>Reçu</span>
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* RECEIPTS */}
      {section === 'receipts' && (
        <>
          <div>
            <h1 className="font-display text-2xl font-bold text-[#123C32]">Reçus &amp; Quittances automatiques</h1>
            <p className="mt-0.5 text-sm text-[#66736D]">
              Chaque quittance PDF inclut le cachet de votre organisation et un QR code de vérification unique
            </p>
          </div>

          {receipts.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-6 w-6" />}
              title="Aucune quittance émise"
              description="Les quittances sont générées automatiquement dès qu'un paiement de loyer est confirmé."
            />
          ) : (
            <div className="rounded-xl border border-[#E8EEEB] bg-white overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#E8EEEB] bg-[#F6F8F7] text-[#66736D]">
                  <tr>
                    <th className="px-4 py-3 font-semibold">N° Quittance</th>
                    <th className="px-4 py-3 font-semibold">Locataire &amp; Bien</th>
                    <th className="px-4 py-3 font-semibold">Période</th>
                    <th className="px-4 py-3 font-semibold">Mode</th>
                    <th className="px-4 py-3 font-semibold text-right">Montant reçu</th>
                    <th className="px-4 py-3 font-semibold text-right">Solde restant</th>
                    <th className="px-4 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8EEEB]">
                  {receipts.map((r) => (
                    <tr key={r.receipt_number} className="hover:bg-[#F6F8F7]/60">
                      <td className="px-4 py-3">
                        <p className="font-mono font-semibold text-[#123C32]">{r.receipt_number}</p>
                        <p className="font-mono text-[10px] text-[#66736D]">QR : {r.verification_token.slice(0, 10)}…</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-[#123C32]">{r.tenant_name}</p>
                        <p className="text-[#66736D]">{r.property_name}</p>
                      </td>
                      <td className="px-4 py-3 text-[#66736D]">{formatPeriodFR(r.period_label)}</td>
                      <td className="px-4 py-3 text-[#123C32]">{formatPaymentMethod(r.payment_method)}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-[#185C46] tabular-nums">
                        {formatXOF(r.amount_xof)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-[#66736D]">
                        {formatXOF(r.balance_remaining_xof)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => downloadReceiptPDF(r)}
                            className="inline-flex items-center gap-1 rounded-lg bg-[#185C46] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#123C32] cursor-pointer"
                          >
                            <Download className="h-3.5 w-3.5" />
                            <span>PDF</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => shareWhatsApp(r)}
                            className="inline-flex items-center gap-1 rounded-lg border border-[#E8EEEB] bg-white px-2.5 py-1.5 text-xs font-medium text-[#123C32] hover:bg-[#F6F8F7] cursor-pointer"
                            title="Partager par WhatsApp"
                          >
                            <Share2 className="h-3.5 w-3.5 text-[#185C46]" />
                            <span>WhatsApp</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* CREATE CONTRACT MODAL */}
      <Modal
        open={contractModal}
        onClose={() => setContractModal(false)}
        title="Nouveau contrat de bail"
        subtitle="Associez un bien et un locataire pour automatiser les échéances"
      >
        <form onSubmit={handleCreateContract} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#123C32] mb-1">Bien immobilier *</label>
              <select
                required
                value={contractForm.propertyId}
                onChange={(e) => {
                  const p = properties.find((x) => String(x.id) === e.target.value);
                  setContractForm({
                    ...contractForm,
                    propertyId: e.target.value,
                    monthlyRentXof: p ? String(p.monthly_rent_xof) : contractForm.monthlyRentXof,
                  });
                }}
                className="w-full rounded-lg border border-[#E8EEEB] bg-white px-3 py-2 text-sm"
              >
                {properties.map((p) => (
                  <option key={p.id} value={String(p.id)}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#123C32] mb-1">Locataire *</label>
              <select
                required
                value={contractForm.tenantId}
                onChange={(e) => setContractForm({ ...contractForm, tenantId: e.target.value })}
                className="w-full rounded-lg border border-[#E8EEEB] bg-white px-3 py-2 text-sm"
              >
                {tenants.map((t) => (
                  <option key={t.id} value={String(t.id)}>
                    {t.full_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#123C32] mb-1">Date de début *</label>
              <input
                type="date"
                required
                value={contractForm.startDate}
                onChange={(e) => setContractForm({ ...contractForm, startDate: e.target.value })}
                className="w-full rounded-lg border border-[#E8EEEB] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#123C32] mb-1">Date de fin *</label>
              <input
                type="date"
                required
                value={contractForm.endDate}
                onChange={(e) => setContractForm({ ...contractForm, endDate: e.target.value })}
                className="w-full rounded-lg border border-[#E8EEEB] px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#123C32] mb-1">Loyer (FCFA)</label>
              <input
                type="number"
                required
                value={contractForm.monthlyRentXof}
                onChange={(e) => setContractForm({ ...contractForm, monthlyRentXof: e.target.value })}
                className="w-full rounded-lg border border-[#E8EEEB] px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#123C32] mb-1">Caution</label>
              <input
                type="number"
                value={contractForm.depositXof}
                onChange={(e) => setContractForm({ ...contractForm, depositXof: e.target.value })}
                className="w-full rounded-lg border border-[#E8EEEB] px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#123C32] mb-1">Avance</label>
              <input
                type="number"
                value={contractForm.advanceXof}
                onChange={(e) => setContractForm({ ...contractForm, advanceXof: e.target.value })}
                className="w-full rounded-lg border border-[#E8EEEB] px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#123C32] mb-1">Jour échéance</label>
              <input
                type="number"
                min={1}
                max={28}
                value={contractForm.dueDay}
                onChange={(e) => setContractForm({ ...contractForm, dueDay: e.target.value })}
                className="w-full rounded-lg border border-[#E8EEEB] px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#123C32] mb-1">Conditions particulières</label>
            <textarea
              rows={2}
              value={contractForm.specialTerms}
              onChange={(e) => setContractForm({ ...contractForm, specialTerms: e.target.value })}
              className="w-full rounded-lg border border-[#E8EEEB] px-3 py-2 text-sm"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setContractModal(false)}
              className="rounded-lg border border-[#E8EEEB] px-4 py-2 text-sm font-medium text-[#123C32] cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[#185C46] px-5 py-2 text-sm font-semibold text-white hover:bg-[#123C32] cursor-pointer"
            >
              {saving ? 'Enregistrement...' : 'Créer le contrat'}
            </button>
          </div>
        </form>
      </Modal>

      {/* RENEW CONTRACT MODAL */}
      <Modal
        open={Boolean(renewTarget)}
        onClose={() => setRenewTarget(null)}
        title={`Renouveler ${renewTarget?.reference || ''}`}
        subtitle="L’ancien bail sera archivé et un nouveau bail actif sera créé"
      >
        <form onSubmit={handleRenewContract} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#123C32] mb-1">Nouvelle date de fin *</label>
            <input
              type="date"
              required
              value={renewForm.newEndDate}
              onChange={(e) => setRenewForm({ ...renewForm, newEndDate: e.target.value })}
              className="w-full rounded-lg border border-[#E8EEEB] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#123C32] mb-1">Nouveau loyer mensuel (FCFA)</label>
            <input
              type="number"
              required
              value={renewForm.newMonthlyRentXof}
              onChange={(e) => setRenewForm({ ...renewForm, newMonthlyRentXof: e.target.value })}
              className="w-full rounded-lg border border-[#E8EEEB] px-3 py-2 text-sm font-mono"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setRenewTarget(null)}
              className="rounded-lg border border-[#E8EEEB] px-4 py-2 text-sm font-medium text-[#123C32] cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[#185C46] px-5 py-2 text-sm font-semibold text-white hover:bg-[#123C32] cursor-pointer"
            >
              Confirmer le renouvellement
            </button>
          </div>
        </form>
      </Modal>

      {/* RECORD PAYMENT MODAL */}
      <Modal
        open={Boolean(payModalInvoice)}
        onClose={() => setPayModalInvoice(null)}
        title="Enregistrer un paiement de loyer"
        subtitle={
          payModalInvoice
            ? `${payModalInvoice.tenant_name} · ${payModalInvoice.property_name} (${formatPeriodFR(payModalInvoice.period_label)})`
            : ''
        }
      >
        <form onSubmit={handleRecordPayment} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#123C32] mb-1">Échéance concernée</label>
            <select
              value={payForm.invoiceId}
              onChange={(e) => {
                const inv = invoices.find((i) => String(i.id) === e.target.value);
                if (inv) {
                  const rem = Math.max(0, inv.amount_due_xof + inv.penalty_xof - inv.discount_xof - inv.amount_paid_xof);
                  setPayForm({ ...payForm, invoiceId: e.target.value, amountXof: String(rem) });
                }
              }}
              className="w-full rounded-lg border border-[#E8EEEB] bg-white px-3 py-2 text-sm"
            >
              {invoices
                .filter((i) => i.status !== 'paye' && i.status !== 'annule')
                .map((i) => (
                  <option key={i.id} value={String(i.id)}>
                    {i.tenant_name} — {i.property_name} ({formatPeriodFR(i.period_label)}) : reste{' '}
                    {formatXOF(Math.max(0, i.amount_due_xof + i.penalty_xof - i.discount_xof - i.amount_paid_xof))}
                  </option>
                ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#123C32] mb-1">Montant encaissé (FCFA) *</label>
              <input
                type="number"
                required
                min={100}
                value={payForm.amountXof}
                onChange={(e) => setPayForm({ ...payForm, amountXof: e.target.value })}
                className="w-full rounded-lg border border-[#E8EEEB] px-3 py-2 text-sm font-mono font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#123C32] mb-1">Mode de paiement *</label>
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
                <option value="especes">Espèces</option>
                <option value="cheque">Chèque</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#123C32] mb-1">Référence transaction</label>
              <input
                type="text"
                value={payForm.transactionRef}
                onChange={(e) => setPayForm({ ...payForm, transactionRef: e.target.value })}
                placeholder="Ex. TX-WV-992814"
                className="w-full rounded-lg border border-[#E8EEEB] px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#123C32] mb-1">Date de paiement *</label>
              <input
                type="date"
                required
                value={payForm.paymentDate}
                onChange={(e) => setPayForm({ ...payForm, paymentDate: e.target.value })}
                className="w-full rounded-lg border border-[#E8EEEB] px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setPayModalInvoice(null)}
              className="rounded-lg border border-[#E8EEEB] px-4 py-2 text-sm font-medium text-[#123C32] cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[#185C46] px-5 py-2 text-sm font-semibold text-white hover:bg-[#123C32] cursor-pointer"
            >
              {saving ? 'Validation...' : 'Confirmer & émettre quittance'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
