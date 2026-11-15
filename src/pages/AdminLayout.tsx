import {
  BarChart3,
  Bell,
  Building,
  Building2,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  DoorClosed,
  FileCheck2,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Receipt,
  Search,
  Settings,
  TrendingDown,
  Users,
  UserCog,
  Wrench,
  X,
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { BrandLogo } from '../components/BrandLogo';
import { PWAInstallButton } from '../components/PWAInstallButton';
import type { AppRoute, AuthState, OrganizationInfo } from '../types';
import { AdminSettingsView } from './admin/AdminSettingsView';
import { ContractsInvoicesView } from './admin/ContractsInvoicesView';
import { DashboardView } from './admin/DashboardView';
import { OperationsView } from './admin/OperationsView';
import { PropertiesView } from './admin/PropertiesView';
import { TenantsView } from './admin/TenantsView';

interface AdminLayoutProps {
  auth: AuthState;
  activeOrg: OrganizationInfo;
  onSelectOrg: (orgId: number) => void;
  route: AppRoute;
  onNavigate: (route: AppRoute) => void;
  onLogout: () => void;
  onRefreshAuth: () => void;
}

const NAV_ITEMS: Array<{
  route: AppRoute;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  { route: 'dashboard', label: 'Tableau de bord', Icon: LayoutDashboard },
  { route: 'properties', label: 'Biens immobiliers', Icon: Building2 },
  { route: 'buildings', label: 'Immeubles', Icon: Building },
  { route: 'units', label: 'Logements', Icon: DoorClosed },
  { route: 'tenants', label: 'Locataires', Icon: Users },
  { route: 'contracts', label: 'Contrats', Icon: FileText },
  { route: 'invoices', label: 'Loyers', Icon: CalendarCheck },
  { route: 'payments', label: 'Paiements', Icon: CreditCard },
  { route: 'receipts', label: 'Reçus', Icon: Receipt },
  { route: 'expenses', label: 'Dépenses', Icon: TrendingDown },
  { route: 'maintenance', label: 'Maintenance', Icon: Wrench },
  { route: 'reports', label: 'Rapports', Icon: BarChart3 },
  { route: 'notifications', label: 'Rappels', Icon: Bell },
  { route: 'users', label: 'Utilisateurs', Icon: UserCog },
  { route: 'subscription', label: 'Abonnement', Icon: FileCheck2 },
  { route: 'settings', label: 'Paramètres', Icon: Settings },
];

export const AdminLayout: React.FC<AdminLayoutProps> = ({
  auth,
  activeOrg,
  onSelectOrg,
  route,
  onNavigate,
  onLogout,
  onRefreshAuth,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [globalQuery, setGlobalQuery] = useState('');

  const currentNav = NAV_ITEMS.find((i) => i.route === route) || NAV_ITEMS[0];
  const firstName = auth.user.full_name.split(' ')[0];

  const quickNavMatches = useMemo(() => {
    const q = globalQuery.trim().toLowerCase();
    if (!q) return [];
    return NAV_ITEMS.filter((i) => i.label.toLowerCase().includes(q));
  }, [globalQuery]);

  const SidebarContent = (isMobile: boolean) => (
    <div className="flex h-full flex-col bg-[#123C32] text-white">
      <div className="flex h-16 items-center justify-between px-4 border-b border-white/10">
        <button
          type="button"
          onClick={() => onNavigate('dashboard')}
          className="cursor-pointer focus:outline-none"
        >
          <BrandLogo variant="light" collapsed={!isMobile && collapsed} />
        </button>
        {!isMobile ? (
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white cursor-pointer"
            aria-label={collapsed ? 'Déplier le menu' : 'Réduire le menu'}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="rounded-lg p-1.5 text-white/80 hover:bg-white/10 cursor-pointer"
            aria-label="Fermer le menu"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {NAV_ITEMS.map(({ route: itemRoute, label, Icon }) => {
          const active = route === itemRoute;
          return (
            <button
              key={itemRoute}
              type="button"
              onClick={() => {
                onNavigate(itemRoute);
                setMobileOpen(false);
              }}
              title={!isMobile && collapsed ? label : undefined}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                active
                  ? 'bg-[#185C46] text-white'
                  : 'text-white/75 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-[#F0D99A]' : ''}`} />
              {(isMobile || !collapsed) && <span className="truncate">{label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Bottom Connected User Profile */}
      <div className="border-t border-white/10 p-3">
        <div className={`flex items-center gap-2.5 ${!isMobile && collapsed ? 'justify-center' : ''}`}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#D6AE55] text-xs font-bold text-[#123C32]">
            {firstName[0]?.toUpperCase()}
          </div>
          {(isMobile || !collapsed) && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-white">{auth.user.full_name}</p>
              <p className="truncate text-[11px] text-[#F0D99A]">{activeOrg.role_name}</p>
            </div>
          )}
          {(isMobile || !collapsed) && (
            <button
              type="button"
              onClick={onLogout}
              title="Se déconnecter"
              className="rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F6F8F7] flex">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:block shrink-0 transition-all duration-200 sticky top-0 h-screen ${
          collapsed ? 'w-[72px]' : 'w-[248px]'
        }`}
      >
        {SidebarContent(false)}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="w-64 h-full">{SidebarContent(true)}</div>
          <div className="flex-1 bg-black/40" onClick={() => setMobileOpen(false)} />
        </div>
      )}

      {/* Main Column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 border-b border-[#E8EEEB] bg-white">
          <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="lg:hidden rounded-lg border border-[#E8EEEB] p-2 text-[#123C32] hover:bg-[#F6F8F7]"
                aria-label="Menu"
              >
                <Menu className="h-4 w-4" />
              </button>
              <div className="min-w-0">
                <p className="text-[11px] text-[#66736D] truncate">
                  {activeOrg.name} / {currentNav.label}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {/* Global quick search */}
              <div className="relative hidden md:block w-56">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#66736D]" />
                <input
                  type="text"
                  value={globalQuery}
                  onChange={(e) => setGlobalQuery(e.target.value)}
                  placeholder="Aller à une rubrique..."
                  className="w-full rounded-lg border border-[#E8EEEB] bg-[#F6F8F7] py-1.5 pl-8 pr-3 text-xs text-[#123C32] focus:border-[#185C46] focus:bg-white focus:outline-none"
                />
                {quickNavMatches.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 rounded-lg border border-[#E8EEEB] bg-white py-1 shadow-lg z-40">
                    {quickNavMatches.map((m) => (
                      <button
                        key={m.route}
                        type="button"
                        onClick={() => {
                          onNavigate(m.route);
                          setGlobalQuery('');
                        }}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[#123C32] hover:bg-[#F6F8F7] cursor-pointer"
                      >
                        <m.Icon className="h-3.5 w-3.5 text-[#185C46]" />
                        <span>{m.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Multi-Org Switcher */}
              {auth.organizations.length > 1 && (
                <select
                  aria-label="Organisation active"
                  value={activeOrg.id}
                  onChange={(e) => onSelectOrg(Number(e.target.value))}
                  className="rounded-lg border border-[#E8EEEB] bg-[#F6F8F7] px-2.5 py-1.5 text-xs font-semibold text-[#123C32] focus:border-[#185C46] focus:outline-none cursor-pointer max-w-[180px]"
                >
                  {auth.organizations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </select>
              )}

              <button
                type="button"
                onClick={() => onNavigate('notifications')}
                className="rounded-lg border border-[#E8EEEB] p-2 text-[#123C32] hover:bg-[#F6F8F7] cursor-pointer"
                title="Rappels & Notifications"
              >
                <Bell className="h-4 w-4" />
              </button>

              <div className="hidden sm:block">
                <PWAInstallButton compact />
              </div>
            </div>
          </div>
        </header>

        {/* Page Viewport */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          {route === 'dashboard' && (
            <DashboardView firstName={firstName} orgId={activeOrg.id} onNavigate={onNavigate} />
          )}
          {route === 'properties' && <PropertiesView orgId={activeOrg.id} mode="properties" />}
          {route === 'buildings' && <PropertiesView orgId={activeOrg.id} mode="buildings" />}
          {route === 'units' && <PropertiesView orgId={activeOrg.id} mode="units" />}
          {route === 'tenants' && <TenantsView orgId={activeOrg.id} />}
          {(route === 'contracts' || route === 'invoices' || route === 'payments' || route === 'receipts') && (
            <ContractsInvoicesView orgId={activeOrg.id} orgName={activeOrg.name} section={route} />
          )}
          {(route === 'expenses' || route === 'maintenance' || route === 'reports' || route === 'notifications') && (
            <OperationsView orgId={activeOrg.id} orgName={activeOrg.name} section={route} />
          )}
          {(route === 'users' || route === 'subscription' || route === 'settings') && (
            <AdminSettingsView orgId={activeOrg.id} section={route} onOrgUpdated={onRefreshAuth} />
          )}
        </main>
      </div>
    </div>
  );
};
