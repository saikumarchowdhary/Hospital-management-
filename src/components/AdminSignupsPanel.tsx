import React, { useEffect, useMemo, useState } from 'react';
import {
  UserPlus,
  Upload,
  Eye,
  Check,
  X,
  HelpCircle,
  Search,
  Edit3,
  KeyRound,
  UserCheck,
  Activity,
  Shield,
} from 'lucide-react';
import { apiRequest, getAccessToken } from '../lib/api';

interface Props {
  onNotify: (msg: string, tone?: 'success' | 'error') => void;
  refreshSignal: number;
  onDataChanged: () => void;
  initialSubTab?: 'doctors' | 'staff' | 'directory' | 'login_activity';
}

export const AdminSignupsPanel: React.FC<Props> = ({ onNotify, refreshSignal, onDataChanged, initialSubTab }) => {
  const [subTab, setSubTab] = useState<'doctors' | 'staff' | 'directory' | 'login_activity'>(initialSubTab || 'doctors');
  const [requests, setRequests] = useState<any[]>([]);
  const [pendingDoctorsCount, setPendingDoctorsCount] = useState(0);
  const [pendingStaffCount, setPendingStaffCount] = useState(0);
  const [members, setMembers] = useState<any[]>([]);
  const [loginEvents, setLoginEvents] = useState<any[]>([]);
  const [overview, setOverview] = useState<any>({ roles: [], departments: [], branches: [], specialties: [] });

  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [branchFilter, setBranchFilter] = useState('all');
  const [deptFilter, setDeptFilter] = useState('all');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const [confirmToggleMember, setConfirmToggleMember] = useState<any>(null);

  // Modals
  const [approveTarget, setApproveTarget] = useState<any>(null);
  const [approveForm, setApproveForm] = useState({ role: '', branch_id: '', department_id: '', specialty_id: '', admin_notes: '' });
  const [rejectTarget, setRejectTarget] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [infoTarget, setInfoTarget] = useState<any>(null);
  const [infoNotes, setInfoNotes] = useState('');
  const [previewDoc, setPreviewDoc] = useState<{ title: string; url: string; mime: string } | null>(null);

  // Member profile / edit / reset password modals
  const [profileModal, setProfileModal] = useState<{ member: any; activity: any[]; assignments: any[] } | null>(null);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [editForm, setEditForm] = useState({
    full_name: '',
    phone: '',
    role_id: '',
    department_id: '',
    branch_id: '',
    designation: '',
    shift: 'Day',
    employment_type: 'Full-Time',
  });
  const [resetTarget, setResetTarget] = useState<any>(null);
  const [resetResult, setResetResult] = useState<{ code?: string; message?: string } | null>(null);
  const [directNewPass, setDirectNewPass] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    role_id: '',
    branch_id: '1',
    department_id: '',
    employee_id: '',
    registration_number: '',
    medical_council: '',
    specialty_id: '',
    qualification: 'MD',
    experience_years: '5',
    consultation_fee: '100',
    password: '',
  });
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [csvResult, setCsvResult] = useState<any>(null);

  const loadAll = async () => {
    try {
      const [reqRes, memRes, ovRes, actRes] = await Promise.all([
        apiRequest('/api/admin/signup-requests'),
        apiRequest('/api/admin/members'),
        apiRequest('/api/admin/overview'),
        apiRequest('/api/admin/login-activity').catch(() => ({ events: [] })),
      ]);
      setRequests(reqRes.requests || []);
      setPendingDoctorsCount(reqRes.pendingDoctorsCount || 0);
      setPendingStaffCount(reqRes.pendingStaffCount || 0);
      setMembers(memRes.members || []);
      setOverview(ovRes || { roles: [], departments: [], branches: [], specialties: [] });
      setLoginEvents(actRes.events || []);
      if (!initialSubTab && (reqRes.pendingDoctorsCount || 0) === 0 && (reqRes.pendingStaffCount || 0) > 0 && subTab === 'doctors') {
        setSubTab('staff');
      }
      if (!initialSubTab && (reqRes.pendingDoctorsCount || 0) === 0 && (reqRes.pendingStaffCount || 0) === 0 && subTab === 'doctors') {
        setSubTab('directory');
      }
    } catch (err: any) {
      onNotify(err.message || 'Failed loading user management data.', 'error');
    }
  };

  useEffect(() => {
    loadAll();
  }, [refreshSignal]);

  const doctorQueue = useMemo(() => requests.filter((r) => r.requested_role === 'doctor'), [requests]);
  const staffQueue = useMemo(() => requests.filter((r) => r.requested_role !== 'doctor'), [requests]);

  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      if (roleFilter === 'staff_only' && !m.is_staff) return false;
      else if (roleFilter !== 'all' && roleFilter !== 'staff_only' && m.role !== roleFilter) return false;
      const st = m.account_status || (m.is_active ? 'Active' : 'Suspended');
      if (statusFilter !== 'all' && st !== statusFilter) return false;
      if (branchFilter !== 'all' && Number(m.branch_id) !== Number(branchFilter)) return false;
      if (deptFilter !== 'all' && Number(m.department_id) !== Number(deptFilter)) return false;
      if (q.trim()) {
        const hay = `${m.user_code} ${m.full_name} ${m.email} ${m.phone || ''} ${m.employee_code || ''} ${m.patient_code || ''}`.toLowerCase();
        if (!hay.includes(q.trim().toLowerCase())) return false;
      }
      return true;
    });
  }, [members, roleFilter, statusFilter, branchFilter, deptFilter, q]);

  useEffect(() => {
    setPage(1);
  }, [roleFilter, statusFilter, branchFilter, deptFilter, q]);

  const totalPages = Math.max(1, Math.ceil(filteredMembers.length / PAGE_SIZE));
  const pagedMembers = useMemo(
    () => filteredMembers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredMembers, page]
  );

  const openAttachmentPreview = async (attachmentId: number, title: string) => {
    try {
      const token = getAccessToken();
      const res = await fetch(`/api/admin/attachments/${attachmentId}`, {
        credentials: 'include',
        headers: {
          'X-Requested-With': 'MediCore-HMS',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!res.ok) throw new Error(`Could not load document (${res.status})`);
      const mime = res.headers.get('content-type') || '';
      const blob = await res.blob();
      setPreviewDoc({ title, url: URL.createObjectURL(blob), mime });
    } catch (err: any) {
      onNotify(err.message || 'Preview failed.', 'error');
    }
  };

  const openMemberProfile = async (memberId: number) => {
    try {
      const res = await apiRequest(`/api/admin/members/${memberId}`);
      setProfileModal(res);
    } catch (err: any) {
      onNotify(err.message || 'Could not load user profile.', 'error');
    }
  };

  const openEditMember = (m: any) => {
    setEditTarget(m);
    setEditForm({
      full_name: m.full_name || '',
      phone: m.phone || '',
      role_id: String(m.role_id || ''),
      department_id: String(m.department_id || ''),
      branch_id: String(m.branch_id || 1),
      designation: m.designation || '',
      shift: m.shift || 'Day',
      employment_type: m.employment_type || 'Full-Time',
    });
  };

  const handleSaveEditMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    try {
      await apiRequest(`/api/admin/members/${editTarget.id}`, {
        method: 'PATCH',
        body: {
          full_name: editForm.full_name,
          phone: editForm.phone,
          role_id: Number(editForm.role_id),
          department_id: editForm.department_id ? Number(editForm.department_id) : null,
          branch_id: Number(editForm.branch_id),
          designation: editForm.designation || undefined,
          shift: editForm.shift,
          employment_type: editForm.employment_type,
        },
      });
      onNotify(`Updated ${editForm.full_name} successfully.`, 'success');
      setEditTarget(null);
      loadAll();
      onDataChanged();
    } catch (err: any) {
      onNotify(err.message || 'Failed updating member.', 'error');
    }
  };

  const handleIssueResetCode = async () => {
    if (!resetTarget) return;
    try {
      const res = await apiRequest(`/api/admin/members/${resetTarget.id}/reset-token`, { method: 'POST', body: {} });
      setResetResult({ code: res.resetCode, message: res.message });
      onNotify(`Reset code issued for ${resetTarget.full_name}.`, 'success');
    } catch (err: any) {
      onNotify(err.message || 'Could not issue reset code.', 'error');
    }
  };

  const handleDirectPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget || !directNewPass) return;
    try {
      await apiRequest(`/api/admin/members/${resetTarget.id}/status`, {
        method: 'PATCH',
        body: { reset_password: directNewPass },
      });
      setResetResult({ message: `Password updated directly for ${resetTarget.full_name}.` });
      setDirectNewPass('');
      onNotify('Password reset completed.', 'success');
    } catch (err: any) {
      onNotify(err.message || 'Password reset failed.', 'error');
    }
  };

  const handleApproveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!approveTarget) return;
    try {
      await apiRequest(`/api/admin/signup-requests/${approveTarget.id}/approve`, {
        method: 'POST',
        body: {
          role: approveForm.role,
          branch_id: approveForm.branch_id ? Number(approveForm.branch_id) : null,
          department_id: approveForm.department_id ? Number(approveForm.department_id) : null,
          specialty_id: approveForm.specialty_id ? Number(approveForm.specialty_id) : null,
          admin_notes: approveForm.admin_notes,
        },
      });
      onNotify(`${approveTarget.full_name} approved and activated.`, 'success');
      setApproveTarget(null);
      loadAll();
      onDataChanged();
    } catch (err: any) {
      onNotify(err.message || 'Approval failed.', 'error');
    }
  };

  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectTarget) return;
    try {
      await apiRequest(`/api/admin/signup-requests/${rejectTarget.id}/reject`, {
        method: 'POST',
        body: { reason: rejectReason.trim() },
      });
      onNotify(`Rejected registration for ${rejectTarget.full_name}.`, 'success');
      setRejectTarget(null);
      setRejectReason('');
      loadAll();
      onDataChanged();
    } catch (err: any) {
      onNotify(err.message || 'Rejection failed.', 'error');
    }
  };

  const handleRequestInfoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!infoTarget) return;
    try {
      await apiRequest(`/api/admin/signup-requests/${infoTarget.id}/request-info`, {
        method: 'POST',
        body: { notes: infoNotes.trim() },
      });
      onNotify(`Requested additional information from ${infoTarget.full_name}.`, 'success');
      setInfoTarget(null);
      setInfoNotes('');
      loadAll();
    } catch (err: any) {
      onNotify(err.message || 'Action failed.', 'error');
    }
  };

  const handleToggleUserStatus = async (m: any) => {
    const nextStatus = m.account_status === 'Active' ? 'Suspended' : 'Active';
    try {
      await apiRequest(`/api/admin/members/${m.id}/status`, {
        method: 'PATCH',
        body: { account_status: nextStatus },
      });
      onNotify(`${m.full_name} marked ${nextStatus}.`, 'success');
      setConfirmToggleMember(null);
      loadAll();
      onDataChanged();
    } catch (err: any) {
      onNotify(err.message || 'Status update failed.', 'error');
    }
  };

  const handleDirectCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/admin/users', { method: 'POST', body: createForm });
      onNotify(`Provisioned active user ${createForm.full_name}.`, 'success');
      setCreateOpen(false);
      loadAll();
      onDataChanged();
    } catch (err: any) {
      onNotify(err.message || 'Provisioning failed.', 'error');
    }
  };

  const handleCsvImport = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiRequest('/api/admin/members/import-csv', {
        method: 'POST',
        body: { csv_text: csvText },
      });
      setCsvResult(res);
      onNotify(`CSV import finished: ${res.createdCount} created, ${res.skippedCount} skipped.`, res.skippedCount ? 'error' : 'success');
      loadAll();
      onDataChanged();
    } catch (err: any) {
      onNotify(err.message || 'CSV import failed.', 'error');
    }
  };

  const renderQueue = (items: any[], isDoctor: boolean) => (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold uppercase">
              <th className="p-4">Applicant</th>
              <th className="p-4">{isDoctor ? 'Licence & Specialty' : 'Requested Role & Employee ID'}</th>
              <th className="p-4">Branch / Dept</th>
              <th className="p-4">Documents</th>
              <th className="p-4">Status</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((r) => (
              <tr key={r.id}>
                <td className="p-4">
                  <div className="font-bold text-slate-900">{r.full_name}</div>
                  <div className="text-slate-500">{r.email} · {r.mobile}</div>
                </td>
                <td className="p-4">
                  {isDoctor ? (
                    <>
                      <div className="font-mono font-semibold text-blue-700">{r.medical_registration_number || '—'}</div>
                      <div className="text-slate-600">{r.medical_council || '—'} · {r.specialty_name || '—'}</div>
                      <div className="text-slate-500">{r.qualification} · {r.experience_years || 0} yrs · ${r.consultation_fee || 100}</div>
                    </>
                  ) : (
                    <>
                      <div className="font-semibold text-slate-800">{r.requested_role_label || r.requested_role}</div>
                      <div className="font-mono text-slate-500">{r.employee_id || 'Auto-assigned ID'}</div>
                    </>
                  )}
                </td>
                <td className="p-4 text-slate-700">
                  <div>{r.branch_name || 'Main'}</div>
                  <div className="text-slate-500">{r.department_name || '—'}</div>
                </td>
                <td className="p-4 space-x-1">
                  {r.licence_attachment_id && (
                    <button onClick={() => openAttachmentPreview(r.licence_attachment_id, `Licence — ${r.full_name}`)} className="px-2 py-1 bg-slate-100 hover:bg-blue-50 rounded-lg font-semibold inline-flex items-center gap-1">
                      <Eye className="w-3 h-3" /> Licence
                    </button>
                  )}
                  {r.photo_attachment_id && (
                    <button onClick={() => openAttachmentPreview(r.photo_attachment_id, `Photo — ${r.full_name}`)} className="px-2 py-1 bg-slate-100 hover:bg-blue-50 rounded-lg font-semibold inline-flex items-center gap-1">
                      <Eye className="w-3 h-3" /> Photo
                    </button>
                  )}
                  {r.document_attachment_id && (
                    <button onClick={() => openAttachmentPreview(r.document_attachment_id, `Credential — ${r.full_name}`)} className="px-2 py-1 bg-slate-100 hover:bg-blue-50 rounded-lg font-semibold inline-flex items-center gap-1">
                      <Eye className="w-3 h-3" /> ID Doc
                    </button>
                  )}
                  {!r.licence_attachment_id && !r.photo_attachment_id && !r.document_attachment_id && <span className="text-slate-400">None</span>}
                </td>
                <td className="p-4">
                  <span className={`font-bold ${r.status === 'Approved' ? 'text-emerald-700' : r.status === 'Rejected' ? 'text-rose-700' : 'text-amber-700'}`}>
                    {r.status}
                  </span>
                  {r.rejection_reason && <div className="text-[11px] text-rose-600 mt-0.5">{r.rejection_reason}</div>}
                </td>
                <td className="p-4 text-right space-x-1">
                  {['Pending', 'Info Requested'].includes(r.status) ? (
                    <>
                      <button
                        onClick={() => {
                          setApproveTarget(r);
                          setApproveForm({
                            role: r.requested_role,
                            branch_id: String(r.branch_id || overview.branches?.[0]?.id || 1),
                            department_id: String(r.department_id || ''),
                            specialty_id: String(r.specialty_id || ''),
                            admin_notes: '',
                          });
                        }}
                        className="px-2.5 py-1 bg-blue-600 text-white rounded-lg font-semibold inline-flex items-center gap-1"
                      >
                        <Check className="w-3 h-3" /> {isDoctor ? 'Verify' : 'Approve'}
                      </button>
                      <button onClick={() => setInfoTarget(r)} className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg font-semibold inline-flex items-center gap-1">
                        <HelpCircle className="w-3 h-3" /> Info
                      </button>
                      <button onClick={() => setRejectTarget(r)} className="px-2.5 py-1 bg-rose-50 text-rose-700 rounded-lg font-semibold inline-flex items-center gap-1">
                        <X className="w-3 h-3" /> Reject
                      </button>
                    </>
                  ) : (
                    <span className="text-slate-400">Reviewed</span>
                  )}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-slate-400">No applications in this queue.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const selectedCreateRole = (overview.roles || []).find((r: any) => String(r.id) === String(createForm.role_id));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">User, Staff & Approval Governance</h2>
          <p className="text-sm text-slate-500 mt-1">Manage accounts, roles, staff categories, password resets, login activity, and registration approvals.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setCsvResult(null); setCsvOpen(true); }} className="px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 flex items-center gap-1.5">
            <Upload className="w-4 h-4" /> Bulk CSV Import
          </button>
          <button
            onClick={() => {
              const firstRole = (overview.roles || []).find((r: any) => r.code !== 'candidate' && r.code !== 'pending_staff');
              setCreateForm((prev) => ({
                ...prev,
                role_id: prev.role_id || String(firstRole?.id || ''),
                department_id: prev.department_id || String(overview.departments?.[0]?.id || ''),
                specialty_id: prev.specialty_id || String(overview.specialties?.[0]?.id || ''),
              }));
              setCreateOpen(true);
            }}
            className="px-3.5 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5"
          >
            <UserPlus className="w-4 h-4" /> Create User / Staff
          </button>
        </div>
      </div>

      <div className="bg-white p-1.5 rounded-2xl border border-slate-200/80 flex items-center gap-2 overflow-x-auto">
        <button onClick={() => setSubTab('doctors')} className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap ${subTab === 'doctors' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
          Doctor Verification ({pendingDoctorsCount} pending)
        </button>
        <button onClick={() => setSubTab('staff')} className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap ${subTab === 'staff' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
          Staff Approvals ({pendingStaffCount} pending)
        </button>
        <button onClick={() => setSubTab('directory')} className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap ${subTab === 'directory' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
          All Users & Staff ({members.length})
        </button>
        <button onClick={() => setSubTab('login_activity')} className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 ${subTab === 'login_activity' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
          <Activity className="w-3.5 h-3.5" /> Login Activity ({loginEvents.length})
        </button>
      </div>

      {subTab === 'doctors' && renderQueue(doctorQueue, true)}
      {subTab === 'staff' && renderQueue(staffQueue, false)}

      {subTab === 'directory' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
          {/* Quick Staff Category Filter Chips */}
          <div className="flex flex-wrap gap-1.5 pb-2 border-b border-slate-100">
            {[
              { code: 'all', label: 'All Accounts' },
              { code: 'staff_only', label: 'All Hospital Staff' },
              { code: 'doctor', label: 'Doctors' },
              { code: 'nurse', label: 'Nurses' },
              { code: 'receptionist', label: 'Receptionists' },
              { code: 'lab_staff', label: 'Lab Staff' },
              { code: 'pharmacist', label: 'Pharmacists' },
              { code: 'accountant', label: 'Accountants' },
              { code: 'case_manager', label: 'Case Managers' },
              { code: 'hr', label: 'HR Team' },
              { code: 'publisher', label: 'Publishers' },
              { code: 'approver', label: 'Approvers' },
              { code: 'patient', label: 'Patients' },
            ].map((chip) => (
              <button
                key={chip.code}
                onClick={() => setRoleFilter(chip.code)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                  roleFilter === chip.code ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, user code, employee ID..." className="w-full pl-9 pr-3 py-2 bg-slate-100 rounded-xl text-xs" />
            </div>
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="px-3 py-2 bg-slate-100 rounded-xl text-xs font-semibold">
              <option value="all">All Roles</option>
              <option value="staff_only">All Staff Roles</option>
              {(overview.roles || []).filter((r: any) => r.code !== 'pending_staff').map((r: any) => (
                <option key={r.code} value={r.code}>{r.name}</option>
              ))}
            </select>
            <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className="px-3 py-2 bg-slate-100 rounded-xl text-xs font-semibold">
              <option value="all">All Branches</option>
              {(overview.branches || []).map((b: any) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="px-3 py-2 bg-slate-100 rounded-xl text-xs font-semibold">
              <option value="all">All Departments</option>
              {(overview.departments || []).map((d: any) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 bg-slate-100 rounded-xl text-xs font-semibold">
              <option value="all">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Pending Verification">Pending Verification</option>
              <option value="Pending Approval">Pending Approval</option>
              <option value="Suspended">Suspended</option>
              <option value="Rejected">Rejected</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold uppercase">
                  <th className="p-3">ID</th>
                  <th className="p-3">Name & Email</th>
                  <th className="p-3">Role / Dept / Branch</th>
                  <th className="p-3">Last Login</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedMembers.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/70">
                    <td className="p-3 font-mono font-semibold text-blue-700">
                      {m.user_code}
                      {m.patient_code && <div className="text-[11px] text-slate-500">{m.patient_code}</div>}
                      {m.employee_code && <div className="text-[11px] text-slate-500">{m.employee_code}</div>}
                    </td>
                    <td className="p-3">
                      <div className="font-bold text-slate-900">{m.full_name}</div>
                      <div className="text-slate-500">{m.email} · {m.phone || '—'}</div>
                    </td>
                    <td className="p-3 text-slate-700">
                      <div className="font-semibold">{m.role_name}</div>
                      <div className="text-slate-500">{m.department_name || '—'} · {m.branch_name || 'Main'}</div>
                    </td>
                    <td className="p-3 text-slate-500 font-mono text-[11px]">
                      {m.last_login_at ? String(m.last_login_at).slice(0, 16) : 'Never'}
                    </td>
                    <td className="p-3">
                      <span className={`font-semibold ${m.account_status === 'Active' ? 'text-emerald-700' : 'text-amber-700'}`}>
                        {m.account_status}
                      </span>
                    </td>
                    <td className="p-3 text-right space-x-1 whitespace-nowrap">
                      <button onClick={() => openMemberProfile(m.id)} className="px-2 py-1 bg-slate-100 hover:bg-blue-50 text-slate-700 rounded-lg font-semibold inline-flex items-center gap-1" title="View Profile">
                        <UserCheck className="w-3 h-3" /> Profile
                      </button>
                      <button onClick={() => openEditMember(m)} className="px-2 py-1 bg-slate-100 hover:bg-indigo-50 text-slate-700 rounded-lg font-semibold inline-flex items-center gap-1" title="Edit Details & Role">
                        <Edit3 className="w-3 h-3" /> Edit
                      </button>
                      <button
                        onClick={() => {
                          setResetTarget(m);
                          setResetResult(null);
                          setDirectNewPass('');
                        }}
                        className="px-2 py-1 bg-slate-100 hover:bg-amber-50 text-slate-700 rounded-lg font-semibold inline-flex items-center gap-1"
                        title="Reset Password"
                      >
                        <KeyRound className="w-3 h-3" /> Reset
                      </button>
                      <button onClick={() => setConfirmToggleMember(m)} className="px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg font-semibold text-slate-700">
                        {m.account_status === 'Active' ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
                {pagedMembers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-slate-400">No accounts match your search/filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {filteredMembers.length > PAGE_SIZE && (
            <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-600">
              <span>Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredMembers.length)} of {filteredMembers.length} users</span>
              <div className="flex items-center gap-1.5">
                <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="px-3 py-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded-lg font-semibold">
                  Previous
                </button>
                <span className="font-mono px-2">Page {page} / {totalPages}</span>
                <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="px-3 py-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded-lg font-semibold">
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {subTab === 'login_activity' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold text-sm text-slate-900">Authentication & Login Activity Log</h3>
            <span className="text-xs text-slate-500">Latest {loginEvents.length} authentication events</span>
          </div>
          <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold uppercase">
                  <th className="p-3">User</th>
                  <th className="p-3">Role</th>
                  <th className="p-3">Event</th>
                  <th className="p-3">IP Address</th>
                  <th className="p-3">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loginEvents.map((ev) => (
                  <tr key={ev.id}>
                    <td className="p-3">
                      <div className="font-semibold text-slate-900">{ev.full_name || 'Unknown'}</div>
                      <div className="text-slate-500">{ev.email || ev.user_code || `User #${ev.actor_user_id || '?'}`}</div>
                    </td>
                    <td className="p-3 font-mono">{ev.actor_role || '—'}</td>
                    <td className="p-3">
                      <span className={`font-semibold ${String(ev.action).includes('fail') ? 'text-rose-700' : 'text-emerald-700'}`}>
                        {ev.action}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-slate-500">{ev.ip_address || '127.0.0.1'}</td>
                    <td className="p-3 font-mono text-slate-500">{String(ev.created_at).slice(0, 19)}</td>
                  </tr>
                ))}
                {loginEvents.length === 0 && (
                  <tr><td colSpan={5} className="p-6 text-center text-slate-400">No login activity logged yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Member Profile Modal */}
      {profileModal && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-base text-slate-900">{profileModal.member.full_name}</h3>
                <p className="text-xs text-slate-500 font-mono">
                  {profileModal.member.user_code} · {profileModal.member.role_name} · {profileModal.member.account_status}
                </p>
              </div>
              <button onClick={() => setProfileModal(null)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs bg-slate-50 p-4 rounded-xl">
              <div><span className="text-slate-500 block">Email</span><span className="font-semibold">{profileModal.member.email}</span></div>
              <div><span className="text-slate-500 block">Phone</span><span className="font-semibold">{profileModal.member.phone || '—'}</span></div>
              <div><span className="text-slate-500 block">Branch</span><span className="font-semibold">{profileModal.member.branch_name || 'Main'}</span></div>
              <div><span className="text-slate-500 block">Department</span><span className="font-semibold">{profileModal.member.department_name || '—'}</span></div>
              <div><span className="text-slate-500 block">Employee / Patient ID</span><span className="font-mono font-semibold">{profileModal.member.employee_code || profileModal.member.patient_code || '—'}</span></div>
              <div><span className="text-slate-500 block">Last Login</span><span className="font-mono">{profileModal.member.last_login_at ? String(profileModal.member.last_login_at).slice(0, 16) : 'Never'}</span></div>
            </div>
            <div>
              <h4 className="font-bold text-xs text-slate-700 mb-2">Recent Audit & Login Activity</h4>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {(profileModal.activity || []).map((a, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg text-xs">
                    <span className="font-semibold text-slate-800">{a.action} ({a.entity_type})</span>
                    <span className="font-mono text-slate-500">{String(a.created_at).slice(0, 19)}</span>
                  </div>
                ))}
                {(profileModal.activity || []).length === 0 && <p className="text-xs text-slate-400">No recent activity.</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editTarget && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleSaveEditMember} className="bg-white rounded-2xl max-w-md w-full p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base">Edit User — {editTarget.user_code}</h3>
              <button type="button" onClick={() => setEditTarget(null)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="col-span-2">
                <label className="block font-semibold text-slate-600 mb-1">Full Name</label>
                <input required value={editForm.full_name} onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })} className="w-full px-3 py-2 bg-slate-100 rounded-xl" />
              </div>
              <div className="col-span-2">
                <label className="block font-semibold text-slate-600 mb-1">Phone</label>
                <input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} className="w-full px-3 py-2 bg-slate-100 rounded-xl" />
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Assigned Role</label>
                <select value={editForm.role_id} onChange={(e) => setEditForm({ ...editForm, role_id: e.target.value })} className="w-full px-3 py-2 bg-slate-100 rounded-xl">
                  {(overview.roles || []).filter((r: any) => r.code !== 'pending_staff').map((r: any) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Branch</label>
                <select value={editForm.branch_id} onChange={(e) => setEditForm({ ...editForm, branch_id: e.target.value })} className="w-full px-3 py-2 bg-slate-100 rounded-xl">
                  {(overview.branches || []).map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Department</label>
                <select value={editForm.department_id} onChange={(e) => setEditForm({ ...editForm, department_id: e.target.value })} className="w-full px-3 py-2 bg-slate-100 rounded-xl">
                  <option value="">— None —</option>
                  {(overview.departments || []).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Designation</label>
                <input value={editForm.designation} onChange={(e) => setEditForm({ ...editForm, designation: e.target.value })} className="w-full px-3 py-2 bg-slate-100 rounded-xl" />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setEditTarget(null)} className="flex-1 py-2 bg-slate-100 rounded-xl text-xs font-semibold">Cancel</button>
              <button type="submit" className="flex-1 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold">Save Changes</button>
            </div>
          </form>
        </div>
      )}

      {/* Password Reset Modal */}
      {resetTarget && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-amber-600" />
                <h3 className="font-bold text-base">Password Reset — {resetTarget.full_name}</h3>
              </div>
              <button onClick={() => setResetTarget(null)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>

            {resetResult && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 space-y-1">
                <div className="font-semibold">{resetResult.message}</div>
                {resetResult.code && <div className="font-mono text-sm font-bold">One-Time Code: {resetResult.code}</div>}
              </div>
            )}

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <p className="text-xs text-slate-600">Option 1: Issue a time-limited one-time reset code for self-service recovery.</p>
              <button type="button" onClick={handleIssueResetCode} className="w-full py-2 bg-slate-900 text-white rounded-xl text-xs font-semibold">
                Generate One-Time Reset Code (24h)
              </button>
            </div>

            <form onSubmit={handleDirectPasswordReset} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <p className="text-xs text-slate-600">Option 2: Set a temporary password immediately (8+ chars, 1 number).</p>
              <input
                required
                type="password"
                minLength={8}
                value={directNewPass}
                onChange={(e) => setDirectNewPass(e.target.value)}
                placeholder="New temporary password"
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs"
              />
              <button type="submit" className="w-full py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold">
                Update Password Now
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Approve Modal */}
      {approveTarget && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleApproveSubmit} className="bg-white rounded-2xl max-w-md w-full p-6 space-y-3">
            <h3 className="font-bold text-base">Approve — {approveTarget.full_name}</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Role</label>
                <select value={approveForm.role} onChange={(e) => setApproveForm({ ...approveForm, role: e.target.value })} className="w-full px-3 py-2 bg-slate-100 rounded-xl text-xs">
                  {(overview.roles || []).filter((r: any) => !['pending_staff', 'patient', 'candidate'].includes(r.code)).map((r: any) => (
                    <option key={r.code} value={r.code}>{r.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Branch</label>
                <select value={approveForm.branch_id} onChange={(e) => setApproveForm({ ...approveForm, branch_id: e.target.value })} className="w-full px-3 py-2 bg-slate-100 rounded-xl text-xs">
                  {(overview.branches || []).map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Department</label>
                <select value={approveForm.department_id} onChange={(e) => setApproveForm({ ...approveForm, department_id: e.target.value })} className="w-full px-3 py-2 bg-slate-100 rounded-xl text-xs">
                  <option value="">— Select —</option>
                  {(overview.departments || []).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              {approveForm.role === 'doctor' && (
                <div className="col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Specialty</label>
                  <select value={approveForm.specialty_id} onChange={(e) => setApproveForm({ ...approveForm, specialty_id: e.target.value })} className="w-full px-3 py-2 bg-slate-100 rounded-xl text-xs">
                    {(overview.specialties || []).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}
            </div>
            <textarea value={approveForm.admin_notes} onChange={(e) => setApproveForm({ ...approveForm, admin_notes: e.target.value })} placeholder="Verification notes..." className="w-full px-3 py-2 bg-slate-100 rounded-xl text-xs" />
            <div className="flex gap-2">
              <button type="button" onClick={() => setApproveTarget(null)} className="flex-1 py-2 bg-slate-100 rounded-xl text-xs font-semibold">Cancel</button>
              <button type="submit" className="flex-1 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold">Approve & Activate</button>
            </div>
          </form>
        </div>
      )}

      {/* Reject Modal */}
      {rejectTarget && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleRejectSubmit} className="bg-white rounded-2xl max-w-md w-full p-6 space-y-3">
            <h3 className="font-bold text-base">Reject Registration — {rejectTarget.full_name}</h3>
            <textarea required value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Mandatory reason shown to applicant..." className="w-full px-3 py-2 bg-slate-100 rounded-xl text-xs" rows={3} />
            <div className="flex gap-2">
              <button type="button" onClick={() => setRejectTarget(null)} className="flex-1 py-2 bg-slate-100 rounded-xl text-xs font-semibold">Cancel</button>
              <button type="submit" className="flex-1 py-2 bg-rose-600 text-white rounded-xl text-xs font-semibold">Confirm Reject</button>
            </div>
          </form>
        </div>
      )}

      {/* Request Info Modal */}
      {infoTarget && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleRequestInfoSubmit} className="bg-white rounded-2xl max-w-md w-full p-6 space-y-3">
            <h3 className="font-bold text-base">Request More Information — {infoTarget.full_name}</h3>
            <textarea required value={infoNotes} onChange={(e) => setInfoNotes(e.target.value)} placeholder="What additional credentials or clarification is needed?" className="w-full px-3 py-2 bg-slate-100 rounded-xl text-xs" rows={3} />
            <div className="flex gap-2">
              <button type="button" onClick={() => setInfoTarget(null)} className="flex-1 py-2 bg-slate-100 rounded-xl text-xs font-semibold">Cancel</button>
              <button type="submit" className="flex-1 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold">Send Request</button>
            </div>
          </form>
        </div>
      )}

      {/* Document Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm">{previewDoc.title}</h3>
              <button onClick={() => setPreviewDoc(null)} className="p-1 text-slate-400"><X className="w-5 h-5" /></button>
            </div>
            {previewDoc.mime.startsWith('image/') ? (
              <img src={previewDoc.url} alt={previewDoc.title} className="max-h-[70vh] mx-auto rounded-lg border" />
            ) : (
              <iframe src={previewDoc.url} title={previewDoc.title} className="w-full h-[65vh] border rounded-lg" />
            )}
          </div>
        </div>
      )}

      {/* Provision User Modal */}
      {createOpen && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleDirectCreate} className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-3 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base">Provision Active User / Staff Account</h3>
              <button type="button" onClick={() => setCreateOpen(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input required placeholder="Full Name" value={createForm.full_name} onChange={(e) => setCreateForm({ ...createForm, full_name: e.target.value })} className="col-span-2 px-3 py-2 bg-slate-100 rounded-xl text-xs" />
              <input required type="email" placeholder="Email" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} className="px-3 py-2 bg-slate-100 rounded-xl text-xs" />
              <input placeholder="Mobile" value={createForm.phone} onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })} className="px-3 py-2 bg-slate-100 rounded-xl text-xs" />
              <select value={createForm.role_id} onChange={(e) => setCreateForm({ ...createForm, role_id: e.target.value })} className="px-3 py-2 bg-slate-100 rounded-xl text-xs">
                {(overview.roles || []).filter((r: any) => !['candidate', 'pending_staff'].includes(r.code)).map((r: any) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              <select value={createForm.branch_id} onChange={(e) => setCreateForm({ ...createForm, branch_id: e.target.value })} className="px-3 py-2 bg-slate-100 rounded-xl text-xs">
                {(overview.branches || []).map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <select value={createForm.department_id} onChange={(e) => setCreateForm({ ...createForm, department_id: e.target.value })} className="px-3 py-2 bg-slate-100 rounded-xl text-xs">
                {(overview.departments || []).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <input placeholder="Employee ID (optional)" value={createForm.employee_id} onChange={(e) => setCreateForm({ ...createForm, employee_id: e.target.value })} className="px-3 py-2 bg-slate-100 rounded-xl text-xs" />
              {selectedCreateRole?.code === 'doctor' && (
                <>
                  <input placeholder="Medical Reg No." value={createForm.registration_number} onChange={(e) => setCreateForm({ ...createForm, registration_number: e.target.value })} className="px-3 py-2 bg-slate-100 rounded-xl text-xs" />
                  <input placeholder="Medical Council" value={createForm.medical_council} onChange={(e) => setCreateForm({ ...createForm, medical_council: e.target.value })} className="px-3 py-2 bg-slate-100 rounded-xl text-xs" />
                </>
              )}
              <input required type="password" minLength={8} placeholder="Password (8+ chars, 1 number)" value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} className="col-span-2 px-3 py-2 bg-slate-100 rounded-xl text-xs" />
            </div>
            <button type="submit" className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-xs font-semibold">Create Active Account</button>
          </form>
        </div>
      )}

      {/* Bulk CSV Import Modal */}
      {csvOpen && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleCsvImport} className="bg-white rounded-2xl max-w-xl w-full p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base">Bulk CSV User Import</h3>
              <button type="button" onClick={() => setCsvOpen(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <p className="text-[11px] text-slate-500 font-mono">full_name,email,mobile,role,password,department,branch,employee_id</p>
            <textarea
              required
              rows={6}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={'full_name,email,mobile,role,password,department,branch\nJane Doe,jane.d@hospital.org,+1-555-7701,nurse,Pass1234,Cardiology,Main'}
              className="w-full px-3 py-2 bg-slate-100 rounded-xl text-xs font-mono"
            />
            {csvResult && (
              <div className="p-3 rounded-xl bg-slate-50 border text-xs space-y-1 max-h-40 overflow-y-auto">
                <div className="font-bold">Imported: {csvResult.createdCount} · Skipped: {csvResult.skippedCount}</div>
                {(csvResult.errors || []).map((er: any, i: number) => (
                  <div key={i} className="text-rose-700">Row {er.row} ({er.email || 'blank'}): {er.message}</div>
                ))}
              </div>
            )}
            <button type="submit" className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-xs font-semibold">Validate & Import CSV</button>
          </form>
        </div>
      )}
      {/* Status Change Confirmation Modal */}
      {confirmToggleMember && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 space-y-4 text-xs">
            <h3 className="font-bold text-base text-slate-900">
              {confirmToggleMember.account_status === 'Active' ? 'Deactivate Account?' : 'Activate Account?'}
            </h3>
            <p className="text-slate-600">
              Confirm {confirmToggleMember.account_status === 'Active' ? 'suspending' : 're-activating'} <strong>{confirmToggleMember.full_name}</strong> ({confirmToggleMember.user_code}).
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirmToggleMember(null)} className="flex-1 py-2 bg-slate-100 rounded-xl font-semibold">Cancel</button>
              <button
                type="button"
                onClick={() => handleToggleUserStatus(confirmToggleMember)}
                className={`flex-1 py-2 text-white rounded-xl font-semibold ${
                  confirmToggleMember.account_status === 'Active' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
