import React, { useEffect, useState } from 'react';
import { CreditCard, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { apiRequest } from '../lib/api';

interface Props {
  userRole: string;
  onNotify: (msg: string, tone?: 'success' | 'error') => void;
  refreshSignal: number;
}

export const BillingInsurancePanel: React.FC<Props> = ({ userRole, onNotify, refreshSignal }) => {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [ledger, setLedger] = useState<any>(null);
  const [insurance, setInsurance] = useState<any>({ policies: [], cases: [] });

  const loadFinance = async () => {
    try {
      const invRes = await apiRequest('/api/billing/invoices');
      setInvoices(invRes.invoices || []);
      if (['admin', 'accountant', 'receptionist'].includes(userRole)) {
        const ledRes = await apiRequest('/api/billing/ledger').catch(() => null);
        setLedger(ledRes);
      }
      if (['admin', 'accountant', 'case_manager'].includes(userRole)) {
        const insRes = await apiRequest('/api/insurance/overview').catch(() => ({ policies: [], cases: [] }));
        setInsurance(insRes);
      }
    } catch (e: any) {
      onNotify(e.message || 'Finance view restricted for current role', 'error');
    }
  };

  useEffect(() => {
    loadFinance();
  }, [userRole, refreshSignal]);

  const handlePay = async (inv: any) => {
    try {
      await apiRequest('/api/billing/payments', {
        method: 'POST',
        body: {
          invoice_id: inv.id,
          amount: Number(inv.balance_due),
          method: 'Card Payment',
          idempotency_key: `ui-${inv.id}-${Date.now()}`,
        },
      });
      onNotify(`Payment recorded for ${inv.invoice_number}.`, 'success');
      loadFinance();
    } catch (err: any) {
      onNotify(err.message || 'Payment failed', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Billing, Ledger & Insurance Claims</h2>
        <p className="text-sm text-slate-500 mt-1">Invoice settlement with idempotency keys, HMAC payment webhooks, and TPA claim processing.</p>
      </div>

      {ledger?.totals && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
            <span className="text-xs font-semibold text-slate-500">Total Invoiced</span>
            <p className="text-2xl font-bold text-slate-900 mt-1">${ledger.totals.totalInvoiced}</p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
            <span className="text-xs font-semibold text-slate-500">Total Collected</span>
            <p className="text-2xl font-bold text-emerald-600 mt-1">${ledger.totals.totalCollected}</p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
            <span className="text-xs font-semibold text-slate-500">Outstanding Due</span>
            <p className="text-2xl font-bold text-amber-600 mt-1">${ledger.totals.totalOutstanding}</p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
            <span className="text-xs font-semibold text-slate-500">Operating Expenses</span>
            <p className="text-2xl font-bold text-slate-900 mt-1">${ledger.totals.totalExpenses}</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center space-x-2">
          <CreditCard className="w-4 h-4 text-blue-600" />
          <h3 className="font-bold text-slate-900 text-sm">Patient Invoices</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold text-xs uppercase">
                <th className="p-4">Invoice #</th>
                <th className="p-4">Patient</th>
                <th className="p-4">Description</th>
                <th className="p-4">Total</th>
                <th className="p-4">Balance Due</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Settle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td className="p-4 font-mono text-xs text-blue-600 font-semibold">{inv.invoice_number}</td>
                  <td className="p-4 text-xs font-semibold text-slate-900">{inv.patient_name}</td>
                  <td className="p-4 text-xs text-slate-700">{inv.description}</td>
                  <td className="p-4 text-xs font-mono">${Number(inv.total_amount).toFixed(2)}</td>
                  <td className="p-4 text-xs font-mono font-bold text-slate-900">${Number(inv.balance_due).toFixed(2)}</td>
                  <td className="p-4 text-xs font-semibold">{inv.status}</td>
                  <td className="p-4 text-right">
                    {Number(inv.balance_due) > 0 ? (
                      <button onClick={() => handlePay(inv)} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold">
                        Pay Full Due
                      </button>
                    ) : (
                      <span className="inline-flex items-center text-xs text-emerald-700 font-semibold gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Settled
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {insurance.cases?.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-indigo-600" />
            <h3 className="font-bold text-slate-900 text-sm">Insurance Pre-Authorizations & Claims</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {insurance.cases.map((c: any) => (
              <div key={c.id} className="p-3 bg-slate-50 rounded-xl text-xs flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-900">{c.case_ref} · {c.patient_name}</div>
                  <div className="text-slate-500">{c.provider_name} · Policy {c.policy_number} · Est. ${c.estimated_amount}</div>
                </div>
                <span className="font-semibold text-indigo-700">{c.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
