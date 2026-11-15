import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  CalendarClock,
  CheckCircle2,
  DoorOpen,
  FileWarning,
  Home,
  Receipt,
  TrendingDown,
  Users,
  Wallet,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { BuildingRevenueBars, OccupancyDonutChart, RevenueComparisonChart } from '../../components/Charts';
import { EmptyState, SkeletonRows, StatCard, StatusIndicator } from '../../components/ui';
import { apiFetch } from '../../lib/api';
import { formatDateFR, formatPaymentMethod, formatPeriodFR, formatXOF } from '../../lib/format';
import type { AppRoute } from '../../types';

interface DashboardResponse {
  period: string;
  kpis: {
    totalProperties: number;
    occupiedUnits: number;
    availableUnits: number;
    maintenanceUnits: number;
    activeTenants: number;
    activeContracts: number;
    expectedRentXof: number;
    collectedRentXof: number;
    unpaidRentXof: number;
    overdueCount: number;
    monthExpensesXof: number;
    netIncomeXof: number;
    pendingExpensesCount: number;
  };
  charts: {
    monthlySeries: Array<{ period: string; expected_xof: number; collected_xof: number; overdue_xof: number }>;
    revenueByBuilding: Array<{ building_name: string; collected_xof: number }>;
  };
  recentPayments: Array<{
    id: number;
    reference: string;
    amount_xof: number;
    payment_method: string;
    payment_date: string;
    verification_status: string;
    tenant_name: string;
    property_name: string;
    period_label: string;
  }>;
  overdueInvoices: Array<{
    id: number;
    period_label: string;
    due_date: string;
    amount_due_xof: number;
    amount_paid_xof: number;
    status: string;
    tenant_name: string;
    tenant_phone: string;
    property_name: string;
  }>;
  upcomingInvoices: Array<{
    id: number;
    period_label: string;
    due_date: string;
    amount_due_xof: number;
    amount_paid_xof: number;
    status: string;
    tenant_name: string;
    property_name: string;
  }>;
  expiringContracts: Array<{
    id: number;
    reference: string;
    end_date: string;
    tenant_name: string;
    property_name: string;
    days_remaining: number;
  }>;
  recentLogs: Array<{
    id: number;
    action: string;
    details_json: string | null;
    created_at: string;
    actor_name: string | null;
  }>;
}

