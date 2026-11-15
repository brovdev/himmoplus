import { Building2, CreditCard, LogOut, Shield, TicketCheck, Users } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { BrandLogo } from '../components/BrandLogo';
import { SkeletonRows, StatCard, StatusIndicator } from '../components/ui';
import { apiFetch } from '../lib/api';
import { formatDateFR, formatXOF } from '../lib/format';

interface SuperAdminOverview {
  stats: {
    totalClients: number;
    ownersCount: number;
    agenciesCount: number;
    totalProperties: number;
    totalTenantsAggregate: number;
    activeContracts: number;
    activeSubscriptions: number;
    trialSubscriptions: number;
    mrrXof: number;
  };
  organizations: Array<{
    id: number;
    name: string;
    org_type: string;
    city: string;
    status: string;
    plan_name: string;
    subscription_status: string;
    properties_count: number;
    active_contracts_count: number;
  }>;
  tickets: Array<{ id: number; organization_name: string; subject: string; message: string; status: string; created_at: string }>;
  logs: Array<{ id: number; action: string; entity_type: string; created_at: string; organization_name: string | null }>;
}

export const SuperAdminConsole: React.FC<{ onLogout: () => void }> = ({ onLogout }) => {
  const [data, setData] = useState<SuperAdminOverview | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<SuperAdminOverview>('/api/super-admin/overview');
      setData(res);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const toggleOrgStatus = async (id: number, nextStatus: 'active' | 'suspended') => {
    await apiFetch(`/api/super-admin/organizations/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: nextStatus }),
    });
    await loadData();
  };

  if (loading || !data) {
    return (
      <div className="min-h-screen bg-[#F6F8F7] p-8 max-w-6xl mx-auto">
        <SkeletonRows rows={6} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F6F8F7]">
      <header className="bg-[#123C32] text-white border-b border-white/10">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 h-16">
          <div className="flex items-center gap-3">
            <BrandLogo variant="light" />
            <span className="text-xs font-medium text-[#F0D99A]">· Console Direction SaaS</span>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10 cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Déconnexion</span>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#123C32]">Supervision Plateforme IMMOPAY CI</h1>
          <p className="mt-0.5 text-sm text-[#66736D]">
            Pilotage des comptes clients, abonnements et métriques agrégées (données nominatives locataires masquées)
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Organisations clientes"
            value={String(data.stats.totalClients)}
            sublabel={`${data.stats.agenciesCount} agence(s) · ${data.stats.ownersCount} propriétaire(s)`}
            icon={<Building2 className="h-4 w-4" />}
          />
          <StatCard
            label="Revenu mensuel récurrent (MRR)"
            value={formatXOF(data.stats.mrrXof)}
            sublabel={`${data.stats.activeSubscriptions} abonnement(s) actif(s)`}
            icon={<CreditCard className="h-4 w-4" />}
            tone="success"
          />
          <StatCard
            label="Volume agrégé du parc"
            value={`${data.stats.totalProperties} biens`}
            sublabel={`${data.stats.activeContracts} baux actifs · ${data.stats.totalTenantsAggregate} locataires`}
            icon={<Users className="h-4 w-4" />}
            tone="gold"
          />
          <StatCard
            label="Comptes en essai 14j"
            value={String(data.stats.trialSubscriptions)}
            sublabel={`${data.tickets.length} ticket(s) support`}
            icon={<Shield className="h-4 w-4" />}
          />
        </div>

        <div className="rounded-xl border border-[#E8EEEB] bg-white overflow-x-auto">
          <div className="border-b border-[#E8EEEB] px-5 py-4">
            <h2 className="font-display text-sm font-bold text-[#123C32]">Comptes clients &amp; abonnements</h2>
          </div>
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#E8EEEB] bg-[#F6F8F7] text-[#66736D]">
              <tr>
                <th className="px-4 py-3 font-semibold">Organisation</th>
                <th className="px-4 py-3 font-semibold">Type &amp; Ville</th>
                <th className="px-4 py-3 font-semibold">Plan</th>
                <th className="px-4 py-3 font-semibold text-right">Biens / Baux</th>
                <th className="px-4 py-3 font-semibold">Statut compte</th>
                <th className="px-4 py-3 font-semibold text-right">Gouvernance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8EEEB]">
              {data.organizations.map((org) => (
                <tr key={org.id}>
                  <td className="px-4 py-3 font-semibold text-[#123C32]">{org.name}</td>
                  <td className="px-4 py-3 text-[#66736D]">
                    {org.org_type === 'agency' ? 'Agence' : 'Propriétaire'} · {org.city}
                  </td>
                  <td className="px-4 py-3 font-medium text-[#185C46]">{org.plan_name || 'Starter'}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">
                    {org.properties_count} biens · {org.active_contracts_count} baux
                  </td>
                  <td className="px-4 py-3">
                    <StatusIndicator status={org.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {org.status === 'suspended' ? (
                      <button
                        type="button"
                        onClick={() => toggleOrgStatus(org.id, 'active')}
                        className="rounded-lg bg-[#185C46] px-3 py-1.5 text-xs font-semibold text-white cursor-pointer"
                      >
                        Réactiver
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => toggleOrgStatus(org.id, 'suspended')}
                        className="rounded-lg border border-[#D94B4B]/40 px-3 py-1.5 text-xs font-semibold text-[#D94B4B] hover:bg-[#FDECEC] cursor-pointer"
                      >
                        Suspendre
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-xl border border-[#E8EEEB] bg-white p-5">
            <div className="flex items-center gap-2 mb-3">
              <TicketCheck className="h-4 w-4 text-[#185C46]" />
              <h2 className="font-display text-sm font-bold text-[#123C32]">Tickets support clients</h2>
            </div>
            <div className="space-y-3 text-xs">
              {data.tickets.map((t) => (
                <div key={t.id} className="rounded-lg border border-[#E8EEEB] p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[#123C32]">{t.subject}</span>
                    <StatusIndicator status={t.status} />
                  </div>
                  <p className="mt-1 text-[#66736D]">{t.message}</p>
                  <p className="mt-1 text-[11px] text-[#66736D]">
                    {t.organization_name} · {formatDateFR(t.created_at)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-[#E8EEEB] bg-white p-5">
            <h2 className="font-display text-sm font-bold text-[#123C32] mb-3">Journaux d’activité plateforme</h2>
            <div className="space-y-2.5 max-h-72 overflow-y-auto text-xs">
              {data.logs.map((l) => (
                <div key={l.id} className="flex items-center justify-between border-b border-[#E8EEEB] pb-2">
                  <div>
                    <span className="font-mono font-semibold text-[#123C32]">{l.action}</span>
                    <span className="text-[#66736D]"> · {l.organization_name || 'Plateforme'}</span>
                  </div>
                  <span className="text-[11px] text-[#66736D]">{formatDateFR(l.created_at)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
