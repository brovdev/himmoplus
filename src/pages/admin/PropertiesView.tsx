import {
  Building2,
  Edit3,
  Grid,
  List,
  MapPin,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { ConfirmDialog, EmptyState, Modal, SkeletonRows, StatusIndicator } from '../../components/ui';
import { apiFetch } from '../../lib/api';
import { formatPropertyType, formatXOF } from '../../lib/format';
import { PROPERTY_IMAGE_PRESETS, resolvePropertyImage } from '../../lib/propertyImages';

interface BuildingItem {
  id: number;
  name: string;
  address: string;
  commune: string;
  city: string;
  quartier: string | null;
  floors_count: number;
  photo_url: string | null;
  description: string | null;
  units_count: number;
  occupied_count: number;
  potential_rent_xof: number;
}

interface PropertyItem {
  id: number;
  building_id: number | null;
  building_name: string | null;
  reference: string;
  name: string;
  property_type: string;
  address: string;
  commune: string;
  city: string;
  quartier: string | null;
  bedrooms: number;
  bathrooms: number;
  area_sqm: number;
  monthly_rent_xof: number;
  deposit_xof: number;
  advance_xof: number;
  condition_state: string;
  status: string;
  photo_url: string | null;
  description: string | null;
  current_tenant_name: string | null;
}

export const PropertiesView: React.FC<{
  orgId: number;
  mode: 'properties' | 'buildings' | 'units';
}> = ({ orgId, mode }) => {
  const [properties, setProperties] = useState<PropertyItem[]>([]);
  const [buildings, setBuildings] = useState<BuildingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>(mode === 'units' ? 'table' : 'grid');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [buildingFilter, setBuildingFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'newest' | 'rent_desc' | 'rent_asc'>('newest');
  const [page, setPage] = useState(1);
  const perPage = 6;

  // Modals
  const [propModalOpen, setPropModalOpen] = useState(false);
  const [editingProp, setEditingProp] = useState<PropertyItem | null>(null);
  const [bldgModalOpen, setBldgModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PropertyItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  const [propForm, setPropForm] = useState({
    name: '',
    reference: '',
    propertyType: 'appartement',
    buildingId: '',
    address: '',
    commune: 'Cocody',
    quartier: '',
    bedrooms: '2',
    bathrooms: '2',
    areaSqm: '85',
    monthlyRentXof: '250000',
    depositXof: '500000',
    advanceXof: '500000',
    status: 'disponible',
    photoUrl: 'angre',
    description: '',
  });

  const [bldgForm, setBldgForm] = useState({
    name: '',
    address: '',
    commune: 'Cocody',
    quartier: '',
    floorsCount: '3',
    photoUrl: 'angre',
    description: '',
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [pRes, bRes] = await Promise.all([
        apiFetch<{ properties: PropertyItem[] }>('/api/properties', {}, orgId),
        apiFetch<{ buildings: BuildingItem[] }>('/api/buildings', {}, orgId),
      ]);
      setProperties(pRes.properties);
      setBuildings(bRes.buildings);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [orgId]);

  const openCreateProp = () => {
    setEditingProp(null);
    setFeedbackError(null);
    setPropForm({
      name: '',
      reference: '',
      propertyType: 'appartement',
      buildingId: buildings[0]?.id ? String(buildings[0].id) : '',
      address: '',
      commune: 'Cocody',
      quartier: '',
      bedrooms: '2',
      bathrooms: '1',
      areaSqm: '75',
      monthlyRentXof: '250000',
      depositXof: '500000',
      advanceXof: '500000',
      status: 'disponible',
      photoUrl: 'angre',
      description: '',
    });
    setPropModalOpen(true);
  };

  const openEditProp = (p: PropertyItem) => {
    setEditingProp(p);
    setFeedbackError(null);
    setPropForm({
      name: p.name,
      reference: p.reference,
      propertyType: p.property_type,
      buildingId: p.building_id ? String(p.building_id) : '',
      address: p.address,
      commune: p.commune,
      quartier: p.quartier || '',
      bedrooms: String(p.bedrooms),
      bathrooms: String(p.bathrooms),
      areaSqm: String(p.area_sqm),
      monthlyRentXof: String(p.monthly_rent_xof),
      depositXof: String(p.deposit_xof),
      advanceXof: String(p.advance_xof),
      status: p.status,
      photoUrl: p.photo_url || 'angre',
      description: p.description || '',
    });
    setPropModalOpen(true);
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setFeedbackError('La photo ne doit pas dépasser 2 Mo.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPropForm((prev) => ({ ...prev, photoUrl: reader.result as string }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProperty = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedbackError(null);
    try {
      const payload = {
        ...propForm,
        buildingId: propForm.buildingId ? Number(propForm.buildingId) : null,
        bedrooms: Number(propForm.bedrooms),
        bathrooms: Number(propForm.bathrooms),
        areaSqm: Number(propForm.areaSqm),
        monthlyRentXof: Number(propForm.monthlyRentXof),
        depositXof: Number(propForm.depositXof),
        advanceXof: Number(propForm.advanceXof),
      };
      if (editingProp) {
        await apiFetch(`/api/properties/${editingProp.id}`, { method: 'PUT', body: JSON.stringify(payload) }, orgId);
      } else {
        await apiFetch('/api/properties', { method: 'POST', body: JSON.stringify(payload) }, orgId);
      }
      setPropModalOpen(false);
      await loadData();
    } catch (err) {
      setFeedbackError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBuilding = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedbackError(null);
    try {
      await apiFetch('/api/buildings', { method: 'POST', body: JSON.stringify(bldgForm) }, orgId);
      setBldgModalOpen(false);
      setBldgForm({ name: '', address: '', commune: 'Cocody', quartier: '', floorsCount: '3', photoUrl: 'angre', description: '' });
      await loadData();
    } catch (err) {
      setFeedbackError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProp = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    setFeedbackError(null);
    try {
      await apiFetch(`/api/properties/${deleteTarget.id}`, { method: 'DELETE' }, orgId);
      setDeleteTarget(null);
      await loadData();
    } catch (err) {
      setFeedbackError((err as Error).message);
      setDeleteTarget(null);
    } finally {
      setSaving(false);
    }
  };

  const filtered = useMemo(() => {
    let list = properties.filter((p) => {
      const q = search.trim().toLowerCase();
      const matchQ =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.reference.toLowerCase().includes(q) ||
        p.commune.toLowerCase().includes(q) ||
        (p.building_name || '').toLowerCase().includes(q);
      const matchStatus = statusFilter === 'all' || p.status === statusFilter;
      const matchType = typeFilter === 'all' || p.property_type === typeFilter;
      const matchBldg = buildingFilter === 'all' || String(p.building_id || 'none') === buildingFilter;
      return matchQ && matchStatus && matchType && matchBldg;
    });
    if (sortBy === 'rent_desc') list = [...list].sort((a, b) => b.monthly_rent_xof - a.monthly_rent_xof);
    if (sortBy === 'rent_asc') list = [...list].sort((a, b) => a.monthly_rent_xof - b.monthly_rent_xof);
    return list;
  }, [properties, search, statusFilter, typeFilter, buildingFilter, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);

  if (loading) return <SkeletonRows rows={6} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#123C32]">
            {mode === 'buildings' ? 'Immeubles & Résidences' : mode === 'units' ? 'Logements & Lots' : 'Biens immobiliers'}
          </h1>
          <p className="mt-0.5 text-sm text-[#66736D]">
            {buildings.length} immeuble(s) · {properties.length} bien(s) enregistrés dans votre organisation
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              setFeedbackError(null);
              setBldgModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#E8EEEB] bg-white px-3.5 py-2 text-xs font-semibold text-[#123C32] hover:bg-[#F6F8F7] cursor-pointer whitespace-nowrap"
          >
            <Building2 className="h-3.5 w-3.5 text-[#185C46]" />
            <span>Nouvel immeuble</span>
          </button>
          <button
            type="button"
            onClick={openCreateProp}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#185C46] px-4 py-2 text-xs font-semibold text-white hover:bg-[#123C32] cursor-pointer whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Ajouter un bien</span>
          </button>
        </div>
      </div>

      {feedbackError && (
        <div className="rounded-lg border border-[#D94B4B]/30 bg-[#FDECEC] px-4 py-3 text-xs font-medium text-[#D94B4B]">
          {feedbackError}
        </div>
      )}

      {/* Buildings summary cards when in buildings mode */}
      {mode === 'buildings' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {buildings.map((b) => (
            <div key={b.id} className="rounded-xl border border-[#E8EEEB] bg-white overflow-hidden">
              <img
                src={resolvePropertyImage(b.photo_url)}
                alt={b.name}
                referrerPolicy="no-referrer"
                className="h-40 w-full object-cover"
              />
              <div className="p-5">
                <h3 className="font-display text-base font-bold text-[#123C32]">{b.name}</h3>
                <p className="mt-1 flex items-center gap-1 text-xs text-[#66736D]">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{b.address} · {b.commune}</span>
                </p>
                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-[#E8EEEB] pt-3 text-xs">
                  <div>
                    <span className="text-[#66736D]">Lots</span>
                    <p className="font-mono font-semibold text-[#123C32]">{b.units_count}</p>
                  </div>
                  <div>
                    <span className="text-[#66736D]">Occupés</span>
                    <p className="font-mono font-semibold text-[#185C46]">{b.occupied_count}</p>
                  </div>
                  <div>
                    <span className="text-[#66736D]">Potentiel</span>
                    <p className="font-mono font-semibold text-[#123C32]">{formatXOF(b.potential_rent_xof)}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setBuildingFilter(String(b.id))}
                  className="mt-4 w-full rounded-lg border border-[#E8EEEB] bg-[#F6F8F7] py-1.5 text-xs font-semibold text-[#123C32] hover:bg-[#E8EEEB] cursor-pointer"
                >
                  Filtrer les lots de cet immeuble
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Search & Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E8EEEB] bg-white p-4">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <div className="relative min-w-[200px] flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#66736D]" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Rechercher nom, réf, commune..."
              className="w-full rounded-lg border border-[#E8EEEB] bg-[#F6F8F7] py-1.5 pl-9 pr-3 text-xs text-[#123C32] focus:border-[#185C46] focus:bg-white focus:outline-none"
            />
          </div>

          <select
            value={buildingFilter}
            onChange={(e) => {
              setBuildingFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-[#E8EEEB] bg-white px-3 py-1.5 text-xs text-[#123C32]"
          >
            <option value="all">Tous les immeubles</option>
            {buildings.map((b) => (
              <option key={b.id} value={String(b.id)}>
                {b.name}
              </option>
            ))}
          </select>

          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-[#E8EEEB] bg-white px-3 py-1.5 text-xs text-[#123C32]"
          >
            <option value="all">Tous types</option>
            <option value="appartement">Appartement</option>
            <option value="studio">Studio</option>
            <option value="villa">Villa</option>
            <option value="maison">Maison</option>
            <option value="magasin">Magasin</option>
            <option value="bureau">Bureau</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-[#E8EEEB] bg-white px-3 py-1.5 text-xs text-[#123C32]"
          >
            <option value="all">Tous statuts</option>
            <option value="disponible">Disponible</option>
            <option value="occupe">Occupé</option>
            <option value="maintenance">Maintenance</option>
            <option value="indisponible">Indisponible</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'newest' | 'rent_desc' | 'rent_asc')}
            className="rounded-lg border border-[#E8EEEB] bg-white px-3 py-1.5 text-xs text-[#123C32]"
          >
            <option value="newest">Plus récents</option>
            <option value="rent_desc">Loyer décroissant</option>
            <option value="rent_asc">Loyer croissant</option>
          </select>
        </div>

        <div className="inline-flex rounded-lg border border-[#E8EEEB] bg-[#F6F8F7] p-0.5">
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            className={`rounded-md p-1.5 cursor-pointer ${viewMode === 'grid' ? 'bg-white text-[#123C32] shadow-xs' : 'text-[#66736D]'}`}
            aria-label="Vue en cartes"
          >
            <Grid className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={`rounded-md p-1.5 cursor-pointer ${viewMode === 'table' ? 'bg-white text-[#123C32] shadow-xs' : 'text-[#66736D]'}`}
            aria-label="Vue en tableau"
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Building2 className="h-6 w-6" />}
          title="Aucun bien trouvé"
          description="Aucun logement ne correspond à vos filtres actuels, ou votre parc est encore vide."
          actionLabel="Ajouter un bien"
          onAction={openCreateProp}
        />
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {paginated.map((p) => (
            <div key={p.id} className="rounded-xl border border-[#E8EEEB] bg-white overflow-hidden flex flex-col justify-between">
              <div>
                <img
                  src={resolvePropertyImage(p.photo_url)}
                  alt={p.name}
                  referrerPolicy="no-referrer"
                  className="h-44 w-full object-cover"
                />
                <div className="p-5">
                  <div className="flex items-center justify-between gap-2 text-xs text-[#66736D]">
                    <span>
                      {p.reference} · {formatPropertyType(p.property_type)}
                    </span>
                    <StatusIndicator status={p.status} />
                  </div>
                  <h3 className="mt-1.5 font-display text-base font-bold text-[#123C32]">{p.name}</h3>
                  <p className="mt-1 text-xs text-[#66736D] truncate">
                    {p.building_name ? `${p.building_name} · ` : ''}
                    {p.commune}
                    {p.quartier ? ` (${p.quartier})` : ''}
                  </p>
                  {p.current_tenant_name && (
                    <p className="mt-2 text-xs text-[#185C46] font-medium">Locataire : {p.current_tenant_name}</p>
                  )}
                </div>
              </div>

              <div className="border-t border-[#E8EEEB] px-5 py-3.5 flex items-center justify-between gap-3 bg-[#F6F8F7]/50">
                <div>
                  <span className="text-[11px] text-[#66736D]">Loyer mensuel</span>
                  <p className="font-mono text-sm font-bold text-[#123C32] tabular-nums">{formatXOF(p.monthly_rent_xof)}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => openEditProp(p)}
                    className="rounded-lg border border-[#E8EEEB] bg-white p-2 text-[#123C32] hover:bg-[#E8EEEB] cursor-pointer"
                    title="Modifier"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(p)}
                    className="rounded-lg border border-[#E8EEEB] bg-white p-2 text-[#D94B4B] hover:bg-[#FDECEC] cursor-pointer"
                    title="Supprimer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-[#E8EEEB] bg-white overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#E8EEEB] bg-[#F6F8F7] text-[#66736D]">
              <tr>
                <th className="px-4 py-3 font-semibold">Réf. &amp; Nom</th>
                <th className="px-4 py-3 font-semibold">Type / Immeuble</th>
                <th className="px-4 py-3 font-semibold">Commune</th>
                <th className="px-4 py-3 font-semibold">Locataire</th>
                <th className="px-4 py-3 font-semibold text-right">Loyer mensuel</th>
                <th className="px-4 py-3 font-semibold">Statut</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8EEEB]">
              {paginated.map((p) => (
                <tr key={p.id} className="hover:bg-[#F6F8F7]/60">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-[#123C32]">{p.name}</p>
                    <p className="font-mono text-[11px] text-[#66736D]">{p.reference}</p>
                  </td>
                  <td className="px-4 py-3 text-[#66736D]">
                    {formatPropertyType(p.property_type)}
                    {p.building_name ? ` · ${p.building_name}` : ''}
                  </td>
                  <td className="px-4 py-3 text-[#66736D]">{p.commune}</td>
                  <td className="px-4 py-3 text-[#123C32]">{p.current_tenant_name || '—'}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-[#123C32] tabular-nums">
                    {formatXOF(p.monthly_rent_xof)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusIndicator status={p.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEditProp(p)}
                        className="rounded border border-[#E8EEEB] p-1.5 text-[#123C32] hover:bg-[#F6F8F7] cursor-pointer"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(p)}
                        className="rounded border border-[#E8EEEB] p-1.5 text-[#D94B4B] hover:bg-[#FDECEC] cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-[#66736D]">
          <span>
            Page {page} sur {totalPages} ({filtered.length} résultat(s))
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-lg border border-[#E8EEEB] bg-white px-3 py-1.5 font-medium text-[#123C32] disabled:opacity-40 cursor-pointer"
            >
              Précédent
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border border-[#E8EEEB] bg-white px-3 py-1.5 font-medium text-[#123C32] disabled:opacity-40 cursor-pointer"
            >
              Suivant
            </button>
          </div>
        </div>
      )}

      {/* ADD / EDIT PROPERTY MODAL */}
      <Modal
        open={propModalOpen}
        onClose={() => setPropModalOpen(false)}
        title={editingProp ? `Modifier ${editingProp.name}` : 'Ajouter un bien immobilier'}
        subtitle="Renseignez les caractéristiques du logement et son loyer en FCFA"
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleSaveProperty} className="space-y-5">
          {feedbackError && (
            <div className="rounded-lg bg-[#FDECEC] px-3.5 py-2.5 text-xs font-medium text-[#D94B4B]">
              {feedbackError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#123C32] mb-1">Nom du bien *</label>
              <input
                type="text"
                required
                value={propForm.name}
                onChange={(e) => setPropForm({ ...propForm, name: e.target.value })}
                placeholder="Ex. Appartement B4"
                className="w-full rounded-lg border border-[#E8EEEB] px-3 py-2 text-sm focus:border-[#185C46] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#123C32] mb-1">Type de bien *</label>
              <select
                value={propForm.propertyType}
                onChange={(e) => setPropForm({ ...propForm, propertyType: e.target.value })}
                className="w-full rounded-lg border border-[#E8EEEB] bg-white px-3 py-2 text-sm"
              >
                <option value="appartement">Appartement</option>
                <option value="studio">Studio</option>
                <option value="villa">Villa</option>
                <option value="maison">Maison</option>
                <option value="magasin">Magasin</option>
                <option value="bureau">Bureau</option>
                <option value="entrepot">Entrepôt</option>
                <option value="terrain">Terrain</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#123C32] mb-1">Immeuble rattaché</label>
              <select
                value={propForm.buildingId}
                onChange={(e) => setPropForm({ ...propForm, buildingId: e.target.value })}
                className="w-full rounded-lg border border-[#E8EEEB] bg-white px-3 py-2 text-sm"
              >
                <option value="">Bien indépendant</option>
                {buildings.map((b) => (
                  <option key={b.id} value={String(b.id)}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#123C32] mb-1">Commune *</label>
              <input
                type="text"
                required
                value={propForm.commune}
                onChange={(e) => setPropForm({ ...propForm, commune: e.target.value })}
                className="w-full rounded-lg border border-[#E8EEEB] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#123C32] mb-1">Quartier</label>
              <input
                type="text"
                value={propForm.quartier}
                onChange={(e) => setPropForm({ ...propForm, quartier: e.target.value })}
                placeholder="Ex. Angré 8e Tranche"
                className="w-full rounded-lg border border-[#E8EEEB] px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#123C32] mb-1">Adresse complète *</label>
            <input
              type="text"
              required
              value={propForm.address}
              onChange={(e) => setPropForm({ ...propForm, address: e.target.value })}
              placeholder="Rue, lot, étage..."
              className="w-full rounded-lg border border-[#E8EEEB] px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#123C32] mb-1">Loyer (FCFA) *</label>
              <input
                type="number"
                required
                min={1000}
                value={propForm.monthlyRentXof}
                onChange={(e) => setPropForm({ ...propForm, monthlyRentXof: e.target.value })}
                className="w-full rounded-lg border border-[#E8EEEB] px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#123C32] mb-1">Caution (FCFA)</label>
              <input
                type="number"
                value={propForm.depositXof}
                onChange={(e) => setPropForm({ ...propForm, depositXof: e.target.value })}
                className="w-full rounded-lg border border-[#E8EEEB] px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#123C32] mb-1">Chambres</label>
              <input
                type="number"
                min={0}
                value={propForm.bedrooms}
                onChange={(e) => setPropForm({ ...propForm, bedrooms: e.target.value })}
                className="w-full rounded-lg border border-[#E8EEEB] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#123C32] mb-1">Statut</label>
              <select
                value={propForm.status}
                onChange={(e) => setPropForm({ ...propForm, status: e.target.value })}
                className="w-full rounded-lg border border-[#E8EEEB] bg-white px-3 py-2 text-sm"
              >
                <option value="disponible">Disponible</option>
                <option value="occupe">Occupé</option>
                <option value="maintenance">Maintenance</option>
                <option value="indisponible">Indisponible</option>
              </select>
            </div>
          </div>

          {/* Photo preview & upload */}
          <div className="rounded-lg border border-[#E8EEEB] bg-[#F6F8F7] p-4">
            <label className="block text-xs font-semibold text-[#123C32] mb-2">Photo du bien (aperçu avant enregistrement)</label>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <img
                src={resolvePropertyImage(propForm.photoUrl)}
                alt="Aperçu du bien"
                referrerPolicy="no-referrer"
                className="h-20 w-32 rounded-lg border border-[#E8EEEB] object-cover shrink-0"
              />
              <div className="space-y-2 flex-1">
                <div className="flex flex-wrap gap-2">
                  {PROPERTY_IMAGE_PRESETS.map((preset) => (
                    <button
                      key={preset.key}
                      type="button"
                      onClick={() => setPropForm({ ...propForm, photoUrl: preset.key })}
                      className={`rounded-md border px-2.5 py-1 text-[11px] font-medium cursor-pointer ${
                        propForm.photoUrl === preset.key
                          ? 'border-[#185C46] bg-[#185C46] text-white'
                          : 'border-[#E8EEEB] bg-white text-[#123C32]'
                      }`}
                    >
                      {preset.label.split(' ')[1]}
                    </button>
                  ))}
                </div>
                <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#185C46] cursor-pointer hover:underline">
                  <Upload className="h-3.5 w-3.5" />
                  <span>Importer une photo locale (JPG/PNG)</span>
                  <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                </label>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setPropModalOpen(false)}
              className="rounded-lg border border-[#E8EEEB] px-4 py-2 text-sm font-medium text-[#123C32] cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[#185C46] px-5 py-2 text-sm font-semibold text-white hover:bg-[#123C32] cursor-pointer disabled:opacity-50"
            >
              {saving ? 'Enregistrement...' : editingProp ? 'Mettre à jour' : 'Enregistrer le bien'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ADD BUILDING MODAL */}
      <Modal
        open={bldgModalOpen}
        onClose={() => setBldgModalOpen(false)}
        title="Ajouter un immeuble ou une résidence"
        subtitle="Regroupez plusieurs appartements ou locaux commerciaux"
      >
        <form onSubmit={handleSaveBuilding} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#123C32] mb-1">Nom de l’immeuble *</label>
            <input
              type="text"
              required
              value={bldgForm.name}
              onChange={(e) => setBldgForm({ ...bldgForm, name: e.target.value })}
              placeholder="Ex. Résidence Marcory Zone 4"
              className="w-full rounded-lg border border-[#E8EEEB] px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#123C32] mb-1">Commune *</label>
              <input
                type="text"
                required
                value={bldgForm.commune}
                onChange={(e) => setBldgForm({ ...bldgForm, commune: e.target.value })}
                className="w-full rounded-lg border border-[#E8EEEB] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#123C32] mb-1">Étages</label>
              <input
                type="number"
                min={1}
                value={bldgForm.floorsCount}
                onChange={(e) => setBldgForm({ ...bldgForm, floorsCount: e.target.value })}
                className="w-full rounded-lg border border-[#E8EEEB] px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#123C32] mb-1">Adresse *</label>
            <input
              type="text"
              required
              value={bldgForm.address}
              onChange={(e) => setBldgForm({ ...bldgForm, address: e.target.value })}
              className="w-full rounded-lg border border-[#E8EEEB] px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setBldgModalOpen(false)}
              className="rounded-lg border border-[#E8EEEB] px-4 py-2 text-sm font-medium text-[#123C32] cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[#185C46] px-5 py-2 text-sm font-semibold text-white hover:bg-[#123C32] cursor-pointer"
            >
              {saving ? 'Création...' : 'Créer l’immeuble'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Supprimer ce bien immobilier ?"
        message={`Êtes-vous sûr de vouloir archiver « ${deleteTarget?.name} » ? Cette action requiert qu'aucun contrat actif ne soit rattaché à ce bien.`}
        confirmLabel="Supprimer"
        danger
        loading={saving}
        onConfirm={handleDeleteProp}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
