import { Eye, Plus, Search, Users } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { EmptyState, Modal, SkeletonRows, StatusIndicator } from '../../components/ui';
import { apiFetch } from '../../lib/api';
import { formatDateFR, formatPaymentMethod, formatXOF } from '../../lib/format';

interface TenantRow {
  id: number;
  full_name: string;
  phone: string;
  email: string | null;
  profession: string | null;
  status: string;
  contract_ref: string | null;
  monthly_rent_xof: number | null;
  property_name: string | null;
  next_due_date: string | null;
  balance_due_xof: number;
}

interface TenantDetail {
  tenant: {
    id: number;
    full_name: string;
    phone: string;
    email: string | null;
    current_address: string | null;
    profession: string | null;
    emergency_contact: string | null;
    id_number: string | null;
    status: string;
    created_at: string;
  };
  contracts: Array<{
    id: number;
    reference: string;
    property_name: string;
    start_date: string;
    end_date: string;
    monthly_rent_xof: number;
    deposit_xof: number;
    advance_xof: number;
    status: string;
  }>;
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
    receipt_number: string | null;
    period_label: string;
  }>;
  maintenance: Array<{
    id: number;
    title: string;
    priority: string;
    status: string;
    created_at: string;
  }>;
  notifications: Array<{
    id: number;
    channel: string;
    title: string;
    message: string;
    created_at: string;
  }>;
}

