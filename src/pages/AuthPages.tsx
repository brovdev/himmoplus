import { ArrowLeft, Building2, Eye, EyeOff, KeyRound, Shield, UserCheck } from 'lucide-react';
import React, { useState } from 'react';
import { BrandLogo } from '../components/BrandLogo';
import { apiFetch } from '../lib/api';
import type { AppRoute, AuthState } from '../types';

interface AuthPagesProps {
  mode: 'login' | 'register' | 'forgot-password';
  onNavigate: (route: AppRoute) => void;
  onAuthenticated: (auth: AuthState) => void;
  preselectedPlan?: string;
}

export const AuthPages: React.FC<AuthPagesProps> = ({ mode, onNavigate, onAuthenticated, preselectedPlan }) => {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  // Login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Register state
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [orgType, setOrgType] = useState<'owner' | 'agency' | 'promoter'>('agency');
  const [city, setCity] = useState('Abidjan');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const auth = await apiFetch<AuthState>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      onAuthenticated(auth);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const quickLogin = async (demoEmail: string, demoPassword: string) => {
    setEmail(demoEmail);
    setPassword(demoPassword);
    setLoading(true);
    setError(null);
    try {
      const auth = await apiFetch<AuthState>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: demoEmail, password: demoPassword }),
      });
      onAuthenticated(auth);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const auth = await apiFetch<AuthState>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ fullName, email, phone, password, organizationName, orgType, city }),
      });
      onAuthenticated(auth);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfoMsg(null);
    try {
      const res = await apiFetch<{ message: string }>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setInfoMsg(res.message);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F8F7] flex flex-col lg:flex-row">
      {/* Left Brand Panel */}
      <div className="lg:w-[44%] bg-[#123C32] text-white p-8 sm:p-12 flex flex-col justify-between">
        <div>
          <button
            type="button"
            onClick={() => onNavigate('public')}
            className="inline-flex items-center gap-2 text-xs font-medium text-[#F0D99A] hover:text-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Retour au site public</span>
          </button>

          <div className="mt-8">
            <BrandLogo variant="light" />
          </div>

          <h1 className="mt-8 font-display text-2xl sm:text-3xl font-bold tracking-tight leading-snug">
            Votre patrimoine immobilier géré avec rigueur et sérénité.
          </h1>
          <p className="mt-4 text-sm text-white/75 leading-relaxed max-w-md">
            Centralisez vos immeubles, contrats de bail, loyers en FCFA, quittances certifiées par QR code et le suivi
            technique de vos biens en Côte d’Ivoire.
          </p>
        </div>

        <div className="mt-10 border-t border-white/15 pt-6 space-y-3 text-xs text-white/80">
          <p className="font-semibold text-[#F0D99A]">Environnement de démonstration prêt à l’emploi</p>
          <p>
            Découvrez l’agence fictive « Immo Gestion Abidjan » (Résidence Angré, Résidence Cocody, Immeuble Yopougon),
            l’espace multi-organisation, le portail locataire et la console Super Administrateur.
          </p>
        </div>
      </div>

      {/* Right Form Panel */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 lg:p-14">
        <div className="w-full max-w-md">
          {mode === 'login' && (
            <div className="rounded-xl border border-[#E8EEEB] bg-white p-6 sm:p-8">
              <h2 className="font-display text-2xl font-bold text-[#123C32]">Connexion</h2>
              <p className="mt-1 text-sm text-[#66736D]">Accédez à votre espace IMMOPAY CI.</p>

              {error && (
                <div className="mt-4 rounded-lg border border-[#D94B4B]/30 bg-[#FDECEC] px-3.5 py-2.5 text-xs font-medium text-[#D94B4B]">
                  {error}
                </div>
              )}

              <form onSubmit={handleLogin} className="mt-6 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[#123C32] mb-1">Adresse e-mail</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nom@organisation.ci"
                    className="w-full rounded-lg border border-[#E8EEEB] bg-white px-3.5 py-2.5 text-sm text-[#123C32] focus:border-[#185C46] focus:outline-none"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-[#123C32]">Mot de passe</label>
                    <button
                      type="button"
                      onClick={() => onNavigate('forgot-password')}
                      className="text-xs font-medium text-[#185C46] hover:underline cursor-pointer"
                    >
                      Mot de passe oublié ?
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full rounded-lg border border-[#E8EEEB] bg-white px-3.5 py-2.5 pr-10 text-sm text-[#123C32] focus:border-[#185C46] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#66736D] hover:text-[#123C32] cursor-pointer"
                      aria-label="Afficher le mot de passe"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-[#185C46] py-2.5 text-sm font-semibold text-white hover:bg-[#123C32] transition-colors cursor-pointer disabled:opacity-50"
                >
                  {loading ? 'Connexion en cours...' : 'Se connecter'}
                </button>
              </form>

              {/* Quick Demo Discovery */}
              <div className="mt-6 border-t border-[#E8EEEB] pt-5">
                <p className="text-xs font-semibold text-[#123C32]">Accès direct à la démonstration :</p>
                <div className="mt-3 space-y-2">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => quickLogin('admin@immogestion-abidjan.ci', 'ImmoPay2026!')}
                    className="flex w-full items-center justify-between rounded-lg border border-[#E8EEEB] bg-[#F6F8F7] px-3.5 py-2 text-left text-xs hover:border-[#185C46] transition-colors cursor-pointer"
                  >
                    <span className="inline-flex items-center gap-2 font-semibold text-[#123C32]">
                      <Building2 className="h-3.5 w-3.5 text-[#185C46]" />
                      Administrateur Agence (Immo Gestion Abidjan)
                    </span>
                    <span className="text-[#185C46] font-medium">Ouvrir</span>
                  </button>

                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => quickLogin('jeanmarc.kouassi@locataire.ci', 'Locataire2026!')}
                    className="flex w-full items-center justify-between rounded-lg border border-[#E8EEEB] bg-[#F6F8F7] px-3.5 py-2 text-left text-xs hover:border-[#185C46] transition-colors cursor-pointer"
                  >
                    <span className="inline-flex items-center gap-2 font-semibold text-[#123C32]">
                      <UserCheck className="h-3.5 w-3.5 text-[#D6AE55]" />
                      Portail Locataire (Kouassi Jean-Marc)
                    </span>
                    <span className="text-[#185C46] font-medium">Ouvrir</span>
                  </button>

                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => quickLogin('superadmin@immopay.ci', 'SuperAdmin2026!')}
                    className="flex w-full items-center justify-between rounded-lg border border-[#E8EEEB] bg-[#F6F8F7] px-3.5 py-2 text-left text-xs hover:border-[#185C46] transition-colors cursor-pointer"
                  >
                    <span className="inline-flex items-center gap-2 font-semibold text-[#123C32]">
                      <Shield className="h-3.5 w-3.5 text-[#123C32]" />
                      Super Administrateur IMMOPAY CI
                    </span>
                    <span className="text-[#185C46] font-medium">Ouvrir</span>
                  </button>
                </div>
              </div>

              <p className="mt-6 text-center text-xs text-[#66736D]">
                Pas encore de compte ?{' '}
                <button
                  type="button"
                  onClick={() => onNavigate('register')}
                  className="font-semibold text-[#185C46] hover:underline cursor-pointer"
                >
                  Créer un espace gratuitement
                </button>
              </p>
            </div>
          )}

          {mode === 'register' && (
            <div className="rounded-xl border border-[#E8EEEB] bg-white p-6 sm:p-8">
              <h2 className="font-display text-2xl font-bold text-[#123C32]">Créer votre espace</h2>
              <p className="mt-1 text-sm text-[#66736D]">
                Essai gratuit de 14 jours{preselectedPlan ? ` · Plan ${preselectedPlan.toUpperCase()}` : ''}.
              </p>

              {error && (
                <div className="mt-4 rounded-lg border border-[#D94B4B]/30 bg-[#FDECEC] px-3.5 py-2.5 text-xs font-medium text-[#D94B4B]">
                  {error}
                </div>
              )}

              <form onSubmit={handleRegister} className="mt-5 space-y-3.5">
                <div>
                  <label className="block text-xs font-medium text-[#123C32] mb-1">Nom &amp; Prénom *</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Ex. Yao Koffi Michel"
                    className="w-full rounded-lg border border-[#E8EEEB] px-3.5 py-2 text-sm focus:border-[#185C46] focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-medium text-[#123C32] mb-1">E-mail professionnel *</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="nom@agence.ci"
                      className="w-full rounded-lg border border-[#E8EEEB] px-3.5 py-2 text-sm focus:border-[#185C46] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#123C32] mb-1">Téléphone</label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+225 07 00 00 00 00"
                      className="w-full rounded-lg border border-[#E8EEEB] px-3.5 py-2 text-sm focus:border-[#185C46] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-medium text-[#123C32] mb-1">Nom de l’organisation *</label>
                    <input
                      type="text"
                      required
                      value={organizationName}
                      onChange={(e) => setOrganizationName(e.target.value)}
                      placeholder="Ex. SCI Les Palmiers"
                      className="w-full rounded-lg border border-[#E8EEEB] px-3.5 py-2 text-sm focus:border-[#185C46] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#123C32] mb-1">Profil</label>
                    <select
                      value={orgType}
                      onChange={(e) => setOrgType(e.target.value as 'owner' | 'agency' | 'promoter')}
                      className="w-full rounded-lg border border-[#E8EEEB] bg-white px-3.5 py-2 text-sm focus:border-[#185C46] focus:outline-none"
                    >
                      <option value="owner">Propriétaire bailleur</option>
                      <option value="agency">Agence immobilière</option>
                      <option value="promoter">Promoteur / Résidence</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#123C32] mb-1">Ville</label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full rounded-lg border border-[#E8EEEB] px-3.5 py-2 text-sm focus:border-[#185C46] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#123C32] mb-1">Mot de passe (8 caractères min.) *</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-lg border border-[#E8EEEB] px-3.5 py-2 text-sm focus:border-[#185C46] focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-[#185C46] py-2.5 text-sm font-semibold text-white hover:bg-[#123C32] transition-colors cursor-pointer disabled:opacity-50"
                >
                  {loading ? 'Création de l’espace...' : 'Démarrer mon essai gratuit (14 jours)'}
                </button>
              </form>

              <p className="mt-5 text-center text-xs text-[#66736D]">
                Déjà inscrit ?{' '}
                <button
                  type="button"
                  onClick={() => onNavigate('login')}
                  className="font-semibold text-[#185C46] hover:underline cursor-pointer"
                >
                  Se connecter
                </button>
              </p>
            </div>
          )}

          {mode === 'forgot-password' && (
            <div className="rounded-xl border border-[#E8EEEB] bg-white p-6 sm:p-8">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#F6F8F7] text-[#185C46]">
                <KeyRound className="h-5 w-5" />
              </div>
              <h2 className="mt-4 font-display text-xl font-bold text-[#123C32]">Réinitialiser le mot de passe</h2>
              <p className="mt-1 text-sm text-[#66736D]">
                Saisissez votre adresse e-mail pour recevoir les instructions de réinitialisation.
              </p>

              {infoMsg && (
                <div className="mt-4 rounded-lg border border-[#185C46]/30 bg-[#EBF5F0] px-3.5 py-2.5 text-xs font-medium text-[#185C46]">
                  {infoMsg}
                </div>
              )}
              {error && (
                <div className="mt-4 rounded-lg border border-[#D94B4B]/30 bg-[#FDECEC] px-3.5 py-2.5 text-xs font-medium text-[#D94B4B]">
                  {error}
                </div>
              )}

              <form onSubmit={handleForgot} className="mt-5 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[#123C32] mb-1">Adresse e-mail</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nom@organisation.ci"
                    className="w-full rounded-lg border border-[#E8EEEB] px-3.5 py-2.5 text-sm focus:border-[#185C46] focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-[#185C46] py-2.5 text-sm font-semibold text-white hover:bg-[#123C32] transition-colors cursor-pointer"
                >
                  {loading ? 'Envoi...' : 'Envoyer le lien'}
                </button>
              </form>

              <button
                type="button"
                onClick={() => onNavigate('login')}
                className="mt-5 block w-full text-center text-xs font-semibold text-[#185C46] hover:underline cursor-pointer"
              >
                Retour à la connexion
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
