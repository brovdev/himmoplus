import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';
import * as XLSX from 'xlsx';
import { formatDateFR, formatPaymentMethod, formatPeriodFR, formatXOF } from './format';

export interface ReceiptExportData {
  receipt_number: string;
  verification_token: string;
  issued_at: string;
  balance_remaining_xof: number;
  payment_ref: string;
  amount_xof: number;
  payment_method: string;
  payment_date: string;
  transaction_ref?: string | null;
  tenant_name: string;
  tenant_phone?: string;
  property_name: string;
  property_address: string;
  commune?: string;
  period_label: string;
  organization_name: string;
  organization_address?: string | null;
  stamp_text?: string | null;
}

export async function downloadReceiptPDF(receipt: ReceiptExportData): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const verifyUrl = `${window.location.origin}/?verify=${receipt.verification_token}`;
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, { width: 220, margin: 1, color: { dark: '#123C32', light: '#FFFFFF' } });

  // Header band
  doc.setFillColor(18, 60, 50); // #123C32
  doc.rect(0, 0, 210, 38, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('IMMOPAY CI', 16, 18);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(240, 217, 154); // #F0D99A
  doc.text('QUITTANCE DE LOYER / REÇU DE PAIEMENT', 16, 26);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.text(`N° ${receipt.receipt_number}`, 194, 18, { align: 'right' });
  doc.setFontSize(8.5);
  doc.text(`Émis le ${formatDateFR(receipt.issued_at)}`, 194, 25, { align: 'right' });

  // Organization & Tenant Info
  doc.setTextColor(18, 60, 50);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('BAILLEUR / GESTIONNAIRE', 16, 52);
  doc.text('LOCATAIRE', 115, 52);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(50, 60, 55);
  doc.text(receipt.organization_name, 16, 59);
  if (receipt.organization_address) doc.text(receipt.organization_address, 16, 65, { maxWidth: 85 });

  doc.text(receipt.tenant_name, 115, 59);
  if (receipt.tenant_phone) doc.text(receipt.tenant_phone, 115, 65);
  doc.text(`Bien : ${receipt.property_name}`, 115, 71);
  doc.text(`${receipt.property_address}${receipt.commune ? `, ${receipt.commune}` : ''}`, 115, 77, { maxWidth: 80 });

  // Payment summary table
  autoTable(doc, {
    startY: 92,
    head: [['Désignation', 'Période', 'Mode de paiement', 'Référence', 'Montant']],
    body: [
      [
        `Règlement de loyer — ${receipt.property_name}`,
        formatPeriodFR(receipt.period_label),
        formatPaymentMethod(receipt.payment_method),
        receipt.transaction_ref || receipt.payment_ref,
        formatXOF(receipt.amount_xof),
      ],
    ],
    headStyles: { fillColor: [24, 92, 70], textColor: 255, fontSize: 9.5 },
    bodyStyles: { textColor: [18, 60, 50], fontSize: 9.5 },
    columnStyles: { 4: { halign: 'right', fontStyle: 'bold' } },
  });

  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 125;

  // Totals box
  doc.setFillColor(246, 248, 247);
  doc.roundedRect(16, finalY + 8, 178, 26, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(18, 60, 50);
  doc.text(`Montant total encaissé : ${formatXOF(receipt.amount_xof)}`, 22, finalY + 18);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(`Solde restant dû pour la période : ${formatXOF(receipt.balance_remaining_xof)}`, 22, finalY + 26);

  // Stamp & QR Code
  const qrY = finalY + 46;
  doc.addImage(qrDataUrl, 'PNG', 16, qrY, 34, 34);
  doc.setFontSize(8.5);
  doc.setTextColor(102, 115, 109);
  doc.text('Vérification d’authenticité', 55, qrY + 8);
  doc.text(`Scannez le QR code ou utilisez le jeton :`, 55, qrY + 14);
  doc.setFont('courier', 'bold');
  doc.setTextColor(18, 60, 50);
  doc.text(receipt.verification_token, 55, qrY + 20);

  // Stamp block
  doc.setDrawColor(214, 174, 85);
  doc.setLineWidth(0.6);
  doc.roundedRect(128, qrY, 66, 30, 2, 2, 'S');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(24, 92, 70);
  doc.text('CACHET & VALIDATION', 161, qrY + 8, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(receipt.stamp_text || receipt.organization_name, 161, qrY + 16, { align: 'center', maxWidth: 60 });
  doc.text(`Date : ${formatDateFR(receipt.payment_date)}`, 161, qrY + 24, { align: 'center' });

  doc.setFontSize(8);
  doc.setTextColor(102, 115, 109);
  doc.text('Document généré via IMMOPAY CI — Votre immobilier, votre tranquillité.', 105, 282, { align: 'center' });

  doc.save(`${receipt.receipt_number}.pdf`);
}

export function downloadContractPDF(contract: {
  reference: string;
  property_name: string;
  commune?: string;
  tenant_name: string;
  tenant_phone?: string;
  start_date: string;
  end_date: string;
  monthly_rent_xof: number;
  deposit_xof: number;
  advance_xof: number;
  due_day: number;
  special_terms?: string | null;
  organization_name: string;
}): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setFillColor(18, 60, 50);
  doc.rect(0, 0, 210, 32, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('CONTRAT DE BAIL LOCATIF', 16, 16);
  doc.setFontSize(9.5);
  doc.setTextColor(240, 217, 154);
  doc.text(`Référence : ${contract.reference} · Établi via IMMOPAY CI`, 16, 24);

  doc.setTextColor(18, 60, 50);
  doc.setFontSize(10.5);
  doc.text('Entre les soussignés :', 16, 44);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(`Bailleur / Mandataire : ${contract.organization_name}`, 16, 52);
  doc.text(`Preneur (Locataire) : ${contract.tenant_name} (${contract.tenant_phone || 'Téléphone non renseigné'})`, 16, 59);

  autoTable(doc, {
    startY: 68,
    head: [['Clause', 'Détails']],
    body: [
      ['Bien loué', `${contract.property_name}${contract.commune ? ` (${contract.commune})` : ''}`],
      ['Durée du bail', `Du ${formatDateFR(contract.start_date)} au ${formatDateFR(contract.end_date)}`],
      ['Loyer mensuel', formatXOF(contract.monthly_rent_xof)],
      ['Caution (Dépôt de garantie)', formatXOF(contract.deposit_xof)],
      ['Avance sur loyer', formatXOF(contract.advance_xof)],
      ['Jour d’échéance mensuelle', `Le ${contract.due_day} de chaque mois`],
      ['Conditions particulières', contract.special_terms || 'Aucune condition particulière additionnelle.'],
    ],
    headStyles: { fillColor: [24, 92, 70], textColor: 255 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 } },
  });

  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 160;
  doc.setFontSize(8.5);
  doc.setTextColor(102, 115, 109);
  doc.text(
    'Avertissement : ce document est un modèle de travail généré par IMMOPAY CI. Il ne constitue pas un acte notarié et doit être vérifié par un conseil juridique au regard du droit ivoirien en vigueur.',
    16,
    finalY + 12,
    { maxWidth: 178 }
  );

  doc.setTextColor(18, 60, 50);
  doc.setFont('helvetica', 'bold');
  doc.text('Signature du Bailleur / Agence', 16, finalY + 34);
  doc.text('Signature du Locataire', 130, finalY + 34);

  doc.save(`${contract.reference}.pdf`);
}

export function exportRowsToCSV(filename: string, headers: string[], rows: Array<Array<string | number>>): void {
  const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = [headers.map(escape).join(';'), ...rows.map((r) => r.map(escape).join(';'))].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportRowsToExcel(filename: string, sheetName: string, data: Array<Record<string, string | number>>): void {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export function exportReportPDF(
  title: string,
  organizationName: string,
  headers: string[],
  rows: Array<Array<string | number>>
): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setFillColor(18, 60, 50);
  doc.rect(0, 0, 210, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(title, 14, 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(240, 217, 154);
  doc.text(`${organizationName} · Généré le ${new Date().toLocaleDateString('fr-FR')}`, 14, 21);

  autoTable(doc, {
    startY: 34,
    head: [headers],
    body: rows,
    headStyles: { fillColor: [24, 92, 70], textColor: 255, fontSize: 9 },
    bodyStyles: { fontSize: 8.5, textColor: [18, 60, 50] },
  });

  doc.save(`${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`);
}
