import React, { useEffect, useState } from 'react';
import { Briefcase, Send, CheckCircle2, FileText, Award, Download, XCircle } from 'lucide-react';
import { apiRequest, getAccessToken } from '../lib/api';

interface Props {
  onNotify: (msg: string, tone?: 'success' | 'error') => void;
  refreshSignal: number;
}

export const CandidateCareersPanel: React.FC<Props> = ({ onNotify, refreshSignal }) => {
  const [vacancies, setVacancies] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [offers, setOffers] = useState<any[]>([]);
  const [coverNotes, setCoverNotes] = useState<Record<number, string>>({});
  const [resumes, setResumes] = useState<Record<number, File | null>>({});
  const [certs, setCerts] = useState<Record<number, File | null>>({});
  const [submittingId, setSubmittingId] = useState<number | null>(null);

  const loadCareers = async () => {
    try {
      const [vRes, aRes, oRes] = await Promise.all([
        apiRequest('/api/hr/vacancies'),
        apiRequest('/api/hr/applications'),
        apiRequest('/api/hr/offers').catch(() => ({ offers: [] })),
      ]);
      setVacancies(vRes.vacancies || []);
      setApplications(aRes.applications || []);
      setOffers(oRes.offers || []);
    } catch (err: any) {
      onNotify(err.message || 'Unable to load career listings.', 'error');
    }
  };

  useEffect(() => {
    loadCareers();
  }, [refreshSignal]);

  const appliedIds = new Set(applications.map((a) => a.vacancy_id));

  const applyToVacancy = async (vacancyId: number) => {
    setSubmittingId(vacancyId);
    try {
      const resumeFile = resumes[vacancyId];
      const certFile = certs[vacancyId];
      let body: any;
      if (resumeFile || certFile) {
        const fd = new FormData();
        fd.append('vacancy_id', String(vacancyId));
        fd.append('cover_note', coverNotes[vacancyId] || '');
        if (resumeFile) fd.append('resume', resumeFile);
        if (certFile) fd.append('certificate', certFile);
        body = fd;
      } else {
        body = { vacancy_id: vacancyId, cover_note: coverNotes[vacancyId] || '' };
      }

      await apiRequest('/api/hr/applications', { method: 'POST', body });
      onNotify('Application submitted to HR with attachments.', 'success');
      loadCareers();
    } catch (err: any) {
      onNotify(err.message || 'Application failed.', 'error');
    } finally {
      setSubmittingId(null);
    }
  };

  const respondToOffer = async (offerId: number, decision: 'Accepted' | 'Rejected') => {
    try {
      await apiRequest(`/api/hr/offers/${offerId}/respond`, {
        method: 'POST',
        body: { decision },
      });
      onNotify(`Offer ${decision.toLowerCase()} successfully.`, 'success');
      loadCareers();
    } catch (err: any) {
      onNotify(err.message || 'Could not update offer response.', 'error');
    }
  };

  const downloadAttachment = async (attachmentId: number, filename: string) => {
    try {
      const token = getAccessToken();
      const res = await fetch(`/api/admin/attachments/${attachmentId}`, {
        credentials: 'include',
        headers: { 'X-Requested-With': 'MediCore-HMS', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (!res.ok) throw new Error('Download failed.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
    } catch (err: any) {
      onNotify(err.message || 'Could not download attachment.', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Hospital Careers, Applications & Offers</h2>
        <p className="text-sm text-slate-500 mt-1">Browse open hospital positions, upload CV & certificates, track interviews, and respond to job offers.</p>
      </div>

      {offers.length > 0 && (
        <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-emerald-700" />
            <h3 className="font-bold text-sm text-emerald-950">My Job Offers ({offers.length})</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {offers.map((o) => (
              <div key={o.id} className="bg-white p-4 rounded-xl border border-emerald-200 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900">{o.vacancy_title}</span>
                  <span className={`font-bold px-2 py-0.5 rounded-full ${
                    o.status === 'Accepted' ? 'bg-emerald-100 text-emerald-800' : o.status === 'Rejected' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                  }`}>{o.status}</span>
                </div>
                <div className="text-slate-600 font-mono">
                  {o.offer_ref} · ${Number(o.offered_salary).toLocaleString()} / mo · Joining: {o.joining_date} ({o.employment_type})
                </div>
                {o.notes && <p className="text-slate-600">{o.notes}</p>}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {o.letter_attachment_id && (
                    <button
                      onClick={() => downloadAttachment(o.letter_attachment_id, o.letter_name || `${o.offer_ref}.pdf`)}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg font-semibold inline-flex items-center gap-1"
                    >
                      <Download className="w-3.5 h-3.5" /> Appointment Letter
                    </button>
                  )}
                  {o.status === 'Issued' && (
                    <>
                      <button
                        onClick={() => respondToOffer(o.id, 'Accepted')}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold inline-flex items-center gap-1"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Accept Offer
                      </button>
                      <button
                        onClick={() => respondToOffer(o.id, 'Rejected')}
                        className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg font-semibold inline-flex items-center gap-1"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Decline
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3">
          <div className="flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-blue-600" />
            <h3 className="font-bold text-sm text-slate-900">Open Positions ({vacancies.length})</h3>
          </div>
          {vacancies.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">No open vacancies published right now.</p>
          ) : (
            vacancies.map((v) => {
              const applied = appliedIds.has(v.id);
              return (
                <div key={v.id} className="p-4 bg-slate-50 rounded-xl border border-slate-200/70 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-slate-900">{v.title}</span>
                    <span className="text-[11px] font-semibold text-blue-700">{v.employment_type}</span>
                  </div>
                  <div className="text-xs text-slate-500">
                    {v.department_name || 'Hospital'} · {v.branch_name || 'Main'} · {v.positions} position(s)
                    {v.closing_date ? ` · Closes ${v.closing_date}` : ''}
                  </div>
                  {(v.required_experience || v.required_qualifications) && (
                    <div className="text-[11px] text-slate-600">
                      {v.required_qualifications && <span>Qual: {v.required_qualifications} </span>}
                      {v.required_experience && <span>· Exp: {v.required_experience}</span>}
                    </div>
                  )}
                  <p className="text-xs text-slate-600">{v.description}</p>
                  {applied ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Application Submitted
                    </span>
                  ) : (
                    <div className="space-y-2 pt-1">
                      <input
                        value={coverNotes[v.id] || ''}
                        onChange={(e) => setCoverNotes({ ...coverNotes, [v.id]: e.target.value })}
                        placeholder="Short cover note / summary (optional)"
                        className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                      />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-600">
                        <label className="bg-white border border-slate-200 rounded-lg p-2 cursor-pointer">
                          <span className="font-semibold block mb-1">Resume / CV (PDF/Doc)</span>
                          <input type="file" accept=".pdf,.doc,.docx,image/*" onChange={(e) => setResumes({ ...resumes, [v.id]: e.target.files?.[0] || null })} className="w-full text-[11px]" />
                        </label>
                        <label className="bg-white border border-slate-200 rounded-lg p-2 cursor-pointer">
                          <span className="font-semibold block mb-1">Certificate / Licence</span>
                          <input type="file" accept=".pdf,image/*" onChange={(e) => setCerts({ ...certs, [v.id]: e.target.files?.[0] || null })} className="w-full text-[11px]" />
                        </label>
                      </div>
                      <button
                        disabled={submittingId === v.id}
                        onClick={() => applyToVacancy(v.id)}
                        className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1"
                      >
                        <Send className="w-3 h-3" /> {submittingId === v.id ? 'Submitting...' : 'Submit Application'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-indigo-600" />
            <h3 className="font-bold text-sm text-slate-900">My Applications ({applications.length})</h3>
          </div>
          {applications.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">You have not applied to any roles yet.</p>
          ) : (
            applications.map((a) => (
              <div key={a.id} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/70 space-y-1 text-xs">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold text-slate-900">{a.vacancy_title}</div>
                    <div className="text-slate-500 font-mono">{a.application_ref} · {a.vacancy_code}</div>
                  </div>
                  <span className={`font-bold px-2 py-0.5 rounded-full ${
                    a.status === 'Not Selected' ? 'bg-rose-100 text-rose-700' : a.status === 'Joined' || a.status === 'Selected' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                  }`}>{a.status}</span>
                </div>
                {a.interview_summary && <div className="text-indigo-700">Interview: {a.interview_summary}</div>}
                {a.rejection_reason && <div className="text-rose-700">Note: {a.rejection_reason}</div>}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
