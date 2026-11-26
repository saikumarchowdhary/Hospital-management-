import React, { useEffect, useState } from 'react';
import { Shield, UserPlus, CheckCircle2, AlertCircle, Building2, Mail, Lock } from 'lucide-react';
import { apiRequest } from '../lib/api';

interface AddAdminPanelProps {
  onNotify: (msg: string, tone?: 'success' | 'error') => void;
  refreshSignal: number;
  onDataChanged: () => void;
}

export const AddAdminPanel: React.FC<AddAdminPanelProps> = ({ onNotify, refreshSignal, onDataChanged }) => {
  const [admins, setAdmins] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    department_id: '',
    designation: 'Hospital Administrator',
    password: '',
    confirm_password: '',
  });

  const loadAdmins = async () => {
    try {
      const [memRes, ovRes] = await Promise.all([
        apiRequest('/api/admin/members?role=admin'),
        apiRequest('/api/admin/overview'),
      ]);
      setAdmins(memRes.members || []);
      const depts = ovRes.departments || [];
      setDepartments(depts);
      setForm((prev) => ({
        ...prev,
        department_id: prev.department_id || String(depts.find((d: any) => d.name === 'Administration')?.id || depts[0]?.id || ''),
      }));
    } catch (err: any) {
      onNotify(err.message || 'Could not load administrator accounts.', 'error');
    }
  };

  useEffect(() => {
    loadAdmins();
  }, [refreshSignal]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (form.password !== form.confirm_password) {
      setErrorMsg('Passwords do not match.');
      return;
    }
    if (form.password.length < 8 || !/\d/.test(form.password)) {
      setErrorMsg('Password must be at least 8 characters and include at least one number.');
      return;
    }

    setBusy(true);
    try {
      const res = await apiRequest('/api/admin/admins', {
        method: 'POST',
        body: {
          full_name: form.full_name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          department_id: form.department_id ? Number(form.department_id) : null,
          designation: form.designation.trim() || 'Hospital Administrator',
          password: form.password,
        },
      });
      const msg = res.message || `Administrator ${form.full_name.trim()} created.`;
      setSuccessMsg(msg);
      onNotify(msg, 'success');
      setForm((prev) => ({
        ...prev,
        full_name: '',
        email: '',
        phone: '',
        password: '',
        confirm_password: '',
      }));
      loadAdmins();
      onDataChanged();
    } catch (err: any) {
      const msg = err.message || 'Failed creating administrator account.';
      setErrorMsg(msg);
      onNotify(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Add Admin</h2>
          <p className="text-sm text-slate-500 mt-1">
            Only existing administrators can provision new Admin accounts. Public admin self-registration is disabled.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-semibold">
          <Shield className="w-4 h-4 text-emerald-400" /> Admin-Only Provisioning
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <form onSubmit={handleSubmit} className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4 text-xs">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
            <UserPlus className="w-4 h-4 text-blue-600" />
            <h3 className="font-bold text-sm text-slate-900">Create New Admin Account</h3>
          </div>

          {errorMsg && (
            <div role="alert" className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}
          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          <div>
            <label className="block font-semibold text-slate-600 mb-1">Full Name *</label>
            <input
              required
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              placeholder="e.g. Dr. Evelyn Carter"
              className="w-full px-3.5 py-2.5 bg-slate-100 rounded-xl text-sm"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-600 mb-1">Admin Email *</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                required
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="new.admin@hospital.org"
                className="w-full pl-9 pr-3.5 py-2.5 bg-slate-100 rounded-xl text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-600 mb-1">Mobile Number</label>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+1-555-0199"
                className="w-full px-3.5 py-2.5 bg-slate-100 rounded-xl text-sm"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-600 mb-1">Department</label>
              <div className="relative">
                <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <select
                  value={form.department_id}
                  onChange={(e) => setForm({ ...form, department_id: e.target.value })}
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-100 rounded-xl text-sm font-semibold"
                >
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-600 mb-1">Designation</label>
            <input
              value={form.designation}
              onChange={(e) => setForm({ ...form, designation: e.target.value })}
              placeholder="Hospital Administrator"
              className="w-full px-3.5 py-2.5 bg-slate-100 rounded-xl text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-600 mb-1">Password *</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  required
                  type="password"
                  minLength={8}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="8+ chars, 1 number"
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-100 rounded-xl text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block font-semibold text-slate-600 mb-1">Confirm Password *</label>
              <input
                required
                type="password"
                minLength={8}
                value={form.confirm_password}
                onChange={(e) => setForm({ ...form, confirm_password: e.target.value })}
                placeholder="Confirm password"
                className="w-full px-3.5 py-2.5 bg-slate-100 rounded-xl text-sm"
              />
            </div>
          </div>

          <button
            disabled={busy}
            type="submit"
            className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl text-sm transition-colors"
          >
            {busy ? 'Creating Admin...' : 'Create Admin Account'}
          </button>
        </form>

        <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm text-slate-900">Active &amp; Provisioned Administrators ({admins.length})</h3>
              <p className="text-xs text-slate-500 mt-0.5">All system administrator accounts with full HMS dashboard access.</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold uppercase">
                  <th className="p-4">Admin ID</th>
                  <th className="p-4">Name &amp; Email</th>
                  <th className="p-4">Department</th>
                  <th className="p-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {admins.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50/70">
                    <td className="p-4 font-mono font-bold text-blue-700">{a.user_code}</td>
                    <td className="p-4">
                      <div className="font-bold text-slate-900">{a.full_name}</div>
                      <div className="text-slate-500">{a.email}</div>
                    </td>
                    <td className="p-4 text-slate-700">{a.department_name || 'Administration'}</td>
                    <td className="p-4">
                      <span className={`font-semibold ${a.account_status === 'Active' ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {a.account_status}
                      </span>
                    </td>
                  </tr>
                ))}
                {admins.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-slate-400">No administrator accounts found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
