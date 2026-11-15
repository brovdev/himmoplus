import {
  Bell,
  Check,
  Download,
  FileSpreadsheet,
  Plus,
  Send,
  Wrench,
  X,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Modal, SkeletonRows, StatCard, StatusIndicator } from '../../components/ui';
import { apiFetch } from '../../lib/api';
import { exportReportPDF, exportRowsToCSV, exportRowsToExcel } from '../../lib/exporters';
import { formatDateFR, formatXOF } from '../../lib/format';

interface ExpenseRow {
  id: number;
  description: string;
  amount_xof: number;
  expense_date: string;
  vendor_name: string | null;
  receipt_ref: string | null;
  validation_status: string;
  category_name: string;
  property_name: string | null;
  building_name: string | null;
}

interface MaintenanceRow {
  id: number;
  property_name: string;
  tenant_name: string | null;
  category: string;
  title: string;
  description: string;
  priority: string;
  assigned_to: string | null;
  estimated_cost_xof: number;
  status: string;
  created_at: string;
}

export const OperationsView: React.FC<{
  orgId: number;
  orgName: string;
  section: 'expenses' | 'maintenance' | 'reports' | 'notifications';
}> = ({ orgId, orgName, section }) => {
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);

  // Expenses
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [categories, setCategories] = useState<Array<{ id: number; name: string }>>([]);
  const [properties, setProperties] = useState<Array<{ id: number; name: string }>>([]);
  const [buildings, setBuildings] = useState<Array<{ id: number; name: string }>>([]);
  const [expModal, setExpModal] = useState(false);
  const [expForm, setExpForm] = useState({
    categoryId: '',
    propertyId: '',
    buildingId: '',
    description: '',
    amountXof: '',
    expenseDate: new Date().toISOString().slice(0, 10),
    vendorName: '',
    receiptRef: '',
  });

  // Maintenance
  const [requests, setRequests] = useState<MaintenanceRow[]>([]);
  const [mntModal, setMntModal] = useState(false);
  const [mntForm, setMntForm] = useState({
    propertyId: '',
    category: 'fuite_eau',
    title: '',
    description: '',
    priority: 'moyenne',
    assignedTo: '',
    estimatedCostXof: '0',
  });

  // Reports
  const [reportBuildingId, setReportBuildingId] = useState('');
  const [unitProfit, setUnitProfit] = useState<
    Array<{
      id: number;
      reference: string;
      name: string;
      building_name: string;
      status: string;
      monthly_rent_xof: number;
      total_collected_xof: number;
      total_expenses_xof: number;
    }>
  >([]);
  const [bldgProfit, setBldgProfit] = useState<
    Array<{
      id: number;
      name: string;
      commune: string;
      units_count: number;
      occupied_count: number;
      total_collected_xof: number;
      total_expenses_xof: number;
    }>
  >([]);

  // Notifications & Templates
  const [notifications, setNotifications] = useState<
    Array<{ id: number; channel: string; title: string; message: string; status: string; created_at: string }>
  >([]);
  const [templates, setTemplates] = useState<
    Array<{ id: number; name: string; trigger_offset_days: number; channel: string; body_template: string; is_active: number }>
  >([]);
  const [providerConfig, setProviderConfig] = useState({
    whatsappConfigured: false,
    smsConfigured: false,
    emailConfigured: false,
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [expRes, mntRes, propRes, bldgRes, repRes, notifRes] = await Promise.all([
        apiFetch<{ expenses: ExpenseRow[]; categories: Array<{ id: number; name: string }> }>('/api/expenses', {}, orgId),
        apiFetch<{ requests: MaintenanceRow[] }>('/api/maintenance', {}, orgId),
        apiFetch<{ properties: Array<{ id: number; name: string }> }>('/api/properties', {}, orgId),
        apiFetch<{ buildings: Array<{ id: number; name: string }> }>('/api/buildings', {}, orgId),
        apiFetch<{ unitProfitability: typeof unitProfit; buildingProfitability: typeof bldgProfit }>(
          `/api/reports${reportBuildingId ? `?buildingId=${reportBuildingId}` : ''}`,
          {},
          orgId
        ),
        apiFetch<{
          notifications: typeof notifications;
          templates: typeof templates;
          providerConfig: typeof providerConfig;
        }>('/api/notifications', {}, orgId),
      ]);
      setExpenses(expRes.expenses);
      setCategories(expRes.categories);
      setRequests(mntRes.requests);
      setProperties(propRes.properties);
      setBuildings(bldgRes.buildings);
      setUnitProfit(repRes.unitProfitability);
      setBldgProfit(repRes.buildingProfitability);
      setNotifications(notifRes.notifications);
      setTemplates(notifRes.templates);
      setProviderConfig(notifRes.providerConfig);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [orgId, reportBuildingId]);

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/api/expenses', { method: 'POST', body: JSON.stringify(expForm) }, orgId);
    setExpModal(false);
    setBanner('Dépense enregistrée.');
    await loadData();
  };

  const handleValidateExpense = async (id: number, status: 'validee' | 'rejetee') => {
    await apiFetch(`/api/expenses/${id}/validate`, { method: 'PATCH', body: JSON.stringify({ status }) }, orgId);
    await loadData();
  };

  const handleSaveMaintenance = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/api/maintenance', { method: 'POST', body: JSON.stringify(mntForm) }, orgId);
    setMntModal(false);
    setBanner('Ticket de maintenance enregistré.');
    await loadData();
  };

  const handleUpdateMaintenanceStatus = async (id: number, status: string) => {
    await apiFetch(`/api/maintenance/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }, orgId);
    await loadData();
  };

  const handleRunReminders = async () => {
    const res = await apiFetch<{ message: string }>('/api/reminders/run', { method: 'POST' }, orgId);
    setBanner(res.message);
    await loadData();
  };

  if (loading) return <SkeletonRows rows={6} />;

  return (
    <div className="space-y-6">
      {banner && (
        <div className="flex items-center justify-between rounded-lg border border-[#185C46]/30 bg-[#EBF5F0] px-4 py-3 text-xs font-medium text-[#185C46]">
          <span>{banner}</span>
          <button type="button" onClick={() => setBanner(null)} className="cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* EXPENSES */}
      {section === 'expenses' && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl font-bold text-[#123C32]">Dépenses &amp; Charges</h1>
              <p className="mt-0.5 text-sm text-[#66736D]">
                Suivi des frais d’entretien, gardiennage, taxes et validation des justificatifs
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setExpForm({
                  categoryId: categories[0]?.id ? String(categories[0].id) : '',
                  propertyId: '',
                  buildingId: '',
                  description: '',
                  amountXof: '',
                  expenseDate: new Date().toISOString().slice(0, 10),
                  vendorName: '',
                  receiptRef: '',
                });
                setExpModal(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#185C46] px-4 py-2 text-xs font-semibold text-white hover:bg-[#123C32] cursor-pointer self-start sm:self-auto"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Ajouter une dépense</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              label="Total dépenses validées"
              value={formatXOF(expenses.filter((e) => e.validation_status === 'validee').reduce((s, e) => s + e.amount_xof, 0))}
              icon={<Check className="h-4 w-4" />}
              tone="warning"
            />
            <StatCard
              label="En attente de validation"
              value={String(expenses.filter((e) => e.validation_status === 'en_attente').length)}
              icon={<Bell className="h-4 w-4" />}
              tone="gold"
            />
            <StatCard
              label="Nombre de lignes"
              value={String(expenses.length)}
              icon={<FileSpreadsheet className="h-4 w-4" />}
            />
          </div>

          <div className="rounded-xl border border-[#E8EEEB] bg-white overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#E8EEEB] bg-[#F6F8F7] text-[#66736D]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Date &amp; Réf.</th>
                  <th className="px-4 py-3 font-semibold">Catégorie &amp; Description</th>
                  <th className="px-4 py-3 font-semibold">Imputation</th>
                  <th className="px-4 py-3 font-semibold">Fournisseur</th>
                  <th className="px-4 py-3 font-semibold text-right">Montant</th>
                  <th className="px-4 py-3 font-semibold">Statut</th>
                  <th className="px-4 py-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8EEEB]">
                {expenses.map((ex) => (
                  <tr key={ex.id} className="hover:bg-[#F6F8F7]/60">
                    <td className="px-4 py-3">
                      <p className="text-[#123C32]">{formatDateFR(ex.expense_date)}</p>
                      <p className="font-mono text-[11px] text-[#66736D]">{ex.receipt_ref || '—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-[#123C32]">{ex.category_name}</p>
                      <p className="text-[#66736D]">{ex.description}</p>
                    </td>
                    <td className="px-4 py-3 text-[#66736D]">{ex.property_name || ex.building_name || 'Général'}</td>
                    <td className="px-4 py-3 text-[#123C32]">{ex.vendor_name || '—'}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-[#123C32] tabular-nums">
                      {formatXOF(ex.amount_xof)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusIndicator status={ex.validation_status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      {ex.validation_status === 'en_attente' ? (
                        <div className="inline-flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleValidateExpense(ex.id, 'validee')}
                            className="rounded bg-[#185C46] px-2.5 py-1 text-[11px] font-semibold text-white cursor-pointer"
                          >
                            Valider
                          </button>
                          <button
                            type="button"
                            onClick={() => handleValidateExpense(ex.id, 'rejetee')}
                            className="rounded bg-[#FDECEC] px-2.5 py-1 text-[11px] font-semibold text-[#D94B4B] cursor-pointer"
                          >
                            Rejeter
                          </button>
                        </div>
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

      {/* MAINTENANCE */}
      {section === 'maintenance' && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl font-bold text-[#123C32]">Maintenance &amp; Réclamations</h1>
              <p className="mt-0.5 text-sm text-[#66736D]">
                Suivi des incidents signalés par les locataires et planification des interventions
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setMntForm({
                  propertyId: properties[0]?.id ? String(properties[0].id) : '',
                  category: 'fuite_eau',
                  title: '',
                  description: '',
                  priority: 'moyenne',
                  assignedTo: '',
                  estimatedCostXof: '0',
                });
                setMntModal(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#185C46] px-4 py-2 text-xs font-semibold text-white hover:bg-[#123C32] cursor-pointer self-start sm:self-auto"
            >
              <Wrench className="h-3.5 w-3.5" />
              <span>Nouvelle intervention</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {requests.map((r) => (
              <div key={r.id} className="rounded-xl border border-[#E8EEEB] bg-white p-5 flex flex-col justify-between gap-4">
                <div>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-[#185C46]">{r.property_name}</span>
                    <StatusIndicator status={r.priority} />
                  </div>
                  <h3 className="mt-2 font-display text-base font-bold text-[#123C32]">{r.title}</h3>
                  <p className="mt-1 text-xs text-[#66736D] leading-relaxed">{r.description}</p>
                  <p className="mt-2 text-xs text-[#66736D]">
                    {r.tenant_name ? `Signalé par ${r.tenant_name} · ` : ''}
                    Intervenant : <strong className="text-[#123C32]">{r.assigned_to || 'À assigner'}</strong> · Coût estimé :{' '}
                    <span className="font-mono font-semibold text-[#123C32]">{formatXOF(r.estimated_cost_xof)}</span>
                  </p>
                </div>

                <div className="flex items-center justify-between border-t border-[#E8EEEB] pt-3">
                  <StatusIndicator status={r.status} />
                  <select
                    value={r.status}
                    onChange={(e) => handleUpdateMaintenanceStatus(r.id, e.target.value)}
                    className="rounded-lg border border-[#E8EEEB] bg-[#F6F8F7] px-2.5 py-1 text-xs font-medium text-[#123C32]"
                  >
                    <option value="nouveau">Nouveau</option>
                    <option value="en_cours">En cours</option>
                    <option value="en_attente">En attente</option>
                    <option value="resolu">Résolu</option>
                    <option value="annule">Annulé</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* REPORTS */}
      {section === 'reports' && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl font-bold text-[#123C32]">Rapports &amp; Rentabilité</h1>
              <p className="mt-0.5 text-sm text-[#66736D]">
                Revenus encaissés, dépenses validées et revenu net par immeuble et par logement
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={reportBuildingId}
                onChange={(e) => setReportBuildingId(e.target.value)}
                className="rounded-lg border border-[#E8EEEB] bg-white px-3 py-1.5 text-xs font-medium text-[#123C32]"
              >
                <option value="">Tous les immeubles</option>
                {buildings.map((b) => (
                  <option key={b.id} value={String(b.id)}>
                    {b.name}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() =>
                  exportReportPDF(
                    'Rapport de rentabilité par logement',
                    orgName,
                    ['Réf.', 'Bien', 'Immeuble', 'Encaissé (FCFA)', 'Dépenses (FCFA)', 'Net (FCFA)'],
                    unitProfit.map((u) => [
                      u.reference,
                      u.name,
                      u.building_name,
                      formatXOF(u.total_collected_xof),
                      formatXOF(u.total_expenses_xof),
                      formatXOF(u.total_collected_xof - u.total_expenses_xof),
                    ])
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#185C46] px-3 py-1.5 text-xs font-semibold text-white cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                <span>PDF</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  exportRowsToExcel(
                    'rapport-rentabilite-immopay-ci',
                    'Rentabilité',
                    unitProfit.map((u) => ({
                      Reference: u.reference,
                      Bien: u.name,
                      Immeuble: u.building_name,
                      Statut: u.status,
                      Encaisse_FCFA: u.total_collected_xof,
                      Depenses_FCFA: u.total_expenses_xof,
                      Revenu_Net_FCFA: u.total_collected_xof - u.total_expenses_xof,
                    }))
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#E8EEEB] bg-white px-3 py-1.5 text-xs font-semibold text-[#123C32] cursor-pointer"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 text-[#185C46]" />
                <span>Excel</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  exportRowsToCSV(
                    'rapport-rentabilite-immopay-ci',
                    ['Référence', 'Bien', 'Immeuble', 'Encaissé', 'Dépenses', 'Revenu Net'],
                    unitProfit.map((u) => [
                      u.reference,
                      u.name,
                      u.building_name,
                      u.total_collected_xof,
                      u.total_expenses_xof,
                      u.total_collected_xof - u.total_expenses_xof,
                    ])
                  )
                }
                className="rounded-lg border border-[#E8EEEB] bg-white px-3 py-1.5 text-xs font-semibold text-[#123C32] cursor-pointer"
              >
                CSV
              </button>
            </div>
          </div>

          {/* Rentabilité par immeuble */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {bldgProfit.map((b) => {
              const net = b.total_collected_xof - b.total_expenses_xof;
              const occRate = b.units_count > 0 ? Math.round((b.occupied_count / b.units_count) * 100) : 0;
              return (
                <div key={b.id} className="rounded-xl border border-[#E8EEEB] bg-white p-5">
                  <h3 className="font-display text-sm font-bold text-[#123C32]">{b.name}</h3>
                  <p className="text-xs text-[#66736D]">
                    {b.commune} · Occupation {occRate}% ({b.occupied_count}/{b.units_count})
                  </p>
                  <div className="mt-4 space-y-1.5 text-xs border-t border-[#E8EEEB] pt-3">
                    <div className="flex justify-between">
                      <span className="text-[#66736D]">Loyers encaissés :</span>
                      <span className="font-mono font-semibold text-[#185C46]">{formatXOF(b.total_collected_xof)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#66736D]">Dépenses validées :</span>
                      <span className="font-mono text-[#D94B4B]">-{formatXOF(b.total_expenses_xof)}</span>
                    </div>
                    <div className="flex justify-between border-t border-[#E8EEEB] pt-1.5 font-semibold">
                      <span className="text-[#123C32]">Revenu net :</span>
                      <span className="font-mono text-[#123C32]">{formatXOF(net)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Tableau par logement */}
          <div className="rounded-xl border border-[#E8EEEB] bg-white overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#E8EEEB] bg-[#F6F8F7] text-[#66736D]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Bien</th>
                  <th className="px-4 py-3 font-semibold">Immeuble</th>
                  <th className="px-4 py-3 font-semibold">Statut</th>
                  <th className="px-4 py-3 font-semibold text-right">Loyers encaissés</th>
                  <th className="px-4 py-3 font-semibold text-right">Dépenses imputées</th>
                  <th className="px-4 py-3 font-semibold text-right">Revenu net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8EEEB]">
                {unitProfit.map((u) => (
                  <tr key={u.id} className="hover:bg-[#F6F8F7]/60">
                    <td className="px-4 py-3">
                      <span className="font-semibold text-[#123C32]">{u.name}</span>{' '}
                      <span className="font-mono text-[11px] text-[#66736D]">({u.reference})</span>
                    </td>
                    <td className="px-4 py-3 text-[#66736D]">{u.building_name}</td>
                    <td className="px-4 py-3">
                      <StatusIndicator status={u.status} />
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-[#185C46] tabular-nums">
                      {formatXOF(u.total_collected_xof)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-[#D94B4B] tabular-nums">
                      {formatXOF(u.total_expenses_xof)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-[#123C32] tabular-nums">
                      {formatXOF(u.total_collected_xof - u.total_expenses_xof)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* NOTIFICATIONS & REMINDERS */}
      {section === 'notifications' && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl font-bold text-[#123C32]">Rappels automatiques &amp; Notifications</h1>
              <p className="mt-0.5 text-sm text-[#66736D]">
                Modèles personnalisables (J-5 à J+15) et historique des relances locataires
              </p>
            </div>
            <button
              type="button"
              onClick={handleRunReminders}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#185C46] px-4 py-2 text-xs font-semibold text-white hover:bg-[#123C32] cursor-pointer self-start sm:self-auto"
            >
              <Send className="h-3.5 w-3.5" />
              <span>Exécuter les relances d’échéances</span>
            </button>
          </div>

          <div className="rounded-xl border border-[#E8EEEB] bg-white p-4 text-xs text-[#66736D] flex flex-wrap items-center gap-4">
            <span className="font-semibold text-[#123C32]">État des passerelles externes :</span>
            <span>WhatsApp Business API : {providerConfig.whatsappConfigured ? 'Connecté' : 'Clé API non configurée'}</span>
            <span>·</span>
            <span>SMS Côte d’Ivoire : {providerConfig.smsConfigured ? 'Connecté' : 'Clé API non configurée'}</span>
            <span>·</span>
            <span>SMTP E-mail : {providerConfig.emailConfigured ? 'Connecté' : 'Non configuré'}</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-xl border border-[#E8EEEB] bg-white p-5 space-y-3">
              <h2 className="font-display text-sm font-bold text-[#123C32]">Scénarios de relance configurés</h2>
              {templates.map((t) => (
                <div key={t.id} className="rounded-lg border border-[#E8EEEB] bg-[#F6F8F7] p-3.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[#123C32]">{t.name}</span>
                    <span className="font-mono text-[11px] uppercase text-[#185C46]">{t.channel}</span>
                  </div>
                  <p className="mt-1.5 text-[#66736D] leading-relaxed">{t.body_template}</p>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-[#E8EEEB] bg-white p-5 space-y-3">
              <h2 className="font-display text-sm font-bold text-[#123C32]">Journal des notifications récentes</h2>
              {notifications.map((n) => (
                <div key={n.id} className="border-b border-[#E8EEEB] pb-3 last:border-0 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[#123C32]">{n.title}</span>
                    <span className="text-[11px] text-[#66736D]">{formatDateFR(n.created_at)}</span>
                  </div>
                  <p className="mt-1 text-[#66736D]">{n.message}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* EXPENSE MODAL */}
      <Modal open={expModal} onClose={() => setExpModal(false)} title="Enregistrer une dépense">
        <form onSubmit={handleSaveExpense} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#123C32] mb-1">Catégorie *</label>
              <select
                value={expForm.categoryId}
                onChange={(e) => setExpForm({ ...expForm, categoryId: e.target.value })}
                className="w-full rounded-lg border border-[#E8EEEB] bg-white px-3 py-2 text-sm"
              >
                {categories.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#123C32] mb-1">Montant (FCFA) *</label>
              <input
                type="number"
                required
                min={100}
                value={expForm.amountXof}
                onChange={(e) => setExpForm({ ...expForm, amountXof: e.target.value })}
                className="w-full rounded-lg border border-[#E8EEEB] px-3 py-2 text-sm font-mono"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#123C32] mb-1">Description *</label>
            <input
              type="text"
              required
              value={expForm.description}
              onChange={(e) => setExpForm({ ...expForm, description: e.target.value })}
              className="w-full rounded-lg border border-[#E8EEEB] px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#123C32] mb-1">Bien concerné</label>
              <select
                value={expForm.propertyId}
                onChange={(e) => setExpForm({ ...expForm, propertyId: e.target.value })}
                className="w-full rounded-lg border border-[#E8EEEB] bg-white px-3 py-2 text-sm"
              >
                <option value="">Immeuble / Général</option>
                {properties.map((p) => (
                  <option key={p.id} value={String(p.id)}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#123C32] mb-1">Fournisseur</label>
              <input
                type="text"
                value={expForm.vendorName}
                onChange={(e) => setExpForm({ ...expForm, vendorName: e.target.value })}
                className="w-full rounded-lg border border-[#E8EEEB] px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setExpModal(false)}
              className="rounded-lg border border-[#E8EEEB] px-4 py-2 text-sm font-medium cursor-pointer"
            >
              Annuler
            </button>
            <button type="submit" className="rounded-lg bg-[#185C46] px-5 py-2 text-sm font-semibold text-white cursor-pointer">
              Enregistrer
            </button>
          </div>
        </form>
      </Modal>

      {/* MAINTENANCE MODAL */}
      <Modal open={mntModal} onClose={() => setMntModal(false)} title="Créer un ticket de maintenance">
        <form onSubmit={handleSaveMaintenance} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#123C32] mb-1">Bien *</label>
              <select
                value={mntForm.propertyId}
                onChange={(e) => setMntForm({ ...mntForm, propertyId: e.target.value })}
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
              <label className="block text-xs font-medium text-[#123C32] mb-1">Priorité</label>
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
            <label className="block text-xs font-medium text-[#123C32] mb-1">Objet *</label>
            <input
              type="text"
              required
              value={mntForm.title}
              onChange={(e) => setMntForm({ ...mntForm, title: e.target.value })}
              className="w-full rounded-lg border border-[#E8EEEB] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#123C32] mb-1">Description *</label>
            <textarea
              rows={3}
              required
              value={mntForm.description}
              onChange={(e) => setMntForm({ ...mntForm, description: e.target.value })}
              className="w-full rounded-lg border border-[#E8EEEB] px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#123C32] mb-1">Prestataire assigné</label>
              <input
                type="text"
                value={mntForm.assignedTo}
                onChange={(e) => setMntForm({ ...mntForm, assignedTo: e.target.value })}
                className="w-full rounded-lg border border-[#E8EEEB] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#123C32] mb-1">Coût estimé (FCFA)</label>
              <input
                type="number"
                value={mntForm.estimatedCostXof}
                onChange={(e) => setMntForm({ ...mntForm, estimatedCostXof: e.target.value })}
                className="w-full rounded-lg border border-[#E8EEEB] px-3 py-2 text-sm font-mono"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setMntModal(false)}
              className="rounded-lg border border-[#E8EEEB] px-4 py-2 text-sm font-medium cursor-pointer"
            >
              Annuler
            </button>
            <button type="submit" className="rounded-lg bg-[#185C46] px-5 py-2 text-sm font-semibold text-white cursor-pointer">
              Enregistrer
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
