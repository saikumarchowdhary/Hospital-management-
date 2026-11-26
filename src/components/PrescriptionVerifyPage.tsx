import React, { useEffect, useState } from 'react';
import { CheckCircle2, ShieldAlert, FileText, ArrowLeft, Stethoscope, Building2 } from 'lucide-react';
import { apiRequest } from '../lib/api';

interface Props {
  prescriptionRef: string;
  onBackHome: () => void;
}

export const PrescriptionVerifyPage: React.FC<Props> = ({ prescriptionRef, onBackHome }) => {
  const [loading, setLoading] = useState(true);
  const [verification, setVerification] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiRequest<{ valid: boolean; verification: any }>(`/api/prescriptions/verify/${encodeURIComponent(prescriptionRef)}`)
      .then((res) => {
        setVerification(res.verification);
      })
      .catch((err: any) => {
        setError(err.message || 'Prescription could not be verified.');
      })
      .finally(() => setLoading(false));
  }, [prescriptionRef]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-white rounded-2xl border border-slate-200 shadow-lg p-6 sm:p-8 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white font-bold text-xl flex items-center justify-center">+</div>
            <div>
              <h1 className="font-bold text-lg text-slate-900">Prescription Verification</h1>
              <p className="text-xs text-slate-500">Pharmacy Authenticity Check</p>
            </div>
          </div>
          <span className="font-mono text-xs font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg">
            {prescriptionRef}
          </span>
        </div>

        {loading ? (
          <div className="py-10 text-center text-sm text-slate-500">Verifying prescription record...</div>
        ) : error ? (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-5 text-center space-y-2">
            <ShieldAlert className="w-9 h-9 text-rose-600 mx-auto" />
            <h2 className="font-bold text-rose-900 text-base">Verification Failed</h2>
            <p className="text-xs text-rose-700">{error}</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
              <CheckCircle2 className="w-7 h-7 text-emerald-600 shrink-0" />
              <div>
                <div className="font-bold text-sm text-emerald-900">Verified Authentic Prescription</div>
                <div className="text-xs text-emerald-700">Issued through CareLine HMS clinical registry.</div>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl border border-slate-200/80 p-4 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Prescription ID</span>
                <span className="font-mono font-bold text-slate-900">{verification.prescription_ref}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 flex items-center gap-1.5"><Stethoscope className="w-3.5 h-3.5" /> Prescribing Doctor</span>
                <span className="font-bold text-slate-900">{verification.doctor_name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Specialization</span>
                <span className="font-semibold text-slate-800">{verification.specialization || 'General Medicine'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Medical Reg #</span>
                <span className="font-mono font-semibold text-slate-800">{verification.registration_number || 'Verified'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" /> Issuing Hospital</span>
                <span className="font-semibold text-slate-800">{verification.hospital_name || 'CareLine HMS'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Issued Date</span>
                <span className="font-mono text-slate-800">{String(verification.created_at || '').slice(0, 19).replace('T', ' ')}</span>
              </div>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={onBackHome}
          className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Return to CareLine HMS</span>
        </button>
      </div>
    </div>
  );
};
