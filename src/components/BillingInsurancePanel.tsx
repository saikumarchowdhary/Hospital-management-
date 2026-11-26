import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  CreditCard,
  ShieldCheck,
  CheckCircle2,
  QrCode,
  Download,
  Plus,
  Search,
  Calendar,
  X,
  Clock,
  AlertCircle,
  ExternalLink
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { downloadPaymentReceiptPdf } from '../lib/pdfGenerators';

interface Props {
  userRole: string;
  onNotify: (msg: string, tone?: 'success' | 'error') => void;
  refreshSignal: number;
  adminPaymentsOnly?: boolean;
}

const STAFF_BILL_ROLES = new Set([
  'admin',
  'department_admin',
  'accountant',
  'receptionist',
  'pharmacist',
  'lab_staff',
  'radiologist',
  'nurse',
  'doctor',
  'case_manager'
]);

const STAFF_CONFIRM_ROLES = new Set([
  'admin',
  'department_admin',
  'accountant',
  'receptionist',
  'case_manager',
  'pharmacist',
  'lab_staff',
  'nurse'
]);

function renderBillStatusBadge(statusRaw: string) {
  const s = String(statusRaw || 'pending').toLowerCase();
  if (s === 'paid') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[11px] font-bold bg-emerald-100 text-emerald-800">
        <CheckCircle2 className="w-3 h-3" /> Paid
      </span>
    );
  }
  if (s === 'verification_pending') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[11px] font-bold bg-amber-100 text-amber-800">
        <Clock className="w-3 h-3" /> Verification Pending
      </span>
    );
  }
  if (s === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[11px] font-bold bg-rose-100 text-rose-800">
        <AlertCircle className="w-3 h-3" /> Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[11px] font-bold bg-orange-100 text-orange-800">
      <Clock className="w-3 h-3" /> Pending
    </span>
  );
}

