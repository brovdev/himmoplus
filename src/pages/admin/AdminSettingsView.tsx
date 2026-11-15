import { Check, Plus, ShieldCheck, Users } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Modal, SkeletonRows, StatusIndicator } from '../../components/ui';
import { apiFetch } from '../../lib/api';
import { formatDateFR, formatXOF } from '../../lib/format';
import type { SubscriptionPlan } from '../../types';

export const AdminSettingsView: React.FC<{
  orgId: number;
  section: 'users' | 'subscription' | 'settings';
  onOrgUpdated?: () => void;
}> = ({ orgId, section, onOrgUpdated }) => {
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Users
  const [members, setMembers] = useState<
    Array<{ id: number; full_name: string; email: string; phone: string | null; role_name: string; is_active: number }>
  >([]);
  const [roles, setRoles] = useState<Array<{ id: number; code: string; name: string }>>([]);
  const [userModal, setUserModal] = useState(false);
  const [userForm, setUserForm] = useState({ fullName: '', email: '', phone: '', password: '', roleCode: 'gestionnaire' });

  // Subscription
  const [subData, setSubData] = useState<{
    subscription: {
      plan_code: string;
      plan_name: string;
      billing_cycle: string;
      status: string;
      current_period_end: string;
      max_properties: number;
      max_tenants: number;
      max_users: number;
    };
    plans: SubscriptionPlan[];
    usage: { propertiesCount: number; tenantsCount: number; usersCount: number };
  } | null>(null);

  // Settings
  const [orgForm, setOrgForm] = useState({ name: '', email: '', phone: '', address: '', city: '', rccm: '', stampText: '' });
  const [logs, setLogs] = useState<Array<{ id: number; action: string; actor_name: string | null; created_at: string }>>([]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [uRes, sRes, setRes] = await Promise.all([
        apiFetch<{ members: typeof members; roles: typeof roles }>('/api/users', {}, orgId),
        apiFetch<NonNullable<typeof subData>>('/api/subscription', {}, orgId),
        apiFetch<{ organization: Record<string, string>; logs: typeof logs }>('/api/settings', {}, orgId),
      ]);
      setMembers(uRes.members);
      setRoles(uRes.roles);
      setSubData(sRes);
      setOrgForm({
        name: setRes.organization.name || '',
        email: setRes.organization.email || '',
        phone: setRes.organization.phone || '',
        address: setRes.organization.address || '',
        city: setRes.organization.city || '',
        rccm: setRes.organization.rccm || '',
        stampText: setRes.organization.stamp_text || '',
      });
      setLogs(setRes.logs);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [orgId]);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/api/users', { method: 'POST', body: JSON.stringify(userForm) }, orgId);
      setUserModal(false);
      setUserForm({ fullName: '', email: '', phone: '', password: '', roleCode: 'gestionnaire' });
      setBanner('Collaborateur ajouté à votre organisation.');
      await loadData();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleUpgradePlan = async (planCode: string, billingCycle: 'monthly' | 'annual') => {
    setError(null);
    const res = await apiFetch<{ message: string }>(
      '/api/subscription/upgrade',
      { method: 'POST', body: JSON.stringify({ planCode, billingCycle, autoRenew: true }) },
      orgId
    );
    setBanner(res.message);
    await loadData();
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/api/settings', { method: 'PUT', body: JSON.stringify(orgForm) }, orgId);
    setBanner('Paramètres de l’organisation enregistrés.');
    onOrgUpdated?.();
    await loadData();
  };

  if (loading) return <SkeletonRows rows={5} />;

  return (
    <div className="space-y-6">
      {banner && (
        <div className="rounded-lg border border-[#185C46]/30 bg-[#EBF5F0] px-4 py-3 text-xs font-medium text-[#185C46]">
          {banner}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-[#D94B4B]/30 bg-[#FDECEC] px-4 py-3 text-xs font-medium text-[#D94B4B]">
          {error}
        </div>
      )}

      {/* USERS */}
      {section === 'users' && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl font-bold text-[#123C32]">Utilisateurs &amp; Rôles</h1>
              <p className="mt-0.5 text-sm text-[#66736D]">
                Contrôle d’accès RBAC : Administrateur, Gestionnaire, Comptable et Agent
              </p>
            </div>
            <button
              type="button"
              onClick={() => setUserModal(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#185C46] px-4 py-2 text-xs font-semibold text-white cursor-pointer self-start sm:self-auto"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Ajouter un collaborateur</span>
            </button>
          </div>

          <div className="rounded-xl border border-[#E8EEEB] bg-white overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#E8EEEB] bg-[#F6F8F7] text-[#66736D]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Collaborateur</th>
                  <th className="px-4 py-3 font-semibold">E-mail</th>
                  <th className="px-4 py-3 font-semibold">Téléphone</th>
                  <th className="px-4 py-3 font-semibold">Rôle</th>
                  <th className="px-4 py-3 font-semibold">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8EEEB]">
                {members.map((m) => (
                  <tr key={m.id}>
                    <td className="px-4 py-3 font-semibold text-[#123C32]">{m.full_name}</td>
                    <td className="px-4 py-3 text-[#66736D]">{m.email}</td>
                    <td className="px-4 py-3 font-mono text-[#123C32]">{m.phone || '—'}</td>
                    <td className="px-4 py-3 font-medium text-[#185C46]">{m.role_name}</td>
                    <td className="px-4 py-3">
                      <StatusIndicator status={m.is_active ? 'actif' : 'inactif'} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* SUBSCRIPTION */}
      {section === 'subscription' && subData && (
        <>
          <div>
            <h1 className="font-display text-2xl font-bold text-[#123C32]">Abonnement SaaS</h1>
            <p className="mt-0.5 text-sm text-[#66736D]">
              Plan actuel, quotas appliqués côté serveur et comparaison des offres en Franc CFA
            </p>
          </div>

          <div className="rounded-xl border border-[#E8EEEB] bg-white p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs text-[#66736D]">Forfait actif</p>
                <h2 className="mt-1 font-display text-xl font-bold text-[#123C32]">
                  Plan {subData.subscription.plan_name}{' '}
                  <span className="text-sm font-normal text-[#66736D]">
                    ({subData.subscription.billing_cycle === 'annual' ? 'Annuel' : 'Mensuel'})
                  </span>
                </h2>
                <p className="mt-1 text-xs text-[#66736D]">
                  Échéance en cours : {formatDateFR(subData.subscription.current_period_end)}
                </p>
              </div>
              <StatusIndicator status={subData.subscription.status} />
            </div>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-[#E8EEEB] pt-5 text-xs">
              <div>
                <span className="text-[#66736D]">Biens utilisés</span>
                <p className="mt-1 font-mono text-base font-bold text-[#123C32]">
                  {subData.usage.propertiesCount} / {subData.subscription.max_properties > 9000 ? 'Illimité' : subData.subscription.max_properties}
                </p>
              </div>
              <div>
                <span className="text-[#66736D]">Locataires utilisés</span>
                <p className="mt-1 font-mono text-base font-bold text-[#123C32]">
                  {subData.usage.tenantsCount} / {subData.subscription.max_tenants > 9000 ? 'Illimité' : subData.subscription.max_tenants}
                </p>
              </div>
              <div>
                <span className="text-[#66736D]">Utilisateurs</span>
                <p className="mt-1 font-mono text-base font-bold text-[#123C32]">
                  {subData.usage.usersCount} / {subData.subscription.max_users > 500 ? 'Illimité' : subData.subscription.max_users}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {subData.plans.map((p) => {
              const isCurrent = p.code === subData.subscription.plan_code;
              const features = JSON.parse(p.features_json) as string[];
              return (
                <div
                  key={p.id}
                  className={`rounded-xl border p-5 bg-white flex flex-col justify-between ${
                    isCurrent ? 'border-[#185C46] ring-1 ring-[#185C46]' : 'border-[#E8EEEB]'
                  }`}
                >
                  <div>
                    <h3 className="font-display text-base font-bold text-[#123C32]">{p.name}</h3>
                    <p className="mt-1 font-mono text-lg font-bold text-[#185C46]">
                      {p.price_monthly_xof === 0 ? 'Sur devis' : `${formatXOF(p.price_monthly_xof)} / mois`}
                    </p>
                    <ul className="mt-4 space-y-2 text-xs text-[#66736D]">
                      {features.map((f) => (
                        <li key={f} className="flex items-start gap-2">
                          <Check className="h-3.5 w-3.5 text-[#185C46] mt-0.5 shrink-0" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {p.price_monthly_xof > 0 && (
                    <button
                      type="button"
                      disabled={isCurrent}
                      onClick={() => handleUpgradePlan(p.code, 'monthly')}
                      className={`mt-5 w-full rounded-lg py-2 text-xs font-semibold cursor-pointer ${
                        isCurrent
                          ? 'bg-[#F6F8F7] text-[#66736D] cursor-default'
                          : 'bg-[#185C46] text-white hover:bg-[#123C32]'
                      }`}
                    >
                      {isCurrent ? 'Forfait actuel' : `Passer au plan ${p.name}`}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* SETTINGS & AUDIT LOGS */}
      {section === 'settings' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 rounded-xl border border-[#E8EEEB] bg-white p-6">
            <h1 className="font-display text-xl font-bold text-[#123C32]">Paramètres de l’organisation</h1>
            <p className="mt-0.5 text-xs text-[#66736D]">
              Ces informations figurent sur vos quittances PDF et contrats de bail.
            </p>

            <form onSubmit={handleSaveSettings} className="mt-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#123C32] mb-1">Raison sociale</label>
                  <input
                    type="text"
                    value={orgForm.name}
                    onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })}
                    className="w-full rounded-lg border border-[#E8EEEB] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#123C32] mb-1">N° RCCM</label>
                  <input
                    type="text"
                    value={orgForm.rccm}
                    onChange={(e) => setOrgForm({ ...orgForm, rccm: e.target.value })}
                    className="w-full rounded-lg border border-[#E8EEEB] px-3 py-2 text-sm font-mono"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#123C32] mb-1">E-mail de contact</label>
                  <input
                    type="email"
                    value={orgForm.email}
                    onChange={(e) => setOrgForm({ ...orgForm, email: e.target.value })}
                    className="w-full rounded-lg border border-[#E8EEEB] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#123C32] mb-1">Téléphone</label>
                  <input
                    type="tel"
                    value={orgForm.phone}
                    onChange={(e) => setOrgForm({ ...orgForm, phone: e.target.value })}
                    className="w-full rounded-lg border border-[#E8EEEB] px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#123C32] mb-1">Adresse</label>
                <input
                  type="text"
                  value={orgForm.address}
                  onChange={(e) => setOrgForm({ ...orgForm, address: e.target.value })}
                  className="w-full rounded-lg border border-[#E8EEEB] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#123C32] mb-1">Texte du cachet sur les quittances</label>
                <input
                  type="text"
                  value={orgForm.stampText}
                  onChange={(e) => setOrgForm({ ...orgForm, stampText: e.target.value })}
                  className="w-full rounded-lg border border-[#E8EEEB] px-3 py-2 text-sm"
                />
              </div>
              <button
                type="submit"
                className="rounded-lg bg-[#185C46] px-5 py-2 text-sm font-semibold text-white hover:bg-[#123C32] cursor-pointer"
              >
                Enregistrer les paramètres
              </button>
            </form>
          </div>

          <div className="lg:col-span-5 rounded-xl border border-[#E8EEEB] bg-white p-6">
            <div className="flex items-center gap-2 mb-4">
              <ShieldCheck className="h-4 w-4 text-[#185C46]" />
              <h2 className="font-display text-base font-bold text-[#123C32]">Journal d’audit sécurité</h2>
            </div>
            <div className="space-y-2.5 max-h-[420px] overflow-y-auto text-xs">
              {logs.map((l) => (
                <div key={l.id} className="border-b border-[#E8EEEB] pb-2">
                  <p className="font-mono font-semibold text-[#123C32]">{l.action}</p>
                  <p className="text-[#66736D]">
                    {l.actor_name || 'Système'} · {formatDateFR(l.created_at)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ADD USER MODAL */}
      <Modal open={userModal} onClose={() => setUserModal(false)} title="Ajouter un collaborateur">
        <form onSubmit={handleAddUser} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#123C32] mb-1">Nom complet *</label>
            <input
              type="text"
              required
              value={userForm.fullName}
              onChange={(e) => setUserForm({ ...userForm, fullName: e.target.value })}
              className="w-full rounded-lg border border-[#E8EEEB] px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#123C32] mb-1">E-mail *</label>
              <input
                type="email"
                required
                value={userForm.email}
                onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                className="w-full rounded-lg border border-[#E8EEEB] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#123C32] mb-1">Rôle *</label>
              <select
                value={userForm.roleCode}
                onChange={(e) => setUserForm({ ...userForm, roleCode: e.target.value })}
                className="w-full rounded-lg border border-[#E8EEEB] bg-white px-3 py-2 text-sm"
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.code}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#123C32] mb-1">Mot de passe temporaire *</label>
            <input
              type="password"
              required
              minLength={8}
              value={userForm.password}
              onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
              className="w-full rounded-lg border border-[#E8EEEB] px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setUserModal(false)} className="rounded-lg border border-[#E8EEEB] px-4 py-2 text-sm">
              Annuler
            </button>
            <button type="submit" className="rounded-lg bg-[#185C46] px-5 py-2 text-sm font-semibold text-white">
              Ajouter
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
