import React, { useEffect, useState } from 'react';
import { OfflineIndicator } from './components/OfflineIndicator';
import { apiFetch } from './lib/api';
import { AdminLayout } from './pages/AdminLayout';
import { AuthPages } from './pages/AuthPages';
import { DeveloperConsole } from './pages/DeveloperConsole';
import { PublicSite } from './pages/PublicSite';
import { SuperAdminConsole } from './pages/SuperAdminConsole';
import { TenantPortal } from './pages/TenantPortal';
import type { AppRoute, AuthState } from './types';

function isDeveloperPath(): boolean {
  return typeof window !== 'undefined' && window.location.pathname.replace(/\/+$/, '') === '/developer';
}

export default function App() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [activeOrgId, setActiveOrgId] = useState<number | null>(null);
  const [route, setRoute] = useState<AppRoute>(() => (isDeveloperPath() ? 'developer' : 'public'));
  const [preselectedPlan, setPreselectedPlan] = useState<string | undefined>(undefined);
  const [checkingSession, setCheckingSession] = useState(true);
  const [verifyToken, setVerifyToken] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('verify');
  });

  useEffect(() => {
    const onPopState = () => {
      if (isDeveloperPath()) setRoute('developer');
      else if (route === 'developer') setRoute('public');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [route]);

  const hydrateAuth = async () => {
    try {
      const me = await apiFetch<AuthState>('/api/auth/me');
      setAuth(me);
      if (isDeveloperPath() || me.user.role_type === 'developer') {
        if (me.user.role_type === 'developer') {
          setRoute('developer');
          if (!isDeveloperPath()) window.history.replaceState({}, '', '/developer');
        }
        return;
      }
      if (me.user.role_type === 'org_user' && me.organizations.length > 0) {
        setActiveOrgId((prev) => prev || me.organizations[0].id);
        setRoute((prev) =>
          ['public', 'login', 'register', 'forgot-password'].includes(prev) ? 'dashboard' : prev
        );
      } else if (me.user.role_type === 'tenant') {
        setRoute('tenant-portal');
      } else if (me.user.role_type === 'super_admin') {
        setRoute('super-admin');
      }
    } catch {
      setAuth(null);
    } finally {
      setCheckingSession(false);
    }
  };

  useEffect(() => {
    hydrateAuth();
  }, []);

  const handleAuthenticated = (nextAuth: AuthState) => {
    setAuth(nextAuth);
    if (nextAuth.user.role_type === 'developer') {
      setRoute('developer');
      if (!isDeveloperPath()) window.history.pushState({}, '', '/developer');
    } else if (nextAuth.user.role_type === 'org_user' && nextAuth.organizations.length > 0) {
      setActiveOrgId(nextAuth.organizations[0].id);
      setRoute('dashboard');
    } else if (nextAuth.user.role_type === 'tenant') {
      setRoute('tenant-portal');
    } else if (nextAuth.user.role_type === 'super_admin') {
      setRoute('super-admin');
    }
  };

  const handleLogout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setAuth(null);
    setActiveOrgId(null);
    if (isDeveloperPath()) {
      setRoute('developer');
    } else {
      setRoute('public');
    }
  };

  const handleNavigate = (nextRoute: AppRoute, plan?: string) => {
    if (plan) setPreselectedPlan(plan);
    if (nextRoute === 'developer') {
      window.history.pushState({}, '', '/developer');
    } else if (isDeveloperPath()) {
      window.history.pushState({}, '', '/');
    }
    setRoute(nextRoute);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-[#F6F8F7] flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="mx-auto h-8 w-8 rounded-full border-2 border-[#185C46] border-t-transparent animate-spin" />
          <p className="text-xs font-medium text-[#66736D]">Chargement d’IMMOPAY CI...</p>
        </div>
      </div>
    );
  }

  // Dedicated independent /developer route
  if (route === 'developer' || isDeveloperPath()) {
    return (
      <DeveloperConsole
        auth={auth}
        onAuthenticated={handleAuthenticated}
        onRefreshAuth={hydrateAuth}
        onLogout={handleLogout}
        onExitToPublic={() => handleNavigate('public')}
      />
    );
  }

  return (
    <>
      <OfflineIndicator />

      {!auth && (route === 'login' || route === 'register' || route === 'forgot-password') && (
        <AuthPages
          mode={route}
          onNavigate={handleNavigate}
          onAuthenticated={handleAuthenticated}
          preselectedPlan={preselectedPlan}
        />
      )}

      {(!auth || route === 'public') &&
        route !== 'login' &&
        route !== 'register' &&
        route !== 'forgot-password' && (
          <PublicSite
            onNavigate={handleNavigate}
            verifyToken={verifyToken}
            onClearVerify={() => {
              setVerifyToken(null);
              const url = new URL(window.location.href);
              url.searchParams.delete('verify');
              window.history.replaceState({}, '', url.toString());
            }}
          />
        )}

      {auth && auth.user.role_type === 'tenant' && route !== 'public' && (
        <TenantPortal onLogout={handleLogout} />
      )}

      {auth && auth.user.role_type === 'super_admin' && route !== 'public' && (
        <SuperAdminConsole onLogout={handleLogout} />
      )}

      {auth &&
        auth.user.role_type === 'org_user' &&
        auth.organizations.length > 0 &&
        route !== 'public' &&
        route !== 'login' &&
        route !== 'register' &&
        route !== 'forgot-password' && (
          <AdminLayout
            auth={auth}
            activeOrg={
              auth.organizations.find((o) => o.id === activeOrgId) || auth.organizations[0]
            }
            onSelectOrg={(id) => setActiveOrgId(id)}
            route={route}
            onNavigate={handleNavigate}
            onLogout={handleLogout}
            onRefreshAuth={hydrateAuth}
          />
        )}
    </>
  );
}
