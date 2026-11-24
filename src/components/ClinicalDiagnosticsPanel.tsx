import React, { useEffect, useState } from 'react';
import { Pill, FlaskConical, Scan, Droplets, CheckCircle2 } from 'lucide-react';
import { apiRequest } from '../lib/api';

interface Props {
  initialSection?: 'pharmacy' | 'lab' | 'radiology' | 'bloodbank';
  searchQuery: string;
  userRole: string;
  onNotify: (msg: string, tone?: 'success' | 'error') => void;
  refreshSignal: number;
}

export const ClinicalDiagnosticsPanel: React.FC<Props> = ({
  initialSection = 'pharmacy',
  searchQuery,
  userRole,
  onNotify,
  refreshSignal,
}) => {
  const [section, setSection] = useState<'pharmacy' | 'lab' | 'radiology' | 'bloodbank'>(initialSection);
  const [medicines, setMedicines] = useState<any[]>([]);
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [labOrders, setLabOrders] = useState<any[]>([]);
  const [radOrders, setRadOrders] = useState<any[]>([]);
  const [bloodData, setBloodData] = useState<any>({ groups: [], inventory: [], requests: [] });

  const loadSection = async () => {
    try {
      if (section === 'pharmacy') {
        const [inv, rx] = await Promise.all([
          apiRequest('/api/pharmacy/inventory'),
          apiRequest('/api/pharmacy/prescriptions'),
        ]);
        setMedicines(inv.medicines || []);
        setPrescriptions(rx.prescriptions || []);
      } else if (section === 'lab') {
        const res = await apiRequest('/api/laboratory/orders');
        setLabOrders(res.orders || []);
      } else if (section === 'radiology') {
        const res = await apiRequest('/api/radiology/orders');
        setRadOrders(res.orders || []);
      } else {
        const res = await apiRequest('/api/bloodbank/overview');
        setBloodData(res);
      }
    } catch (e: any) {
      onNotify(e.message || `Restricted or unavailable section: ${section}`, 'error');
    }
  };

  useEffect(() => {
    setSection(initialSection);
  }, [initialSection]);

  useEffect(() => {
    loadSection();
  }, [section, userRole, refreshSignal]);

  const handleDispense = async (rxId: number) => {
    try {
      await apiRequest(`/api/pharmacy/prescriptions/${rxId}/dispense`, { method: 'POST', body: {} });
      onNotify('Prescription dispensed and inventory batch updated atomically.', 'success');
      loadSection();
    } catch (err: any) {
      onNotify(err.message || 'Dispense failed', 'error');
    }
  };

  const handleReleaseLab = async (orderId: number) => {
    try {
      await apiRequest(`/api/laboratory/orders/${orderId}/release`, { method: 'POST', body: {} });
      onNotify('Lab report verified and released to patient chart.', 'success');
      loadSection();
    } catch (err: any) {
      onNotify(err.message || 'Release failed', 'error');
    }
  };

  const q = searchQuery.trim().toLowerCase();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Pharmacy, Diagnostics & Blood Bank</h2>
          <p className="text-sm text-slate-500 mt-1">FEFO medicine dispensing, laboratory specimen lifecycle, radiology studies, and compatible blood stock.</p>
        </div>
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
          {[
            { id: 'pharmacy', label: 'Pharmacy', icon: Pill },
            { id: 'lab', label: 'Laboratory', icon: FlaskConical },
            { id: 'radiology', label: 'Radiology', icon: Scan },
            { id: 'bloodbank', label: 'Blood Bank', icon: Droplets },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setSection(tab.id as any)}
                className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                  section === tab.id ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {section === 'pharmacy' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
            <h3 className="font-bold text-slate-900 mb-3">Medicine Stock Catalogue</h3>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {medicines.filter((m) => !q || m.name.toLowerCase().includes(q) || m.sku.toLowerCase().includes(q)).map((m) => (
                <div key={m.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl text-xs">
                  <div>
                    <div className="font-semibold text-slate-900">{m.name}</div>
                    <div className="text-slate-500">{m.sku} · {m.category_name || 'General'} · ${m.unit_price}/{m.unit}</div>
                  </div>
                  <span className={`font-bold ${m.total_quantity <= m.reorder_level ? 'text-amber-600' : 'text-emerald-700'}`}>
                    {m.total_quantity} in stock
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
            <h3 className="font-bold text-slate-900 mb-3">Prescriptions Queue</h3>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {prescriptions.map((rx) => (
                <div key={rx.id} className="p-3 bg-slate-50 rounded-xl text-xs flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-slate-900">{rx.prescription_ref} · {rx.patient_name}</div>
                    <div className="text-slate-500">Prescribed by {rx.doctor_name} · Status: {rx.status}</div>
                  </div>
                  {rx.status !== 'Dispensed' && ['admin', 'pharmacist'].includes(userRole) && (
                    <button
                      onClick={() => handleDispense(rx.id)}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold"
                    >
                      Dispense
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {section === 'lab' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold text-xs uppercase">
                <th className="p-4">Order Ref</th>
                <th className="p-4">Patient</th>
                <th className="p-4">Diagnostic Test</th>
                <th className="p-4">Result Value</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {labOrders.map((o) => (
                <tr key={o.id}>
                  <td className="p-4 font-mono text-xs text-blue-600 font-semibold">{o.order_ref}</td>
                  <td className="p-4 text-xs font-semibold text-slate-900">{o.patient_name}</td>
                  <td className="p-4 text-xs text-slate-700">{o.test_name}</td>
                  <td className="p-4 text-xs font-mono">{o.result_value || 'Pending / Gated'}</td>
                  <td className="p-4 text-xs font-semibold">{o.status}</td>
                  <td className="p-4 text-right">
                    {o.status === 'Awaiting Review' && ['admin', 'lab_staff', 'doctor'].includes(userRole) && (
                      <button onClick={() => handleReleaseLab(o.id)} className="px-2.5 py-1 bg-emerald-600 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Release
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {section === 'radiology' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold text-xs uppercase">
                <th className="p-4">Order Ref</th>
                <th className="p-4">Patient</th>
                <th className="p-4">Modality & Study</th>
                <th className="p-4">Impression</th>
                <th className="p-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {radOrders.map((r) => (
                <tr key={r.id}>
                  <td className="p-4 font-mono text-xs text-blue-600 font-semibold">{r.order_ref}</td>
                  <td className="p-4 text-xs font-semibold text-slate-900">{r.patient_name}</td>
                  <td className="p-4 text-xs text-slate-700">{r.modality} · {r.study_name}</td>
                  <td className="p-4 text-xs text-slate-600">{r.impression || 'Awaiting Radiologist Report'}</td>
                  <td className="p-4 text-xs font-semibold">{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {section === 'bloodbank' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
            <h3 className="font-bold text-slate-900 mb-3">Available Blood Units</h3>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {(bloodData.inventory || []).map((bag: any) => (
                <div key={bag.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl text-xs">
                  <div>
                    <div className="font-semibold text-slate-900">{bag.bag_code} · {bag.group_name} ({bag.component})</div>
                    <div className="text-slate-500">Expires {bag.expiry_date}</div>
                  </div>
                  <span className="font-bold text-rose-600">{bag.status}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
            <h3 className="font-bold text-slate-900 mb-3">Blood Transfusion Requests</h3>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {(bloodData.requests || []).map((req: any) => (
                <div key={req.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl text-xs">
                  <div>
                    <div className="font-semibold text-slate-900">{req.request_ref} · {req.patient_name}</div>
                    <div className="text-slate-500">{req.group_name} · {req.units_requested} unit(s) · {req.urgency}</div>
                  </div>
                  <span className="font-semibold text-blue-700">{req.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
