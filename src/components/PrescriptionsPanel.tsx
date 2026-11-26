import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Download, Plus, Trash2, Search, QrCode, Calendar, Stethoscope, Pill } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { downloadPrescriptionPdf, PrescriptionMedicineRow } from '../lib/pdfGenerators';

interface Props {
  userRole: string;
  onNotify: (msg: string, tone?: 'success' | 'error') => void;
  refreshSignal: number;
}

const emptyMedicine = (): PrescriptionMedicineRow => ({
  name: '',
  dosage: '',
  frequency: '',
  duration: '',
  instructions: '',
});

export const PrescriptionsPanel: React.FC<Props> = ({ userRole, onNotify, refreshSignal }) => {
  const isDoctor = userRole === 'doctor';
  const isAdmin = userRole === 'admin';

  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  // Filters (especially for Admin & History)
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Doctor Write Prescription form state
  const [patientId, setPatientId] = useState('');
  const [appointmentId, setAppointmentId] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [symptoms, setSymptoms] = useState('');
  const [medicines, setMedicines] = useState<PrescriptionMedicineRow[]>([emptyMedicine()]);
  const [testsInput, setTestsInput] = useState('');
  const [advice, setAdvice] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');

  const loadPrescriptions = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter && statusFilter !== 'All') params.set('status', statusFilter);
      if (fromDate) params.set('from_date', fromDate);
      if (toDate) params.set('to_date', toDate);
      if (searchTerm.trim()) params.set('q', searchTerm.trim());
      const qs = params.toString() ? `?${params.toString()}` : '';
      const endpoint = isAdmin ? `/api/admin/prescriptions${qs}` : `/api/clinical/prescriptions${qs}`;
      const res = await apiRequest<{ prescriptions: any[] }>(endpoint);
      setPrescriptions(res.prescriptions || []);
    } catch (err: any) {
      onNotify(err.message || 'Could not load prescriptions.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPrescriptions();
  }, [userRole, refreshSignal, statusFilter, fromDate, toDate]);

  useEffect(() => {
    if (!isDoctor) return;
    apiRequest<{ patients: any[] }>('/api/patients')
      .then((res) => {
        const list = res.patients || [];
        setPatients(list);
        if (!patientId && list[0]) setPatientId(String(list[0].id));
      })
      .catch(() => {});
    apiRequest<{ appointments: any[] }>('/api/appointments')
      .then((res) => setAppointments(res.appointments || []))
      .catch(() => {});
  }, [isDoctor]);

  const patientAppointments = useMemo(() => {
    if (!patientId) return [];
    return appointments.filter((a) => String(a.patient_id) === String(patientId));
  }, [appointments, patientId]);

  const handleAddMedicineRow = () => {
    setMedicines((prev) => [...prev, emptyMedicine()]);
  };

  const handleRemoveMedicineRow = (idx: number) => {
    setMedicines((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  };

  const handleUpdateMedicine = (idx: number, field: keyof PrescriptionMedicineRow, val: string) => {
    setMedicines((prev) => prev.map((row, i) => (i === idx ? { ...row, [field]: val } : row)));
  };

  const handleSubmitPrescription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientId) {
      onNotify('Please select a patient.', 'error');
      return;
    }
    if (!diagnosis.trim()) {
      onNotify('Please enter a diagnosis.', 'error');
      return;
    }
    const validMeds = medicines.filter((m) => m.name.trim() && m.dosage.trim() && m.frequency.trim() && m.duration.trim());
    if (validMeds.length === 0) {
      onNotify('Add at least one complete medicine entry (name, dosage, frequency, duration).', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const tests = testsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      await apiRequest('/api/clinical/prescriptions', {
        method: 'POST',
        body: {
          patient_id: Number(patientId),
          appointment_id: appointmentId ? Number(appointmentId) : null,
          diagnosis: diagnosis.trim(),
          symptoms: symptoms.trim(),
          medicines: validMeds,
          tests_recommended: tests,
          advice: advice.trim(),
          follow_up_date: followUpDate || null,
        },
      });
      onNotify('Prescription saved & sent to patient and pharmacy.', 'success');
      setAppointmentId('');
      setDiagnosis('');
      setSymptoms('');
      setMedicines([emptyMedicine()]);
      setTestsInput('');
      setAdvice('');
      setFollowUpDate('');
      loadPrescriptions();
    } catch (err: any) {
      onNotify(err.message || 'Failed to save prescription.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadPdf = async (rx: any) => {
    setDownloadingId(rx.id);
    try {
      await downloadPrescriptionPdf(rx);
      onNotify(`Downloaded PDF for ${rx.prescription_ref}.`, 'success');
    } catch (err: any) {
      onNotify(err.message || 'Could not generate PDF.', 'error');
    } finally {
      setDownloadingId(null);
    }
  };

  const displayedPrescriptions = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return prescriptions;
    return prescriptions.filter(
      (rx) =>
        String(rx.prescription_ref || '').toLowerCase().includes(q) ||
        String(rx.patient_name || '').toLowerCase().includes(q) ||
        String(rx.doctor_name || '').toLowerCase().includes(q) ||
        String(rx.diagnosis || '').toLowerCase().includes(q)
    );
  }, [prescriptions, searchTerm]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">
            {isAdmin ? 'All Hospital Prescriptions' : isDoctor ? 'Write & Manage Prescriptions' : 'My Prescriptions'}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            {isDoctor
              ? 'Issue structured multi-medicine prescriptions with instant A4 PDF and pharmacy verification QR codes.'
              : isAdmin
                ? 'Hospital-wide prescription oversight with date and status filters and PDF export.'
                : 'View your doctor prescriptions and download official A4 PDFs with pharmacy verification QR codes.'}
          </p>
        </div>
      </div>

      {/* DOCTOR WRITE PRESCRIPTION FORM */}
      {isDoctor && (
        <form onSubmit={handleSubmitPrescription} className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-xs space-y-5 text-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Stethoscope className="w-4 h-4 text-blue-600" />
              <h3 className="font-bold text-base text-slate-900">Write Prescription</h3>
            </div>
            <span className="text-slate-500 font-medium">A4 PDF + Verification QR generated automatically</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Select Patient *</label>
              <select
                required
                value={patientId}
                onChange={(e) => {
                  setPatientId(e.target.value);
                  setAppointmentId('');
                }}
                className="w-full px-3 py-2.5 bg-slate-100 rounded-xl font-medium"
              >
                <option value="">Choose patient...</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name} ({p.patient_code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Linked Appointment (Optional)</label>
              <select
                value={appointmentId}
                onChange={(e) => setAppointmentId(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-100 rounded-xl font-medium"
              >
                <option value="">Standalone Prescription</option>
                {patientAppointments.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.appointment_ref} · {a.appointment_date} {a.appointment_time} ({a.status})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Diagnosis *</label>
              <input
                required
                placeholder="e.g., Acute Viral Upper Respiratory Infection"
                value={diagnosis}
                onChange={(e) => setDiagnosis(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-100 rounded-xl"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Symptoms</label>
              <input
                placeholder="e.g., Fever 101F, dry cough, throat soreness"
                value={symptoms}
                onChange={(e) => setSymptoms(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-100 rounded-xl"
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-slate-800 text-sm">
                <Pill className="w-4 h-4 text-blue-600" />
                <span>Medicines ({medicines.length})</span>
              </div>
              <button
                type="button"
                onClick={handleAddMedicineRow}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl font-semibold"
              >
                <Plus className="w-3.5 h-3.5" /> Add medicine
              </button>
            </div>

            <div className="space-y-2.5">
              {medicines.map((med, idx) => (
                <div key={idx} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200/70 items-center">
                  <input
                    required
                    placeholder="Medicine Name *"
                    value={med.name}
                    onChange={(e) => handleUpdateMedicine(idx, 'name', e.target.value)}
                    className="lg:col-span-3 px-3 py-2 bg-white border border-slate-200 rounded-lg"
                  />
                  <input
                    required
                    placeholder="Dosage (e.g. 500mg) *"
                    value={med.dosage}
                    onChange={(e) => handleUpdateMedicine(idx, 'dosage', e.target.value)}
                    className="lg:col-span-2 px-3 py-2 bg-white border border-slate-200 rounded-lg"
                  />
                  <input
                    required
                    placeholder="Frequency (e.g. 1-0-1) *"
                    value={med.frequency}
                    onChange={(e) => handleUpdateMedicine(idx, 'frequency', e.target.value)}
                    className="lg:col-span-2 px-3 py-2 bg-white border border-slate-200 rounded-lg"
                  />
                  <input
                    required
                    placeholder="Duration (e.g. 5 days) *"
                    value={med.duration}
                    onChange={(e) => handleUpdateMedicine(idx, 'duration', e.target.value)}
                    className="lg:col-span-2 px-3 py-2 bg-white border border-slate-200 rounded-lg"
                  />
                  <input
                    placeholder="Instructions (After food)"
                    value={med.instructions || ''}
                    onChange={(e) => handleUpdateMedicine(idx, 'instructions', e.target.value)}
                    className="lg:col-span-2 px-3 py-2 bg-white border border-slate-200 rounded-lg"
                  />
                  <div className="lg:col-span-1 flex justify-end">
                    <button
                      type="button"
                      disabled={medicines.length <= 1}
                      onClick={() => handleRemoveMedicineRow(idx)}
                      className="p-2 text-slate-400 hover:text-rose-600 disabled:opacity-30 rounded-lg"
                      title="Remove medicine row"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Tests Recommended (comma-separated)</label>
              <input
                placeholder="e.g., Complete Blood Count (CBC), Chest X-Ray"
                value={testsInput}
                onChange={(e) => setTestsInput(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-100 rounded-xl"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Advice / Notes</label>
              <input
                placeholder="Hydration, rest, return if fever persists > 72h"
                value={advice}
                onChange={(e) => setAdvice(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-100 rounded-xl"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Follow-up Date (Optional)</label>
              <input
                type="date"
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-100 rounded-xl"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl font-semibold shadow-sm"
            >
              {submitting ? 'Saving Prescription...' : 'Issue & Save Prescription'}
            </button>
          </div>
        </form>
      )}

      {/* FILTERS BAR */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs flex flex-wrap items-center gap-3 text-xs">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by RX ref, patient, doctor, or diagnosis..."
            className="w-full pl-9 pr-3 py-2 bg-slate-100 rounded-xl"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 bg-slate-100 rounded-xl font-semibold text-slate-700"
        >
          <option value="All">All Statuses</option>
          <option value="Requested">Requested</option>
          <option value="Dispensed">Dispensed</option>
        </select>
        <div className="flex items-center gap-1.5 bg-slate-100 px-3 py-1.5 rounded-xl">
          <Calendar className="w-3.5 h-3.5 text-slate-500" />
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="bg-transparent" />
          <span className="text-slate-400">to</span>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="bg-transparent" />
        </div>
        {(fromDate || toDate || statusFilter !== 'All' || searchTerm) && (
          <button
            type="button"
            onClick={() => {
              setSearchTerm('');
              setStatusFilter('All');
              setFromDate('');
              setToDate('');
            }}
            className="px-3 py-2 text-blue-600 font-semibold hover:bg-blue-50 rounded-xl"
          >
            Reset
          </button>
        )}
      </div>

      {/* PRESCRIPTIONS LIST */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-600" />
            <h3 className="font-bold text-sm text-slate-900">
              {isDoctor ? 'Issued Prescriptions' : isAdmin ? 'Prescription Registry' : 'My Prescriptions'} ({displayedPrescriptions.length})
            </h3>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading prescriptions...</div>
        ) : displayedPrescriptions.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">No prescriptions found matching the current filters.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {displayedPrescriptions.map((rx) => (
              <div key={rx.id} className="p-4 sm:p-5 hover:bg-slate-50/70 transition-colors space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-lg">
                        {rx.prescription_ref}
                      </span>
                      <span className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold ${
                        String(rx.status).toLowerCase() === 'dispensed'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {rx.status}
                      </span>
                      <span className="text-xs text-slate-500 font-mono">
                        {String(rx.created_at || '').slice(0, 10)}
                      </span>
                    </div>
                    <div className="mt-1.5 text-sm font-bold text-slate-900">
                      {rx.diagnosis || rx.notes || 'Clinical Prescription'}
                    </div>
                    <div className="text-xs text-slate-600 mt-0.5">
                      Patient: <span className="font-semibold text-slate-800">{rx.patient_name}</span> ({rx.patient_code})
                      {' · '}
                      Doctor: <span className="font-semibold text-slate-800">{rx.doctor_name}</span> ({rx.specialization || 'General'})
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <a
                      href={`/verify/prescription/${encodeURIComponent(rx.prescription_ref)}`}
                      className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      <span>Verify Link</span>
                    </a>
                    <button
                      type="button"
                      disabled={downloadingId === rx.id}
                      onClick={() => handleDownloadPdf(rx)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl text-xs font-semibold shadow-xs"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>{downloadingId === rx.id ? 'Generating...' : 'Download PDF'}</span>
                    </button>
                  </div>
                </div>

                {Array.isArray(rx.medicines) && rx.medicines.length > 0 && (
                  <div className="overflow-x-auto bg-slate-50 rounded-xl border border-slate-200/70">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="text-slate-500 border-b border-slate-200/70">
                          <th className="py-2 px-3 font-semibold">Medicine</th>
                          <th className="py-2 px-3 font-semibold">Dosage</th>
                          <th className="py-2 px-3 font-semibold">Frequency</th>
                          <th className="py-2 px-3 font-semibold">Duration</th>
                          <th className="py-2 px-3 font-semibold">Instructions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200/50">
                        {rx.medicines.map((m: any, idx: number) => (
                          <tr key={idx}>
                            <td className="py-2 px-3 font-semibold text-slate-900">{m.name}</td>
                            <td className="py-2 px-3 text-slate-700">{m.dosage}</td>
                            <td className="py-2 px-3 text-slate-700">{m.frequency}</td>
                            <td className="py-2 px-3 text-slate-700">{m.duration}</td>
                            <td className="py-2 px-3 text-slate-500">{m.instructions || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {(rx.tests_recommended?.length > 0 || rx.advice || rx.follow_up_date) && (
                  <div className="flex flex-wrap gap-4 text-xs text-slate-600 pt-1">
                    {rx.tests_recommended?.length > 0 && (
                      <span><strong>Tests:</strong> {rx.tests_recommended.join(', ')}</span>
                    )}
                    {rx.advice && (
                      <span><strong>Advice:</strong> {rx.advice}</span>
                    )}
                    {rx.follow_up_date && (
                      <span className="text-blue-700 font-semibold"><strong>Follow-up:</strong> {rx.follow_up_date}</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