export const BillingInsurancePanel: React.FC<Props> = ({
  userRole,
  onNotify,
  refreshSignal,
  adminPaymentsOnly = false
}) => {
  const isStaff = STAFF_BILL_ROLES.has(userRole);
  const canConfirmPayments = STAFF_CONFIRM_ROLES.has(userRole);
  const isAdmin = userRole === 'admin';

  const [bills, setBills] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [billingConfig, setBillingConfig] = useState<any>({
    hospitalName: 'CareLine HMS',
    hospitalAddress: '100 Medical Center Pkwy, Metro City',
    hospitalPhone: '+1-555-0100',
    upiId: 'carelinehms@upi',
    currency: 'INR',
    razorpayEnabled: false,
    razorpayKeyId: null
  });
  const [patients, setPatients] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [ledger, setLedger] = useState<any>(null);
  const [insurance, setInsurance] = useState<any>({ policies: [], cases: [] });
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [billTypeFilter, setBillTypeFilter] = useState('All');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Create Bill Modal
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [billForm, setBillForm] = useState({
    patient_id: '',
    bill_type: 'consultation',
    description: '',
    amount: ''
  });

  // Pay Now Modal + QR
  const [payModalBill, setPayModalBill] = useState<any | null>(null);
  const [upiQrDataUrl, setUpiQrDataUrl] = useState<string>('');
  const [upiUri, setUpiUri] = useState<string>('');
  const [txnInput, setTxnInput] = useState('');
  const [submittingUpi, setSubmittingUpi] = useState(false);
  const [processingRazorpay, setProcessingRazorpay] = useState(false);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);

  const loadFinance = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'All') params.set('status', statusFilter);
      if (billTypeFilter !== 'All') params.set('bill_type', billTypeFilter);
      if (fromDate) params.set('from_date', fromDate);
      if (toDate) params.set('to_date', toDate);
      if (searchTerm.trim()) params.set('q', searchTerm.trim());
      const qs = params.toString() ? `?${params.toString()}` : '';

      if (adminPaymentsOnly && isAdmin) {
        const [payRes, cfgRes] = await Promise.all([
          apiRequest<{ payments: any[]; summary: any }>(`/api/admin/payments${qs}`),
          apiRequest<{ config: any }>('/api/billing/config').catch(() => null)
        ]);
        setBills(payRes.payments || []);
        setSummary(payRes.summary || null);
        if (cfgRes?.config) setBillingConfig(cfgRes.config);
      } else {
        const billsRes = await apiRequest<{ bills: any[]; config: any }>(`/api/billing/bills${qs}`);
        setBills(billsRes.bills || []);
        if (billsRes.config) setBillingConfig(billsRes.config);

        const invRes = await apiRequest('/api/billing/invoices').catch(() => ({ invoices: [] }));
        setInvoices(invRes.invoices || []);
        if (['admin', 'accountant', 'receptionist'].includes(userRole)) {
          const ledRes = await apiRequest('/api/billing/ledger').catch(() => null);
          setLedger(ledRes);
        }
        if (['admin', 'accountant', 'case_manager'].includes(userRole)) {
          const insRes = await apiRequest('/api/insurance/overview').catch(() => ({ policies: [], cases: [] }));
          setInsurance(insRes);
        }
      }
    } catch (e: any) {
      onNotify(e.message || 'Finance view restricted for current role', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFinance();
  }, [userRole, refreshSignal, statusFilter, billTypeFilter, fromDate, toDate, adminPaymentsOnly]);

  useEffect(() => {
    if (!isStaff) return;
    apiRequest<{ patients: any[] }>('/api/patients')
      .then((res) => {
        const list = res.patients || [];
        setPatients(list);
        if (!billForm.patient_id && list[0]) {
          setBillForm((prev) => ({ ...prev, patient_id: String(list[0].id) }));
        }
      })
      .catch(() => {});
  }, [isStaff]);

  const openPayModal = async (bill: any) => {
    setPayModalBill(bill);
    setTxnInput(bill.transaction_id || '');
    const amountStr = Number(bill.amount || 0).toFixed(2);
    const uri = `upi://pay?pa=${encodeURIComponent(billingConfig.upiId || 'carelinehms@upi')}&pn=${encodeURIComponent(billingConfig.hospitalName || 'CareLine HMS')}&am=${amountStr}&cu=INR&tn=${encodeURIComponent(bill.payment_ref)}`;
    setUpiUri(uri);
    try {
      const dataUrl = await QRCode.toDataURL(uri, { width: 240, margin: 1 });
      setUpiQrDataUrl(dataUrl);
    } catch {
      setUpiQrDataUrl('');
    }
  };

  const handleCreateBill = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await apiRequest('/api/billing/bills', {
        method: 'POST',
        body: {
          patient_id: Number(billForm.patient_id),
          bill_type: billForm.bill_type,
          description: billForm.description.trim(),
          amount: Number(billForm.amount)
        }
      });
      onNotify('Patient bill created and sent to patient.', 'success');
      setCreateOpen(false);
      setBillForm((prev) => ({ ...prev, description: '', amount: '' }));
      loadFinance();
    } catch (err: any) {
      onNotify(err.message || 'Could not create bill.', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleSubmitUpi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payModalBill) return;
    setSubmittingUpi(true);
    try {
      const res = await apiRequest<{ message: string }>(`/api/billing/bills/${payModalBill.id}/submit-upi`, {
        method: 'POST',
        body: { transaction_id: txnInput.trim() }
      });
      onNotify(res.message || 'UPI Transaction ID submitted for staff verification.', 'success');
      setPayModalBill(null);
      setTxnInput('');
      loadFinance();
    } catch (err: any) {
      onNotify(err.message || 'Failed submitting UPI Transaction ID.', 'error');
    } finally {
      setSubmittingUpi(false);
    }
  };

  const handleRazorpayPay = async (bill: any) => {
    setProcessingRazorpay(true);
    try {
      const order = await apiRequest<{ orderId: string; amountPaise: number; currency: string; keyId: string }>(
        `/api/billing/bills/${bill.id}/create-razorpay-order`,
        { method: 'POST', body: {} }
      );
      if (!(window as any).Razorpay) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://checkout.razorpay.com/v1/checkout.js';
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('Could not load Razorpay checkout SDK.'));
          document.body.appendChild(script);
        });
      }
      const rzp = new (window as any).Razorpay({
        key: order.keyId,
        amount: order.amountPaise,
        currency: order.currency,
        name: billingConfig.hospitalName,
        description: `${bill.payment_ref} · ${bill.description}`,
        order_id: order.orderId,
        handler: async (response: any) => {
          try {
            await apiRequest(`/api/billing/bills/${bill.id}/verify-razorpay`, {
              method: 'POST',
              body: {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature
              }
            });
            onNotify('Online payment verified and marked Paid.', 'success');
            setPayModalBill(null);
            loadFinance();
          } catch (verErr: any) {
            onNotify(verErr.message || 'Razorpay signature verification failed.', 'error');
          }
        }
      });
      rzp.open();
    } catch (err: any) {
      onNotify(err.message || 'Online checkout unavailable; please pay via UPI QR.', 'error');
    } finally {
      setProcessingRazorpay(false);
    }
  };

  const handleConfirmPayment = async (bill: any, decision: 'paid' | 'failed') => {
    setConfirmingId(bill.id);
    try {
      await apiRequest(`/api/billing/bills/${bill.id}/confirm`, {
        method: 'POST',
        body: { decision }
      });
      onNotify(
        decision === 'paid'
          ? `Payment confirmed for ${bill.payment_ref}. Receipt ready.`
          : `Payment marked failed for ${bill.payment_ref}.`,
        decision === 'paid' ? 'success' : 'error'
      );
      loadFinance();
    } catch (err: any) {
      onNotify(err.message || 'Confirmation failed.', 'error');
    } finally {
      setConfirmingId(null);
    }
  };

  const handleDownloadReceipt = async (bill: any) => {
    try {
      await downloadPaymentReceiptPdf(bill, billingConfig);
      onNotify(`Downloaded receipt PDF for ${bill.payment_ref}.`, 'success');
    } catch (err: any) {
      onNotify(err.message || 'Could not generate receipt PDF.', 'error');
    }
  };

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

  const displayedBills = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return bills;
    return bills.filter(
      (b) =>
        String(b.payment_ref || '').toLowerCase().includes(q) ||
        String(b.patient_name || '').toLowerCase().includes(q) ||
        String(b.description || '').toLowerCase().includes(q) ||
        String(b.transaction_id || '').toLowerCase().includes(q)
    );
  }, [bills, searchTerm]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">
            {adminPaymentsOnly
              ? 'All Hospital Payments & Bills'
              : userRole === 'patient'
                ? 'My Bills & QR Payments'
                : 'Billing, QR Payments & Insurance Claims'}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            {userRole === 'patient'
              ? 'Scan the hospital UPI QR code to pay pending bills, submit your transaction ID, and download verified PDF receipts.'
              : 'Create patient bills, verify patient UPI transaction IDs, reconcile invoices, and manage TPA claims.'}
          </p>
        </div>
        {isStaff && (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-sm shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Create Patient Bill</span>
          </button>
        )}
      </div>

      {/* ADMIN PAYMENTS SUMMARY */}
      {adminPaymentsOnly && summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
            <span className="text-xs font-semibold text-slate-500">Paid Total</span>
            <p className="text-2xl font-bold text-emerald-600 mt-1 font-mono">₹{Number(summary.paidTotal || 0).toLocaleString()}</p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
            <span className="text-xs font-semibold text-slate-500">Verification Pending</span>
            <p className="text-2xl font-bold text-amber-600 mt-1 font-mono">₹{Number(summary.verificationPendingTotal || 0).toLocaleString()}</p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
            <span className="text-xs font-semibold text-slate-500">Pending Payment</span>
            <p className="text-2xl font-bold text-orange-600 mt-1 font-mono">₹{Number(summary.pendingTotal || 0).toLocaleString()}</p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
            <span className="text-xs font-semibold text-slate-500">Failed / Disputed</span>
            <p className="text-2xl font-bold text-rose-600 mt-1 font-mono">₹{Number(summary.failedTotal || 0).toLocaleString()}</p>
          </div>
        </div>
      )}

      {!adminPaymentsOnly && ledger?.totals && (
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

      {/* BILLS FILTERS */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs flex flex-wrap items-center gap-3 text-xs">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by bill ref, patient name, description, or transaction ID..."
            className="w-full pl-9 pr-3 py-2 bg-slate-100 rounded-xl"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 bg-slate-100 rounded-xl font-semibold text-slate-700"
        >
          <option value="All">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="verification_pending">Verification Pending</option>
          <option value="paid">Paid</option>
          <option value="failed">Failed</option>
        </select>
        <select
          value={billTypeFilter}
          onChange={(e) => setBillTypeFilter(e.target.value)}
          className="px-3 py-2 bg-slate-100 rounded-xl font-semibold text-slate-700"
        >
          <option value="All">All Bill Types</option>
          <option value="consultation">Consultation</option>
          <option value="lab test">Lab Test</option>
          <option value="medicine">Medicine</option>
          <option value="room">Room</option>
          <option value="other">Other</option>
        </select>
        <div className="flex items-center gap-1.5 bg-slate-100 px-3 py-1.5 rounded-xl">
          <Calendar className="w-3.5 h-3.5 text-slate-500" />
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="bg-transparent" />
          <span className="text-slate-400">to</span>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="bg-transparent" />
        </div>
      </div>

      {/* BILLS & QR PAYMENTS TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <QrCode className="w-4 h-4 text-blue-600" />
            <h3 className="font-bold text-slate-900 text-sm">
              {userRole === 'patient' ? 'My Bills' : 'Patient Bills & UPI Payments'} ({displayedBills.length})
            </h3>
          </div>
          <span className="text-xs text-slate-500 font-mono">UPI: {billingConfig.upiId}</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading bills...</div>
        ) : displayedBills.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">No bills match the selected filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold text-xs uppercase">
                  <th className="p-4">Bill Ref</th>
                  <th className="p-4">Patient</th>
                  <th className="p-4">Type & Description</th>
                  <th className="p-4">Amount</th>
                  <th className="p-4">Transaction ID</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedBills.map((bill) => {
                  const status = String(bill.status || 'pending').toLowerCase();
                  return (
                    <tr key={bill.id} className="hover:bg-slate-50/60">
                      <td className="p-4 text-xs">
                        <div className="font-mono font-bold text-blue-700">{bill.payment_ref}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{String(bill.created_at || '').slice(0, 10)}</div>
                      </td>
                      <td className="p-4 text-xs">
                        <div className="font-semibold text-slate-900">{bill.patient_name}</div>
                        <div className="text-[11px] text-slate-500 font-mono">{bill.patient_code}</div>
                      </td>
                      <td className="p-4 text-xs">
                        <span className="uppercase text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                          {bill.bill_type || 'other'}
                        </span>
                        <div className="text-slate-800 font-medium mt-1">{bill.description}</div>
                      </td>
                      <td className="p-4 text-xs font-mono font-bold text-slate-900">
                        ₹{Number(bill.amount || 0).toFixed(2)}
                      </td>
                      <td className="p-4 text-xs font-mono text-slate-600">
                        {bill.transaction_id || '—'}
                      </td>
                      <td className="p-4">{renderBillStatusBadge(status)}</td>
                      <td className="p-4 text-right">
                        <div className="inline-flex flex-wrap items-center justify-end gap-2">
                          {(status === 'pending' || status === 'failed') && (
                            <button
                              type="button"
                              onClick={() => openPayModal(bill)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold"
                            >
                              <QrCode className="w-3.5 h-3.5" />
                              <span>Pay Now</span>
                            </button>
                          )}
                          {canConfirmPayments && status !== 'paid' && (
                            <>
                              <button
                                type="button"
                                disabled={confirmingId === bill.id}
                                onClick={() => handleConfirmPayment(bill, 'paid')}
                                className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-lg text-xs font-semibold"
                              >
                                Confirm Paid
                              </button>
                              {status === 'verification_pending' && (
                                <button
                                  type="button"
                                  disabled={confirmingId === bill.id}
                                  onClick={() => handleConfirmPayment(bill, 'failed')}
                                  className="px-2.5 py-1.5 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-lg text-xs font-semibold"
                                >
                                  Reject
                                </button>
                              )}
                            </>
                          )}
                          {status === 'paid' && (
                            <button
                              type="button"
                              onClick={() => handleDownloadReceipt(bill)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>Download Receipt</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* EXISTING INVOICES & INSURANCE SECTION (preserved when not in Admin-only Payments subpage) */}
      {!adminPaymentsOnly && (
        <>
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
        </>
      )}

      {/* CREATE PATIENT BILL MODAL */}
      {createOpen && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <form onSubmit={handleCreateBill} className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 text-xs shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-base text-slate-900">Create Patient Bill</h3>
              <button type="button" onClick={() => setCreateOpen(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Patient *</label>
              <select
                required
                value={billForm.patient_id}
                onChange={(e) => setBillForm({ ...billForm, patient_id: e.target.value })}
                className="w-full px-3 py-2.5 bg-slate-100 rounded-xl"
              >
                <option value="">Select patient...</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>{p.full_name} ({p.patient_code})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Bill Type *</label>
              <select
                required
                value={billForm.bill_type}
                onChange={(e) => setBillForm({ ...billForm, bill_type: e.target.value })}
                className="w-full px-3 py-2.5 bg-slate-100 rounded-xl"
              >
                <option value="consultation">Consultation</option>
                <option value="lab test">Lab Test</option>
                <option value="medicine">Medicine</option>
                <option value="room">Room</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Description *</label>
              <input
                required
                placeholder="e.g., Cardiology Specialist Consultation & ECG"
                value={billForm.description}
                onChange={(e) => setBillForm({ ...billForm, description: e.target.value })}
                className="w-full px-3 py-2.5 bg-slate-100 rounded-xl"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Amount (INR) *</label>
              <input
                required
                type="number"
                min="1"
                step="0.01"
                placeholder="500.00"
                value={billForm.amount}
                onChange={(e) => setBillForm({ ...billForm, amount: e.target.value })}
                className="w-full px-3 py-2.5 bg-slate-100 rounded-xl font-mono"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setCreateOpen(false)} className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-semibold">
                Cancel
              </button>
              <button type="submit" disabled={creating} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold">
                {creating ? 'Creating...' : 'Create Bill'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* UPI QR PAYMENT MODAL */}
      {payModalBill && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 text-xs shadow-xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-base text-slate-900">Scan & Pay via UPI</h3>
                <p className="text-slate-500 font-mono">{payModalBill.payment_ref}</p>
              </div>
              <button type="button" onClick={() => setPayModalBill(null)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col items-center text-center space-y-3">
              {upiQrDataUrl ? (
                <img src={upiQrDataUrl} alt="UPI Payment QR Code" className="w-48 h-48 rounded-xl border border-slate-200 bg-white p-2" />
              ) : (
                <div className="w-48 h-48 rounded-xl bg-slate-200 flex items-center justify-center text-slate-500">Generating QR...</div>
              )}
              <div className="space-y-1">
                <div className="text-2xl font-bold font-mono text-slate-900">₹{Number(payModalBill.amount || 0).toFixed(2)}</div>
                <div className="font-bold text-sm text-blue-700">{billingConfig.hospitalName}</div>
                <div className="text-slate-600">{payModalBill.bill_type?.toUpperCase()} · {payModalBill.description}</div>
                <div className="font-mono text-[11px] text-slate-500">UPI ID: {billingConfig.upiId}</div>
              </div>
              {upiUri && (
                <a
                  href={upiUri}
                  className="inline-flex items-center gap-1.5 text-blue-600 font-semibold hover:underline"
                >
                  <span>Open in UPI App</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>

            <form onSubmit={handleSubmitUpi} className="space-y-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Enter UPI Transaction ID / UTR *
                </label>
                <input
                  required
                  minLength={6}
                  placeholder="e.g., 432819045612"
                  value={txnInput}
                  onChange={(e) => setTxnInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-100 rounded-xl font-mono"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  After submission, status becomes <strong>Verification Pending</strong> until confirmed by hospital staff.
                </p>
              </div>
              <button
                type="submit"
                disabled={submittingUpi}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl font-semibold"
              >
                {submittingUpi ? 'Submitting...' : 'Submit UPI Transaction ID'}
              </button>
            </form>

            {billingConfig.razorpayEnabled && (
              <div className="pt-2 border-t border-slate-100 space-y-2">
                <button
                  type="button"
                  disabled={processingRazorpay}
                  onClick={() => handleRazorpayPay(payModalBill)}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-xl font-semibold"
                >
                  {processingRazorpay ? 'Opening Razorpay...' : 'Pay Online (Razorpay Test Mode)'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
