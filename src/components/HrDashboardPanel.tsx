import React, { useEffect, useMemo, useState } from 'react';
import {
  Briefcase,
  Users,
  Calendar,
  FileText,
  Award,
  BarChart3,
  Plus,
  Search,
  Eye,
  Download,
  Upload,
  CheckCircle2,
  XCircle,
  Edit3,
  X,
  Clock,
} from 'lucide-react';
import { apiRequest, getAccessToken } from '../lib/api';

interface Props {
  onNotify: (msg: string, tone?: 'success' | 'error') => void;
  refreshSignal: number;
  initialSubTab?: 'overview' | 'employees' | 'vacancies' | 'candidates' | 'interviews' | 'offers' | 'reports';
}

export const HrDashboardPanel: React.FC<Props> = ({ onNotify, refreshSignal, initialSubTab = 'overview' }) => {
  const [subTab, setSubTab] = useState<'overview' | 'employees' | 'vacancies' | 'candidates' | 'interviews' | 'offers' | 'reports'>(initialSubTab);

  const [dash, setDash] = useState<any>(null);
  const [employeesData, setEmployeesData] = useState<any>({ employees: [], leaves: [], payroll: [], attendance: [], staffRoles: [], departments: [], branches: [] });
  const [vacancies, setVacancies] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [interviews, setInterviews] = useState<any[]>([]);
  const [offers, setOffers] = useState<any[]>([]);
  const [reportsData, setReportsData] = useState<any>(null);

  const [empQuery, setEmpQuery] = useState('');
  const [appStatusFilter, setAppStatusFilter] = useState('all');
  const [empPage, setEmpPage] = useState(1);
  const [appPage, setAppPage] = useState(1);
  const HR_PAGE_SIZE = 10;
  const [confirmCloseVac, setConfirmCloseVac] = useState<any>(null);

  // Employee Modals
  const [empModalOpen, setEmpModalOpen] = useState(false);
  const [editingEmp, setEditingEmp] = useState<any>(null);
  const [empForm, setEmpForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    role_id: '',
    department_id: '',
    branch_id: '1',
    designation: 'Staff Nurse',
    employment_type: 'Full-Time',
    qualification: '',
    shift: 'Day',
    joining_date: new Date().toISOString().slice(0, 10),
    employee_code: '',
    base_salary: '5000',
    employment_status: 'Active',
    password: '',
  });
  const [empProfileModal, setEmpProfileModal] = useState<any>(null);
  const [empDocFile, setEmpDocFile] = useState<File | null>(null);
  const [empDocTitle, setEmpDocTitle] = useState('');
  const [empDocType, setEmpDocType] = useState('Contract');

  // Vacancy Modal & Applicants Modal
  const [vacModalOpen, setVacModalOpen] = useState(false);
  const [editingVac, setEditingVac] = useState<any>(null);
  const [vacForm, setVacForm] = useState({
    title: '',
    department_id: '',
    branch_id: '1',
    location: 'Main Campus',
    employment_type: 'Full-Time',
    positions: '1',
    required_experience: '',
    required_qualifications: '',
    description: '',
    opening_date: new Date().toISOString().slice(0, 10),
    closing_date: '',
    status: 'Published',
  });
  const [vacApplicantsModal, setVacApplicantsModal] = useState<{ vacancy: any; applicants: any[] } | null>(null);

  // Candidate Detail / Reject / Schedule Interview / Feedback / Issue Offer Modals
  const [appDetailModal, setAppDetailModal] = useState<any>(null);
  const [rejectModal, setRejectModal] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [schedModal, setSchedModal] = useState<any>(null);
  const [schedForm, setSchedForm] = useState({
    scheduled_at: `${new Date(Date.now() + 86400000).toISOString().slice(0, 10)} 10:00`,
    interviewer_name: '',
    interviewer_user_id: '',
    mode: 'In-Person',
    notes: '',
  });
  const [feedbackModal, setFeedbackModal] = useState<any>(null);
  const [feedbackForm, setFeedbackForm] = useState({ feedback: '', rating: '5', outcome: 'Passed' });
  const [offerModal, setOfferModal] = useState<any>(null);
  const [offerForm, setOfferForm] = useState({ offered_salary: '5500', joining_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10), employment_type: 'Full-Time', notes: '' });
  const [offerLetterFile, setOfferLetterFile] = useState<File | null>(null);

  const [previewDoc, setPreviewDoc] = useState<{ title: string; url: string; mime: string } | null>(null);

  const loadAll = async () => {
    try {
      const [dRes, eRes, vRes, aRes, iRes, oRes, rRes] = await Promise.all([
        apiRequest('/api/hr/dashboard'),
        apiRequest('/api/hr/employees'),
        apiRequest('/api/hr/vacancies'),
        apiRequest('/api/hr/applications'),
        apiRequest('/api/hr/interviews'),
        apiRequest('/api/hr/offers'),
        apiRequest('/api/hr/reports'),
      ]);
      setDash(dRes);
      setEmployeesData(eRes);
      setVacancies(vRes.vacancies || []);
      setApplications(aRes.applications || []);
      setInterviews(iRes.interviews || []);
      setOffers(oRes.offers || []);
      setReportsData(rRes);
    } catch (err: any) {
      onNotify(err.message || 'Unable to load HR workspace.', 'error');
    }
  };

  useEffect(() => {
    setSubTab(initialSubTab);
  }, [initialSubTab]);

  useEffect(() => {
    loadAll();
  }, [refreshSignal]);

  const openAttachment = async (attachmentId: number, title: string, download = false) => {
    try {
      const token = getAccessToken();
      const res = await fetch(`/api/admin/attachments/${attachmentId}`, {
        credentials: 'include',
        headers: { 'X-Requested-With': 'MediCore-HMS', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (!res.ok) throw new Error(`Could not fetch file (${res.status})`);
      const mime = res.headers.get('content-type') || '';
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (download) {
        const a = document.createElement('a');
        a.href = url;
        a.download = title;
        a.click();
      } else {
        setPreviewDoc({ title, url, mime });
      }
    } catch (err: any) {
      onNotify(err.message || 'Could not open document.', 'error');
    }
  };

  const filteredEmployees = useMemo(() => {
    const q = empQuery.trim().toLowerCase();
    return (employeesData.employees || []).filter((e: any) => {
      if (!q) return true;
      return `${e.full_name} ${e.employee_code} ${e.email} ${e.department_name || ''} ${e.designation}`.toLowerCase().includes(q);
    });
  }, [employeesData.employees, empQuery]);

  const filteredApplications = useMemo(() => {
    return applications.filter((a) => appStatusFilter === 'all' || a.status === appStatusFilter);
  }, [applications, appStatusFilter]);

  useEffect(() => {
    setEmpPage(1);
  }, [empQuery]);

  useEffect(() => {
    setAppPage(1);
  }, [appStatusFilter]);

  const empTotalPages = Math.max(1, Math.ceil(filteredEmployees.length / HR_PAGE_SIZE));
  const pagedEmployees = useMemo(
    () => filteredEmployees.slice((empPage - 1) * HR_PAGE_SIZE, empPage * HR_PAGE_SIZE),
    [filteredEmployees, empPage]
  );

  const appTotalPages = Math.max(1, Math.ceil(filteredApplications.length / HR_PAGE_SIZE));
  const pagedApplications = useMemo(
    () => filteredApplications.slice((appPage - 1) * HR_PAGE_SIZE, appPage * HR_PAGE_SIZE),
    [filteredApplications, appPage]
  );

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingEmp) {
        await apiRequest(`/api/hr/employees/${editingEmp.id}`, {
          method: 'PATCH',
          body: {
            full_name: empForm.full_name,
            phone: empForm.phone,
            department_id: empForm.department_id ? Number(empForm.department_id) : null,
            branch_id: Number(empForm.branch_id),
            designation: empForm.designation,
            employment_type: empForm.employment_type,
            qualification: empForm.qualification,
            shift: empForm.shift,
            joining_date: empForm.joining_date,
            employment_status: empForm.employment_status,
            base_salary: Number(empForm.base_salary),
          },
        });
        onNotify(`Updated employee ${empForm.full_name}.`, 'success');
      } else {
        await apiRequest('/api/hr/employees', {
          method: 'POST',
          body: {
            ...empForm,
            role_id: Number(empForm.role_id),
            department_id: empForm.department_id ? Number(empForm.department_id) : null,
            branch_id: Number(empForm.branch_id),
            base_salary: Number(empForm.base_salary),
          },
        });
        onNotify(`Added employee ${empForm.full_name}.`, 'success');
      }
      setEmpModalOpen(false);
      loadAll();
    } catch (err: any) {
      onNotify(err.message || 'Could not save employee.', 'error');
    }
  };

  const openEmpProfile = async (empId: number) => {
    try {
      const res = await apiRequest(`/api/hr/employees/${empId}`);
      setEmpProfileModal(res);
    } catch (err: any) {
      onNotify(err.message || 'Could not load employee profile.', 'error');
    }
  };

  const handleUploadEmpDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empProfileModal?.employee?.id || !empDocFile) return;
    try {
      const fd = new FormData();
      fd.append('title', empDocTitle.trim() || empDocFile.name);
      fd.append('doc_type', empDocType);
      fd.append('document', empDocFile);
      await apiRequest(`/api/hr/employees/${empProfileModal.employee.id}/documents`, { method: 'POST', body: fd });
      onNotify('Employee document uploaded.', 'success');
      setEmpDocFile(null);
      setEmpDocTitle('');
      openEmpProfile(empProfileModal.employee.id);
      loadAll();
    } catch (err: any) {
      onNotify(err.message || 'Document upload failed.', 'error');
    }
  };

  const handleLeaveAction = async (leaveId: number, status: 'Approved' | 'Rejected') => {
    try {
      await apiRequest(`/api/hr/leaves/${leaveId}`, { method: 'PATCH', body: { status } });
      onNotify(`Leave request ${status.toLowerCase()}.`, 'success');
      loadAll();
    } catch (err: any) {
      onNotify(err.message || 'Leave action failed.', 'error');
    }
  };

  const handleRunPayroll = async () => {
    try {
      const res = await apiRequest('/api/hr/payroll/run', { method: 'POST', body: {} });
      onNotify(res.message || 'Payroll run completed.', 'success');
      loadAll();
    } catch (err: any) {
      onNotify(err.message || 'Payroll run failed.', 'error');
    }
  };

  const handleSaveVacancy = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingVac) {
        await apiRequest(`/api/hr/vacancies/${editingVac.id}`, {
          method: 'PATCH',
          body: {
            ...vacForm,
            department_id: vacForm.department_id ? Number(vacForm.department_id) : null,
            branch_id: Number(vacForm.branch_id),
            positions: Number(vacForm.positions),
          },
        });
        onNotify(`Vacancy "${vacForm.title}" updated.`, 'success');
      } else {
        await apiRequest('/api/hr/vacancies', {
          method: 'POST',
          body: {
            ...vacForm,
            department_id: vacForm.department_id ? Number(vacForm.department_id) : null,
            branch_id: Number(vacForm.branch_id),
            positions: Number(vacForm.positions),
          },
        });
        onNotify(`Vacancy "${vacForm.title}" created (${vacForm.status}).`, 'success');
      }
      setVacModalOpen(false);
      loadAll();
    } catch (err: any) {
      onNotify(err.message || 'Could not save vacancy.', 'error');
    }
  };

  const handleVacancyStatus = async (vid: number, status: string) => {
    try {
      await apiRequest(`/api/hr/vacancies/${vid}/status`, { method: 'POST', body: { status } });
      onNotify(`Vacancy marked ${status}.`, 'success');
      loadAll();
    } catch (err: any) {
      onNotify(err.message || 'Vacancy status change failed.', 'error');
    }
  };

  const openVacancyApplicants = async (vac: any) => {
    try {
      const res = await apiRequest(`/api/hr/vacancies/${vac.id}/applicants`);
      setVacApplicantsModal({ vacancy: vac, applicants: res.applications || [] });
    } catch (err: any) {
      onNotify(err.message || 'Could not load applicants.', 'error');
    }
  };

  const handleAppStatusUpdate = async (appId: number, status: string, extra: Record<string, any> = {}) => {
    try {
      await apiRequest(`/api/hr/applications/${appId}/status`, { method: 'PATCH', body: { status, ...extra } });
      onNotify(`Application moved to ${status}.`, 'success');
      loadAll();
    } catch (err: any) {
      onNotify(err.message || 'Status update failed.', 'error');
    }
  };

  const handleConfirmRejectApp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectModal) return;
    await handleAppStatusUpdate(rejectModal.id, 'Not Selected', { rejection_reason: rejectReason.trim() });
    setRejectModal(null);
    setRejectReason('');
  };

  const handleScheduleInterview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schedModal) return;
    try {
      await apiRequest('/api/hr/interviews', {
        method: 'POST',
        body: {
          application_id: schedModal.id,
          scheduled_at: schedForm.scheduled_at,
          interviewer_name: schedForm.interviewer_name || undefined,
          interviewer_user_id: schedForm.interviewer_user_id ? Number(schedForm.interviewer_user_id) : null,
          mode: schedForm.mode,
          notes: schedForm.notes,
        },
      });
      onNotify('Interview scheduled and candidate notified.', 'success');
      setSchedModal(null);
      loadAll();
    } catch (err: any) {
      onNotify(err.message || 'Could not schedule interview.', 'error');
    }
  };

  const handleSaveInterviewFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackModal) return;
    try {
      await apiRequest(`/api/hr/interviews/${feedbackModal.id}`, {
        method: 'PATCH',
        body: {
          feedback: feedbackForm.feedback,
          rating: Number(feedbackForm.rating),
          outcome: feedbackForm.outcome,
        },
      });
      onNotify('Interview feedback & rating recorded.', 'success');
      setFeedbackModal(null);
      loadAll();
    } catch (err: any) {
      onNotify(err.message || 'Could not update interview.', 'error');
    }
  };

  const handleIssueOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!offerModal) return;
    try {
      let body: any;
      if (offerLetterFile) {
        const fd = new FormData();
        fd.append('application_id', String(offerModal.id));
        fd.append('offered_salary', offerForm.offered_salary);
        fd.append('joining_date', offerForm.joining_date);
        fd.append('employment_type', offerForm.employment_type);
        fd.append('notes', offerForm.notes);
        fd.append('letter', offerLetterFile);
        body = fd;
      } else {
        body = {
          application_id: offerModal.id,
          offered_salary: Number(offerForm.offered_salary),
          joining_date: offerForm.joining_date,
          employment_type: offerForm.employment_type,
          notes: offerForm.notes,
        };
      }
      await apiRequest('/api/hr/offers', { method: 'POST', body });
      onNotify(`Offer issued to ${offerModal.candidate_name}.`, 'success');
      setOfferModal(null);
      setOfferLetterFile(null);
      loadAll();
    } catch (err: any) {
      onNotify(err.message || 'Failed issuing offer.', 'error');
    }
  };

  const exportHrCsv = () => {
    const rows = [
      ['Employee Code', 'Name', 'Email', 'Role', 'Department', 'Designation', 'Type', 'Status'],
      ...(employeesData.employees || []).map((e: any) => [
        e.employee_code,
        `"${e.full_name}"`,
        e.email,
        `"${e.role_name}"`,
        `"${e.department_name || ''}"`,
        `"${e.designation || ''}"`,
        e.employment_type || 'Full-Time',
        e.employment_status,
      ]),
    ];
    const blob = new Blob([rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `HR_Workforce_Report_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const k = dash?.kpis || {};

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">HR, Recruitment & Workforce Suite</h2>
          <p className="text-sm text-slate-500 mt-1">Manage hospital employees, job vacancies, candidates, interviews, offers, payroll, and HR analytics.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setEditingVac(null);
              setVacForm({
                title: '',
                department_id: String(employeesData.departments?.[0]?.id || ''),
                branch_id: String(employeesData.branches?.[0]?.id || 1),
                location: 'Main Campus',
                employment_type: 'Full-Time',
                positions: '1',
                required_experience: '',
                required_qualifications: '',
                description: '',
                opening_date: new Date().toISOString().slice(0, 10),
                closing_date: '',
                status: 'Published',
              });
              setVacModalOpen(true);
            }}
            className="px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Post Vacancy
          </button>
          <button
            onClick={() => {
              setEditingEmp(null);
              setEmpForm({
                full_name: '',
                email: '',
                phone: '',
                role_id: String(employeesData.staffRoles?.[0]?.id || ''),
                department_id: String(employeesData.departments?.[0]?.id || ''),
                branch_id: String(employeesData.branches?.[0]?.id || 1),
                designation: 'Staff Nurse',
                employment_type: 'Full-Time',
                qualification: '',
                shift: 'Day',
                joining_date: new Date().toISOString().slice(0, 10),
                employee_code: '',
                base_salary: '5000',
                employment_status: 'Active',
                password: '',
              });
              setEmpModalOpen(true);
            }}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Add Employee
          </button>
        </div>
      </div>

      {/* HR Navigation Tabs */}
      <div className="bg-white p-1.5 rounded-2xl border border-slate-200/80 flex items-center gap-1.5 overflow-x-auto">
        {[
          { id: 'overview', label: 'HR Overview', icon: Briefcase },
          { id: 'employees', label: `Employees (${employeesData.employees?.length || 0})`, icon: Users },
          { id: 'vacancies', label: `Vacancies (${vacancies.length})`, icon: FileText },
          { id: 'candidates', label: `Candidates (${applications.length})`, icon: CheckCircle2 },
          { id: 'interviews', label: `Interviews (${interviews.length})`, icon: Calendar },
          { id: 'offers', label: `Offers (${offers.length})`, icon: Award },
          { id: 'reports', label: 'HR Reports', icon: BarChart3 },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id as any)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap inline-flex items-center gap-1.5 ${
                subTab === t.id ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {subTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {[
              { label: 'Total Employees', val: k.totalEmployees ?? 0, cls: 'text-slate-900' },
              { label: 'Active Employees', val: k.activeEmployees ?? 0, cls: 'text-emerald-700' },
              { label: 'Total Vacancies', val: k.totalVacancies ?? 0, cls: 'text-blue-700' },
              { label: 'New Applications', val: k.newApplications ?? 0, cls: 'text-indigo-700' },
              { label: 'Under Review', val: k.underReviewApplications ?? 0, cls: 'text-amber-700' },
              { label: 'Shortlisted', val: k.shortlistedCandidates ?? 0, cls: 'text-blue-700' },
              { label: 'Scheduled Interviews', val: k.scheduledInterviews ?? 0, cls: 'text-purple-700' },
              { label: 'Selected Candidates', val: k.selectedCandidates ?? 0, cls: 'text-emerald-700' },
              { label: 'Rejected Candidates', val: k.rejectedCandidates ?? 0, cls: 'text-rose-700' },
              { label: 'Pending Offers', val: k.pendingOffers ?? 0, cls: 'text-amber-700' },
            ].map((card) => (
              <div key={card.label} className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
                <div className="text-[11px] font-semibold text-slate-500 uppercase">{card.label}</div>
                <div className={`text-2xl font-bold font-mono mt-1.5 ${card.cls}`}>{card.val}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3">
              <h3 className="font-bold text-sm text-slate-900">Recent Recruitment Applications</h3>
              <div className="space-y-2">
                {(dash?.recentApplications || []).map((ra: any) => (
                  <div key={ra.id} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl text-xs">
                    <div>
                      <div className="font-bold text-slate-900">{ra.candidate_name}</div>
                      <div className="text-slate-500">{ra.vacancy_title} · <span className="font-mono">{ra.application_ref}</span></div>
                    </div>
                    <span className="font-bold text-blue-700">{ra.status}</span>
                  </div>
                ))}
                {(dash?.recentApplications || []).length === 0 && <p className="text-xs text-slate-400">No applications yet.</p>}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3">
              <h3 className="font-bold text-sm text-slate-900">Upcoming Scheduled Interviews</h3>
              <div className="space-y-2">
                {(dash?.upcomingInterviews || []).map((iv: any) => (
                  <div key={iv.id} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl text-xs">
                    <div>
                      <div className="font-bold text-slate-900">{iv.candidate_name} — {iv.vacancy_title}</div>
                      <div className="text-slate-500">{iv.scheduled_at} · {iv.mode} · Interviewer: {iv.interviewer_name}</div>
                    </div>
                    <span className="font-semibold text-indigo-700">{iv.outcome}</span>
                  </div>
                ))}
                {(dash?.upcomingInterviews || []).length === 0 && <p className="text-xs text-slate-400">No pending interviews.</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {subTab === 'employees' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input value={empQuery} onChange={(e) => setEmpQuery(e.target.value)} placeholder="Search employee name, ID, role, department..." className="w-full pl-9 pr-3 py-2 bg-slate-100 rounded-xl text-xs" />
              </div>
              <button onClick={handleRunPayroll} className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold">
                Run Current Month Payroll
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold uppercase">
                    <th className="p-3">Emp ID</th>
                    <th className="p-3">Employee</th>
                    <th className="p-3">Role / Designation</th>
                    <th className="p-3">Dept / Type</th>
                    <th className="p-3">Joining Date</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagedEmployees.map((emp: any) => (
                    <tr key={emp.id} className="hover:bg-slate-50/70">
                      <td className="p-3 font-mono font-bold text-blue-700">{emp.employee_code}</td>
                      <td className="p-3">
                        <div className="font-bold text-slate-900">{emp.full_name}</div>
                        <div className="text-slate-500">{emp.email}</div>
                      </td>
                      <td className="p-3">
                        <div className="font-semibold text-slate-800">{emp.role_name}</div>
                        <div className="text-slate-500">{emp.designation}</div>
                      </td>
                      <td className="p-3">
                        <div>{emp.department_name || '—'}</div>
                        <div className="text-slate-500">{emp.employment_type || 'Full-Time'}</div>
                      </td>
                      <td className="p-3 font-mono">{emp.joining_date || '—'}</td>
                      <td className="p-3 font-semibold text-emerald-700">{emp.employment_status}</td>
                      <td className="p-3 text-right space-x-1 whitespace-nowrap">
                        <button onClick={() => openEmpProfile(emp.id)} className="px-2.5 py-1 bg-slate-100 hover:bg-blue-50 rounded-lg font-semibold inline-flex items-center gap-1">
                          <Eye className="w-3 h-3" /> Profile / Docs ({emp.document_count || 0})
                        </button>
                        <button
                          onClick={() => {
                            setEditingEmp(emp);
                            setEmpForm({
                              full_name: emp.full_name,
                              email: emp.email,
                              phone: emp.phone || '',
                              role_id: String(emp.role_id || ''),
                              department_id: String(emp.department_id || ''),
                              branch_id: String(emp.branch_id || 1),
                              designation: emp.designation || '',
                              employment_type: emp.employment_type || 'Full-Time',
                              qualification: emp.qualification || '',
                              shift: emp.shift || 'Day',
                              joining_date: emp.joining_date || '',
                              employee_code: emp.employee_code,
                              base_salary: String(emp.base_salary || 5000),
                              employment_status: emp.employment_status || 'Active',
                              password: '',
                            });
                            setEmpModalOpen(true);
                          }}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-indigo-50 rounded-lg font-semibold inline-flex items-center gap-1"
                        >
                          <Edit3 className="w-3 h-3" /> Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                  {pagedEmployees.length === 0 && (
                    <tr><td colSpan={7} className="p-6 text-center text-slate-400">No matching employees found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {filteredEmployees.length > HR_PAGE_SIZE && (
              <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-600">
                <span>Showing {(empPage - 1) * HR_PAGE_SIZE + 1}–{Math.min(empPage * HR_PAGE_SIZE, filteredEmployees.length)} of {filteredEmployees.length} employees</span>
                <div className="flex items-center gap-1.5">
                  <button disabled={empPage <= 1} onClick={() => setEmpPage((p) => Math.max(1, p - 1))} className="px-3 py-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded-lg font-semibold">Previous</button>
                  <span className="font-mono px-2">Page {empPage} / {empTotalPages}</span>
                  <button disabled={empPage >= empTotalPages} onClick={() => setEmpPage((p) => Math.min(empTotalPages, p + 1))} className="px-3 py-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded-lg font-semibold">Next</button>
                </div>
              </div>
            )}
          </div>

          {(employeesData.leaves || []).length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3">
              <h3 className="font-bold text-sm text-slate-900">Leave Requests</h3>
              <div className="space-y-2">
                {employeesData.leaves.map((lv: any) => (
                  <div key={lv.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl text-xs">
                    <div>
                      <div className="font-bold text-slate-900">{lv.employee_name} ({lv.employee_code}) — {lv.leave_type}</div>
                      <div className="text-slate-500">{lv.start_date} to {lv.end_date} · {lv.reason}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-blue-700">{lv.status}</span>
                      {lv.status === 'Pending' && (
                        <>
                          <button onClick={() => handleLeaveAction(lv.id, 'Approved')} className="px-2.5 py-1 bg-emerald-600 text-white rounded-lg font-semibold">Approve</button>
                          <button onClick={() => handleLeaveAction(lv.id, 'Rejected')} className="px-2.5 py-1 bg-rose-50 text-rose-700 rounded-lg font-semibold">Reject</button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {subTab === 'vacancies' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold uppercase">
                  <th className="p-4">Code & Title</th>
                  <th className="p-4">Dept / Type</th>
                  <th className="p-4">Dates</th>
                  <th className="p-4">Applicants</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {vacancies.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50/70">
                    <td className="p-4">
                      <div className="font-mono font-bold text-blue-700">{v.vacancy_code}</div>
                      <div className="font-bold text-slate-900 text-sm">{v.title}</div>
                      <div className="text-slate-500">{v.positions} position(s) · {v.location || 'Main Campus'}</div>
                    </td>
                    <td className="p-4">
                      <div className="font-semibold">{v.department_name || 'Hospital'}</div>
                      <div className="text-slate-500">{v.employment_type}</div>
                    </td>
                    <td className="p-4 font-mono text-[11px]">
                      <div>Open: {v.opening_date || 'Immediate'}</div>
                      <div className={v.is_expired ? 'text-rose-700 font-bold' : ''}>Close: {v.closing_date || 'Open-ended'}</div>
                    </td>
                    <td className="p-4">
                      <button onClick={() => openVacancyApplicants(v)} className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg font-bold">
                        {v.applicant_count || 0} Applicants
                      </button>
                    </td>
                    <td className="p-4">
                      <span className={`font-bold ${v.status === 'Published' ? 'text-emerald-700' : v.status === 'Closed' ? 'text-slate-500' : 'text-amber-700'}`}>
                        {v.status}
                      </span>
                    </td>
                    <td className="p-4 text-right space-x-1 whitespace-nowrap">
                      <button
                        onClick={() => {
                          setEditingVac(v);
                          setVacForm({
                            title: v.title,
                            department_id: String(v.department_id || ''),
                            branch_id: String(v.branch_id || 1),
                            location: v.location || 'Main Campus',
                            employment_type: v.employment_type || 'Full-Time',
                            positions: String(v.positions || 1),
                            required_experience: v.required_experience || '',
                            required_qualifications: v.required_qualifications || '',
                            description: v.description || '',
                            opening_date: v.opening_date || '',
                            closing_date: v.closing_date || '',
                            status: v.status,
                          });
                          setVacModalOpen(true);
                        }}
                        className="px-2.5 py-1 bg-slate-100 rounded-lg font-semibold"
                      >
                        Edit
                      </button>
                      {v.status === 'Draft' && (
                        <>
                          <button onClick={() => handleVacancyStatus(v.id, 'Pending Approval')} className="px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg font-semibold">
                            Submit
                          </button>
                          <button onClick={() => handleVacancyStatus(v.id, 'Published')} className="px-2.5 py-1 bg-emerald-600 text-white rounded-lg font-semibold">
                            Publish
                          </button>
                        </>
                      )}
                      {v.status === 'Approved' && (
                        <button onClick={() => handleVacancyStatus(v.id, 'Published')} className="px-2.5 py-1 bg-emerald-600 text-white rounded-lg font-semibold">
                          Publish
                        </button>
                      )}
                      {v.status === 'Published' && (
                        <button onClick={() => setConfirmCloseVac(v)} className="px-2.5 py-1 bg-rose-50 text-rose-700 rounded-lg font-semibold">
                          Close
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'candidates' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {['all', 'Submitted', 'Under Review', 'Shortlisted', 'Interview Scheduled', 'Selected', 'Offer Issued', 'Joined', 'Not Selected'].map((st) => (
              <button
                key={st}
                onClick={() => setAppStatusFilter(st)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${appStatusFilter === st ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}
              >
                {st === 'all' ? 'All Candidates' : st}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold uppercase">
                  <th className="p-3">Ref & Candidate</th>
                  <th className="p-3">Vacancy</th>
                  <th className="p-3">Documents</th>
                  <th className="p-3">Stage</th>
                  <th className="p-3 text-right">Workflow Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedApplications.map((app) => (
                  <tr key={app.id} className="hover:bg-slate-50/70">
                    <td className="p-3">
                      <div className="font-mono font-bold text-blue-700">{app.application_ref}</div>
                      <div className="font-bold text-slate-900">{app.candidate_name}</div>
                      <div className="text-slate-500">{app.candidate_email}</div>
                    </td>
                    <td className="p-3">
                      <div className="font-semibold text-slate-800">{app.vacancy_title}</div>
                      {app.interview_summary && <div className="text-indigo-700 text-[11px]">{app.interview_summary}</div>}
                    </td>
                    <td className="p-3 space-x-1">
                      {app.resume_attachment_id && (
                        <button onClick={() => openAttachment(app.resume_attachment_id, `Resume-${app.application_ref}.pdf`, true)} className="px-2 py-1 bg-slate-100 hover:bg-blue-50 rounded-lg font-semibold inline-flex items-center gap-1">
                          <Download className="w-3 h-3" /> CV
                        </button>
                      )}
                      {app.cert_attachment_id && (
                        <button onClick={() => openAttachment(app.cert_attachment_id, `Certificate-${app.application_ref}.pdf`, false)} className="px-2 py-1 bg-slate-100 hover:bg-blue-50 rounded-lg font-semibold inline-flex items-center gap-1">
                          <Eye className="w-3 h-3" /> Cert
                        </button>
                      )}
                      <button
                        onClick={async () => {
                          const d = await apiRequest(`/api/hr/applications/${app.id}`);
                          setAppDetailModal(d);
                        }}
                        className="px-2 py-1 bg-slate-100 rounded-lg font-semibold"
                      >
                        Details
                      </button>
                    </td>
                    <td className="p-3 font-bold text-blue-700">
                      {app.status}
                      {app.rejection_reason && <div className="text-[11px] text-rose-600 font-normal">{app.rejection_reason}</div>}
                    </td>
                    <td className="p-3 text-right space-x-1 whitespace-nowrap">
                      {app.status === 'Submitted' && (
                        <button onClick={() => handleAppStatusUpdate(app.id, 'Under Review')} className="px-2.5 py-1 bg-amber-100 text-amber-800 rounded-lg font-semibold">
                          Review
                        </button>
                      )}
                      {['Submitted', 'Under Review'].includes(app.status) && (
                        <button onClick={() => handleAppStatusUpdate(app.id, 'Shortlisted')} className="px-2.5 py-1 bg-blue-600 text-white rounded-lg font-semibold">
                          Shortlist
                        </button>
                      )}
                      {['Under Review', 'Shortlisted', 'Interview Scheduled'].includes(app.status) && (
                        <button
                          onClick={() => {
                            setSchedModal(app);
                            setSchedForm({
                              scheduled_at: `${new Date(Date.now() + 86400000).toISOString().slice(0, 10)} 11:00`,
                              interviewer_name: '',
                              interviewer_user_id: '',
                              mode: 'In-Person',
                              notes: '',
                            });
                          }}
                          className="px-2.5 py-1 bg-indigo-600 text-white rounded-lg font-semibold"
                        >
                          Schedule Interview
                        </button>
                      )}
                      {['Shortlisted', 'Interview Scheduled'].includes(app.status) && (
                        <button onClick={() => handleAppStatusUpdate(app.id, 'Selected')} className="px-2.5 py-1 bg-emerald-600 text-white rounded-lg font-semibold">
                          Select
                        </button>
                      )}
                      {['Shortlisted', 'Interview Scheduled', 'Selected'].includes(app.status) && !app.offer_id && (
                        <button
                          onClick={() => {
                            setOfferModal(app);
                            setOfferLetterFile(null);
                          }}
                          className="px-2.5 py-1 bg-emerald-700 text-white rounded-lg font-semibold"
                        >
                          Issue Offer
                        </button>
                      )}
                      {!['Joined', 'Not Selected'].includes(app.status) && (
                        <button onClick={() => setRejectModal(app)} className="px-2.5 py-1 bg-rose-50 text-rose-700 rounded-lg font-semibold">
                          Reject
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {pagedApplications.length === 0 && (
                  <tr><td colSpan={5} className="p-6 text-center text-slate-400">No applications in this stage.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {filteredApplications.length > HR_PAGE_SIZE && (
            <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-600">
              <span>Showing {(appPage - 1) * HR_PAGE_SIZE + 1}–{Math.min(appPage * HR_PAGE_SIZE, filteredApplications.length)} of {filteredApplications.length} applications</span>
              <div className="flex items-center gap-1.5">
                <button disabled={appPage <= 1} onClick={() => setAppPage((p) => Math.max(1, p - 1))} className="px-3 py-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded-lg font-semibold">Previous</button>
                <span className="font-mono px-2">Page {appPage} / {appTotalPages}</span>
                <button disabled={appPage >= appTotalPages} onClick={() => setAppPage((p) => Math.min(appTotalPages, p + 1))} className="px-3 py-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded-lg font-semibold">Next</button>
              </div>
            </div>
          )}
        </div>
      )}

      {subTab === 'interviews' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold uppercase">
                  <th className="p-4">Candidate & Role</th>
                  <th className="p-4">Scheduled At & Mode</th>
                  <th className="p-4">Interviewer</th>
                  <th className="p-4">Rating & Feedback</th>
                  <th className="p-4">Outcome</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {interviews.map((iv) => (
                  <tr key={iv.id}>
                    <td className="p-4">
                      <div className="font-bold text-slate-900">{iv.candidate_name}</div>
                      <div className="text-slate-500">{iv.vacancy_title} · {iv.application_ref}</div>
                    </td>
                    <td className="p-4 font-mono">
                      <div>{iv.scheduled_at}</div>
                      <div className="text-slate-500">{iv.mode}</div>
                    </td>
                    <td className="p-4">{iv.assigned_interviewer_name || iv.interviewer_name}</td>
                    <td className="p-4">
                      {iv.rating ? <span className="font-bold text-amber-600">{iv.rating}/5 · </span> : null}
                      <span>{iv.feedback || iv.notes || 'Pending feedback'}</span>
                    </td>
                    <td className="p-4 font-bold text-indigo-700">{iv.outcome}</td>
                    <td className="p-4 text-right">
                      <button
                        onClick={() => {
                          setFeedbackModal(iv);
                          setFeedbackForm({
                            feedback: iv.feedback || '',
                            rating: String(iv.rating || 5),
                            outcome: iv.outcome === 'Pending' ? 'Passed' : iv.outcome,
                          });
                        }}
                        className="px-3 py-1 bg-indigo-600 text-white rounded-lg font-semibold"
                      >
                        Record Feedback
                      </button>
                    </td>
                  </tr>
                ))}
                {interviews.length === 0 && (
                  <tr><td colSpan={6} className="p-8 text-center text-slate-400">No interviews scheduled yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'offers' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold uppercase">
                  <th className="p-4">Offer Ref</th>
                  <th className="p-4">Candidate & Vacancy</th>
                  <th className="p-4">Compensation & Joining</th>
                  <th className="p-4">Letter</th>
                  <th className="p-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {offers.map((o) => (
                  <tr key={o.id}>
                    <td className="p-4 font-mono font-bold text-blue-700">{o.offer_ref}</td>
                    <td className="p-4">
                      <div className="font-bold text-slate-900">{o.candidate_name}</div>
                      <div className="text-slate-500">{o.vacancy_title}</div>
                    </td>
                    <td className="p-4 font-mono">
                      <div>${Number(o.offered_salary).toLocaleString()} / mo ({o.employment_type})</div>
                      <div className="text-slate-500">Joining: {o.joining_date}</div>
                    </td>
                    <td className="p-4">
                      {o.letter_attachment_id ? (
                        <button onClick={() => openAttachment(o.letter_attachment_id, o.letter_name || `${o.offer_ref}.pdf`, true)} className="px-2.5 py-1 bg-slate-100 rounded-lg font-semibold inline-flex items-center gap-1">
                          <Download className="w-3 h-3" /> {o.letter_name || 'Download'}
                        </button>
                      ) : (
                        <span className="text-slate-400">No attachment</span>
                      )}
                    </td>
                    <td className="p-4 font-bold text-emerald-700">{o.status}</td>
                  </tr>
                ))}
                {offers.length === 0 && (
                  <tr><td colSpan={5} className="p-8 text-center text-slate-400">No job offers issued yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'reports' && reportsData && (
        <div className="space-y-6">
          <div className="flex justify-end">
            <button onClick={exportHrCsv} className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5">
              <Download className="w-3.5 h-3.5" /> Export Workforce CSV
            </button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3">
              <h3 className="font-bold text-sm text-slate-900">Department Workforce Distribution</h3>
              <div className="space-y-2">
                {(reportsData.departmentDistribution || []).map((d: any) => (
                  <div key={d.label} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl text-xs">
                    <span className="font-semibold text-slate-800">{d.label}</span>
                    <span className="font-mono font-bold text-blue-700">{d.value} total ({d.active_count} active)</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3">
              <h3 className="font-bold text-sm text-slate-900">Recruitment Funnel & Offer Metrics</h3>
              <div className="space-y-2">
                {(reportsData.recruitmentFunnel || []).map((rf: any) => (
                  <div key={rf.status} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl text-xs">
                    <span className="font-semibold text-slate-800">{rf.status}</span>
                    <span className="font-mono font-bold text-indigo-700">{rf.count}</span>
                  </div>
                ))}
                {(reportsData.offerSummary || []).map((os: any) => (
                  <div key={os.status} className="flex items-center justify-between p-2.5 bg-emerald-50 rounded-xl text-xs">
                    <span className="font-semibold text-emerald-900">Offers {os.status}</span>
                    <span className="font-mono font-bold text-emerald-700">{os.count} (Avg ${Math.round(os.avg_salary || 0)})</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Employee Add / Edit Modal */}
      {empModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleSaveEmployee} className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-3 max-h-[90vh] overflow-y-auto text-xs">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base">{editingEmp ? `Edit Employee — ${editingEmp.employee_code}` : 'Add Hospital Employee'}</h3>
              <button type="button" onClick={() => setEmpModalOpen(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input required placeholder="Full Name" value={empForm.full_name} onChange={(e) => setEmpForm({ ...empForm, full_name: e.target.value })} className="col-span-2 px-3 py-2 bg-slate-100 rounded-xl" />
              <input required disabled={Boolean(editingEmp)} type="email" placeholder="Work Email" value={empForm.email} onChange={(e) => setEmpForm({ ...empForm, email: e.target.value })} className="px-3 py-2 bg-slate-100 rounded-xl" />
              <input placeholder="Phone" value={empForm.phone} onChange={(e) => setEmpForm({ ...empForm, phone: e.target.value })} className="px-3 py-2 bg-slate-100 rounded-xl" />
              {!editingEmp && (
                <select value={empForm.role_id} onChange={(e) => setEmpForm({ ...empForm, role_id: e.target.value })} className="px-3 py-2 bg-slate-100 rounded-xl">
                  {(employeesData.staffRoles || []).map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              )}
              <select value={empForm.department_id} onChange={(e) => setEmpForm({ ...empForm, department_id: e.target.value })} className="px-3 py-2 bg-slate-100 rounded-xl">
                {(employeesData.departments || []).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <select value={empForm.branch_id} onChange={(e) => setEmpForm({ ...empForm, branch_id: e.target.value })} className="px-3 py-2 bg-slate-100 rounded-xl">
                {(employeesData.branches || []).map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <input placeholder="Designation" value={empForm.designation} onChange={(e) => setEmpForm({ ...empForm, designation: e.target.value })} className="px-3 py-2 bg-slate-100 rounded-xl" />
              <select value={empForm.employment_type} onChange={(e) => setEmpForm({ ...empForm, employment_type: e.target.value })} className="px-3 py-2 bg-slate-100 rounded-xl">
                <option value="Full-Time">Full-Time</option>
                <option value="Part-Time">Part-Time</option>
                <option value="Contract">Contract</option>
                <option value="Visiting">Visiting Consultant</option>
              </select>
              <input type="date" value={empForm.joining_date} onChange={(e) => setEmpForm({ ...empForm, joining_date: e.target.value })} className="px-3 py-2 bg-slate-100 rounded-xl" />
              <input type="number" placeholder="Base Salary ($)" value={empForm.base_salary} onChange={(e) => setEmpForm({ ...empForm, base_salary: e.target.value })} className="px-3 py-2 bg-slate-100 rounded-xl" />
              {editingEmp && (
                <select value={empForm.employment_status} onChange={(e) => setEmpForm({ ...empForm, employment_status: e.target.value })} className="px-3 py-2 bg-slate-100 rounded-xl">
                  <option value="Active">Active</option>
                  <option value="On Leave">On Leave</option>
                  <option value="Suspended">Suspended</option>
                </select>
              )}
              {!editingEmp && (
                <>
                  <input placeholder="Employee Code (auto if blank)" value={empForm.employee_code} onChange={(e) => setEmpForm({ ...empForm, employee_code: e.target.value })} className="px-3 py-2 bg-slate-100 rounded-xl" />
                  <input required type="password" minLength={8} placeholder="Password (8+ chars, 1 number)" value={empForm.password} onChange={(e) => setEmpForm({ ...empForm, password: e.target.value })} className="col-span-2 px-3 py-2 bg-slate-100 rounded-xl" />
                </>
              )}
            </div>
            <button type="submit" className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-semibold">Save Employee</button>
          </form>
        </div>
      )}

      {/* Employee Profile & Documents Modal */}
      {empProfileModal && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-base text-slate-900">{empProfileModal.employee.full_name}</h3>
                <p className="font-mono text-slate-500">{empProfileModal.employee.employee_code} · {empProfileModal.employee.designation} · {empProfileModal.employee.employment_type}</p>
              </div>
              <button onClick={() => setEmpProfileModal(null)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <form onSubmit={handleUploadEmpDoc} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="font-bold text-slate-700 flex items-center gap-1.5"><Upload className="w-3.5 h-3.5 text-blue-600" /> Upload Employee Document</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input placeholder="Document Title" value={empDocTitle} onChange={(e) => setEmpDocTitle(e.target.value)} className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg" />
                <select value={empDocType} onChange={(e) => setEmpDocType(e.target.value)} className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg">
                  <option value="Contract">Employment Contract</option>
                  <option value="ID Proof">ID / Passport</option>
                  <option value="Licence">Medical / Professional Licence</option>
                  <option value="Appointment Letter">Appointment Letter</option>
                </select>
                <input required type="file" onChange={(e) => setEmpDocFile(e.target.files?.[0] || null)} className="text-[11px]" />
              </div>
              <button type="submit" className="px-3.5 py-1.5 bg-blue-600 text-white rounded-lg font-semibold">Upload Document</button>
            </form>
            <div>
              <h4 className="font-bold text-slate-700 mb-2">Employee Documents ({empProfileModal.documents?.length || 0})</h4>
              <div className="space-y-1.5">
                {(empProfileModal.documents || []).map((doc: any) => (
                  <div key={doc.id} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg">
                    <div>
                      <span className="font-semibold text-slate-900">{doc.title}</span> <span className="text-slate-500">({doc.doc_type})</span>
                    </div>
                    {doc.attachment_id && (
                      <button onClick={() => openAttachment(doc.attachment_id, doc.original_name || doc.title)} className="px-2 py-1 bg-white border rounded font-semibold">
                        View
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Vacancy Modal */}
      {vacModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleSaveVacancy} className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-3 max-h-[90vh] overflow-y-auto text-xs">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base">{editingVac ? `Edit Vacancy — ${editingVac.vacancy_code}` : 'Create Job Vacancy'}</h3>
              <button type="button" onClick={() => setVacModalOpen(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input required placeholder="Job Title" value={vacForm.title} onChange={(e) => setVacForm({ ...vacForm, title: e.target.value })} className="col-span-2 px-3 py-2 bg-slate-100 rounded-xl" />
              <select value={vacForm.department_id} onChange={(e) => setVacForm({ ...vacForm, department_id: e.target.value })} className="px-3 py-2 bg-slate-100 rounded-xl">
                {(employeesData.departments || []).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <select value={vacForm.employment_type} onChange={(e) => setVacForm({ ...vacForm, employment_type: e.target.value })} className="px-3 py-2 bg-slate-100 rounded-xl">
                <option value="Full-Time">Full-Time</option>
                <option value="Part-Time">Part-Time</option>
                <option value="Contract">Contract</option>
              </select>
              <input placeholder="Location" value={vacForm.location} onChange={(e) => setVacForm({ ...vacForm, location: e.target.value })} className="px-3 py-2 bg-slate-100 rounded-xl" />
              <input type="number" min={1} placeholder="Positions" value={vacForm.positions} onChange={(e) => setVacForm({ ...vacForm, positions: e.target.value })} className="px-3 py-2 bg-slate-100 rounded-xl" />
              <input placeholder="Required Experience" value={vacForm.required_experience} onChange={(e) => setVacForm({ ...vacForm, required_experience: e.target.value })} className="px-3 py-2 bg-slate-100 rounded-xl" />
              <input placeholder="Required Qualifications" value={vacForm.required_qualifications} onChange={(e) => setVacForm({ ...vacForm, required_qualifications: e.target.value })} className="px-3 py-2 bg-slate-100 rounded-xl" />
              <div>
                <label className="block text-slate-500 mb-1">Opening Date</label>
                <input type="date" value={vacForm.opening_date} onChange={(e) => setVacForm({ ...vacForm, opening_date: e.target.value })} className="w-full px-3 py-2 bg-slate-100 rounded-xl" />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">Closing Date</label>
                <input type="date" value={vacForm.closing_date} onChange={(e) => setVacForm({ ...vacForm, closing_date: e.target.value })} className="w-full px-3 py-2 bg-slate-100 rounded-xl" />
              </div>
              {!editingVac && (
                <select value={vacForm.status} onChange={(e) => setVacForm({ ...vacForm, status: e.target.value })} className="col-span-2 px-3 py-2 bg-slate-100 rounded-xl font-semibold">
                  <option value="Published">Publish Immediately</option>
                  <option value="Draft">Save as Draft</option>
                  <option value="Pending Approval">Submit for Approver Review</option>
                </select>
              )}
              <textarea required rows={3} placeholder="Role responsibilities & requirements..." value={vacForm.description} onChange={(e) => setVacForm({ ...vacForm, description: e.target.value })} className="col-span-2 px-3 py-2 bg-slate-100 rounded-xl" />
            </div>
            <button type="submit" className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-semibold">Save Vacancy</button>
          </form>
        </div>
      )}

      {/* Reject Candidate Modal */}
      {rejectModal && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleConfirmRejectApp} className="bg-white rounded-2xl max-w-md w-full p-6 space-y-3 text-xs">
            <h3 className="font-bold text-base">Reject Candidate — {rejectModal.candidate_name}</h3>
            <textarea required rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Provide clear rejection reason..." className="w-full px-3 py-2 bg-slate-100 rounded-xl" />
            <div className="flex gap-2">
              <button type="button" onClick={() => setRejectModal(null)} className="flex-1 py-2 bg-slate-100 rounded-xl font-semibold">Cancel</button>
              <button type="submit" className="flex-1 py-2 bg-rose-600 text-white rounded-xl font-semibold">Confirm Rejection</button>
            </div>
          </form>
        </div>
      )}

      {/* Schedule Interview Modal */}
      {schedModal && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleScheduleInterview} className="bg-white rounded-2xl max-w-md w-full p-6 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base">Schedule Interview — {schedModal.candidate_name}</h3>
              <button type="button" onClick={() => setSchedModal(null)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <input required value={schedForm.scheduled_at} onChange={(e) => setSchedForm({ ...schedForm, scheduled_at: e.target.value })} placeholder="YYYY-MM-DD HH:MM" className="w-full px-3 py-2 bg-slate-100 rounded-xl" />
            <select value={schedForm.interviewer_user_id} onChange={(e) => setSchedForm({ ...schedForm, interviewer_user_id: e.target.value })} className="w-full px-3 py-2 bg-slate-100 rounded-xl">
              <option value="">— Assign Staff Interviewer (Optional) —</option>
              {(employeesData.employees || []).map((emp: any) => (
                <option key={emp.user_id} value={emp.user_id}>{emp.full_name} ({emp.role_name})</option>
              ))}
            </select>
            <input placeholder="Or Interviewer Panel Name" value={schedForm.interviewer_name} onChange={(e) => setSchedForm({ ...schedForm, interviewer_name: e.target.value })} className="w-full px-3 py-2 bg-slate-100 rounded-xl" />
            <select value={schedForm.mode} onChange={(e) => setSchedForm({ ...schedForm, mode: e.target.value })} className="w-full px-3 py-2 bg-slate-100 rounded-xl">
              <option value="In-Person">In-Person</option>
              <option value="Video Call">Video Call</option>
              <option value="Panel">Clinical Panel</option>
            </select>
            <textarea rows={2} placeholder="Interview instructions / notes..." value={schedForm.notes} onChange={(e) => setSchedForm({ ...schedForm, notes: e.target.value })} className="w-full px-3 py-2 bg-slate-100 rounded-xl" />
            <button type="submit" className="w-full py-2.5 bg-indigo-600 text-white rounded-xl font-semibold">Schedule Interview</button>
          </form>
        </div>
      )}

      {/* Interview Feedback Modal */}
      {feedbackModal && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleSaveInterviewFeedback} className="bg-white rounded-2xl max-w-md w-full p-6 space-y-3 text-xs">
            <h3 className="font-bold text-base">Interview Evaluation — {feedbackModal.candidate_name}</h3>
            <div className="grid grid-cols-2 gap-3">
              <select value={feedbackForm.rating} onChange={(e) => setFeedbackForm({ ...feedbackForm, rating: e.target.value })} className="px-3 py-2 bg-slate-100 rounded-xl">
                <option value="5">5 / 5 — Exceptional</option>
                <option value="4">4 / 5 — Strong</option>
                <option value="3">3 / 5 — Satisfactory</option>
                <option value="2">2 / 5 — Below Bar</option>
                <option value="1">1 / 5 — Not Suitable</option>
              </select>
              <select value={feedbackForm.outcome} onChange={(e) => setFeedbackForm({ ...feedbackForm, outcome: e.target.value })} className="px-3 py-2 bg-slate-100 rounded-xl">
                <option value="Passed">Passed</option>
                <option value="Recommended">Recommended</option>
                <option value="On Hold">On Hold</option>
                <option value="Failed">Failed</option>
              </select>
            </div>
            <textarea required rows={3} placeholder="Detailed interview evaluation..." value={feedbackForm.feedback} onChange={(e) => setFeedbackForm({ ...feedbackForm, feedback: e.target.value })} className="w-full px-3 py-2 bg-slate-100 rounded-xl" />
            <div className="flex gap-2">
              <button type="button" onClick={() => setFeedbackModal(null)} className="flex-1 py-2 bg-slate-100 rounded-xl font-semibold">Cancel</button>
              <button type="submit" className="flex-1 py-2 bg-indigo-600 text-white rounded-xl font-semibold">Save Feedback</button>
            </div>
          </form>
        </div>
      )}

      {/* Issue Offer Modal */}
      {offerModal && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleIssueOffer} className="bg-white rounded-2xl max-w-md w-full p-6 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base">Issue Job Offer — {offerModal.candidate_name}</h3>
              <button type="button" onClick={() => setOfferModal(null)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input required type="number" placeholder="Offered Monthly Salary ($)" value={offerForm.offered_salary} onChange={(e) => setOfferForm({ ...offerForm, offered_salary: e.target.value })} className="px-3 py-2 bg-slate-100 rounded-xl" />
              <input required type="date" value={offerForm.joining_date} onChange={(e) => setOfferForm({ ...offerForm, joining_date: e.target.value })} className="px-3 py-2 bg-slate-100 rounded-xl" />
            </div>
            <select value={offerForm.employment_type} onChange={(e) => setOfferForm({ ...offerForm, employment_type: e.target.value })} className="w-full px-3 py-2 bg-slate-100 rounded-xl">
              <option value="Full-Time">Full-Time</option>
              <option value="Part-Time">Part-Time</option>
              <option value="Contract">Contract</option>
            </select>
            <textarea rows={2} placeholder="Offer terms & benefits summary..." value={offerForm.notes} onChange={(e) => setOfferForm({ ...offerForm, notes: e.target.value })} className="w-full px-3 py-2 bg-slate-100 rounded-xl" />
            <label className="block text-slate-600">
              Appointment Letter (PDF/Doc, Optional)
              <input type="file" accept=".pdf,.doc,.docx,image/*" onChange={(e) => setOfferLetterFile(e.target.files?.[0] || null)} className="mt-1 block w-full text-[11px]" />
            </label>
            <button type="submit" className="w-full py-2.5 bg-emerald-600 text-white rounded-xl font-semibold">Generate & Issue Offer</button>
          </form>
        </div>
      )}

      {/* Candidate Detail Modal */}
      {appDetailModal && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-3 text-xs max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="font-bold text-base">{appDetailModal.application.candidate_name} ({appDetailModal.application.application_ref})</h3>
              <button onClick={() => setAppDetailModal(null)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="bg-slate-50 p-3 rounded-xl space-y-1">
              <div><strong>Vacancy:</strong> {appDetailModal.application.vacancy_title}</div>
              <div><strong>Cover Note:</strong> {appDetailModal.application.cover_note || 'None provided'}</div>
              <div><strong>Current Status:</strong> {appDetailModal.application.status}</div>
            </div>
            <div>
              <h4 className="font-bold mb-1">Timeline & History</h4>
              {(appDetailModal.history || []).map((h: any) => (
                <div key={h.id} className="p-2 bg-slate-50 rounded-lg mb-1">
                  <strong>{h.from_status || 'Start'} → {h.to_status}</strong> by {h.actor_name || 'System'} · <span className="font-mono">{String(h.created_at).slice(0, 16)}</span>
                  {h.notes && <div className="text-slate-600">{h.notes}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Vacancy Applicants Modal */}
      {vacApplicantsModal && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 space-y-3 text-xs">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="font-bold text-base">Applicants for {vacApplicantsModal.vacancy.title}</h3>
              <button onClick={() => setVacApplicantsModal(null)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            {vacApplicantsModal.applicants.map((a) => (
              <div key={a.id} className="p-3 bg-slate-50 rounded-xl flex items-center justify-between">
                <div>
                  <div className="font-bold">{a.candidate_name}</div>
                  <div className="text-slate-500">{a.candidate_email} · {a.application_ref}</div>
                </div>
                <span className="font-bold text-blue-700">{a.status}</span>
              </div>
            ))}
            {vacApplicantsModal.applicants.length === 0 && <p className="text-slate-400 text-center py-4">No applications yet.</p>}
          </div>
        </div>
      )}

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
      {confirmCloseVac && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 space-y-4 text-xs">
            <h3 className="font-bold text-base text-slate-900">Close Published Vacancy?</h3>
            <p className="text-slate-600">
              Closing <strong>{confirmCloseVac.title}</strong> ({confirmCloseVac.vacancy_code}) removes it from candidate job listings.
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirmCloseVac(null)} className="flex-1 py-2 bg-slate-100 rounded-xl font-semibold">Cancel</button>
              <button
                type="button"
                onClick={async () => {
                  await handleVacancyStatus(confirmCloseVac.id, 'Closed');
                  setConfirmCloseVac(null);
                }}
                className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-semibold"
              >
                Confirm Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
