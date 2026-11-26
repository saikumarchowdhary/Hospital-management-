import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Users,
  Calendar,
  Activity,
  CheckCircle2,
  XCircle,
  Plus,
  Search,
  Edit3,
  Clock,
  BedDouble,
  Briefcase,
  X,
  Shield,
} from 'lucide-react';
import { apiRequest } from '../lib/api';

interface Props {
  onNotify: (msg: string, tone?: 'success' | 'error') => void;
  refreshSignal: number;
  initialSubTab?: 'overview' | 'employees' | 'patients_ops' | 'leaves' | 'activity';
}

export const DepartmentAdminDashboardPanel: React.FC<Props> = ({
  onNotify,
  refreshSignal,
  initialSubTab = 'overview',
}) => {
  const [subTab, setSubTab] = useState<'overview' | 'employees' | 'patients_ops' | 'leaves' | 'activity'>(initialSubTab);
  const [data, setData] = useState<any>(null);
  const [empSearch, setEmpSearch] = useState('');
  const [empModalOpen, setEmpModalOpen] = useState(false);
  const [editingEmp, setEditingEmp] = useState<any>(null);
  const [empForm, setEmpForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    role_id: '',
    designation: 'Department Staff',
    employment_type: 'Full-Time',
    qualification: '',
    shift: 'Day',
    employee_code: '',
    base_salary: '4800',
    employment_status: 'Active',
    password: '',
  });

  useEffect(() => {
    setSubTab(initialSubTab);
  }, [initialSubTab]);

  const loadDashboard = async () => {
    try {
      const res = await apiRequest('/api/department-admin/dashboard');
      setData(res);
    } catch (err: any) {
      onNotify(err.message || 'Unable to load department workspace.', 'error');
    }
  };

  useEffect(() => {
    loadDashboard();
  }, [refreshSignal]);

  const filteredEmployees = useMemo(() => {
    const q = empSearch.trim().toLowerCase();
    return (data?.employees || []).filter((e: any) => {
      if (!q) return true;
      return `${e.full_name} ${e.employee_code} ${e.email} ${e.designation || ''} ${e.role_name || ''}`
        .toLowerCase()
        .includes(q);
    });
  }, [data?.employees, empSearch]);

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingEmp) {
        await apiRequest(`/api/department-admin/employees/${editingEmp.id}`, {
          method: 'PATCH',
          body: {
            full_name: empForm.full_name,
            phone: empForm.phone,
            designation: empForm.designation,
            employment_type: empForm.employment_type,
            qualification: empForm.qualification,
            shift: empForm.shift,
            employment_status: empForm.employment_status,
            base_salary: Number(empForm.base_salary),
          },
        });
        onNotify(`Updated ${empForm.full_name} in ${data?.department?.name}.`, 'success');
      } else {
        await apiRequest('/api/department-admin/employees', {
          method: 'POST',
          body: {
            full_name: empForm.full_name,
            email: empForm.email,
            phone: empForm.phone,
            role_id: Number(empForm.role_id),
            designation: empForm.designation,
            employment_type: empForm.employment_type,
            qualification: empForm.qualification,
            shift: empForm.shift,
            employee_code: empForm.employee_code,
            base_salary: Number(empForm.base_salary),
            password: empForm.password,
          },
        });
        onNotify(`Added ${empForm.full_name} to ${data?.department?.name}.`, 'success');
      }
      setEmpModalOpen(false);
      loadDashboard();
    } catch (err: any) {
      onNotify(err.message || 'Failed saving department staff.', 'error');
    }
  };

  const handleAppointmentStatus = async (apptId: number, status: string) => {
    try {
      await apiRequest(`/api/department-admin/appointments/${apptId}/status`, {
        method: 'PATCH',
        body: { status },
      });
      onNotify(`Appointment updated to ${status}.`, 'success');
      loadDashboard();
    } catch (err: any) {
      onNotify(err.message || 'Could not update appointment.', 'error');
    }
  };

  const handleLeaveDecision = async (leaveId: number, status: 'Approved' | 'Rejected') => {
    try {
      await apiRequest(`/api/department-admin/leaves/${leaveId}`, {
        method: 'PATCH',
        body: { status },
      });
      onNotify(`Leave request ${status.toLowerCase()}.`, 'success');
      loadDashboard();
    } catch (err: any) {
      onNotify(err.message || 'Could not process leave request.', 'error');
    }
  };

  const dept = data?.department;
  const k = data?.kpis || {};

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-800 text-xs font-bold mb-2">
            <Building2 className="w-3.5 h-3.5" />
            <span>Department Scope: {dept ? `${dept.name} (${dept.code})` : 'Assigned Department'}</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Department Admin Dashboard</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage {dept?.name || 'your department'} personnel, operations, patient appointments, and leave approvals with strict department-level isolation.
          </p>
        </div>
        <button
          onClick={() => {
            setEditingEmp(null);
            setEmpForm({
              full_name: '',
              email: '',
              phone: '',
              role_id: String(data?.staffRoles?.[0]?.id || ''),
              designation: `${dept?.name || 'Department'} Specialist`,
              employment_type: 'Full-Time',
              qualification: '',
              shift: 'Day',
              employee_code: '',
              base_salary: '4800',
              employment_status: 'Active',
              password: '',
            });
            setEmpModalOpen(true);
          }}
          className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" /> Add Department Staff
        </button>
      </div>

      {/* Sub-navigation */}
      <div className="bg-white p-1.5 rounded-2xl border border-slate-200/80 flex items-center gap-1.5 overflow-x-auto">
        {[
          { id: 'overview', label: 'Department Overview', icon: Activity },
          { id: 'employees', label: `Dept Employees (${(data?.employees || []).length})`, icon: Users },
          { id: 'patients_ops', label: `Patients & Ops (${(data?.appointments || []).length})`, icon: Calendar },
          { id: 'leaves', label: `Leave Requests (${(data?.leaves || []).length})`, icon: Clock },
          { id: 'activity', label: 'Department Activity', icon: Shield },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id as any)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap inline-flex items-center gap-1.5 ${
                subTab === t.id ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {subTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total Dept Employees', val: k.totalEmployees ?? 0, cls: 'text-slate-900' },
              { label: 'Active Staff', val: k.activeEmployees ?? 0, cls: 'text-emerald-700' },
              { label: 'Department Doctors', val: k.totalDoctors ?? 0, cls: 'text-blue-700' },
              { label: 'Pending Leave Requests', val: k.pendingLeaves ?? 0, cls: 'text-amber-700' },
              { label: 'Total Appointments', val: k.totalAppointments ?? 0, cls: 'text-indigo-700' },
              { label: "Today's Appointments", val: k.todaysAppointments ?? 0, cls: 'text-blue-700' },
              { label: 'Active Admissions', val: k.activeAdmissions ?? 0, cls: 'text-purple-700' },
              { label: 'Open Dept Vacancies', val: (data?.vacancies || []).length, cls: 'text-emerald-700' },
            ].map((item) => (
              <div key={item.label} className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
                <div className="text-[11px] font-semibold text-slate-500 uppercase">{item.label}</div>
                <div className={`text-2xl font-bold font-mono mt-1.5 ${item.cls}`}>{item.val}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3">
              <h3 className="font-bold text-sm text-slate-900">Department Appointments Queue</h3>
              <div className="space-y-2">
                {(data?.appointments || []).slice(0, 6).map((a: any) => (
                  <div key={a.id} className="p-3 bg-slate-50 rounded-xl flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-slate-900">{a.patient_name} · <span className="font-mono text-blue-700">{a.appointment_ref}</span></div>
                      <div className="text-slate-500">Dr. {a.doctor_name} · {a.appointment_date} {a.appointment_time}</div>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-semibold">{a.status}</span>
                  </div>
                ))}
                {(data?.appointments || []).length === 0 && (
                  <p className="text-xs text-slate-400">No appointments logged for this department yet.</p>
                )}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3">
              <h3 className="font-bold text-sm text-slate-900">Department Open Vacancies & Admissions</h3>
              <div className="space-y-2">
                {(data?.vacancies || []).map((v: any) => (
                  <div key={v.id} className="p-3 bg-slate-50 rounded-xl flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-slate-900 flex items-center gap-1.5">
                        <Briefcase className="w-3.5 h-3.5 text-indigo-600" /> {v.title}
                      </div>
                      <div className="text-slate-500">{v.vacancy_code} · Positions: {v.positions} · {v.employment_type}</div>
                    </div>
                    <span className="font-semibold text-indigo-700">{v.status}</span>
                  </div>
                ))}
                {(data?.admissions || []).slice(0, 4).map((adm: any) => (
                  <div key={adm.id} className="p-3 bg-emerald-50/60 border border-emerald-200/70 rounded-xl flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-slate-900 flex items-center gap-1.5">
                        <BedDouble className="w-3.5 h-3.5 text-emerald-700" /> {adm.patient_name} ({adm.patient_code})
                      </div>
                      <div className="text-slate-500">Ward: {adm.ward_name} · Bed: {adm.bed_code} · Dr. {adm.doctor_name}</div>
                    </div>
                    <span className="font-semibold text-emerald-800">{adm.status}</span>
                  </div>
                ))}
                {(data?.vacancies || []).length === 0 && (data?.admissions || []).length === 0 && (
                  <p className="text-xs text-slate-400">No active admissions or open vacancies in this department.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {subTab === 'employees' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={empSearch}
                onChange={(e) => setEmpSearch(e.target.value)}
                placeholder={`Filter ${dept?.name || 'department'} employees...`}
                className="w-full pl-9 pr-3 py-2 bg-slate-100 rounded-xl text-xs"
              />
            </div>
            <span className="text-xs font-semibold text-slate-500">
              Showing {filteredEmployees.length} staff in {dept?.name || 'department'}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold uppercase">
                  <th className="p-3">Employee ID</th>
                  <th className="p-3">Staff Member</th>
                  <th className="p-3">Role / Designation</th>
                  <th className="p-3">Shift & Type</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEmployees.map((emp: any) => (
                  <tr key={emp.id} className="hover:bg-slate-50">
                    <td className="p-3 font-mono font-bold text-indigo-700">{emp.employee_code}</td>
                    <td className="p-3">
                      <div className="font-bold text-slate-900">{emp.full_name}</div>
                      <div className="text-slate-500">{emp.email}</div>
                    </td>
                    <td className="p-3">
                      <div className="font-semibold text-slate-800">{emp.designation || emp.role_name}</div>
                      <div className="text-slate-500">{emp.role_name}</div>
                    </td>
                    <td className="p-3 text-slate-600">{emp.shift || 'Day'} · {emp.employment_type || 'Full-Time'}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded font-semibold ${emp.employment_status === 'Active' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                        {emp.employment_status}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => {
                          setEditingEmp(emp);
                          setEmpForm({
                            full_name: emp.full_name,
                            email: emp.email,
                            phone: emp.phone || '',
                            role_id: String(emp.role_id || ''),
                            designation: emp.designation || '',
                            employment_type: emp.employment_type || 'Full-Time',
                            qualification: emp.qualification || '',
                            shift: emp.shift || 'Day',
                            employee_code: emp.employee_code || '',
                            base_salary: String(emp.base_salary || 4800),
                            employment_status: emp.employment_status || 'Active',
                            password: '',
                          });
                          setEmpModalOpen(true);
                        }}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-indigo-50 rounded-lg font-semibold inline-flex items-center gap-1"
                      >
                        <Edit3 className="w-3 h-3" /> Edit
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredEmployees.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-slate-400">No employees found in this department.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'patients_ops' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3">
            <h3 className="font-bold text-sm text-slate-900">Department Patients ({(data?.patients || []).length})</h3>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {(data?.patients || []).map((pt: any) => (
                <div key={pt.id} className="p-3 bg-slate-50 rounded-xl text-xs flex items-center justify-between">
                  <div>
                    <div className="font-bold text-slate-900">{pt.full_name} <span className="font-mono text-blue-700">({pt.patient_code})</span></div>
                    <div className="text-slate-500">{pt.gender || 'N/A'} · Blood: {pt.blood_group || '—'} · Last Visit: {pt.last_visit_date ? String(pt.last_visit_date).slice(0, 10) : 'New'}</div>
                  </div>
                  <span className="font-mono text-slate-500">{pt.phone || pt.email}</span>
                </div>
              ))}
              {(data?.patients || []).length === 0 && <p className="text-xs text-slate-400">No department patient records yet.</p>}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3">
            <h3 className="font-bold text-sm text-slate-900">Department Appointments & Operations ({(data?.appointments || []).length})</h3>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {(data?.appointments || []).map((a: any) => (
                <div key={a.id} className="p-3 bg-slate-50 rounded-xl text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">{a.patient_name} ({a.appointment_ref})</span>
                    <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-semibold">{a.status}</span>
                  </div>
                  <div className="text-slate-500">Dr. {a.doctor_name} · {a.appointment_date} {a.appointment_time} · {a.reason || 'Consultation'}</div>
                  {['Pending', 'Confirmed', 'Checked In'].includes(a.status) && (
                    <div className="flex items-center gap-2 pt-1">
                      {a.status === 'Pending' && (
                        <button onClick={() => handleAppointmentStatus(a.id, 'Confirmed')} className="px-2.5 py-1 bg-blue-600 text-white rounded-lg font-semibold">Confirm</button>
                      )}
                      <button onClick={() => handleAppointmentStatus(a.id, 'Completed')} className="px-2.5 py-1 bg-emerald-600 text-white rounded-lg font-semibold">Mark Completed</button>
                      <button onClick={() => handleAppointmentStatus(a.id, 'Cancelled')} className="px-2.5 py-1 bg-rose-100 text-rose-800 rounded-lg font-semibold">Cancel</button>
                    </div>
                  )}
                </div>
              ))}
              {(data?.appointments || []).length === 0 && <p className="text-xs text-slate-400">No department appointments found.</p>}
            </div>
          </div>
        </div>
      )}

      {subTab === 'leaves' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3">
          <h3 className="font-bold text-sm text-slate-900">Department Leave Approvals</h3>
          <div className="space-y-2.5">
            {(data?.leaves || []).map((lv: any) => (
              <div key={lv.id} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div>
                  <div className="font-bold text-slate-900">{lv.employee_name} <span className="font-mono text-indigo-700">({lv.employee_code})</span></div>
                  <div className="text-slate-600">{lv.leave_type} · {lv.start_date} to {lv.end_date} · {lv.reason || 'Requested leave'}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded font-semibold ${lv.status === 'Approved' ? 'bg-emerald-100 text-emerald-800' : lv.status === 'Rejected' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}`}>
                    {lv.status}
                  </span>
                  {lv.status === 'Pending' && (
                    <>
                      <button onClick={() => handleLeaveDecision(lv.id, 'Approved')} className="px-2.5 py-1 bg-emerald-600 text-white rounded-lg font-semibold inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                      </button>
                      <button onClick={() => handleLeaveDecision(lv.id, 'Rejected')} className="px-2.5 py-1 bg-rose-600 text-white rounded-lg font-semibold inline-flex items-center gap-1">
                        <XCircle className="w-3.5 h-3.5" /> Reject
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
            {(data?.leaves || []).length === 0 && <p className="text-xs text-slate-400">No leave requests in {dept?.name || 'this department'}.</p>}
          </div>
        </div>
      )}

      {subTab === 'activity' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3">
          <h3 className="font-bold text-sm text-slate-900">Recent Department Activity & Audit Events</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 uppercase">
                  <th className="p-2.5">Actor</th>
                  <th className="p-2.5">Action</th>
                  <th className="p-2.5">Entity</th>
                  <th className="p-2.5">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(data?.recentActivities || []).map((log: any) => (
                  <tr key={log.id}>
                    <td className="p-2.5 font-semibold text-slate-800">{log.actor_name || 'System'} ({log.actor_role})</td>
                    <td className="p-2.5 font-mono text-indigo-700">{log.action}</td>
                    <td className="p-2.5">{log.entity_type} #{log.entity_id}</td>
                    <td className="p-2.5 font-mono text-slate-500">{String(log.created_at).slice(0, 19)}</td>
                  </tr>
                ))}
                {(data?.recentActivities || []).length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-slate-400">No recent department activity logs recorded.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {empModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleSaveEmployee} className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-900">
                {editingEmp ? `Edit ${editingEmp.full_name}` : `Add Staff to ${dept?.name || 'Department'}`}
              </h3>
              <button type="button" onClick={() => setEmpModalOpen(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input required placeholder="Full Name *" value={empForm.full_name} onChange={(e) => setEmpForm({ ...empForm, full_name: e.target.value })} className="sm:col-span-2 px-3 py-2 bg-slate-100 rounded-xl" />
              {!editingEmp && (
                <>
                  <input required type="email" placeholder="Work Email *" value={empForm.email} onChange={(e) => setEmpForm({ ...empForm, email: e.target.value })} className="px-3 py-2 bg-slate-100 rounded-xl" />
                  <input placeholder="Employee ID (optional)" value={empForm.employee_code} onChange={(e) => setEmpForm({ ...empForm, employee_code: e.target.value })} className="px-3 py-2 bg-slate-100 rounded-xl" />
                  <select required value={empForm.role_id} onChange={(e) => setEmpForm({ ...empForm, role_id: e.target.value })} className="sm:col-span-2 px-3 py-2 bg-slate-100 rounded-xl font-semibold">
                    {(data?.staffRoles || []).map((r: any) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </>
              )}
              <input placeholder="Phone" value={empForm.phone} onChange={(e) => setEmpForm({ ...empForm, phone: e.target.value })} className="px-3 py-2 bg-slate-100 rounded-xl" />
              <input placeholder="Designation" value={empForm.designation} onChange={(e) => setEmpForm({ ...empForm, designation: e.target.value })} className="px-3 py-2 bg-slate-100 rounded-xl" />
              <select value={empForm.shift} onChange={(e) => setEmpForm({ ...empForm, shift: e.target.value })} className="px-3 py-2 bg-slate-100 rounded-xl">
                <option value="Day">Day Shift</option>
                <option value="Evening">Evening Shift</option>
                <option value="Night">Night Shift</option>
                <option value="Rotational">Rotational</option>
              </select>
              <select value={empForm.employment_type} onChange={(e) => setEmpForm({ ...empForm, employment_type: e.target.value })} className="px-3 py-2 bg-slate-100 rounded-xl">
                <option value="Full-Time">Full-Time</option>
                <option value="Part-Time">Part-Time</option>
                <option value="Contract">Contract</option>
              </select>
              {editingEmp && (
                <select value={empForm.employment_status} onChange={(e) => setEmpForm({ ...empForm, employment_status: e.target.value })} className="sm:col-span-2 px-3 py-2 bg-slate-100 rounded-xl font-semibold">
                  <option value="Active">Active</option>
                  <option value="On Leave">On Leave</option>
                  <option value="Suspended">Suspended</option>
                </select>
              )}
              {!editingEmp && (
                <input required type="password" minLength={8} placeholder="Temporary Password (8+ chars, 1 number) *" value={empForm.password} onChange={(e) => setEmpForm({ ...empForm, password: e.target.value })} className="sm:col-span-2 px-3 py-2 bg-slate-100 rounded-xl" />
              )}
            </div>
            <button type="submit" className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold">
              {editingEmp ? 'Save Staff Updates' : 'Create Department Staff'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
