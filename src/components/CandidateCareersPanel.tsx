import React, { useEffect, useState } from 'react';
import { Briefcase, Send, CheckCircle2 } from 'lucide-react';
import { apiRequest } from '../lib/api';

interface Props {
  onNotify: (msg: string, tone?: 'success' | 'error') => void;
  refreshSignal: number;
}

export const CandidateCareersPanel: React.FC<Props> = ({ onNotify, refreshSignal }) => {
  const [vacancies, setVacancies] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [coverNotes, setCoverNotes] = useState<Record<number, string>>({});

  const loadCareers = async () => {
    try {
      const [vRes, aRes] = await Promise.all([
        apiRequest('/api/hr/vacancies'),
        apiRequest('/api/hr/applications'),
      ]);
      setVacancies(vRes.vacancies || []);
      setApplications(aRes.applications || []);
    } catch (err: any) {
      onNotify(err.message || 'Unable to load career listings.', 'error');
    }
  };

  useEffect(() => {
    loadCareers();
  }, [refreshSignal]);

  const appliedIds = new Set(applications.map((a) => a.vacancy_id));

  const applyToVacancy = async (vacancyId: number) => {
    try {
      await apiRequest('/api/hr/applications', {
        method: 'POST',
        body: { vacancy_id: vacancyId, cover_note: coverNotes[vacancyId] || '' },
      });
      onNotify('Application submitted to HR.', 'success');
      loadCareers();
    } catch (err: any) {
      onNotify(err.message || 'Application failed.', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Hospital Careers & My Applications</h2>
        <p className="text-sm text-slate-500 mt-1">Browse open hospital positions and track your application progress.</p>
      </div>

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
                  <div className="text-xs text-slate-500">{v.department_name || 'Hospital'} · {v.branch_name || 'Main'} · {v.positions} position(s)</div>
                  <p className="text-xs text-slate-600">{v.description}</p>
                  {applied ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Application Submitted
                    </span>
                  ) : (
                    <div className="flex gap-2 pt-1">
                      <input
                        value={coverNotes[v.id] || ''}
                        onChange={(e) => setCoverNotes({ ...coverNotes, [v.id]: e.target.value })}
                        placeholder="Short cover note (optional)"
                        className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                      />
                      <button onClick={() => applyToVacancy(v.id)} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1">
                        <Send className="w-3 h-3" /> Apply
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3">
          <h3 className="font-bold text-sm text-slate-900">My Applications ({applications.length})</h3>
          {applications.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">You have not applied to any roles yet.</p>
          ) : (
            applications.map((a) => (
              <div key={a.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200/70 flex items-center justify-between text-xs">
                <div>
                  <div className="font-bold text-slate-900">{a.vacancy_title}</div>
                  <div className="text-slate-500 font-mono">{a.application_ref} · {a.vacancy_code}</div>
                  {a.interview_summary && <div className="text-indigo-700 mt-0.5">Interview: {a.interview_summary}</div>}
                </div>
                <span className="font-bold text-blue-700">{a.status}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
