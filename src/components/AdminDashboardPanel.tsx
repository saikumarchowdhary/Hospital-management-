import React, { useEffect, useState } from 'react';
import {
  Building2,
  Plus,
  Users,
  Edit3,
  CreditCard,
  Settings,
  Megaphone,
  FileText,
  X,
  Eye,
  Save,
} from 'lucide-react';
import { apiRequest, getAccessToken } from '../lib/api';

interface Props {
  section: 'departments' | 'finance_payroll' | 'admin_notices_docs' | 'admin_settings';
  onNotify: (msg: string, tone?: 'success' | 'error') => void;
  refreshSignal: number;
  onDataChanged: () => void;
}

export const AdminDashboardPanel: React.FC<Props> = ({ section, onNotify, refreshSignal, onDataChanged }) => {
  const [departments, setDepartments] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [staffUsers, setStaffUsers] = useState<any[]>([]);
  const [financeData, setFinanceData] = useState<any>(null);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [documentsData, setDocumentsData] = useState<{ documents: any[]; employeeDocs: any[] }>({ documents: [], employeeDocs: [] });
  const [settingsMap, setSettingsMap] = useState<Record<string, string>>({});

  // Department modals
  const [deptModalOpen, setDeptModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<any>(null);
  const [deptForm, setDeptForm] = useState({ code: '', name: '', branch_id: '1', category: 'clinical', head_user_id: '', description: '', is_active: true });
  const [deptEmployeesModal, setDeptEmployeesModal] = useState<{ dept: any; employees: any[] } | null>(null);

  // Branch modals
  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<any>(null);
  const [branchForm, setBranchForm] = useState({ code: '', name: '', address: '', phone: '', email: '', city: '' });

  // Preview doc
  const [previewDoc, setPreviewDoc] = useState<{ title: string; url: string; mime: string } | null>(null);
  const [confirmToggle, setConfirmToggle] = useState<{ kind: 'department' | 'branch'; item: any } | null>(null);

  const loadSectionData = async () => {
    try {
      const ov = await apiRequest('/api/admin/overview');
      setDepartments(ov.departments || []);
      setBranches(ov.branches || []);
      setStaffUsers((ov.users || []).filter((u: any) => u.is_staff && u.account_status === 'Active'));
      const sMap: Record<string, string> = {};
      for (const s of ov.settings || []) sMap[s.key] = s.value;
      setSettingsMap(sMap);

      if (section === 'finance_payroll') {
        const fin = await apiRequest('/api/admin/finance-payroll');
        setFinanceData(fin);
      }
      if (section === 'admin_notices_docs') {
        const [pubRes, docRes] = await Promise.all([
          apiRequest('/api/publisher'),
          apiRequest('/api/admin/documents'),
        ]);
        setAnnouncements(pubRes.announcements || []);
        setApprovals(pubRes.approvals || []);
        setDocumentsData(docRes || { documents: [], employeeDocs: [] });
      }
    } catch (err: any) {
      onNotify(err.message || 'Could not load admin module data.', 'error');
    }
  };

  useEffect(() => {
    loadSectionData();
  }, [section, refreshSignal]);

  const openAttachmentPreview = async (attachmentId: number, title: string) => {
    try {
      const token = getAccessToken();
      const res = await fetch(`/api/admin/attachments/${attachmentId}`, {
        credentials: 'include',
        headers: { 'X-Requested-With': 'MediCore-HMS', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (!res.ok) throw new Error('Unable to load document');
      const mime = res.headers.get('content-type') || '';
      const blob = await res.blob();
      setPreviewDoc({ title, url: URL.createObjectURL(blob), mime });
    } catch (err: any) {
      onNotify(err.message || 'Document preview failed.', 'error');
    }
  };

  const handleSaveDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingDept) {
        await apiRequest(`/api/admin/departments/${editingDept.id}`, {
          method: 'PATCH',
          body: {
            code: deptForm.code,
            name: deptForm.name,
            branch_id: Number(deptForm.branch_id),
            category: deptForm.category,
            head_user_id: deptForm.head_user_id ? Number(deptForm.head_user_id) : null,
            description: deptForm.description,
            is_active: deptForm.is_active,
          },
        });
        onNotify(`Department "${deptForm.name}" updated.`, 'success');
      } else {
        await apiRequest('/api/admin/departments', {
          method: 'POST',
          body: {
            code: deptForm.code,
            name: deptForm.name,
            branch_id: Number(deptForm.branch_id),
            category: deptForm.category,
            head_user_id: deptForm.head_user_id ? Number(deptForm.head_user_id) : null,
            description: deptForm.description,
          },
        });
        onNotify(`Department "${deptForm.name}" created.`, 'success');
      }
      setDeptModalOpen(false);
      loadSectionData();
      onDataChanged();
    } catch (err: any) {
      onNotify(err.message || 'Department save failed.', 'error');
    }
  };

  const handleToggleDepartmentStatus = async (d: any) => {
    try {
      await apiRequest(`/api/admin/departments/${d.id}`, {
        method: 'PATCH',
        body: { is_active: !d.is_active },
      });
      onNotify(`${d.name} ${d.is_active ? 'deactivated' : 'activated'}.`, 'success');
      setConfirmToggle(null);
      loadSectionData();
    } catch (err: any) {
      onNotify(err.message || 'Update failed.', 'error');
    }
  };

  const handleViewDeptEmployees = async (d: any) => {
    try {
      const res = await apiRequest(`/api/admin/departments/${d.id}/employees`);
      setDeptEmployeesModal({ dept: d, employees: res.employees || [] });
    } catch (err: any) {
      onNotify(err.message || 'Could not load department employees.', 'error');
    }
  };

  const handleSaveBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingBranch) {
        await apiRequest(`/api/admin/branches/${editingBranch.id}`, { method: 'PATCH', body: branchForm });
        onNotify(`Branch "${branchForm.name}" updated.`, 'success');
      } else {
        await apiRequest('/api/admin/branches', { method: 'POST', body: branchForm });
        onNotify(`Branch "${branchForm.name}" created.`, 'success');
      }
      setBranchModalOpen(false);
      loadSectionData();
      onDataChanged();
    } catch (err: any) {
      onNotify(err.message || 'Branch save failed.', 'error');
    }
  };

  const handleToggleBranchStatus = async (b: any) => {
    try {
      await apiRequest(`/api/admin/branches/${b.id}`, { method: 'PATCH', body: { is_active: !b.is_active } });
      onNotify(`Branch "${b.name}" ${b.is_active ? 'deactivated' : 'activated'}.`, 'success');
      setConfirmToggle(null);
      loadSectionData();
    } catch (err: any) {
      onNotify(err.message || 'Failed updating branch status.', 'error');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/admin/settings/bulk', {
        method: 'PUT',
        body: { settings: settingsMap },
      });
      onNotify('Hospital system & security settings saved to SQLite.', 'success');
      onDataChanged();
    } catch (err: any) {
      onNotify(err.message || 'Failed saving settings.', 'error');
    }
  };

  if (section === 'departments') {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Department Management</h2>
            <p className="text-sm text-slate-500 mt-1">Create clinical & administrative departments, assign department heads, view staff rosters, and toggle status.</p>
          </div>
          <button
            onClick={() => {
              setEditingDept(null);
              setDeptForm({ code: '', name: '', branch_id: String(branches[0]?.id || 1), category: 'clinical', head_user_id: '', description: '', is_active: true });
              setDeptModalOpen(true);
            }}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Create Department
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold uppercase">
                  <th className="p-4">Code & Name</th>
                  <th className="p-4">Category / Branch</th>
                  <th className="p-4">Department Head</th>
                  <th className="p-4">Staff / Doctors</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {departments.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50/70">
                    <td className="p-4">
                      <div className="font-mono font-bold text-blue-700">{d.code}</div>
                      <div className="font-bold text-slate-900 text-sm">{d.name}</div>
                      {d.description && <div className="text-slate-500">{d.description}</div>}
                    </td>
                    <td className="p-4">
                      <div className="capitalize font-semibold text-slate-800">{d.category}</div>
                      <div className="text-slate-500">{d.branch_name || 'Main Campus'}</div>
                    </td>
                    <td className="p-4">
                      {d.head_name ? (
                        <div>
                          <div className="font-semibold text-slate-900">{d.head_name}</div>
                          <div className="font-mono text-slate-500">{d.head_user_code}</div>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">Unassigned</span>
                      )}
                    </td>
                    <td className="p-4 font-mono">
                      {d.employee_count || 0} staff · {d.doctor_count || 0} doctors
                    </td>
                    <td className="p-4">
                      <span className={`font-bold ${d.is_active ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {d.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="p-4 text-right space-x-1 whitespace-nowrap">
                      <button onClick={() => handleViewDeptEmployees(d)} className="px-2.5 py-1 bg-slate-100 hover:bg-blue-50 text-slate-700 rounded-lg font-semibold inline-flex items-center gap-1">
                        <Users className="w-3 h-3" /> Employees
                      </button>
                      <button
                        onClick={() => {
                          setEditingDept(d);
                          setDeptForm({
                            code: d.code,
                            name: d.name,
                            branch_id: String(d.branch_id || 1),
                            category: d.category || 'clinical',
                            head_user_id: String(d.head_user_id || ''),
                            description: d.description || '',
                            is_active: Boolean(d.is_active),
                          });
                          setDeptModalOpen(true);
                        }}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-indigo-50 text-slate-700 rounded-lg font-semibold inline-flex items-center gap-1"
                      >
                        <Edit3 className="w-3 h-3" /> Edit / Head
                      </button>
                      <button onClick={() => setConfirmToggle({ kind: 'department', item: d })} className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg font-semibold text-slate-700">
                        {d.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Create/Edit Department Modal */}
        {deptModalOpen && (
          <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
            <form onSubmit={handleSaveDepartment} className="bg-white rounded-2xl max-w-md w-full p-6 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-base">{editingDept ? `Edit Department — ${editingDept.name}` : 'Create Department'}</h3>
                <button type="button" onClick={() => setDeptModalOpen(false)}><X className="w-5 h-5 text-slate-400" /></button>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Code</label>
                  <input required value={deptForm.code} onChange={(e) => setDeptForm({ ...deptForm, code: e.target.value })} placeholder="CARD" className="w-full px-3 py-2 bg-slate-100 rounded-xl uppercase" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Category</label>
                  <select value={deptForm.category} onChange={(e) => setDeptForm({ ...deptForm, category: e.target.value })} className="w-full px-3 py-2 bg-slate-100 rounded-xl">
                    <option value="clinical">Clinical</option>
                    <option value="diagnostics">Diagnostics</option>
                    <option value="operations">Operations</option>
                    <option value="administrative">Administrative</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block font-semibold text-slate-600 mb-1">Department Name</label>
                  <input required value={deptForm.name} onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })} placeholder="Cardiology" className="w-full px-3 py-2 bg-slate-100 rounded-xl" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Branch</label>
                  <select value={deptForm.branch_id} onChange={(e) => setDeptForm({ ...deptForm, branch_id: e.target.value })} className="w-full px-3 py-2 bg-slate-100 rounded-xl">
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Assign Department Head</label>
                  <select value={deptForm.head_user_id} onChange={(e) => setDeptForm({ ...deptForm, head_user_id: e.target.value })} className="w-full px-3 py-2 bg-slate-100 rounded-xl">
                    <option value="">— Unassigned —</option>
                    {staffUsers.map((u) => <option key={u.id} value={u.id}>{u.full_name} ({u.role_name})</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block font-semibold text-slate-600 mb-1">Description</label>
                  <textarea rows={2} value={deptForm.description} onChange={(e) => setDeptForm({ ...deptForm, description: e.target.value })} className="w-full px-3 py-2 bg-slate-100 rounded-xl" />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setDeptModalOpen(false)} className="flex-1 py-2 bg-slate-100 rounded-xl text-xs font-semibold">Cancel</button>
                <button type="submit" className="flex-1 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold">Save Department</button>
              </div>
            </form>
          </div>
        )}

        {/* View Dept Employees Modal */}
        {deptEmployeesModal && (
          <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-3 max-h-[85vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h3 className="font-bold text-base">{deptEmployeesModal.dept.name} — Employees ({deptEmployeesModal.employees.length})</h3>
                <button onClick={() => setDeptEmployeesModal(null)}><X className="w-5 h-5 text-slate-400" /></button>
              </div>
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 uppercase">
                    <th className="p-2.5">Code</th>
                    <th className="p-2.5">Name</th>
                    <th className="p-2.5">Role / Designation</th>
                    <th className="p-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {deptEmployeesModal.employees.map((e) => (
                    <tr key={e.user_id}>
                      <td className="p-2.5 font-mono">{e.employee_code || e.user_code}</td>
                      <td className="p-2.5 font-semibold">{e.full_name} <span className="text-slate-400 font-normal">({e.email})</span></td>
                      <td className="p-2.5">{e.role_name} · {e.designation || 'Staff'}</td>
                      <td className="p-2.5">{e.account_status}</td>
                    </tr>
                  ))}
                  {deptEmployeesModal.employees.length === 0 && (
                    <tr><td colSpan={4} className="p-6 text-center text-slate-400">No employees assigned to this department yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {confirmToggle?.kind === 'department' && (
          <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-sm w-full p-6 space-y-4 text-xs">
              <h3 className="font-bold text-base text-slate-900">
                {confirmToggle.item.is_active ? 'Deactivate Department?' : 'Activate Department?'}
              </h3>
              <p className="text-slate-600">
                Confirm {confirmToggle.item.is_active ? 'deactivating' : 'activating'} <strong>{confirmToggle.item.name}</strong> ({confirmToggle.item.code}).
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setConfirmToggle(null)} className="flex-1 py-2 bg-slate-100 rounded-xl font-semibold">Cancel</button>
                <button
                  type="button"
                  onClick={() => handleToggleDepartmentStatus(confirmToggle.item)}
                  className={`flex-1 py-2 text-white rounded-xl font-semibold ${confirmToggle.item.is_active ? 'bg-rose-600' : 'bg-emerald-600'}`}
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (section === 'finance_payroll') {
    const t = financeData?.totals || {};
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Finance & Payroll Monitoring</h2>
          <p className="text-sm text-slate-500 mt-1">Administrator-only live SQLite revenue, billing, payment settlement, expense, and payroll oversight.</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Collected Revenue', value: `$${Number(t.totalCollected || 0).toLocaleString()}`, tone: 'text-emerald-700' },
            { label: 'Pending Payments', value: `$${Number(t.totalOutstanding || 0).toLocaleString()}`, tone: 'text-amber-700' },
            { label: 'Total Invoiced', value: `$${Number(t.totalInvoiced || 0).toLocaleString()}`, tone: 'text-blue-700' },
            { label: 'Net Payroll Processed', value: `$${Number(t.totalPayrollNet || 0).toLocaleString()}`, tone: 'text-indigo-700' },
          ].map((k) => (
            <div key={k.label} className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="text-[11px] font-semibold text-slate-500 uppercase">{k.label}</div>
              <div className={`text-2xl font-bold font-mono mt-2 ${k.tone}`}>{k.value}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-blue-600" />
              <h3 className="font-bold text-sm text-slate-900">Recent Billing & Invoices</h3>
            </div>
            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 uppercase">
                    <th className="p-2.5">Invoice</th>
                    <th className="p-2.5">Patient</th>
                    <th className="p-2.5">Total / Due</th>
                    <th className="p-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(financeData?.invoices || []).map((inv: any) => (
                    <tr key={inv.id}>
                      <td className="p-2.5 font-mono font-semibold">{inv.invoice_number}</td>
                      <td className="p-2.5">{inv.patient_name}</td>
                      <td className="p-2.5 font-mono">${inv.total_amount} / <span className="text-amber-700">${inv.balance_due}</span></td>
                      <td className="p-2.5 font-semibold">{inv.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3">
            <h3 className="font-bold text-sm text-slate-900">Payroll Cycles & Staff Payslips</h3>
            <div className="space-y-2">
              {(financeData?.payrollSummaryByPeriod || []).map((p: any) => (
                <div key={p.pay_period} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl text-xs">
                  <span className="font-mono font-bold text-slate-900">{p.pay_period} ({p.staff_count} staff)</span>
                  <span className="font-mono text-emerald-700 font-semibold">Net: ${p.total_net}</span>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto max-h-52 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 uppercase">
                    <th className="p-2">Payslip</th>
                    <th className="p-2">Employee</th>
                    <th className="p-2">Net</th>
                    <th className="p-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(financeData?.payroll || []).map((pr: any) => (
                    <tr key={pr.id}>
                      <td className="p-2 font-mono">{pr.payslip_ref || pr.pay_period}</td>
                      <td className="p-2">{pr.employee_name}</td>
                      <td className="p-2 font-mono font-semibold">${pr.net_salary}</td>
                      <td className="p-2 text-emerald-700 font-semibold">{pr.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (section === 'admin_notices_docs') {
    const pendingNotices = announcements.filter((a) => ['Pending Approval', 'Under Review'].includes(a.status));
    const publishedNotices = announcements.filter((a) => a.status === 'Published');
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Announcements & Authorized Documents Oversight</h2>
          <p className="text-sm text-slate-500 mt-1">Monitor pending notice approvals, review published communications, and inspect authorized hospital documents.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80">
            <div className="text-xs font-semibold text-slate-500 uppercase">Pending Approval Notices</div>
            <div className="text-2xl font-bold font-mono text-amber-600 mt-1">{pendingNotices.length}</div>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80">
            <div className="text-xs font-semibold text-slate-500 uppercase">Published Announcements</div>
            <div className="text-2xl font-bold font-mono text-emerald-600 mt-1">{publishedNotices.length}</div>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80">
            <div className="text-xs font-semibold text-slate-500 uppercase">Stored Attachments</div>
            <div className="text-2xl font-bold font-mono text-blue-600 mt-1">{documentsData.documents.length}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3">
            <div className="flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-blue-600" />
              <h3 className="font-bold text-sm text-slate-900">Hospital Notices & Approval Trail ({announcements.length})</h3>
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {announcements.map((a) => (
                <div key={a.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200/70 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">{a.title}</span>
                    <span className="font-semibold text-blue-700">{a.status}</span>
                  </div>
                  <div className="text-slate-500">{a.category || 'General'} · Priority: {a.priority} · By {a.author_name} · Acks: {a.unique_acks_count ?? a.acks_count}</div>
                  <p className="text-slate-600">{a.body}</p>
                </div>
              ))}
              {approvals.length > 0 && (
                <div className="pt-2 border-t border-slate-200">
                  <p className="text-[11px] font-bold text-slate-600 mb-1">Latest Approval Decisions</p>
                  {approvals.slice(0, 5).map((ap) => (
                    <div key={ap.id} className="text-[11px] text-slate-600">
                      • <strong>{ap.announcement_title}</strong> — {ap.decision} by {ap.reviewer_name} {ap.comments ? `(${ap.comments})` : ''}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-indigo-600" />
              <h3 className="font-bold text-sm text-slate-900">Authorized Document Vault</h3>
            </div>
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 uppercase">
                    <th className="p-2">File</th>
                    <th className="p-2">Module</th>
                    <th className="p-2">Owner</th>
                    <th className="p-2 text-right">View</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {documentsData.documents.map((doc) => (
                    <tr key={doc.id}>
                      <td className="p-2 font-semibold text-slate-800">{doc.original_name}</td>
                      <td className="p-2 font-mono">{doc.module}</td>
                      <td className="p-2">{doc.owner_name || 'System'}</td>
                      <td className="p-2 text-right">
                        <button onClick={() => openAttachmentPreview(doc.id, doc.original_name)} className="px-2 py-1 bg-slate-100 hover:bg-blue-50 rounded-lg font-semibold inline-flex items-center gap-1">
                          <Eye className="w-3 h-3" /> Open
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {previewDoc && (
          <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-2xl w-full p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm">{previewDoc.title}</h3>
                <button onClick={() => setPreviewDoc(null)}><X className="w-5 h-5 text-slate-400" /></button>
              </div>
              {previewDoc.mime.startsWith('image/') ? (
                <img src={previewDoc.url} alt={previewDoc.title} className="max-h-[70vh] mx-auto rounded-lg border" />
              ) : (
                <iframe src={previewDoc.url} title={previewDoc.title} className="w-full h-[65vh] border rounded-lg" />
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // System Settings & Branch Management
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">System Settings & Branch Management</h2>
        <p className="text-sm text-slate-500 mt-1">Configure hospital identity, branch campuses, notification channels, document limits, and security policies.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <form onSubmit={handleSaveSettings} className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-blue-600" />
              <h3 className="font-bold text-sm text-slate-900">Hospital Configuration & Security Policy</h3>
            </div>
            <button type="submit" className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1">
              <Save className="w-3.5 h-3.5" /> Save Settings
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-600 mb-1">Hospital Name</label>
              <input value={settingsMap.hospital_name || ''} onChange={(e) => setSettingsMap({ ...settingsMap, hospital_name: e.target.value })} className="w-full px-3 py-2 bg-slate-100 rounded-xl" />
            </div>
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-600 mb-1">Hospital Tagline</label>
              <input value={settingsMap.hospital_tagline || ''} onChange={(e) => setSettingsMap({ ...settingsMap, hospital_tagline: e.target.value })} className="w-full px-3 py-2 bg-slate-100 rounded-xl" />
            </div>
            <div>
              <label className="block font-semibold text-slate-600 mb-1">Contact Phone</label>
              <input value={settingsMap.hospital_phone || ''} onChange={(e) => setSettingsMap({ ...settingsMap, hospital_phone: e.target.value })} className="w-full px-3 py-2 bg-slate-100 rounded-xl" />
            </div>
            <div>
              <label className="block font-semibold text-slate-600 mb-1">Contact Email</label>
              <input value={settingsMap.hospital_email || ''} onChange={(e) => setSettingsMap({ ...settingsMap, hospital_email: e.target.value })} className="w-full px-3 py-2 bg-slate-100 rounded-xl" />
            </div>
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-600 mb-1">Address</label>
              <input value={settingsMap.hospital_address || ''} onChange={(e) => setSettingsMap({ ...settingsMap, hospital_address: e.target.value })} className="w-full px-3 py-2 bg-slate-100 rounded-xl" />
            </div>
            <div>
              <label className="block font-semibold text-slate-600 mb-1">Session Timeout (mins)</label>
              <input type="number" value={settingsMap.session_timeout_minutes || '480'} onChange={(e) => setSettingsMap({ ...settingsMap, session_timeout_minutes: e.target.value })} className="w-full px-3 py-2 bg-slate-100 rounded-xl" />
            </div>
            <div>
              <label className="block font-semibold text-slate-600 mb-1">Max Upload Size (MB)</label>
              <input type="number" value={settingsMap.document_max_size_mb || '10'} onChange={(e) => setSettingsMap({ ...settingsMap, document_max_size_mb: e.target.value })} className="w-full px-3 py-2 bg-slate-100 rounded-xl" />
            </div>
            <div>
              <label className="block font-semibold text-slate-600 mb-1">Allow Admin Self-Approval</label>
              <select value={settingsMap.allow_self_approval || 'false'} onChange={(e) => setSettingsMap({ ...settingsMap, allow_self_approval: e.target.value })} className="w-full px-3 py-2 bg-slate-100 rounded-xl">
                <option value="false">Blocked (Strict Separation of Duties)</option>
                <option value="true">Allowed for Admin</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-600 mb-1">Email & SMS Notifications</label>
              <select value={settingsMap.enable_email_notifications || 'true'} onChange={(e) => setSettingsMap({ ...settingsMap, enable_email_notifications: e.target.value })} className="w-full px-3 py-2 bg-slate-100 rounded-xl">
                <option value="true">Enabled</option>
                <option value="false">Disabled</option>
              </select>
            </div>
          </div>
        </form>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-indigo-600" />
              <h3 className="font-bold text-sm text-slate-900">Hospital Branches ({branches.length})</h3>
            </div>
            <button
              onClick={() => {
                setEditingBranch(null);
                setBranchForm({ code: '', name: '', address: '', phone: '', email: '', city: '' });
                setBranchModalOpen(true);
              }}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Add Branch
            </button>
          </div>
          <div className="space-y-2.5">
            {branches.map((b) => (
              <div key={b.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200/70 flex items-center justify-between text-xs">
                <div>
                  <div className="font-bold text-slate-900">{b.name} <span className="font-mono text-blue-700">({b.code})</span></div>
                  <div className="text-slate-500">{b.address} {b.city ? `· ${b.city}` : ''} · {b.phone}</div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      setEditingBranch(b);
                      setBranchForm({ code: b.code, name: b.name, address: b.address, phone: b.phone, email: b.email || '', city: b.city || '' });
                      setBranchModalOpen(true);
                    }}
                    className="px-2 py-1 bg-white border border-slate-200 rounded-lg font-semibold"
                  >
                    Edit
                  </button>
                  <button onClick={() => setConfirmToggle({ kind: 'branch', item: b })} className={`px-2 py-1 rounded-lg font-semibold ${b.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                    {b.is_active ? 'Active' : 'Inactive'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {branchModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleSaveBranch} className="bg-white rounded-2xl max-w-md w-full p-6 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base">{editingBranch ? 'Edit Branch' : 'Add Branch'}</h3>
              <button type="button" onClick={() => setBranchModalOpen(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <input required disabled={Boolean(editingBranch)} placeholder="Branch Code (e.g. NORTH)" value={branchForm.code} onChange={(e) => setBranchForm({ ...branchForm, code: e.target.value })} className="w-full px-3 py-2 bg-slate-100 rounded-xl uppercase" />
            <input required placeholder="Branch Name" value={branchForm.name} onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })} className="w-full px-3 py-2 bg-slate-100 rounded-xl" />
            <input required placeholder="Street Address" value={branchForm.address} onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })} className="w-full px-3 py-2 bg-slate-100 rounded-xl" />
            <div className="grid grid-cols-2 gap-2">
              <input required placeholder="Phone" value={branchForm.phone} onChange={(e) => setBranchForm({ ...branchForm, phone: e.target.value })} className="px-3 py-2 bg-slate-100 rounded-xl" />
              <input placeholder="City" value={branchForm.city} onChange={(e) => setBranchForm({ ...branchForm, city: e.target.value })} className="px-3 py-2 bg-slate-100 rounded-xl" />
            </div>
            <input type="email" placeholder="Branch Email" value={branchForm.email} onChange={(e) => setBranchForm({ ...branchForm, email: e.target.value })} className="w-full px-3 py-2 bg-slate-100 rounded-xl" />
            <button type="submit" className="w-full py-2.5 bg-indigo-600 text-white rounded-xl font-semibold">Save Branch</button>
          </form>
        </div>
      )}

      {confirmToggle?.kind === 'branch' && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 space-y-4 text-xs">
            <h3 className="font-bold text-base text-slate-900">
              {confirmToggle.item.is_active ? 'Deactivate Branch?' : 'Activate Branch?'}
            </h3>
            <p className="text-slate-600">
              Confirm {confirmToggle.item.is_active ? 'deactivating' : 'activating'} <strong>{confirmToggle.item.name}</strong> ({confirmToggle.item.code}).
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirmToggle(null)} className="flex-1 py-2 bg-slate-100 rounded-xl font-semibold">Cancel</button>
              <button
                type="button"
                onClick={() => handleToggleBranchStatus(confirmToggle.item)}
                className={`flex-1 py-2 text-white rounded-xl font-semibold ${confirmToggle.item.is_active ? 'bg-rose-600' : 'bg-emerald-600'}`}
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