export const DashboardView: React.FC<{
  firstName: string;
  orgId: number;
  onNavigate: (route: AppRoute) => void;
}> = ({ firstName, orgId, onNavigate }) => {
  const [period, setPeriod] = useState('2026-11');
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    apiFetch<DashboardResponse>(`/api/dashboard?period=${period}`, {}, orgId)
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err) => {
        if (active) setError((err as Error).message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [orgId, period]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-12 w-72 rounded-lg bg-[#E8EEEB] animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-28 rounded-xl border border-[#E8EEEB] bg-white animate-pulse" />
          ))}
        </div>
        <SkeletonRows rows={4} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-[#D94B4B]/30 bg-[#FDECEC] p-6 text-sm text-[#D94B4B]">
        Impossible de charger le tableau de bord : {error || 'Erreur inconnue.'}
      </div>
    );
  }

  const { kpis } = data;
  const isFreshAccount = kpis.totalProperties === 0 && kpis.activeTenants === 0;
  const collectionRate =
    kpis.expectedRentXof > 0 ? Math.round((kpis.collectedRentXof / kpis.expectedRentXof) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Greeting + Period Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#123C32]">
            Bonjour, {firstName}
          </h1>
          <p className="mt-0.5 text-sm text-[#66736D]">
            Voici la situation de votre patrimoine immobilier.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          <label htmlFor="period-select" className="text-xs font-medium text-[#66736D] whitespace-nowrap">
            Période :
          </label>
          <select
            id="period-select"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="rounded-lg border border-[#E8EEEB] bg-white px-3 py-2 text-xs font-semibold text-[#123C32] focus:border-[#185C46] focus:outline-none cursor-pointer"
          >
            <option value="2026-11">Novembre 2026</option>
            <option value="2026-10">Octobre 2026</option>
            <option value="2026-09">Septembre 2026</option>
            <option value="2026-08">Août 2026</option>
            <option value="2026-07">Juillet 2026</option>
            <option value="2026-06">Juin 2026</option>
          </select>
          <button
            type="button"
            onClick={() => onNavigate('payments')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#185C46] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#123C32] transition-colors cursor-pointer whitespace-nowrap"
          >
            <span>Enregistrer un paiement</span>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {isFreshAccount ? (
        <EmptyState
          icon={<Building2 className="h-6 w-6" />}
          title="Votre espace immobilier est prêt"
          description="Commencez par enregistrer votre premier bien ou immeuble, puis associez vos locataires et contrats de bail pour suivre automatiquement vos loyers."
          actionLabel="Ajouter mon premier bien"
          onAction={() => onNavigate('properties')}
        />
      ) : (
        <>
          {/* 8 Primary Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard
              label="Total des biens"
              value={String(kpis.totalProperties)}
              sublabel={`${kpis.activeContracts} contrat(s) actif(s)`}
              icon={<Building2 className="h-4 w-4" />}
              onClick={() => onNavigate('properties')}
            />
            <StatCard
              label="Logements occupés"
              value={String(kpis.occupiedUnits)}
              sublabel={`${
                kpis.totalProperties > 0 ? Math.round((kpis.occupiedUnits / kpis.totalProperties) * 100) : 0
              }% du parc loué`}
              icon={<Home className="h-4 w-4" />}
              tone="success"
              onClick={() => onNavigate('properties')}
            />
            <StatCard
              label="Logements disponibles"
              value={String(kpis.availableUnits)}
              sublabel={`${kpis.maintenanceUnits} en maintenance`}
              icon={<DoorOpen className="h-4 w-4" />}
              tone="gold"
              onClick={() => onNavigate('properties')}
            />
            <StatCard
              label="Locataires actifs"
              value={String(kpis.activeTenants)}
              sublabel="Fiches et baux suivis"
              icon={<Users className="h-4 w-4" />}
              onClick={() => onNavigate('tenants')}
            />
            <StatCard
              label={`Loyers attendus (${formatPeriodFR(period)})`}
              value={formatXOF(kpis.expectedRentXof)}
              sublabel="Basé sur les échéances générées"
              icon={<CalendarClock className="h-4 w-4" />}
              onClick={() => onNavigate('invoices')}
            />
            <StatCard
              label="Loyers encaissés"
              value={formatXOF(kpis.collectedRentXof)}
              sublabel={`Taux de recouvrement : ${collectionRate}%`}
              icon={<CheckCircle2 className="h-4 w-4" />}
              tone="success"
              onClick={() => onNavigate('payments')}
            />
            <StatCard
              label="Loyers impayés"
              value={formatXOF(kpis.unpaidRentXof)}
              sublabel={`${kpis.overdueCount} échéance(s) en retard`}
              icon={<AlertTriangle className="h-4 w-4" />}
              tone={kpis.unpaidRentXof > 0 ? 'danger' : 'neutral'}
              onClick={() => onNavigate('invoices')}
            />
            <StatCard
              label="Dépenses du mois"
              value={formatXOF(kpis.monthExpensesXof)}
              sublabel={`Revenu net : ${formatXOF(kpis.netIncomeXof)}`}
              icon={<TrendingDown className="h-4 w-4" />}
              tone="warning"
              onClick={() => onNavigate('expenses')}
            />
          </div>

          {/* Financial Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 rounded-xl border border-[#E8EEEB] bg-white p-5 sm:p-6">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div>
                  <h2 className="font-display text-base font-semibold text-[#123C32]">
                    Loyers encaissés vs loyers attendus
                  </h2>
                  <p className="text-xs text-[#66736D]">Évolution mensuelle issue des échéances et règlements</p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('reports')}
                  className="text-xs font-semibold text-[#185C46] hover:underline cursor-pointer whitespace-nowrap"
                >
                  Rapports détaillés
                </button>
              </div>
              <RevenueComparisonChart data={data.charts.monthlySeries} />
            </div>

            <div className="lg:col-span-5 flex flex-col gap-6">
              <div className="rounded-xl border border-[#E8EEEB] bg-white p-5 sm:p-6">
                <h2 className="font-display text-base font-semibold text-[#123C32] mb-4">
                  Répartition des biens par occupation
                </h2>
                <OccupancyDonutChart
                  occupied={kpis.occupiedUnits}
                  available={kpis.availableUnits}
                  maintenance={kpis.maintenanceUnits}
                />
              </div>

              <div className="rounded-xl border border-[#E8EEEB] bg-white p-5 sm:p-6 flex-1">
                <h2 className="font-display text-base font-semibold text-[#123C32] mb-4">
                  Revenus encaissés par immeuble
                </h2>
                <BuildingRevenueBars items={data.charts.revenueByBuilding} />
              </div>
            </div>
          </div>

          {/* Operational Sections */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Paiements récents */}
            <div className="lg:col-span-6 rounded-xl border border-[#E8EEEB] bg-white overflow-hidden">
              <div className="flex items-center justify-between border-b border-[#E8EEEB] px-5 py-4">
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-[#185C46]" />
                  <h2 className="font-display text-sm font-semibold text-[#123C32]">Paiements récents</h2>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('payments')}
                  className="text-xs font-semibold text-[#185C46] hover:underline cursor-pointer"
                >
                  Voir tout
                </button>
              </div>
              <div className="divide-y divide-[#E8EEEB]">
                {data.recentPayments.length === 0 ? (
                  <p className="p-5 text-sm text-[#66736D]">Aucun paiement enregistré.</p>
                ) : (
                  data.recentPayments.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-[#F6F8F7]/60">
                      <div className="min-w-0">
                        <p className="font-medium text-[#123C32] truncate">{p.tenant_name}</p>
                        <p className="text-xs text-[#66736D] truncate">
                          {p.property_name} · {formatPaymentMethod(p.payment_method)} · {formatDateFR(p.payment_date)}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-mono font-semibold text-[#123C32] tabular-nums">{formatXOF(p.amount_xof)}</p>
                        <StatusIndicator status={p.verification_status} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Loyers en retard */}
            <div className="lg:col-span-6 rounded-xl border border-[#E8EEEB] bg-white overflow-hidden">
              <div className="flex items-center justify-between border-b border-[#E8EEEB] px-5 py-4">
                <div className="flex items-center gap-2">
                  <FileWarning className="h-4 w-4 text-[#D94B4B]" />
                  <h2 className="font-display text-sm font-semibold text-[#123C32]">Loyers en retard ou partiels</h2>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('invoices')}
                  className="text-xs font-semibold text-[#185C46] hover:underline cursor-pointer"
                >
                  Gérer les échéances
                </button>
              </div>
              <div className="divide-y divide-[#E8EEEB]">
                {data.overdueInvoices.length === 0 ? (
                  <p className="p-5 text-sm text-[#185C46]">Aucun retard de paiement en cours.</p>
                ) : (
                  data.overdueInvoices.map((inv) => {
                    const remaining = Math.max(0, inv.amount_due_xof - inv.amount_paid_xof);
                    return (
                      <div key={inv.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                        <div className="min-w-0">
                          <p className="font-medium text-[#123C32] truncate">{inv.tenant_name}</p>
                          <p className="text-xs text-[#66736D] truncate">
                            {inv.property_name} · Échéance {formatDateFR(inv.due_date)}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-mono font-semibold text-[#D94B4B] tabular-nums">{formatXOF(remaining)}</p>
                          <StatusIndicator status={inv.status} />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Upcoming dues, Alerts & Recent Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Échéances à venir */}
            <div className="rounded-xl border border-[#E8EEEB] bg-white p-5">
              <h2 className="font-display text-sm font-semibold text-[#123C32] mb-3">Échéances à venir</h2>
              {data.upcomingInvoices.length === 0 ? (
                <p className="text-xs text-[#66736D]">Aucune échéance en attente.</p>
              ) : (
                <div className="space-y-3">
                  {data.upcomingInvoices.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between gap-2 text-xs border-b border-[#E8EEEB] pb-2.5 last:border-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="font-medium text-[#123C32] truncate">{inv.tenant_name}</p>
                        <p className="text-[#66736D] truncate">
                          {inv.property_name} · {formatDateFR(inv.due_date)}
                        </p>
                      </div>
                      <span className="font-mono font-semibold text-[#123C32] tabular-nums shrink-0">
                        {formatXOF(inv.amount_due_xof - inv.amount_paid_xof)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Alertes importantes */}
            <div className="rounded-xl border border-[#E8EEEB] bg-white p-5">
              <h2 className="font-display text-sm font-semibold text-[#123C32] mb-3">Alertes importantes</h2>
              <div className="space-y-3 text-xs">
                {data.expiringContracts.map((c) => (
                  <div key={c.id} className="rounded-lg border border-[#E9A23B]/40 bg-[#FDF6E9] p-3">
                    <p className="font-semibold text-[#123C32]">
                      Bail {c.reference} expire dans {c.days_remaining} jours
                    </p>
                    <p className="mt-0.5 text-[#66736D]">
                      {c.tenant_name} · {c.property_name} ({formatDateFR(c.end_date)})
                    </p>
                  </div>
                ))}
                {kpis.pendingExpensesCount > 0 && (
                  <div className="rounded-lg border border-[#E8EEEB] bg-[#F6F8F7] p-3">
                    <p className="font-semibold text-[#123C32]">
                      {kpis.pendingExpensesCount} dépense(s) en attente de validation
                    </p>
                    <button
                      type="button"
                      onClick={() => onNavigate('expenses')}
                      className="mt-1 font-semibold text-[#185C46] hover:underline cursor-pointer"
                    >
                      Examiner les justificatifs
                    </button>
                  </div>
                )}
                {data.expiringContracts.length === 0 && kpis.pendingExpensesCount === 0 && (
                  <p className="text-[#66736D]">Aucune alerte urgente à signaler.</p>
                )}
              </div>
            </div>

            {/* Activités récentes */}
            <div className="rounded-xl border border-[#E8EEEB] bg-white p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-display text-sm font-semibold text-[#123C32]">Activités récentes</h2>
                <Receipt className="h-4 w-4 text-[#66736D]" />
              </div>
              <div className="space-y-3 text-xs">
                {data.recentLogs.map((log) => {
                  const msg = (() => {
                    try {
                      const parsed = JSON.parse(log.details_json || '{}');
                      return parsed.message || log.action;
                    } catch {
                      return log.action;
                    }
                  })();
                  return (
                    <div key={log.id} className="border-b border-[#E8EEEB] pb-2.5 last:border-0 last:pb-0">
                      <p className="text-[#123C32] leading-snug">{msg}</p>
                      <p className="mt-0.5 text-[11px] text-[#66736D]">
                        {log.actor_name || 'Système'} · {formatDateFR(log.created_at)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
