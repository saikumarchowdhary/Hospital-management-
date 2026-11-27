import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';

export interface PrescriptionMedicineRow {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions?: string;
}

export interface PrescriptionRecord {
  id: number;
  prescription_ref: string;
  patient_name: string;
  patient_code?: string;
  patient_age?: number | null;
  patient_gender?: string;
  doctor_name: string;
  specialization?: string;
  registration_number?: string;
  department_name?: string;
  diagnosis?: string;
  symptoms?: string;
  medicines: PrescriptionMedicineRow[];
  tests_recommended?: string[];
  advice?: string;
  notes?: string;
  follow_up_date?: string | null;
  created_at: string;
  hospital?: {
    name?: string;
    address?: string;
    phone?: string;
  };
}

export interface BillReceiptRecord {
  id: number;
  payment_ref: string;
  receipt_number?: string;
  invoice_number?: string;
  bill_type?: string;
  description?: string;
  amount: number;
  status: string;
  transaction_id?: string | null;
  payment_method?: string;
  patient_name: string;
  patient_code?: string;
  patient_phone?: string;
  patient_email?: string;
  created_at: string;
  paid_at?: string;
  items?: Array<{
    category?: string;
    description: string;
    quantity: number;
    unit_price: number;
    line_total: number;
  }>;
}

function sanitizeFilenamePart(value: string) {
  return String(value || 'Patient')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'Record';
}