export const TenantsView: React.FC<{ orgId: number }> = ({ orgId }) => {
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [detail, setDetail] = useState<TenantDetail | null>(null);
  const [detailTab, setDetailTab] = useState<'info' | 'contracts' | 'payments' | 'maintenance' | 'history'>('info');

  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    email: '',
    currentAddress: '',
    profession: '',
    emergencyContact: '',
    idNumber: '',
  });

  const loadTenants = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ tenants: TenantRow[] }>('/api/tenants', {}, orgId);
      setTenants(res.tenants);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTenants();
  }, [orgId]);

  const openDetail = async (tenantId: number) => {
    const res = await apiFetch<TenantDetail>(`/api/tenants/${tenantId}`, {}, orgId);
    setDetail(res);
    setDetailTab('info');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiFetch('/api/tenants', { method: 'POST', body: JSON.stringify(form) }, orgId);
      setCreateOpen(false);
      setForm({ fullName: '', phone: '', email: '', currentAddress: '', profession: '', emergencyContact: '', idNumber: '' });
      await loadTenants();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const filtered = tenants.filter((t) => {
    const q = search.trim().toLowerCase();
    return (
      !q ||
      t.full_name.toLowerCase().includes(q) ||
      t.phone.toLowerCase().includes(q) ||
      (t.property_name || '').toLowerCase().includes(q)
    );
  });

  if (loading) return <SkeletonRows rows={6} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#123C32]">Locataires</h1>
          <p className="mt-0.5 text-sm text-[#66736D]">
            {tenants.length} dossier(s) locataire suivi(s) · Synthèse financière et historique complet
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setCreateOpen(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#185C46] px-4 py-2 text-xs font-semibold text-white hover:bg-[#123C32] cursor-pointer whitespace-nowrap self-start sm:self-auto"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Nouveau locataire</span>
        </button>
      </div>

      <div className="rounded-xl border border-[#E8EEEB] bg-white p-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#66736D]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom, téléphone, bien..."
            className="w-full rounded-lg border border-[#E8EEEB] bg-[#F6F8F7] py-1.5 pl-9 pr-3 text-xs text-[#123C32] focus:border-[#185C46] focus:bg-white focus:outline-none"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title="Aucun locataire enregistré"
          description="Ajoutez vos locataires pour les associer à vos logements et générer leurs contrats de bail."
          actionLabel="Ajouter un locataire"
          onAction={() => setCreateOpen(true)}
        />
      ) : (
        <div className="rounded-xl border border-[#E8EEEB] bg-white overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#E8EEEB] bg-[#F6F8F7] text-[#66736D]">
              <tr>
                <th className="px-4 py-3 font-semibold">Locataire</th>
                <th className="px-4 py-3 font-semibold">Téléphone</th>
                <th className="px-4 py-3 font-semibold">Bien occupé</th>
                <th className="px-4 py-3 font-semibold text-right">Loyer mensuel</th>
                <th className="px-4 py-3 font-semibold">Prochaine échéance</th>
                <th className="px-4 py-3 font-semibold text-right">Situation</th>
                <th className="px-4 py-3 font-semibold">Statut</th>
                <th className="px-4 py-3 font-semibold text-right">Fiche</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8EEEB]">
              {filtered.map((t) => {
                const initials = t.full_name
                  .split(' ')
                  .slice(0, 2)
                  .map((s) => s[0])
                  .join('')
                  .toUpperCase();
                return (
                  <tr key={t.id} className="hover:bg-[#F6F8F7]/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#123C32] text-[11px] font-bold text-[#F0D99A]">
                          {initials}
                        </span>
                        <div>
                          <p className="font-semibold text-[#123C32]">{t.full_name}</p>
                          <p className="text-[11px] text-[#66736D]">{t.profession || '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-[#123C32]">{t.phone}</td>
                    <td className="px-4 py-3 text-[#123C32]">{t.property_name || 'Sans bail actif'}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-[#123C32] tabular-nums">
                      {t.monthly_rent_xof ? formatXOF(t.monthly_rent_xof) : '—'}
                    </td>
                    <td className="px-4 py-3 text-[#66736D]">{formatDateFR(t.next_due_date)}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {t.balance_due_xof > 0 ? (
                        <span className="font-semibold text-[#D94B4B]">-{formatXOF(t.balance_due_xof)}</span>
                      ) : (
                        <span className="font-medium text-[#185C46]">À jour</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusIndicator status={t.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => openDetail(t.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-[#E8EEEB] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#123C32] hover:bg-[#F6F8F7] cursor-pointer"
                      >
                        <Eye className="h-3.5 w-3.5 text-[#185C46]" />
                        <span>Consulter</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* CREATE TENANT MODAL */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Nouveau locataire"
        subtitle="Enregistrez la fiche complète du locataire"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-[#FDECEC] px-3.5 py-2.5 text-xs font-medium text-[#D94B4B]">{error}</div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#123C32] mb-1">Nom et prénoms *</label>
              <input
                type="text"
                required
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                className="w-full rounded-lg border border-[#E8EEEB] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#123C32] mb-1">Téléphone *</label>
              <input
                type="tel"
                required
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+225 07 00 00 00 00"
                className="w-full rounded-lg border border-[#E8EEEB] px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#123C32] mb-1">E-mail</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full rounded-lg border border-[#E8EEEB] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#123C32] mb-1">Profession</label>
              <input
                type="text"
                value={form.profession}
                onChange={(e) => setForm({ ...form, profession: e.target.value })}
                className="w-full rounded-lg border border-[#E8EEEB] px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#123C32] mb-1">N° CNI / Passeport</label>
              <input
                type="text"
                value={form.idNumber}
                onChange={(e) => setForm({ ...form, idNumber: e.target.value })}
                className="w-full rounded-lg border border-[#E8EEEB] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#123C32] mb-1">Contact d’urgence</label>
              <input
                type="text"
                value={form.emergencyContact}
                onChange={(e) => setForm({ ...form, emergencyContact: e.target.value })}
                placeholder="Nom et téléphone"
                className="w-full rounded-lg border border-[#E8EEEB] px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="rounded-lg border border-[#E8EEEB] px-4 py-2 text-sm font-medium text-[#123C32] cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[#185C46] px-5 py-2 text-sm font-semibold text-white hover:bg-[#123C32] cursor-pointer"
            >
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </Modal>

      {/* TENANT DETAIL SHEET MODAL WITH TABS */}
      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail?.tenant.full_name || 'Fiche locataire'}
        subtitle={detail ? `${detail.tenant.phone} · ${detail.tenant.profession || 'Locataire'}` : ''}
        maxWidth="max-w-3xl"
      >
        {detail && (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-1 border-b border-[#E8EEEB] pb-3">
              {[
                { key: 'info', label: 'Informations' },
                { key: 'contracts', label: `Contrats (${detail.contracts.length})` },
                { key: 'payments', label: `Paiements & Reçus (${detail.payments.length})` },
                { key: 'maintenance', label: `Réclamations (${detail.maintenance.length})` },
                { key: 'history', label: `Communications (${detail.notifications.length})` },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setDetailTab(tab.key as typeof detailTab)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                    detailTab === tab.key ? 'bg-[#123C32] text-white' : 'text-[#66736D] hover:bg-[#F6F8F7]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {detailTab === 'info' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="rounded-lg border border-[#E8EEEB] p-3.5">
                  <span className="text-[#66736D]">Téléphone</span>
                  <p className="mt-1 font-mono font-semibold text-[#123C32]">{detail.tenant.phone}</p>
                </div>
                <div className="rounded-lg border border-[#E8EEEB] p-3.5">
                  <span className="text-[#66736D]">Adresse e-mail</span>
                  <p className="mt-1 font-semibold text-[#123C32]">{detail.tenant.email || 'Non renseignée'}</p>
                </div>
                <div className="rounded-lg border border-[#E8EEEB] p-3.5">
                  <span className="text-[#66736D]">Pièce d’identité</span>
                  <p className="mt-1 font-mono font-semibold text-[#123C32]">{detail.tenant.id_number || '—'}</p>
                </div>
                <div className="rounded-lg border border-[#E8EEEB] p-3.5">
                  <span className="text-[#66736D]">Contact d’urgence</span>
                  <p className="mt-1 font-semibold text-[#123C32]">{detail.tenant.emergency_contact || '—'}</p>
                </div>
              </div>
            )}

            {detailTab === 'contracts' && (
              <div className="space-y-3 text-xs">
                {detail.contracts.map((c) => (
                  <div key={c.id} className="rounded-lg border border-[#E8EEEB] p-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-[#123C32]">
                        {c.reference} · {c.property_name}
                      </p>
                      <p className="mt-0.5 text-[#66736D]">
                        Du {formatDateFR(c.start_date)} au {formatDateFR(c.end_date)} · Caution : {formatXOF(c.deposit_xof)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono font-bold text-[#123C32]">{formatXOF(c.monthly_rent_xof)}</p>
                      <StatusIndicator status={c.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {detailTab === 'payments' && (
              <div className="space-y-2 text-xs">
                {detail.payments.length === 0 ? (
                  <p className="text-[#66736D]">Aucun paiement enregistré.</p>
                ) : (
                  detail.payments.map((p) => (
                    <div key={p.id} className="flex items-center justify-between rounded-lg border border-[#E8EEEB] p-3">
                      <div>
                        <p className="font-mono font-semibold text-[#123C32]">
                          {p.reference} {p.receipt_number ? `· ${p.receipt_number}` : ''}
                        </p>
                        <p className="text-[#66736D]">
                          Période {p.period_label} · {formatPaymentMethod(p.payment_method)} · {formatDateFR(p.payment_date)}
                        </p>
                      </div>
                      <span className="font-mono font-bold text-[#185C46]">{formatXOF(p.amount_xof)}</span>
                    </div>
                  ))
                )}
              </div>
            )}

            {detailTab === 'maintenance' && (
              <div className="space-y-2 text-xs">
                {detail.maintenance.length === 0 ? (
                  <p className="text-[#66736D]">Aucune réclamation déclarée.</p>
                ) : (
                  detail.maintenance.map((m) => (
                    <div key={m.id} className="flex items-center justify-between rounded-lg border border-[#E8EEEB] p-3">
                      <div>
                        <p className="font-semibold text-[#123C32]">{m.title}</p>
                        <p className="text-[#66736D]">{formatDateFR(m.created_at)}</p>
                      </div>
                      <StatusIndicator status={m.status} />
                    </div>
                  ))
                )}
              </div>
            )}

            {detailTab === 'history' && (
              <div className="space-y-2 text-xs">
                {detail.notifications.length === 0 ? (
                  <p className="text-[#66736D]">Aucune communication envoyée.</p>
                ) : (
                  detail.notifications.map((n) => (
                    <div key={n.id} className="rounded-lg border border-[#E8EEEB] p-3">
                      <p className="font-semibold text-[#123C32]">{n.title}</p>
                      <p className="mt-1 text-[#66736D]">{n.message}</p>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};
