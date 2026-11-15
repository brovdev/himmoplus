import {
  ArrowRight,
  Building2,
  Check,
  ChevronDown,
  FileCheck2,
  Menu,
  ShieldCheck,
  Smartphone,
  Wallet,
  X,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { BrandLogo } from '../components/BrandLogo';
import { PWAInstallButton } from '../components/PWAInstallButton';
import { Modal } from '../components/ui';
import { apiFetch } from '../lib/api';
import { formatXOF } from '../lib/format';
import { HERO_ABIDJAN_IMAGE, resolvePropertyImage } from '../lib/propertyImages';
import type { AppRoute, SubscriptionPlan } from '../types';

interface PublicSiteProps {
  onNavigate: (route: AppRoute, preselectedPlan?: string) => void;
  verifyToken?: string | null;
  onClearVerify?: () => void;
}

const FAQS = [
  {
    q: 'Comment fonctionnent les paiements Mobile Money (Wave, Orange Money, MTN, Moov) ?',
    a: 'Chaque paiement enregistré ou initié est rattaché à une référence de transaction unique et rapproché de l’échéance mensuelle. Les paiements hors ligne ou déclarés restent en attente jusqu’à validation manuelle ou confirmation serveur.',
  },
  {
    q: 'Puis-je gérer plusieurs immeubles et plusieurs organisations depuis un seul compte ?',
    a: 'Oui. IMMOPAY CI est conçu en architecture multi-organisations isolée. Vous pouvez basculer entre vos différentes agences ou SCI depuis la barre supérieure, tout en conservant une séparation stricte des données.',
  },
  {
    q: 'Les quittances de loyer sont-elles générées automatiquement ?',
    a: 'Dès qu’un paiement est confirmé, une quittance PDF professionnelle portant votre cachet et un QR code de vérification unique est générée et accessible au téléchargement pour vous et votre locataire.',
  },
  {
    q: 'Comment mes locataires accèdent-ils à leur espace ?',
    a: 'Le portail locataire indépendant permet à chaque locataire de consulter son bail, suivre ses échéances, télécharger ses quittances et déclarer un incident technique avec priorité.',
  },
  {
    q: 'Quelles garanties offrez-vous pour la sécurité des données en Côte d’Ivoire ?',
    a: 'Les mots de passe sont chiffrés, les sessions protégées par signature HMAC, les accès contrôlés côté serveur par rôle et chaque action financière sensible est tracée dans un journal d’audit.',
  },
];

export const PublicSite: React.FC<PublicSiteProps> = ({ onNavigate, verifyToken, onClearVerify }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [audienceTab, setAudienceTab] = useState<'owners' | 'agencies'>('owners');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [openFaqIdx, setOpenFaqIdx] = useState<number | null>(0);
  const [legalModal, setLegalModal] = useState<'cgu' | 'privacy' | null>(null);

  // Demo form state
  const [demoForm, setDemoForm] = useState({
    fullName: '',
    company: '',
    email: '',
    phone: '',
    propertiesCount: '6 à 30 biens',
    message: '',
  });
  const [demoSubmitting, setDemoSubmitting] = useState(false);
  const [demoResult, setDemoResult] = useState<{ ok: boolean; text: string } | null>(null);

  // Receipt verification
  const [verifyingData, setVerifyingData] = useState<{
    loading: boolean;
    valid?: boolean;
    receipt?: Record<string, string | number>;
    error?: string;
  } | null>(null);

  useEffect(() => {
    apiFetch<{ plans: SubscriptionPlan[] }>('/api/public/plans')
      .then((res) => setPlans(res.plans))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!verifyToken) {
      setVerifyingData(null);
      return;
    }
    setVerifyingData({ loading: true });
    apiFetch<{ valid: boolean; receipt: Record<string, string | number> }>(`/api/verify-receipt/${verifyToken}`)
      .then((res) => setVerifyingData({ loading: false, valid: true, receipt: res.receipt }))
      .catch((err) => setVerifyingData({ loading: false, valid: false, error: err.message }));
  }, [verifyToken]);

  const handleDemoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDemoSubmitting(true);
    setDemoResult(null);
    try {
      const res = await apiFetch<{ message: string }>('/api/public/demo-request', {
        method: 'POST',
        body: JSON.stringify(demoForm),
      });
      setDemoResult({ ok: true, text: res.message });
      setDemoForm({ fullName: '', company: '', email: '', phone: '', propertiesCount: '6 à 30 biens', message: '' });
    } catch (err) {
      setDemoResult({ ok: false, text: (err as Error).message });
    } finally {
      setDemoSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F8F7] text-[#123C32]">
      {/* TOP BAR CONTRACT: 3 ZONES (Brand | 5 Nav Links | 1 Primary Action) */}
      <header className="sticky top-0 z-40 border-b border-[#E8EEEB] bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-8 px-4 sm:px-6 lg:px-8 h-16">
          <a href="#accueil" className="whitespace-nowrap shrink-0">
            <BrandLogo variant="dark" />
          </a>

          <nav className="hidden lg:flex items-center gap-7 text-sm font-medium text-[#66736D]">
            <a href="#fonctionnalites" className="hover:text-[#123C32] transition-colors whitespace-nowrap shrink-0">
              Fonctionnalités
            </a>
            <a href="#solutions" className="hover:text-[#123C32] transition-colors whitespace-nowrap shrink-0">
              Solutions
            </a>
            <a href="#tarifs" className="hover:text-[#123C32] transition-colors whitespace-nowrap shrink-0">
              Tarifs
            </a>
            <a href="#faq" className="hover:text-[#123C32] transition-colors whitespace-nowrap shrink-0">
              FAQ
            </a>
            <button
              type="button"
              onClick={() => onNavigate('login')}
              className="hover:text-[#123C32] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Connexion
            </button>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden sm:block">
              <PWAInstallButton compact />
            </div>
            <button
              type="button"
              onClick={() => onNavigate('register')}
              className="rounded-lg bg-[#185C46] px-4 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-[#123C32] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Commencer gratuitement
            </button>
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="lg:hidden rounded-lg border border-[#E8EEEB] p-2 text-[#123C32] hover:bg-[#F6F8F7]"
              aria-label="Menu"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-[#E8EEEB] bg-white px-4 py-4 space-y-3 text-sm font-medium">
            <a href="#fonctionnalites" onClick={() => setMobileMenuOpen(false)} className="block py-1.5 text-[#123C32]">
              Fonctionnalités
            </a>
            <a href="#solutions" onClick={() => setMobileMenuOpen(false)} className="block py-1.5 text-[#123C32]">
              Solutions propriétaires &amp; agences
            </a>
            <a href="#tarifs" onClick={() => setMobileMenuOpen(false)} className="block py-1.5 text-[#123C32]">
              Tarifs en FCFA
            </a>
            <a href="#faq" onClick={() => setMobileMenuOpen(false)} className="block py-1.5 text-[#123C32]">
              Questions fréquentes
            </a>
            <a href="#demo" onClick={() => setMobileMenuOpen(false)} className="block py-1.5 text-[#123C32]">
              Demander une démonstration
            </a>
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onNavigate('login');
              }}
              className="w-full rounded-lg border border-[#E8EEEB] py-2.5 text-center font-semibold text-[#123C32]"
            >
              Se connecter
            </button>
          </div>
        )}
      </header>

      {/* HERO SECTION */}
      <section id="accueil" className="border-b border-[#E8EEEB] bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 lg:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-center">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#185C46]">
                Côte d’Ivoire · Gestion locative en Franc CFA (XOF)
              </p>
              <h1
                className="mt-3 font-display font-bold tracking-tight text-[#123C32] leading-[1.08]"
                style={{ fontSize: 'clamp(2.25rem, 4vw, 3.5rem)', textWrap: 'balance' }}
              >
                Gérez vos loyers sans stress.
              </h1>
              <p className="mt-5 text-base sm:text-lg text-[#66736D] leading-relaxed max-w-xl">
                IMMOPAY CI simplifie la gestion de vos biens immobiliers, automatise les rappels de loyers et vous
                permet de suivre vos revenus en temps réel.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => onNavigate('register')}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#185C46] px-6 py-3 text-sm font-semibold text-white hover:bg-[#123C32] transition-colors cursor-pointer whitespace-nowrap"
                >
                  <span>Commencer gratuitement</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('login')}
                  className="inline-flex items-center gap-2 rounded-lg border border-[#E8EEEB] bg-[#F6F8F7] px-6 py-3 text-sm font-semibold text-[#123C32] hover:bg-[#E8EEEB] transition-colors cursor-pointer whitespace-nowrap"
                >
                  <span>Découvrir la démonstration</span>
                </button>
              </div>

              <p className="mt-4 text-xs text-[#66736D]">
                Essai gratuit de 14 jours · Sans carte bancaire · Espace de démonstration « Immo Gestion Abidjan » inclus
              </p>
            </div>

            <div className="lg:col-span-6 flex">
              <div className="relative w-full overflow-hidden rounded-2xl border border-[#E8EEEB] bg-[#123C32]">
                <img
                  src={HERO_ABIDJAN_IMAGE}
                  alt="Résidence moderne à Cocody Angré, Abidjan"
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover min-h-[300px] lg:min-h-[420px]"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#123C32]/95 via-[#123C32]/65 to-transparent p-6 text-white">
                  <div className="grid grid-cols-3 gap-4 border-t border-white/15 pt-4">
                    <div>
                      <p className="text-[11px] text-[#F0D99A]">Loyers suivis</p>
                      <p className="mt-0.5 font-mono text-base sm:text-lg font-semibold tabular-nums">100% XOF</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-[#F0D99A]">Quittances</p>
                      <p className="mt-0.5 font-mono text-base sm:text-lg font-semibold tabular-nums">PDF + QR</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-[#F0D99A]">Portail locataire</p>
                      <p className="mt-0.5 font-mono text-base sm:text-lg font-semibold tabular-nums">24h / 24</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CORE CAPABILITIES */}
      <section id="fonctionnalites" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 lg:py-20">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#185C46]">Architecture opérationnelle</p>
          <h2 className="mt-2 font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#123C32]">
            Tout votre patrimoine, vos contrats et votre trésorerie au même endroit.
          </h2>
        </div>

        <div className="mt-10 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 rounded-xl border border-[#E8EEEB] bg-white p-6 sm:p-8 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs font-mono font-semibold text-[#D6AE55]">01. SUIVI FINANCIER &amp; LOYERS</span>
                <Wallet className="h-5 w-5 text-[#185C46]" />
              </div>
              <h3 className="mt-3 font-display text-xl font-semibold text-[#123C32]">
                Génération mensuelle des échéances, paiements partiels et quittances certifiées
              </h3>
              <p className="mt-2 text-sm text-[#66736D] leading-relaxed">
                Générez vos appels de loyers sans doublon à partir des contrats actifs. Enregistrez les règlements Wave,
                Orange Money, MTN Moov, virement ou espèces avec calcul instantané du solde restant et génération du reçu PDF
                muni d’un QR code vérifiable.
              </p>
            </div>
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-[#E8EEEB] pt-5">
              <div>
                <p className="text-xs text-[#66736D]">Rapprochement</p>
                <p className="mt-0.5 text-sm font-semibold text-[#123C32]">Attendu vs Encaissé</p>
              </div>
              <div>
                <p className="text-xs text-[#66736D]">Relances</p>
                <p className="mt-0.5 text-sm font-semibold text-[#123C32]">J-5, J-2, J, J+3, J+7</p>
              </div>
              <div>
                <p className="text-xs text-[#66736D]">Exports</p>
                <p className="mt-0.5 text-sm font-semibold text-[#123C32]">PDF · Excel · CSV</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[#E8EEEB] bg-white overflow-hidden flex flex-col">
            <img
              src={resolvePropertyImage('angre')}
              alt="Résidence Angré Abidjan"
              referrerPolicy="no-referrer"
              className="h-44 w-full object-cover"
            />
            <div className="p-6 flex-1 flex flex-col justify-between">
              <div>
                <span className="text-xs font-mono font-semibold text-[#185C46]">02. PATRIMOINE STRUCTURÉ</span>
                <h3 className="mt-2 font-display text-lg font-semibold text-[#123C32]">
                  Immeubles, logements &amp; baux
                </h3>
                <p className="mt-1.5 text-sm text-[#66736D]">
                  Regroupez appartements, studios, villas et magasins par résidence avec alertes d’expiration à 90, 60 et 30 jours.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[#E8EEEB] bg-white p-6">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-semibold text-[#185C46]">03. PORTAIL LOCATAIRE</span>
              <Smartphone className="h-5 w-5 text-[#185C46]" />
            </div>
            <h3 className="mt-3 font-display text-lg font-semibold text-[#123C32]">
              Espace dédié sur mobile et PWA
            </h3>
            <p className="mt-2 text-sm text-[#66736D] leading-relaxed">
              Vos locataires accèdent en toute sécurité à leurs quittances, leur contrat, leur prochaine échéance et déclarent
              leurs incidents techniques en 30 secondes.
            </p>
          </div>

          <div className="rounded-xl border border-[#E8EEEB] bg-white p-6">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-semibold text-[#185C46]">04. RENTABILITÉ NETTE</span>
              <FileCheck2 className="h-5 w-5 text-[#185C46]" />
            </div>
            <h3 className="mt-3 font-display text-lg font-semibold text-[#123C32]">
              Dépenses, maintenance &amp; rapports
            </h3>
            <p className="mt-2 text-sm text-[#66736D] leading-relaxed">
              Enregistrez travaux, plomberie, gardiennage et taxes pour calculer le revenu net réel par logement et par
              immeuble.
            </p>
          </div>

          <div className="rounded-xl border border-[#E8EEEB] bg-[#123C32] p-6 text-white">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-semibold text-[#F0D99A]">05. ISOLATION MULTI-TENANT</span>
              <ShieldCheck className="h-5 w-5 text-[#D6AE55]" />
            </div>
            <h3 className="mt-3 font-display text-lg font-semibold">
              Sécurité bancaire &amp; rôles sur mesure
            </h3>
            <p className="mt-2 text-sm text-white/80 leading-relaxed">
              Chaque organisation dispose d’un espace cloisonné côté serveur. Attribuez des droits précis à vos gestionnaires,
              comptables et agents de terrain.
            </p>
          </div>
        </div>
      </section>

      {/* POUR LES PROPRIETAIRES & AGENCES */}
      <section id="solutions" className="border-y border-[#E8EEEB] bg-white py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#185C46]">Adapté à votre structure</p>
              <h2 className="mt-2 font-display text-2xl sm:text-3xl font-bold text-[#123C32]">
                Conçu pour les propriétaires et les agences immobilières
              </h2>
            </div>

            <div className="inline-flex rounded-lg border border-[#E8EEEB] bg-[#F6F8F7] p-1 self-start">
              <button
                type="button"
                onClick={() => setAudienceTab('owners')}
                className={`rounded-md px-4 py-1.5 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  audienceTab === 'owners' ? 'bg-white text-[#123C32] shadow-xs' : 'text-[#66736D] hover:text-[#123C32]'
                }`}
              >
                Pour les propriétaires
              </button>
              <button
                type="button"
                onClick={() => setAudienceTab('agencies')}
                className={`rounded-md px-4 py-1.5 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  audienceTab === 'agencies' ? 'bg-white text-[#123C32] shadow-xs' : 'text-[#66736D] hover:text-[#123C32]'
                }`}
              >
                Pour les agences
              </button>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
            <div className="lg:col-span-5">
              <img
                src={resolvePropertyImage(audienceTab === 'owners' ? 'cocody' : 'yopougon')}
                alt={audienceTab === 'owners' ? 'Villa Cocody Riviera' : 'Immeuble commercial et résidentiel Abidjan'}
                referrerPolicy="no-referrer"
                className="h-full min-h-[260px] w-full rounded-xl border border-[#E8EEEB] object-cover"
              />
            </div>
            <div className="lg:col-span-7 rounded-xl border border-[#E8EEEB] bg-[#F6F8F7] p-6 sm:p-8 flex flex-col justify-between">
              {audienceTab === 'owners' ? (
                <div>
                  <h3 className="font-display text-xl font-semibold text-[#123C32]">
                    Maîtrisez la rentabilité de vos villas, cours et immeubles sans tableur complexe
                  </h3>
                  <ul className="mt-5 space-y-3 text-sm text-[#123C32]">
                    <li className="flex items-start gap-2.5">
                      <Check className="h-4 w-4 text-[#185C46] mt-0.5 shrink-0" />
                      <span>Vision immédiate des loyers encaissés vs impayés depuis votre téléphone.</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <Check className="h-4 w-4 text-[#185C46] mt-0.5 shrink-0" />
                      <span>Rappels structurés avant et après échéance pour réduire les retards de paiement.</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <Check className="h-4 w-4 text-[#185C46] mt-0.5 shrink-0" />
                      <span>Suivi précis des dépenses de réparation et calcul automatique du revenu net.</span>
                    </li>
                  </ul>
                </div>
              ) : (
                <div>
                  <h3 className="font-display text-xl font-semibold text-[#123C32]">
                    Centralisez vos mandats, collaborateurs et recouvrements sur une plateforme unique
                  </h3>
                  <ul className="mt-5 space-y-3 text-sm text-[#123C32]">
                    <li className="flex items-start gap-2.5">
                      <Check className="h-4 w-4 text-[#185C46] mt-0.5 shrink-0" />
                      <span>Gestion multi-utilisateurs : administrateurs, gestionnaires, comptables et agents.</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <Check className="h-4 w-4 text-[#185C46] mt-0.5 shrink-0" />
                      <span>Quittances personnalisées avec le cachet et le RCCM de votre agence immobilière.</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <Check className="h-4 w-4 text-[#185C46] mt-0.5 shrink-0" />
                      <span>Rapports financiers exportables en PDF, Excel et CSV pour vos redditions de comptes.</span>
                    </li>
                  </ul>
                </div>
              )}

              <div className="mt-6 pt-5 border-t border-[#E8EEEB] flex flex-wrap items-center justify-between gap-4">
                <span className="text-xs text-[#66736D]">Démarrez votre espace en moins de 2 minutes.</span>
                <button
                  type="button"
                  onClick={() => onNavigate('register')}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#185C46] px-4 py-2 text-xs font-semibold text-white hover:bg-[#123C32] cursor-pointer"
                >
                  <span>Créer mon espace</span>
                  <Building2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PRICING SECTION */}
      <section id="tarifs" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 lg:py-20">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#185C46]">Tarifs transparents en XOF</p>
            <h2 className="mt-2 font-display text-2xl sm:text-3xl font-bold text-[#123C32]">
              Des offres adaptées à la taille de votre parc immobilier
            </h2>
          </div>

          <div className="inline-flex items-center rounded-lg border border-[#E8EEEB] bg-white p-1 self-start">
            <button
              type="button"
              onClick={() => setBillingCycle('monthly')}
              className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                billingCycle === 'monthly' ? 'bg-[#123C32] text-white' : 'text-[#66736D] hover:text-[#123C32]'
              }`}
            >
              Mensuel
            </button>
            <button
              type="button"
              onClick={() => setBillingCycle('annual')}
              className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                billingCycle === 'annual' ? 'bg-[#123C32] text-white' : 'text-[#66736D] hover:text-[#123C32]'
              }`}
            >
              Annuel (2 mois offerts)
            </button>
          </div>
        </div>

        <div className="mt-10 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
          {plans.map((plan) => {
            const isPro = plan.code === 'pro';
            const features = (() => {
              try {
                return JSON.parse(plan.features_json) as string[];
              } catch {
                return [];
              }
            })();
            const price =
              plan.price_monthly_xof === 0
                ? 'Sur devis'
                : billingCycle === 'annual'
                  ? `${formatXOF(plan.price_annual_xof)} / an`
                  : `${formatXOF(plan.price_monthly_xof)} / mois`;

            return (
              <div
                key={plan.id}
                className={`rounded-xl border p-6 flex flex-col justify-between bg-white ${
                  isPro ? 'border-[#185C46] ring-1 ring-[#185C46]' : 'border-[#E8EEEB]'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-display text-lg font-bold text-[#123C32]">{plan.name}</h3>
                    {isPro && <span className="text-[11px] font-semibold text-[#D6AE55]">Recommandé</span>}
                  </div>
                  <p className="mt-1 text-xs text-[#66736D]">{plan.tagline}</p>

                  <p className="mt-5 font-display text-2xl font-bold text-[#123C32] tabular-nums">{price}</p>
                  <p className="mt-1 text-xs text-[#66736D]">
                    {plan.max_properties > 9000
                      ? 'Volume illimité selon contrat'
                      : `Jusqu’à ${plan.max_properties} biens · ${plan.max_tenants} locataires`}
                  </p>

                  <ul className="mt-5 space-y-2.5 border-t border-[#E8EEEB] pt-5 text-xs text-[#123C32]">
                    {features.map((feat) => (
                      <li key={feat} className="flex items-start gap-2">
                        <Check className="h-3.5 w-3.5 text-[#185C46] mt-0.5 shrink-0" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (plan.code === 'enterprise') {
                      document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth' });
                    } else {
                      onNavigate('register', plan.code);
                    }
                  }}
                  className={`mt-6 w-full rounded-lg py-2.5 text-xs font-semibold transition-colors cursor-pointer ${
                    isPro
                      ? 'bg-[#185C46] text-white hover:bg-[#123C32]'
                      : 'border border-[#E8EEEB] bg-[#F6F8F7] text-[#123C32] hover:bg-[#E8EEEB]'
                  }`}
                >
                  {plan.code === 'enterprise' ? 'Demander un devis' : 'Essayer 14 jours'}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* FAQ & DEMO REQUEST */}
      <section id="faq" className="border-t border-[#E8EEEB] bg-white py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-12 gap-12">
          <div className="lg:col-span-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#185C46]">Questions fréquentes</p>
            <h2 className="mt-2 font-display text-2xl font-bold text-[#123C32]">
              Réponses sur le fonctionnement d’IMMOPAY CI
            </h2>

            <div className="mt-6 divide-y divide-[#E8EEEB] border-y border-[#E8EEEB]">
              {FAQS.map((item, idx) => {
                const open = openFaqIdx === idx;
                return (
                  <div key={item.q} className="py-4">
                    <button
                      type="button"
                      onClick={() => setOpenFaqIdx(open ? null : idx)}
                      className="flex w-full items-center justify-between gap-4 text-left font-display text-sm font-semibold text-[#123C32] cursor-pointer"
                    >
                      <span>{item.q}</span>
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 text-[#66736D] transition-transform ${open ? 'rotate-180' : ''}`}
                      />
                    </button>
                    {open && <p className="mt-2.5 text-sm text-[#66736D] leading-relaxed">{item.a}</p>}
                  </div>
                );
              })}
            </div>
          </div>

          <div id="demo" className="lg:col-span-6">
            <div className="rounded-xl border border-[#E8EEEB] bg-[#F6F8F7] p-6 sm:p-8">
              <h2 className="font-display text-xl font-bold text-[#123C32]">Demander une démonstration personnalisée</h2>
              <p className="mt-1.5 text-sm text-[#66736D]">
                Notre équipe basée à Abidjan vous accompagne pour migrer votre parc immobilier.
              </p>

              <form onSubmit={handleDemoSubmit} className="mt-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-[#123C32] mb-1">Nom &amp; Prénom *</label>
                    <input
                      type="text"
                      required
                      value={demoForm.fullName}
                      onChange={(e) => setDemoForm({ ...demoForm, fullName: e.target.value })}
                      placeholder="Ex. Konan Serge"
                      className="w-full rounded-lg border border-[#E8EEEB] bg-white px-3.5 py-2 text-sm text-[#123C32] focus:border-[#185C46] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#123C32] mb-1">Agence / Société</label>
                    <input
                      type="text"
                      value={demoForm.company}
                      onChange={(e) => setDemoForm({ ...demoForm, company: e.target.value })}
                      placeholder="Ex. Ivoire Habitat"
                      className="w-full rounded-lg border border-[#E8EEEB] bg-white px-3.5 py-2 text-sm text-[#123C32] focus:border-[#185C46] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-[#123C32] mb-1">Adresse e-mail *</label>
                    <input
                      type="email"
                      required
                      value={demoForm.email}
                      onChange={(e) => setDemoForm({ ...demoForm, email: e.target.value })}
                      placeholder="contact@entreprise.ci"
                      className="w-full rounded-lg border border-[#E8EEEB] bg-white px-3.5 py-2 text-sm text-[#123C32] focus:border-[#185C46] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#123C32] mb-1">Téléphone *</label>
                    <input
                      type="tel"
                      required
                      value={demoForm.phone}
                      onChange={(e) => setDemoForm({ ...demoForm, phone: e.target.value })}
                      placeholder="+225 07 00 00 00 00"
                      className="w-full rounded-lg border border-[#E8EEEB] bg-white px-3.5 py-2 text-sm text-[#123C32] focus:border-[#185C46] focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#123C32] mb-1">Nombre de lots gérés</label>
                  <select
                    value={demoForm.propertiesCount}
                    onChange={(e) => setDemoForm({ ...demoForm, propertiesCount: e.target.value })}
                    className="w-full rounded-lg border border-[#E8EEEB] bg-white px-3.5 py-2 text-sm text-[#123C32] focus:border-[#185C46] focus:outline-none"
                  >
                    <option>1 à 5 biens</option>
                    <option>6 à 30 biens</option>
                    <option>31 à 150 biens</option>
                    <option>Plus de 150 biens</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#123C32] mb-1">Précisions</label>
                  <textarea
                    rows={3}
                    value={demoForm.message}
                    onChange={(e) => setDemoForm({ ...demoForm, message: e.target.value })}
                    placeholder="Précisez vos besoins (multi-immeubles, portail locataire, formation équipe...)"
                    className="w-full rounded-lg border border-[#E8EEEB] bg-white px-3.5 py-2 text-sm text-[#123C32] focus:border-[#185C46] focus:outline-none"
                  />
                </div>

                {demoResult && (
                  <div
                    className={`rounded-lg border px-4 py-3 text-xs font-medium ${
                      demoResult.ok
                        ? 'border-[#185C46]/30 bg-[#EBF5F0] text-[#185C46]'
                        : 'border-[#D94B4B]/30 bg-[#FDECEC] text-[#D94B4B]'
                    }`}
                  >
                    {demoResult.text}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={demoSubmitting}
                  className="w-full rounded-lg bg-[#185C46] py-2.5 text-sm font-semibold text-white hover:bg-[#123C32] transition-colors cursor-pointer disabled:opacity-50"
                >
                  {demoSubmitting ? 'Envoi en cours...' : 'Envoyer la demande de démonstration'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-[#E8EEEB] bg-[#123C32] text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="md:col-span-2">
              <BrandLogo variant="light" />
              <p className="mt-3 text-sm text-[#F0D99A]">« Votre immobilier, votre tranquillité. »</p>
              <p className="mt-2 max-w-md text-xs text-white/75 leading-relaxed">
                Plateforme SaaS de gestion locative et immobilière conçue pour le marché ivoirien. Abidjan, Côte d’Ivoire.
              </p>
            </div>
            <div>
              <h4 className="font-display text-xs font-semibold uppercase tracking-wider text-[#F0D99A]">Plateforme</h4>
              <ul className="mt-3 space-y-2 text-xs text-white/80">
                <li>
                  <button type="button" onClick={() => onNavigate('login')} className="hover:text-white cursor-pointer">
                    Connexion espace client
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => onNavigate('register')} className="hover:text-white cursor-pointer">
                    Créer un compte (Essai 14 jours)
                  </button>
                </li>
                <li>
                  <a href="#tarifs" className="hover:text-white">
                    Grille tarifaire XOF
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-display text-xs font-semibold uppercase tracking-wider text-[#F0D99A]">Conformité</h4>
              <ul className="mt-3 space-y-2 text-xs text-white/80">
                <li>
                  <button type="button" onClick={() => setLegalModal('cgu')} className="hover:text-white cursor-pointer">
                    Conditions Générales d’Utilisation
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => setLegalModal('privacy')} className="hover:text-white cursor-pointer">
                    Politique de confidentialité (CI)
                  </button>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-10 border-t border-white/10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-white/60">
            <span>© {new Date().getFullYear()} IMMOPAY CI. Tous droits réservés.</span>
            <span>Devise officielle : Franc CFA (XOF)</span>
          </div>
        </div>
      </footer>

      {/* RECEIPT VERIFICATION MODAL */}
      <Modal
        open={Boolean(verifyToken)}
        onClose={() => onClearVerify?.()}
        title="Vérification d’authenticité de quittance"
        subtitle="Contrôle cryptographique IMMOPAY CI"
      >
        {verifyingData?.loading && <p className="text-sm text-[#66736D]">Vérification en cours...</p>}
        {verifyingData && !verifyingData.loading && verifyingData.valid && verifyingData.receipt && (
          <div className="space-y-3 text-sm">
            <div className="rounded-lg bg-[#EBF5F0] px-4 py-3 font-medium text-[#185C46]">
              Quittance authentique confirmée dans le registre IMMOPAY CI.
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-[#66736D]">Numéro :</span>
                <p className="font-mono font-semibold text-[#123C32]">{verifyingData.receipt.receipt_number}</p>
              </div>
              <div>
                <span className="text-[#66736D]">Organisation :</span>
                <p className="font-semibold text-[#123C32]">{verifyingData.receipt.organization_name}</p>
              </div>
              <div>
                <span className="text-[#66736D]">Bien :</span>
                <p className="font-medium text-[#123C32]">{verifyingData.receipt.property_name}</p>
              </div>
              <div>
                <span className="text-[#66736D]">Montant encaissé :</span>
                <p className="font-mono font-semibold text-[#185C46]">
                  {formatXOF(Number(verifyingData.receipt.amount_xof))}
                </p>
              </div>
            </div>
          </div>
        )}
        {verifyingData && !verifyingData.loading && !verifyingData.valid && (
          <div className="rounded-lg bg-[#FDECEC] px-4 py-3 text-sm text-[#D94B4B]">
            {verifyingData.error || 'Ce jeton de quittance est invalide ou introuvable.'}
          </div>
        )}
      </Modal>

      {/* LEGAL MODALS */}
      <Modal
        open={legalModal !== null}
        onClose={() => setLegalModal(null)}
        title={legalModal === 'cgu' ? 'Conditions Générales d’Utilisation' : 'Politique de confidentialité (Côte d’Ivoire)'}
      >
        <div className="space-y-3 text-sm text-[#66736D] leading-relaxed">
          {legalModal === 'cgu' ? (
            <>
              <p>
                IMMOPAY CI fournit une plateforme SaaS de gestion locative à destination des propriétaires, agences immobilières
                et gestionnaires opérant en Côte d’Ivoire.
              </p>
              <p>
                Les modèles de contrats de bail mis à disposition sont des outils de préparation administrative. Chaque client
                demeure responsable de la validation juridique finale de ses baux selon le droit civil et commercial ivoirien
                (Acte uniforme OHADA portant sur le droit commercial général pour les baux à usage professionnel).
              </p>
              <p>
                Les paiements électroniques transitent exclusivement via les prestataires agréés configurés ; aucun règlement
                hors ligne n’est réputé acquis sans validation explicite du gestionnaire.
              </p>
            </>
          ) : (
            <>
              <p>
                Conformément à la Loi n°2013-450 du 19 juin 2013 relative à la protection des données à caractère personnel en
                République de Côte d’Ivoire, les données des locataires, contrats et transactions sont strictement isolées par
                organisation cliente.
              </p>
              <p>
                Les données collectées servent exclusivement à l’exécution de la gestion locative, à l’édition des quittances
                et aux rappels d’échéances. Elles ne sont ni cédées ni revendues à des tiers.
              </p>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
};