export async function downloadPrescriptionPdf(rx: PrescriptionRecord) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const hospitalName = rx.hospital?.name || 'CareLine HMS';
  const hospitalAddress = rx.hospital?.address || '100 Medical Center Pkwy, Metro City';
  const hospitalPhone = rx.hospital?.phone || '+1-555-0100';
  const dateStr = String(rx.created_at || new Date().toISOString()).slice(0, 10);

  // Header band
  doc.setFillColor(30, 94, 255);
  doc.rect(0, 0, 210, 30, 'F');

  // Vector medical cross logo
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(14, 7, 16, 16, 3, 3, 'F');
  doc.setFillColor(30, 94, 255);
  doc.rect(20.5, 10, 3, 10, 'F');
  doc.rect(17, 13.5, 10, 3, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(hospitalName, 35, 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`${hospitalAddress}  |  Tel: ${hospitalPhone}`, 35, 21);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('MEDICAL PRESCRIPTION', 196, 12, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Ref: ${rx.prescription_ref}`, 196, 18, { align: 'right' });
  doc.text(`Date: ${dateStr}`, 196, 23, { align: 'right' });

  // Doctor & Patient cards
  doc.setTextColor(15, 23, 42);
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, 36, 88, 26, 2, 2, 'FD');
  doc.roundedRect(108, 36, 88, 26, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 94, 255);
  doc.text('PRESCRIBING PHYSICIAN', 18, 42);
  doc.text('PATIENT DETAILS', 112, 42);

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(10);
  doc.text(rx.doctor_name || 'Attending Physician', 18, 48);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(`Specialization: ${rx.specialization || rx.department_name || 'General Medicine'}`, 18, 53.5);
  doc.text(`Reg. No: ${rx.registration_number || 'Verified HMS Reg'}`, 18, 58.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(rx.patient_name || 'Patient', 112, 48);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  const ageLabel = rx.patient_age !== null && rx.patient_age !== undefined ? `${rx.patient_age} yrs` : 'N/A';
  doc.text(`Patient ID: ${rx.patient_code || `PT-${rx.id}`}`, 112, 53.5);
  doc.text(`Age / Gender: ${ageLabel} / ${rx.patient_gender || 'N/A'}`, 112, 58.5);

  // Diagnosis & Symptoms
  let y = 69;
  doc.setFillColor(239, 246, 255);
  doc.setDrawColor(191, 219, 254);
  doc.roundedRect(14, y, 182, rx.symptoms ? 20 : 13, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(30, 64, 175);
  doc.text('Diagnosis:', 18, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(String(rx.diagnosis || 'Clinical Assessment').slice(0, 95), 39, y + 6);

  if (rx.symptoms) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 64, 175);
    doc.text('Symptoms:', 18, y + 13.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(String(rx.symptoms).slice(0, 95), 39, y + 13.5);
    y += 26;
  } else {
    y += 19;
  }

  // Rx Symbol + Medicines Table
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('Rx — Prescribed Medicines', 14, y);
  y += 3;

  const medRows = (rx.medicines || []).map((m, idx) => [
    `${idx + 1}. ${m.name}`,
    m.dosage,
    m.frequency,
    m.duration,
    m.instructions || '—'
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Medicine', 'Dosage', 'Frequency', 'Duration', 'Instructions']],
    body: medRows.length > 0 ? medRows : [['No medicines listed', '—', '—', '—', '—']],
    theme: 'grid',
    margin: { left: 14, right: 14 },
    headStyles: { fillColor: [30, 94, 255], textColor: [255, 255, 255], fontSize: 8.5, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8.5, textColor: [30, 41, 59] },
    alternateRowStyles: { fillColor: [248, 250, 252] }
  });

  const tableEndY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 8 : y + 40;
  let nextY = Math.min(tableEndY, 225);

  if (Array.isArray(rx.tests_recommended) && rx.tests_recommended.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text('Tests Recommended:', 14, nextY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const wrappedTests = doc.splitTextToSize(rx.tests_recommended.join(', '), 138);
    doc.text(wrappedTests, 54, nextY);
    nextY += wrappedTests.length * 4.5 + 4;
  }

  const adviceText = rx.advice || rx.notes;
  if (adviceText) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text('Advice / Notes:', 14, nextY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const wrappedAdvice = doc.splitTextToSize(String(adviceText), 138);
    doc.text(wrappedAdvice, 54, nextY);
    nextY += wrappedAdvice.length * 4.5 + 4;
  }

  if (rx.follow_up_date) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(30, 94, 255);
    doc.text(`Follow-up Date: ${rx.follow_up_date}`, 14, nextY);
  }

  // Verification QR code bottom-left
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://careline-hms.local';
  const verifyUrl = `${origin}/verify/prescription/${encodeURIComponent(rx.prescription_ref)}`;
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, { width: 180, margin: 1 });

  doc.setDrawColor(226, 232, 240);
  doc.line(14, 242, 196, 242);
  doc.addImage(qrDataUrl, 'PNG', 14, 246, 28, 28);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text('PHARMACY VERIFICATION QR', 46, 253);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(`Prescription ID: ${rx.prescription_ref}`, 46, 258);
  doc.text(`Doctor: ${rx.doctor_name}`, 46, 263);
  doc.text('Scan to verify authenticity online.', 46, 268);

  // Signature bottom-right
  doc.setDrawColor(100, 116, 139);
  doc.line(135, 262, 194, 262);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(rx.doctor_name, 164.5, 267, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(`Doctor Signature (${rx.registration_number || 'Verified'})`, 164.5, 271.5, { align: 'center' });

  // Mandatory footer note
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('This is a computer-generated prescription.', 105, 286, { align: 'center' });

  const fileName = `Prescription_${sanitizeFilenamePart(rx.patient_name)}_${dateStr}.pdf`;
  doc.save(fileName);
}

export async function downloadPaymentReceiptPdf(
  bill: BillReceiptRecord,
  config?: { hospitalName?: string; hospitalAddress?: string; hospitalPhone?: string; upiId?: string }
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const hospitalName = config?.hospitalName || 'CareLine HMS';
  const hospitalAddress = config?.hospitalAddress || '100 Medical Center Pkwy, Metro City';
  const hospitalPhone = config?.hospitalPhone || '+1-555-0100';
  const paidDate = String(bill.paid_at || bill.created_at || new Date().toISOString()).slice(0, 19).replace('T', ' ');

  // Header
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 210, 32, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(hospitalName, 14, 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`${hospitalAddress}  |  Tel: ${hospitalPhone}`, 14, 21);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('OFFICIAL PAYMENT RECEIPT', 196, 13, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Receipt #: ${bill.receipt_number || bill.payment_ref}`, 196, 19, { align: 'right' });
  doc.text(`Bill Ref: ${bill.payment_ref}`, 196, 25, { align: 'right' });

  // PAID Stamp
  doc.setDrawColor(16, 185, 129);
  doc.setFillColor(236, 253, 245);
  doc.roundedRect(156, 40, 40, 14, 2, 2, 'FD');
  doc.setTextColor(5, 150, 105);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('PAID', 176, 49.5, { align: 'center' });

  // Patient & Payment metadata
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('BILLED TO PATIENT', 14, 43);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(bill.patient_name || 'Patient', 14, 49);
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`Patient ID: ${bill.patient_code || '—'}   |   Phone: ${bill.patient_phone || '—'}`, 14, 54.5);
  if (bill.patient_email) {
    doc.text(`Email: ${bill.patient_email}`, 14, 59.5);
  }

  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, 66, 182, 22, 2, 2, 'FD');
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.text('Payment Method:', 18, 73);
  doc.text('Transaction ID / UTR:', 18, 79);
  doc.text('Payment Date:', 110, 73);
  doc.text('Invoice #:', 110, 79);
  doc.setFont('helvetica', 'normal');
  doc.text(bill.payment_method || 'UPI QR', 52, 73);
  doc.text(bill.transaction_id || bill.payment_ref, 52, 79);
  doc.text(paidDate, 138, 73);
  doc.text(bill.invoice_number || bill.payment_ref, 138, 79);

  // Bill Items Table
  const tableRows = (bill.items && bill.items.length > 0
    ? bill.items
    : [{ category: bill.bill_type || 'other', description: bill.description || 'Hospital Bill', quantity: 1, unit_price: bill.amount, line_total: bill.amount }]
  ).map((it, idx) => [
    String(idx + 1),
    it.description,
    String(it.category || bill.bill_type || 'Service').toUpperCase(),
    String(it.quantity || 1),
    `INR ${Number(it.line_total ?? it.unit_price ?? bill.amount).toFixed(2)}`
  ]);

  autoTable(doc, {
    startY: 94,
    head: [['#', 'Bill Description', 'Type', 'Qty', 'Amount']],
    body: tableRows,
    theme: 'grid',
    margin: { left: 14, right: 14 },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontSize: 8.5 },
    bodyStyles: { fontSize: 9, textColor: [30, 41, 59] },
    columnStyles: { 4: { halign: 'right', fontStyle: 'bold' } }
  });

  const endY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 8 : 135;
  doc.setFillColor(236, 253, 245);
  doc.setDrawColor(167, 243, 208);
  doc.roundedRect(120, endY, 76, 16, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(6, 95, 70);
  doc.text('Total Amount Paid:', 125, endY + 10);
  doc.setFontSize(11);
  doc.text(`INR ${Number(bill.amount).toFixed(2)}`, 192, endY + 10, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('This is a computer-generated payment receipt verified by CareLine HMS.', 105, 282, { align: 'center' });

  const fileName = `Receipt_${sanitizeFilenamePart(bill.receipt_number || bill.payment_ref)}_${sanitizeFilenamePart(bill.patient_name)}.pdf`;
  doc.save(fileName);
}

export async function downloadPatientRegistryPdf(patients: any[], userRole: string, hospitalName = 'CareLine HMS') {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const dateStr = new Date().toISOString().slice(0, 10);

  // Header band
  doc.setFillColor(30, 94, 255);
  doc.rect(0, 0, 210, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(`${hospitalName} — Patient Registry Summary`, 14, 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(`Generated: ${dateStr}  |  Role Clearance: ${userRole.toUpperCase()}  |  Secure & Role-Restricted`, 14, 20);

  const rows = (patients || []).map((p, idx) => [
    String(idx + 1),
    p.patient_code || `PT-${p.id}`,
    p.full_name || 'Patient',
    `${p.gender || 'N/A'} (DOB: ${p.dob || 'N/A'})`,
    p.blood_group || 'N/A',
    p.phone || p.email || 'N/A',
    p.address || '—'
  ]);

  autoTable(doc, {
    startY: 34,
    head: [['#', 'MRN / Code', 'Full Name', 'Demographics', 'Blood Group', 'Contact', 'Address']],
    body: rows.length > 0 ? rows : [['1', 'N/A', 'No patients found', '—', '—', '—', '—']],
    theme: 'grid',
    margin: { left: 14, right: 14 },
    headStyles: { fillColor: [30, 94, 255], textColor: [255, 255, 255], fontSize: 8.5, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8, textColor: [30, 41, 59] },
    alternateRowStyles: { fillColor: [248, 250, 252] }
  });

  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('Confidential Electronic Health Record Summary — Authorized Hospital Personnel Only.', 105, 285, { align: 'center' });

  doc.save(`Patient_Registry_Summary_${dateStr}.pdf`);
}

