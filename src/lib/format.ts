export function formatXOF(amount: number | null | undefined): string {
  const val = Math.round(Number(amount || 0));
  return `${val.toLocaleString('fr-FR')} FCFA`;
}

export function formatShortXOF(amount: number | null | undefined): string {
  const val = Math.round(Number(amount || 0));
  if (Math.abs(val) >= 1_000_000) {
    return `${(val / 1_000_000).toFixed(1).replace('.', ',')} M FCFA`;
  }
  return `${val.toLocaleString('fr-FR')} FCFA`;
}

export function formatDateFR(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

const MONTHS_FR = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
];

export function formatPeriodFR(periodLabel: string): string {
  const [y, m] = periodLabel.split('-');
  const idx = Number(m) - 1;
  if (!y || idx < 0 || idx > 11) return periodLabel;
  return `${MONTHS_FR[idx]} ${y}`;
}

export function formatPaymentMethod(method: string): string {
  const map: Record<string, string> = {
    wave: 'Wave',
    orange_money: 'Orange Money',
    mtn_money: 'MTN Mobile Money',
    moov_money: 'Moov Money',
    virement: 'Virement bancaire',
    especes: 'Espèces',
    cheque: 'Chèque',
  };
  return map[method] || method;
}

export function formatPropertyType(type: string): string {
  const map: Record<string, string> = {
    appartement: 'Appartement',
    studio: 'Studio',
    villa: 'Villa',
    maison: 'Maison',
    magasin: 'Magasin',
    bureau: 'Bureau',
    entrepot: 'Entrepôt',
    terrain: 'Terrain',
  };
  return map[type] || type;
}
