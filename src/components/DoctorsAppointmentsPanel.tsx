import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, Clock, UserCheck, Plus, CheckCircle2, X } from 'lucide-react';
import { apiRequest } from '../lib/api';

interface Props {
  mode: 'doctors' | 'appointments';
  searchQuery: string;
  userRole: string;
  onNotify: (msg: string, tone?: 'success' | 'error') => void;
  refreshSignal: number;
}

export const DoctorsAppointmentsPanel: React.FC<Props> = ({ mode, searchQuery, userRole, onNotify, refreshSignal }) => {
  const [doctors, setDoctors] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [showBookModal, setShowBookModal] = useState(false);
  const [slots, setSlots] = useState<any[]>([]);
  const [booking, setBooking] = useState({
    doctor_id: '',
    patient_id: '',
    appointment_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    appointment_time: '',
    visit_type: 'In-Person',
    reason: 'General clinical consultation',
  });

  const loadData = async () => {
    try {
      const [docsRes, apptsRes] = await Promise.all([
        apiRequest('/api/doctors'),
        apiRequest('/api/appointments').catch(() => ({ appointments: [] })),
      ]);
      setDoctors(docsRes.doctors || []);
      setAppointments(apptsRes.appointments || []);
      if (userRole !== 'patient') {
        const patRes = await apiRequest('/api/patients').catch(() => ({ patients: [] }));
        setPatients(patRes.patients || []);
      }
    } catch (e: any) {
      onNotify(e.message || 'Failed loading schedule data', 'error');
    }
  };

  useEffect(() => {
    loadData();
  }, [userRole, refreshSignal]);

  useEffect(() => {
    if (!booking.doctor_id || !booking.appointment_date) return;
    apiRequest(`/api/doctors/${booking.doctor_id}/slots?date=${booking.appointment_date}`)
      .then((res) => {
        const list = res.slots || [];
        setSlots(list);
        const firstAvail = list.find((s: any) => s.status === 'Available');
        if (firstAvail) setBooking((prev) => ({ ...prev, appointment_time: firstAvail.slot_time }));
      })
      .catch(() => setSlots([]));
  }, [booking.doctor_id, booking.appointment_date]);

  const filteredDoctors = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return doctors;
    return doctors.filter((d) =>
      [d.full_name, d.specialty_name, d.department_name, d.branch_name, d.availability_status]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [doctors, searchQuery]);

  const filteredAppointments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return appointments;
    return appointments.filter((a) =>
      [a.appointment_ref, a.patient_name, a.doctor_name, a.specialty_name, a.status]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [appointments, searchQuery]);

  const handleBook = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/appointments', {
        method: 'POST',
        body: {
          doctor_id: Number(booking.doctor_id),
          patient_id: booking.patient_id ? Number(booking.patient_id) : undefined,
          appointment_date: booking.appointment_date,
          appointment_time: booking.appointment_time,
          visit_type: booking.visit_type,
          reason: booking.reason,
        },
      });
      onNotify('Appointment booked and confirmation dispatched.', 'success');
      setShowBookModal(false);
      loadData();
    } catch (err: any) {
      onNotify(err.message || 'Booking failed', 'error');
    }
  };

  const handleTransition = async (id: number, status: string) => {
    try {
      await apiRequest(`/api/appointments/${id}/status`, { method: 'PATCH', body: { status } });
      onNotify(`Appointment updated to ${status}.`, 'success');
      loadData();
    } catch (err: any) {
      onNotify(err.message || 'Status update failed', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">
            {mode === 'doctors' ? 'Doctors Directory & Availability' : 'Appointments & Consultation Queue'}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Connected to SQLite schedules, slot reservation locks, and real-time check-in/consultation transitions.
          </p>
        </div>
        {mode === 'appointments' && ['admin', 'receptionist', 'patient'].includes(userRole) && (
          <button
            onClick={() => {
              if (!booking.doctor_id && doctors[0]) {
                setBooking((b) => ({ ...b, doctor_id: String(doctors[0].id), patient_id: patients[0] ? String(patients[0].id) : '' }));
              }
              setShowBookModal(true);
            }}
            className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-xs font-semibold shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Book Appointment</span>
          </button>
        )}
      </div>

      {mode === 'doctors' ? (
        filteredDoctors.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/80 p-10 text-center text-sm text-slate-500">
            {doctors.length === 0
              ? 'No verified doctors are registered yet. Doctors will appear here once verified and scheduled by Hospital Administration.'
              : 'No doctors match your current search filter.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredDoctors.map((doc) => (
              <div key={doc.id} className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-center justify-between">
                    <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                      <UserCheck className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-semibold text-emerald-700">{doc.availability_status || 'Available'}</span>
                  </div>
                  <h3 className="font-bold text-slate-900 text-base mt-3">{doc.full_name}</h3>
                  <p className="text-xs text-slate-500">{doc.specialty_name} · {doc.department_name}</p>
                  <p className="text-xs text-slate-500 mt-1">{doc.branch_name} · {doc.qualification} · {doc.experience_years} yrs exp</p>
                </div>
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-900">${doc.consultation_fee} Fee</span>
                  {userRole !== 'doctor' && (
                    <button
                      onClick={() => {
                        setBooking((b) => ({ ...b, doctor_id: String(doc.id), patient_id: patients[0] ? String(patients[0].id) : '' }));
                        setShowBookModal(true);
                      }}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg"
                    >
                      Check Slots
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold text-xs uppercase tracking-wider">
                  <th className="p-4">Ref</th>
                  <th className="p-4">Patient</th>
                  <th className="p-4">Doctor & Specialty</th>
                  <th className="p-4">Date & Slot</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAppointments.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50/80">
                    <td className="p-4 font-mono text-xs font-semibold text-blue-600">{a.appointment_ref}</td>
                    <td className="p-4 text-xs font-semibold text-slate-900">{a.patient_name}</td>
                    <td className="p-4 text-xs text-slate-700">{a.doctor_name} · {a.specialty_name}</td>
                    <td className="p-4 text-xs text-slate-600 font-mono">{a.appointment_date} {a.appointment_time}</td>
                    <td className="p-4 text-xs font-semibold text-slate-800">{a.status}</td>
                    <td className="p-4 text-right space-x-2">
                      {a.status === 'Booked' && userRole !== 'patient' && (
                        <button onClick={() => handleTransition(a.id, 'Confirmed')} className="px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-semibold">
                          Confirm
                        </button>
                      )}
                      {['Booked', 'Confirmed'].includes(a.status) && userRole !== 'patient' && (
                        <button onClick={() => handleTransition(a.id, 'Checked In')} className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-semibold">
                          Check In
                        </button>
                      )}
                      {!['Cancelled', 'Completed'].includes(a.status) && (
                        <button onClick={() => handleTransition(a.id, 'Cancelled')} className="px-2.5 py-1 bg-rose-50 text-rose-700 rounded-lg text-xs font-semibold">
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredAppointments.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-10 text-center text-xs text-slate-400">No appointments found for your scope.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showBookModal && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <form onSubmit={handleBook} className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 border border-slate-100 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-600" /> Schedule Appointment
              </h3>
              <button type="button" onClick={() => setShowBookModal(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            {userRole !== 'patient' && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Patient</label>
                <select required value={booking.patient_id} onChange={(e) => setBooking({ ...booking, patient_id: e.target.value })} className="w-full px-3.5 py-2.5 bg-slate-100 rounded-xl text-sm">
                  <option value="">Select patient...</option>
                  {patients.map((p) => <option key={p.id} value={p.id}>{p.full_name} ({p.patient_code})</option>)}
                </select>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Doctor</label>
                <select required value={booking.doctor_id} onChange={(e) => setBooking({ ...booking, doctor_id: e.target.value })} className="w-full px-3.5 py-2.5 bg-slate-100 rounded-xl text-sm">
                  {doctors.map((d) => <option key={d.id} value={d.id}>{d.full_name} ({d.specialty_name})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Date</label>
                <input required type="date" value={booking.appointment_date} onChange={(e) => setBooking({ ...booking, appointment_date: e.target.value })} className="w-full px-3.5 py-2.5 bg-slate-100 rounded-xl text-sm" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Available Time Slots</label>
              <div className="grid grid-cols-4 gap-2">
                {slots.map((s) => (
                  <button
                    key={s.id || s.slot_time}
                    type="button"
                    disabled={s.status !== 'Available'}
                    onClick={() => setBooking({ ...booking, appointment_time: s.slot_time })}
                    className={`py-2 px-2 rounded-lg text-xs font-semibold border transition-all ${
                      s.status !== 'Available'
                        ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                        : booking.appointment_time === s.slot_time
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-blue-400'
                    }`}
                  >
                    <Clock className="w-3 h-3 inline mr-1" />{s.slot_time}
                  </button>
                ))}
              </div>
            </div>
            <input required placeholder="Visit Reason" value={booking.reason} onChange={(e) => setBooking({ ...booking, reason: e.target.value })} className="w-full px-3.5 py-2.5 bg-slate-100 rounded-xl text-sm" />
            <div className="flex space-x-3 pt-2">
              <button type="button" onClick={() => setShowBookModal(false)} className="flex-1 py-2.5 bg-slate-100 text-slate-700 font-semibold text-sm rounded-xl">Cancel</button>
              <button type="submit" disabled={!booking.appointment_time} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-sm rounded-xl flex items-center justify-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> Confirm Booking
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
