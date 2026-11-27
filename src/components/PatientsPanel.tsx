import React, { useEffect, useMemo, useState } from 'react';
import { Users, Plus, X, Eye, HeartPulse, FileText, AlertCircle, Download } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { downloadPatientRegistryPdf } from '../lib/pdfGenerators';
import { VitalsTrendChart } from './VitalsTrendChart';

interface Props {
  searchQuery: string;
  userRole: string;
  onNotify: (msg: string, tone?: 'success' | 'error') => void;
  refreshSignal: number;
}

export const PatientsPanel: React.FC<Props> = ({ searchQuery, userRole, onNotify, refreshSignal }) => {
  const [patients, setPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [patientDetail, setPatientDetail] = useState<any>(null);
  const [myVitals, setMyVitals] = useState<any[]>([]);
  const [showRecordVitals, setShowRecordVitals] = useState(false);
  const [vitalsForm, setVitalsForm] = useState({
    blood_pressure: '120/78',
    pulse: '74',
    temperature: '36.8',
    respiratory_rate: '16',
    oxygen_saturation: '99',
  });
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    dob: '1992-05-14',
    gender: 'Female',
    blood_group: 'O+',
    address: '',
  });

  const loadPatients = async () => {
    setLoading(true);
    try {
      if (userRole === 'patient') {
        const res = await apiRequest('/api/patients/me/dashboard');
        setPatients(res.profile ? [res.profile] : []);
        setMyVitals(Array.isArray(res.vitals) ? res.vitals : []);
      } else {
        const res = await apiRequest('/api/patients');
        setPatients(res.patients || []);
        setMyVitals([]);
      }
    } catch (e: any) {
      onNotify(e.message || 'Unable to load patients', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPatients();
  }, [userRole, refreshSignal]);

  // Real-time local client-side filter as user types without API round-trip
  const filteredPatients = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter((p) =>
      [p.full_name, p.patient_code, p.email, p.phone, p.blood_group, p.gender]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [patients, searchQuery]);

  const handleViewDetail = async (p: any) => {
    setSelectedPatient(p);
    setShowRecordVitals(false);
    try {
      const detail = await apiRequest(`/api/patients/${p.id}`);
      setPatientDetail(detail);
    } catch (e: any) {
      setPatientDetail({ error: e.message });
    }
  };

  const handleRecordVitals = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) return;
    try {
      await apiRequest('/api/nursing/vitals', {
        method: 'POST',
        body: {
          patient_id: selectedPatient.id,
          encounter_type: 'OPD',
          blood_pressure: vitalsForm.blood_pressure.trim(),
          pulse: Number(vitalsForm.pulse),
          temperature: Number(vitalsForm.temperature),
          respiratory_rate: Number(vitalsForm.respiratory_rate),
          oxygen_saturation: Number(vitalsForm.oxygen_saturation),
        },
      });
      onNotify(`Vitals logged for ${selectedPatient.full_name}.`, 'success');
      setShowRecordVitals(false);
      const detail = await apiRequest(`/api/patients/${selectedPatient.id}`);
      setPatientDetail(detail);
    } catch (err: any) {
      onNotify(err.message || 'Failed to record vitals', 'error');
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/patients', { method: 'POST', body: form });
      onNotify(`Patient ${form.full_name} registered successfully.`, 'success');
      setShowRegister(false);
      setForm({ full_name: '', email: '', phone: '', dob: '1992-05-14', gender: 'Female', blood_group: 'O+', address: '' });
      loadPatients();
    } catch (err: any) {
      onNotify(err.message || 'Failed to register patient', 'error');
    }
  };

  return (
    <div className="space-y-6 relative pb-16">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Patient Directory & Electronic Health Records</h2>
          <p className="text-sm text-slate-500 mt-1">
            Live SQLite patient registry with instant client-side search filtering and role-gated clinical chart inspection.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => downloadPatientRegistryPdf(filteredPatients, userRole)}
            className="flex items-center space-x-1.5 bg-slate-900 hover:bg-slate-800 text-white px-3.5 py-2.5 rounded-xl text-xs font-semibold shadow-xs"
            title="Export Registry PDF Summary"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            <span>Export Registry PDF</span>
          </button>
          {['admin', 'receptionist'].includes(userRole) && (
            <button
              onClick={() => setShowRegister(true)}
              className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-xs font-semibold shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Register New Patient</span>
            </button>
          )}
        </div>
      </div>

      {['admin', 'receptionist', 'doctor', 'nurse'].includes(userRole) && (
        <button
          type="button"
          onClick={() => setShowRegister(true)}
          className="fixed bottom-6 right-6 z-40 bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-full shadow-2xl flex items-center gap-2 font-bold text-xs transition-transform hover:scale-105"
          title="Rapid Inpatient Registration"
        >
          <Plus className="w-4 h-4" />
          <span>Quick Add Patient</span>
        </button>
      )}

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center space-x-2 text-xs font-semibold text-slate-600">
            <Users className="w-4 h-4 text-blue-600" />
            <span>Showing {filteredPatients.length} of {patients.length} patient records</span>
          </div>
          {loading && <span className="text-xs text-blue-600 font-medium">Syncing...</span>}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold text-xs uppercase tracking-wider">
                <th className="p-4">MRN / Code</th>
                <th className="p-4">Full Name</th>
                <th className="p-4">Demographics</th>
                <th className="p-4">Contact</th>
                <th className="p-4">Blood Group</th>
                <th className="p-4 text-right">Chart</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredPatients.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="p-4 font-mono text-xs font-semibold text-blue-600">{p.patient_code}</td>
                  <td className="p-4">
                    <div className="font-semibold text-slate-900 text-xs">{p.full_name}</div>
                    <div className="text-[11px] text-slate-500">{p.address || 'Address on file'}</div>
                  </td>
                  <td className="p-4 text-xs text-slate-700">{p.gender} · DOB {p.dob}</td>
                  <td className="p-4 text-xs text-slate-600">
                    <div>{p.phone || 'N/A'}</div>
                    <div className="text-[11px] text-slate-400">{p.email}</div>
                  </td>
                  <td className="p-4 text-xs font-semibold text-slate-800">{p.blood_group || 'Unknown'}</td>
                  <td className="p-4 text-right">
                    <button
                      onClick={() => handleViewDetail(p)}
                      className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 text-xs font-semibold"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Open EHR</span>
                    </button>
                  </td>
                </tr>
              ))}
              {filteredPatients.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-10 text-center text-xs text-slate-400">
                    No matching patient records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {userRole === 'patient' && (
        <VitalsTrendChart vitals={myVitals} patientName={patients[0]?.full_name} />
      )}

      {showRegister && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <form onSubmit={handleRegister} className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 border border-slate-100 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg text-slate-900">Register New Patient</h3>
              <button type="button" onClick={() => setShowRegister(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input required placeholder="Full Name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="px-3.5 py-2.5 bg-slate-100 rounded-xl text-sm" />
              <input required type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="px-3.5 py-2.5 bg-slate-100 rounded-xl text-sm" />
              <input required placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="px-3.5 py-2.5 bg-slate-100 rounded-xl text-sm" />
              <input required type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} className="px-3.5 py-2.5 bg-slate-100 rounded-xl text-sm" />
              <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} className="px-3.5 py-2.5 bg-slate-100 rounded-xl text-sm">
                <option value="Female">Female</option>
                <option value="Male">Male</option>
                <option value="Other">Other</option>
              </select>
              <select value={form.blood_group} onChange={(e) => setForm({ ...form, blood_group: e.target.value })} className="px-3.5 py-2.5 bg-slate-100 rounded-xl text-sm">
                {['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'].map((bg) => <option key={bg} value={bg}>{bg}</option>)}
              </select>
            </div>
            <input required placeholder="Residential Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full px-3.5 py-2.5 bg-slate-100 rounded-xl text-sm" />
            <div className="flex space-x-3 pt-2">
              <button type="button" onClick={() => setShowRegister(false)} className="flex-1 py-2.5 bg-slate-100 text-slate-700 font-semibold text-sm rounded-xl">Cancel</button>
              <button type="submit" className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl">Save Patient</button>
            </div>
          </form>
        </div>
      )}

      {selectedPatient && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full p-6 border border-slate-100 max-h-[90vh] overflow-y-auto space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-lg text-slate-900">{selectedPatient.full_name}</h3>
                <p className="text-xs text-slate-500">{selectedPatient.patient_code} · {selectedPatient.gender} · DOB {selectedPatient.dob}</p>
              </div>
              <button onClick={() => { setSelectedPatient(null); setPatientDetail(null); setShowRecordVitals(false); }} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            {patientDetail?.error ? (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{patientDetail.error}</span>
              </div>
            ) : patientDetail ? (
              <div className="space-y-4">
                {patientDetail.clinicalRestricted && (
                  <div className="p-3 bg-slate-100 rounded-xl text-xs text-slate-600">
                    Clinical vitals and diagnoses are restricted by hospital RBAC policy for your active role.
                  </div>
                )}
                {patientDetail.clinical && (
                  <>
                    <VitalsTrendChart
                      vitals={patientDetail.clinical.vitals || []}
                      patientName={selectedPatient.full_name}
                      compact
                      canRecordVitals={['doctor', 'nurse'].includes(userRole)}
                      onRequestRecordVitals={() => setShowRecordVitals((v) => !v)}
                    />

                    {showRecordVitals && ['doctor', 'nurse'].includes(userRole) && (
                      <form onSubmit={handleRecordVitals} className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-800">Record New Vitals Reading</span>
                          <button type="button" onClick={() => setShowRecordVitals(false)} className="text-xs text-slate-500 hover:text-slate-800">Close</button>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600 mb-1">BP (mmHg)</label>
                            <input required value={vitalsForm.blood_pressure} onChange={(e) => setVitalsForm({ ...vitalsForm, blood_pressure: e.target.value })} placeholder="120/78" className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono" />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Pulse (bpm)</label>
                            <input required type="number" min={20} max={250} value={vitalsForm.pulse} onChange={(e) => setVitalsForm({ ...vitalsForm, pulse: e.target.value })} className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono" />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Temp (°C)</label>
                            <input required type="number" step="0.1" min={30} max={45} value={vitalsForm.temperature} onChange={(e) => setVitalsForm({ ...vitalsForm, temperature: e.target.value })} className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono" />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Resp (/min)</label>
                            <input required type="number" min={5} max={60} value={vitalsForm.respiratory_rate} onChange={(e) => setVitalsForm({ ...vitalsForm, respiratory_rate: e.target.value })} className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono" />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600 mb-1">SpO2 (%)</label>
                            <input required type="number" min={50} max={100} value={vitalsForm.oxygen_saturation} onChange={(e) => setVitalsForm({ ...vitalsForm, oxygen_saturation: e.target.value })} className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono" />
                          </div>
                        </div>
                        <div className="flex justify-end">
                          <button type="submit" className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold">Save Vitals</button>
                        </div>
                      </form>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                        <h4 className="font-semibold text-xs uppercase text-slate-600 flex items-center gap-1.5 mb-2">
                          <HeartPulse className="w-4 h-4 text-rose-500" /> Recent Vitals
                        </h4>
                        {patientDetail.clinical.vitals.length ? patientDetail.clinical.vitals.slice(0, 4).map((v: any) => (
                          <div key={v.id} className="text-xs text-slate-700 py-1.5 border-b border-slate-200/60 last:border-0 font-mono tabular-nums">
                            BP {v.blood_pressure} · Pulse {v.pulse} · SpO2 {v.oxygen_saturation}% · Temp {v.temperature}°C
                          </div>
                        )) : <p className="text-xs text-slate-400">No vitals recorded yet.</p>}
                      </div>
                      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                        <h4 className="font-semibold text-xs uppercase text-slate-600 flex items-center gap-1.5 mb-2">
                          <FileText className="w-4 h-4 text-blue-600" /> Consultations & Diagnoses
                        </h4>
                        {patientDetail.clinical.consultations.length ? patientDetail.clinical.consultations.slice(0, 4).map((c: any) => (
                          <div key={c.id} className="text-xs text-slate-700 py-1.5 border-b border-slate-200/60 last:border-0">
                            <span className="font-semibold">{c.chief_complaint}</span> — {c.treatment_plan || 'Follow-up'}
                          </div>
                        )) : <p className="text-xs text-slate-400">No consultation notes recorded.</p>}
                      </div>
                    </div>
                  </>
                )}
                <div>
                  <h4 className="font-semibold text-xs uppercase text-slate-600 mb-2">Appointment History</h4>
                  <div className="space-y-1.5">
                    {(patientDetail.appointments || []).slice(0, 5).map((a: any) => (
                      <div key={a.id} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg text-xs">
                        <span>{a.appointment_date} {a.appointment_time} · {a.doctor_name} ({a.department_name})</span>
                        <span className="font-semibold text-blue-700">{a.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 py-6 text-center">Loading electronic health record...</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
