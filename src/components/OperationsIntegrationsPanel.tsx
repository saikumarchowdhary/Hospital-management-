import React, { useEffect, useState } from 'react';
import { Briefcase, Send, Megaphone, PlugZap } from 'lucide-react';
import { apiRequest } from '../lib/api';

interface Props {
  userRole: string;
  onNotify: (msg: string, tone?: 'success' | 'error') => void;
  refreshSignal: number;
}

export const OperationsIntegrationsPanel: React.FC<Props> = ({ userRole, onNotify, refreshSignal }) => {
  const [integrations, setIntegrations] = useState<any>(null);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [notifyForm, setNotifyForm] = useState({ channel: 'sms', recipient: '+15550199', subject: 'CareLine HMS Alert', message: 'Your appointment is confirmed.' });

  const loadOps = async () => {
    try {
      const pubRes = await apiRequest('/api/publisher').catch(() => ({ announcements: [] }));
      setAnnouncements(pubRes.announcements || []);
      if (['admin', 'hr'].includes(userRole)) {
        const hrRes = await apiRequest('/api/hr/employees').catch(() => ({ employees: [] }));
        setEmployees(hrRes.employees || []);
      }
      if (['admin', 'accountant', 'receptionist'].includes(userRole)) {
        const intRes = await apiRequest('/api/integrations/status').catch(() => null);
        setIntegrations(intRes);
      }
    } catch (e: any) {
      onNotify(e.message || 'Operations load partial', 'error');
    }
  };

  useEffect(() => {
    loadOps();
  }, [userRole, refreshSignal]);

  const handleSandboxSend = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/integrations/notify/test', {
        method: 'POST',
        body: { ...notifyForm, sandbox: true },
      });
      onNotify(`Sandbox ${notifyForm.channel.toUpperCase()} message logged and delivered.`, 'success');
      loadOps();
    } catch (err: any) {
      onNotify(err.message || 'Sandbox send failed', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Hospital Operations, HR & Live Integrations</h2>
        <p className="text-sm text-slate-500 mt-1">Verified credential readiness, sandbox notification testing, HR staff roster, and hospital announcements.</p>
      </div>

      {integrations?.status && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3">
            <div className="flex items-center space-x-2">
              <PlugZap className="w-4 h-4 text-blue-600" />
              <h3 className="font-bold text-slate-900 text-sm">Third-Party Integration Readiness</h3>
            </div>
            <div className="space-y-2">
              {Object.entries(integrations.status).map(([key, val]: [string, any]) => (
                <div key={key} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl text-xs">
                  <span className="font-semibold text-slate-800">{key}</span>
                  <span className={`font-mono font-bold ${val.status === 'CONFIGURED' ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {val.status} {val.sandboxSupported ? '(Sandbox Ready)' : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <form onSubmit={handleSandboxSend} className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3">
            <div className="flex items-center space-x-2">
              <Send className="w-4 h-4 text-indigo-600" />
              <h3 className="font-bold text-slate-900 text-sm">Sandbox Notification Delivery Test</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <select value={notifyForm.channel} onChange={(e) => setNotifyForm({ ...notifyForm, channel: e.target.value })} className="px-3 py-2 bg-slate-100 rounded-xl text-xs font-semibold">
                <option value="sms">SMS (Twilio Sandbox)</option>
                <option value="email">Email (SMTP/SendGrid Sandbox)</option>
                <option value="whatsapp">WhatsApp (Meta Sandbox)</option>
              </select>
              <input required placeholder="Phone or Email" value={notifyForm.recipient} onChange={(e) => setNotifyForm({ ...notifyForm, recipient: e.target.value })} className="px-3 py-2 bg-slate-100 rounded-xl text-xs" />
            </div>
            <textarea required rows={3} value={notifyForm.message} onChange={(e) => setNotifyForm({ ...notifyForm, message: e.target.value })} className="w-full px-3 py-2 bg-slate-100 rounded-xl text-xs" />
            <button type="submit" className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl">
              Dispatch Sandbox Message
            </button>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3">
          <div className="flex items-center space-x-2">
            <Megaphone className="w-4 h-4 text-blue-600" />
            <h3 className="font-bold text-slate-900 text-sm">Hospital Announcements</h3>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {announcements.map((a) => (
              <div key={a.id} className="p-3 bg-slate-50 rounded-xl text-xs">
                <div className="font-semibold text-slate-900">{a.title}</div>
                <div className="text-slate-600 mt-1">{a.body}</div>
              </div>
            ))}
          </div>
        </div>

        {employees.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3">
            <div className="flex items-center space-x-2">
              <Briefcase className="w-4 h-4 text-indigo-600" />
              <h3 className="font-bold text-slate-900 text-sm">HR Employee Roster</h3>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {employees.slice(0, 12).map((emp) => (
                <div key={emp.id} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl text-xs">
                  <div>
                    <div className="font-semibold text-slate-900">{emp.full_name}</div>
                    <div className="text-slate-500">{emp.employee_code} · {emp.designation}</div>
                  </div>
                  <span className="font-semibold text-slate-700">{emp.role_name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
