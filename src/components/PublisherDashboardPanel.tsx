import React, { useEffect, useState } from 'react';
import {
  Megaphone,
  Plus,
  Send,
  Eye,
  Archive,
  CheckCircle2,
  TrendingUp,
  Users,
  Edit3,
  Download,
  X,
} from 'lucide-react';
import { apiRequest, getAccessToken } from '../lib/api';

interface Props {
  onNotify: (msg: string, tone?: 'success' | 'error') => void;
  refreshSignal: number;
  initialSubTab?: 'overview' | 'notices' | 'campaigns' | 'acknowledgements';
}

export const PublisherDashboardPanel: React.FC<Props> = ({ onNotify, refreshSignal, initialSubTab = 'overview' }) => {
  const [subTab, setSubTab] = useState<'overview' | 'notices' | 'campaigns' | 'acknowledgements'>(initialSubTab);
  const [dash, setDash] = useState<any>(null);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');

  // Notice modal
  const [noticeModalOpen, setNoticeModalOpen] = useState(false);
  const [editingNotice, setEditingNotice] = useState<any>(null);
  const [noticeForm, setNoticeForm] = useState({
    title: '',
    body: '',
    category: 'General',
    priority: 'Normal',
    audience: 'all',
    department_id: '',
    branch_id: '',
    start_date: new Date().toISOString().slice(0, 10),
    expiry_date: '2027-12-31',
    submit_for_approval: 'true',
  });
  const [noticeFile, setNoticeFile] = useState<File | null>(null);
  const [previewNotice, setPreviewNotice] = useState<any>(null);

  // Campaign modal
  const [campModalOpen, setCampModalOpen] = useState(false);
  const [editingCamp, setEditingCamp] = useState<any>(null);
  const [campForm, setCampForm] = useState({
    name: '',
    description: '',
    destination_url: '#patient/doctors',
    offer_terms: '',
    audience: 'Patients',
    branch_id: '1',
    start_date: new Date().toISOString().slice(0, 10),
    end_date: '2027-12-31',
    submit_for_approval: 'true',
  });
  const [campBannerFile, setCampBannerFile] = useState<File | null>(null);

  // Acknowledgements report
  const [selectedAckNoticeId, setSelectedAckNoticeId] = useState<number | null>(null);
  const [ackReport, setAckReport] = useState<any>(null);
  const [previewDoc, setPreviewDoc] = useState<{ title: string; url: string; mime: string } | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<{ kind: 'notice' | 'campaign'; item: any } | null>(null);

  const loadAll = async () => {
    try {
      const [dRes, pRes, cRes] = await Promise.all([
        apiRequest('/api/publisher/dashboard'),
        apiRequest('/api/publisher'),
        apiRequest('/api/campaigns'),
      ]);
      setDash(dRes);
      setAnnouncements(pRes.announcements || []);
      setCampaigns(cRes.campaigns || []);
    } catch (err: any) {
      onNotify(err.message || 'Unable to load publisher workspace.', 'error');
    }
  };

  useEffect(() => {
    setSubTab(initialSubTab);
  }, [initialSubTab]);

  useEffect(() => {
    loadAll();
  }, [refreshSignal]);

  const loadAckReport = async (noticeId: number) => {
    setSelectedAckNoticeId(noticeId);
    try {
      const res = await apiRequest(`/api/publisher/${noticeId}/acknowledgements`);
      setAckReport(res);
    } catch (err: any) {
      onNotify(err.message || 'Failed loading acknowledgements.', 'error');
    }
  };

  const openAttachmentPreview = async (attachmentId: number, title: string) => {
    try {
      const token = getAccessToken();
      const res = await fetch(`/api/admin/attachments/${attachmentId}`, {
        credentials: 'include',
        headers: { 'X-Requested-With': 'MediCore-HMS', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (!res.ok) throw new Error('Unable to load attachment.');
      const mime = res.headers.get('content-type') || '';
      const blob = await res.blob();
      setPreviewDoc({ title, url: URL.createObjectURL(blob), mime });
    } catch (err: any) {
      onNotify(err.message || 'Preview failed.', 'error');
    }
  };

  const handleSaveNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const fd = new FormData();
      Object.entries(noticeForm).forEach(([k, val]) => {
        if (val !== '') fd.append(k, String(val));
      });
      if (noticeFile) fd.append('attachment', noticeFile);

      if (editingNotice) {
        await apiRequest(`/api/publisher/${editingNotice.id}`, { method: 'PATCH', body: fd });
        onNotify(`Notice "${noticeForm.title}" updated.`, 'success');
      } else {
        await apiRequest('/api/publisher', { method: 'POST', body: fd });
        onNotify(noticeForm.submit_for_approval === 'true' ? 'Notice created & submitted for approval.' : 'Notice saved as Draft.', 'success');
      }
      setNoticeModalOpen(false);
      setNoticeFile(null);
      loadAll();
    } catch (err: any) {
      onNotify(err.message || 'Failed saving notice.', 'error');
    }
  };

  const handleNoticeAction = async (id: number, action: 'submit' | 'publish' | 'archive') => {
    try {
      await apiRequest(`/api/publisher/${id}/${action}`, { method: 'POST', body: {} });
      onNotify(`Notice ${action} action completed.`, 'success');
      loadAll();
    } catch (err: any) {
      onNotify(err.message || `Could not ${action} notice.`, 'error');
    }
  };

  const handleSaveCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const fd = new FormData();
      Object.entries(campForm).forEach(([k, val]) => {
        if (val !== '') fd.append(k, String(val));
      });
      if (campBannerFile) fd.append('banner', campBannerFile);

      if (editingCamp) {
        await apiRequest(`/api/campaigns/${editingCamp.id}`, { method: 'PATCH', body: fd });
        onNotify('Campaign updated.', 'success');
      } else {
        await apiRequest('/api/campaigns', { method: 'POST', body: fd });
        onNotify('Campaign created.', 'success');
      }
      setCampModalOpen(false);
      setCampBannerFile(null);
      loadAll();
    } catch (err: any) {
      onNotify(err.message || 'Campaign save failed.', 'error');
    }
  };

  const handleCampaignStatus = async (id: number, status: 'Published' | 'Paused' | 'Archived' | 'submit') => {
    try {
      if (status === 'submit') {
        await apiRequest(`/api/campaigns/${id}/submit`, { method: 'POST', body: {} });
      } else {
        await apiRequest(`/api/campaigns/${id}/status`, { method: 'POST', body: { status } });
      }
      onNotify('Campaign status updated.', 'success');
      loadAll();
    } catch (err: any) {
      onNotify(err.message || 'Campaign update failed.', 'error');
    }
  };

  const exportAckCsv = () => {
    if (!ackReport?.recipients) return;
    const rows = [
      ['User Code', 'Full Name', 'Email', 'Role', 'Status', 'Viewed At', 'Acknowledged At'],
      ...ackReport.recipients.map((r: any) => [
        r.user_code,
        `"${r.full_name}"`,
        r.email,
        `"${r.role_name}"`,
        r.status,
        r.viewed_at || '',
        r.acknowledged_at || '',
      ]),
    ];
    const blob = new Blob([rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Notice_${ackReport.announcement.id}_Acknowledgements.csv`;
    a.click();
  };

  const k = dash?.kpis || {};
  const filteredNotices = announcements.filter((a) => statusFilter === 'all' || a.status === statusFilter);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Publisher Communications & Campaigns</h2>
          <p className="text-sm text-slate-500 mt-1">Draft notices, manage banners & health campaigns, track approvals, and verify audience acknowledgements.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setEditingCamp(null);
              setCampForm({
                name: '',
                description: '',
                destination_url: '#patient/doctors',
                offer_terms: '',
                audience: 'Patients',
                branch_id: String(dash?.branches?.[0]?.id || 1),
                start_date: new Date().toISOString().slice(0, 10),
                end_date: '2027-12-31',
                submit_for_approval: 'true',
              });
              setCampModalOpen(true);
            }}
            className="px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> New Campaign
          </button>
          <button
            onClick={() => {
              setEditingNotice(null);
              setNoticeForm({
                title: '',
                body: '',
                category: 'General',
                priority: 'Normal',
                audience: 'all',
                department_id: '',
                branch_id: '',
                start_date: new Date().toISOString().slice(0, 10),
                expiry_date: '2027-12-31',
                submit_for_approval: 'true',
              });
              setNoticeModalOpen(true);
            }}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Create Notice
          </button>
        </div>
      </div>

      <div className="bg-white p-1.5 rounded-2xl border border-slate-200/80 flex items-center gap-1.5 overflow-x-auto">
        {[
          { id: 'overview', label: 'Publisher Overview', icon: Megaphone },
          { id: 'notices', label: `Notice Management (${announcements.length})`, icon: CheckCircle2 },
          { id: 'campaigns', label: `Ads & Campaigns (${campaigns.length})`, icon: TrendingUp },
          { id: 'acknowledgements', label: 'Acknowledgement Tracking', icon: Users },
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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            { label: 'Draft Notices', val: k.draftNotices ?? 0, cls: 'text-slate-700' },
            { label: 'Pending Approval', val: (k.pendingNotices ?? 0) + (k.underReviewNotices ?? 0), cls: 'text-amber-700' },
            { label: 'Approved Notices', val: k.approvedNotices ?? 0, cls: 'text-indigo-700' },
            { label: 'Published Active', val: k.publishedNotices ?? 0, cls: 'text-emerald-700' },
            { label: 'Expired / Archived', val: (k.expiredNotices ?? 0) + (k.archivedNotices ?? 0), cls: 'text-slate-500' },
            { label: 'Rejected Notices', val: k.rejectedNotices ?? 0, cls: 'text-rose-700' },
            { label: 'Changes Requested', val: k.changesRequestedNotices ?? 0, cls: 'text-amber-700' },
            { label: 'Active Campaigns', val: k.activeCampaigns ?? 0, cls: 'text-blue-700' },
            { label: 'Pending Campaigns', val: k.pendingCampaigns ?? 0, cls: 'text-amber-700' },
            { label: 'Total Acknowledgements', val: k.totalAcknowledgements ?? 0, cls: 'text-emerald-700' },
          ].map((c) => (
            <div key={c.label} className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="text-[11px] font-semibold text-slate-500 uppercase">{c.label}</div>
              <div className={`text-2xl font-bold font-mono mt-1.5 ${c.cls}`}>{c.val}</div>
            </div>
          ))}
        </div>
      )}

      {subTab === 'notices' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {['all', 'Draft', 'Pending Approval', 'Under Review', 'Changes Requested', 'Approved', 'Published', 'Rejected', 'Archived'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 rounded-xl text-xs font-semibold ${statusFilter === st ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}
              >
                {st === 'all' ? 'All Notices' : st}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {filteredNotices.map((a) => (
              <div key={a.id} className="p-4 bg-slate-50 rounded-xl border border-slate-200/70 space-y-2 text-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-slate-900">{a.title}</span>
                      <span className="px-2 py-0.5 rounded bg-white border border-slate-200 font-semibold">{a.category || 'General'}</span>
                      <span className={`px-2 py-0.5 rounded font-bold ${
                        ['Emergency', 'Urgent'].includes(a.priority) ? 'bg-rose-100 text-rose-800' : a.priority === 'High' ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-700'
                      }`}>{a.priority}</span>
                    </div>
                    <div className="text-slate-500 mt-0.5">
                      Audience: <strong>{a.audience || 'all'}</strong> · {a.start_date} to {a.expiry_date} · Views: {a.unique_views_count ?? a.views_count} · Acks: {a.unique_acks_count ?? a.acks_count}
                    </div>
                  </div>
                  <span className={`font-bold px-2.5 py-1 rounded-full self-start ${
                    a.status === 'Published' ? 'bg-emerald-100 text-emerald-800' : a.status === 'Rejected' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                  }`}>{a.status}</span>
                </div>
                <p className="text-slate-700">{a.body}</p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button onClick={() => setPreviewNotice(a)} className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg font-semibold inline-flex items-center gap-1">
                    <Eye className="w-3 h-3" /> Preview
                  </button>
                  {a.attachment_id && (
                    <button onClick={() => openAttachmentPreview(a.attachment_id, a.attachment_name || a.title)} className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg font-semibold">
                      View Attachment
                    </button>
                  )}
                  {['Draft', 'Changes Requested', 'Rejected'].includes(a.status) && (
                    <>
                      <button
                        onClick={() => {
                          setEditingNotice(a);
                          setNoticeForm({
                            title: a.title,
                            body: a.body,
                            category: a.category || 'General',
                            priority: a.priority || 'Normal',
                            audience: a.audience || 'all',
                            department_id: String(a.department_id || ''),
                            branch_id: String(a.branch_id || ''),
                            start_date: a.start_date || '',
                            expiry_date: a.expiry_date || '',
                            submit_for_approval: 'false',
                          });
                          setNoticeModalOpen(true);
                        }}
                        className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg font-semibold inline-flex items-center gap-1"
                      >
                        <Edit3 className="w-3 h-3" /> Edit
                      </button>
                      <button onClick={() => handleNoticeAction(a.id, 'submit')} className="px-2.5 py-1 bg-blue-600 text-white rounded-lg font-semibold inline-flex items-center gap-1">
                        <Send className="w-3 h-3" /> Submit for Approval
                      </button>
                    </>
                  )}
                  {a.status === 'Approved' && (
                    <button onClick={() => handleNoticeAction(a.id, 'publish')} className="px-2.5 py-1 bg-emerald-600 text-white rounded-lg font-semibold">
                      Publish Notice
                    </button>
                  )}
                  {['Published', 'Approved'].includes(a.status) && (
                    <button onClick={() => setConfirmArchive({ kind: 'notice', item: a })} className="px-2.5 py-1 bg-slate-200 text-slate-700 rounded-lg font-semibold inline-flex items-center gap-1">
                      <Archive className="w-3 h-3" /> Archive
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setSubTab('acknowledgements');
                      loadAckReport(a.id);
                    }}
                    className="px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg font-semibold"
                  >
                    Acknowledgement Report
                  </button>
                </div>
              </div>
            ))}
            {filteredNotices.length === 0 && <p className="text-xs text-slate-400 text-center py-6">No notices match this filter.</p>}
          </div>
        </div>
      )}

      {subTab === 'campaigns' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3">
          {campaigns.map((c) => {
            const ctr = c.impressions > 0 ? ((c.clicks / c.impressions) * 100).toFixed(1) : '0.0';
            return (
              <div key={c.id} className="p-4 bg-slate-50 rounded-xl border border-slate-200/70 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold text-sm text-slate-900">{c.name}</div>
                    <div className="text-slate-500">Audience: {c.audience} · {c.start_date} to {c.end_date} · {c.branch_name || 'Main'}</div>
                  </div>
                  <span className={`font-bold px-2.5 py-1 rounded-full ${
                    c.status === 'Published' ? 'bg-emerald-100 text-emerald-800' : c.status === 'Rejected' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                  }`}>{c.status}</span>
                </div>
                <p className="text-slate-700">{c.description}</p>
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="font-mono text-slate-600">
                    Impressions: <strong>{c.impressions}</strong> · Clicks: <strong>{c.clicks}</strong> · CTR: <strong>{ctr}%</strong>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {c.banner_attachment_id && (
                      <button onClick={() => openAttachmentPreview(c.banner_attachment_id, c.banner_name || c.name)} className="px-2.5 py-1 bg-white border rounded-lg font-semibold">
                        Banner
                      </button>
                    )}
                    {['Draft', 'Changes Requested', 'Rejected'].includes(c.status) && (
                      <button onClick={() => handleCampaignStatus(c.id, 'submit')} className="px-2.5 py-1 bg-blue-600 text-white rounded-lg font-semibold">
                        Submit
                      </button>
                    )}
                    {['Approved', 'Paused'].includes(c.status) && (
                      <button onClick={() => handleCampaignStatus(c.id, 'Published')} className="px-2.5 py-1 bg-emerald-600 text-white rounded-lg font-semibold">
                        Publish / Resume
                      </button>
                    )}
                    {c.status === 'Published' && (
                      <button onClick={() => handleCampaignStatus(c.id, 'Paused')} className="px-2.5 py-1 bg-amber-100 text-amber-800 rounded-lg font-semibold">
                        Pause
                      </button>
                    )}
                    {c.status !== 'Archived' && (
                      <button onClick={() => setConfirmArchive({ kind: 'campaign', item: c })} className="px-2.5 py-1 bg-slate-200 text-slate-700 rounded-lg font-semibold">
                        Archive
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {campaigns.length === 0 && <p className="text-xs text-slate-400 text-center py-6">No campaigns created yet.</p>}
        </div>
      )}

      {subTab === 'acknowledgements' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <select
              value={selectedAckNoticeId || ''}
              onChange={(e) => {
                if (e.target.value) loadAckReport(Number(e.target.value));
              }}
              className="px-3.5 py-2 bg-slate-100 rounded-xl text-xs font-semibold min-w-[260px]"
            >
              <option value="">Select a Notice to View Acknowledgement Tracking...</option>
              {announcements.map((a) => (
                <option key={a.id} value={a.id}>{a.title} ({a.status})</option>
              ))}
            </select>
            {ackReport && (
              <button onClick={exportAckCsv} className="px-3.5 py-2 bg-slate-900 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5">
                <Download className="w-3.5 h-3.5" /> Export Ack CSV
              </button>
            )}
          </div>

          {ackReport ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 bg-slate-50 rounded-xl"><div className="text-slate-500">Target Audience</div><div className="text-xl font-bold font-mono">{ackReport.summary.totalRecipients}</div></div>
                <div className="p-3 bg-emerald-50 rounded-xl"><div className="text-emerald-700">Acknowledged</div><div className="text-xl font-bold font-mono text-emerald-700">{ackReport.summary.acknowledgedCount}</div></div>
                <div className="p-3 bg-blue-50 rounded-xl"><div className="text-blue-700">Viewed</div><div className="text-xl font-bold font-mono text-blue-700">{ackReport.summary.viewedCount}</div></div>
                <div className="p-3 bg-amber-50 rounded-xl"><div className="text-amber-700">Unread</div><div className="text-xl font-bold font-mono text-amber-700">{ackReport.summary.unreadCount}</div></div>
              </div>
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 uppercase">
                      <th className="p-3">Recipient</th>
                      <th className="p-3">Role</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Viewed At</th>
                      <th className="p-3">Acknowledged At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(ackReport.recipients || []).map((r: any) => (
                      <tr key={r.user_id}>
                        <td className="p-3 font-semibold">{r.full_name} <span className="font-mono text-slate-400">({r.user_code})</span></td>
                        <td className="p-3">{r.role_name}</td>
                        <td className="p-3">
                          <span className={`font-bold ${r.status === 'Acknowledged' ? 'text-emerald-700' : r.status === 'Viewed' ? 'text-blue-700' : 'text-amber-700'}`}>
                            {r.status}
                          </span>
                        </td>
                        <td className="p-3 font-mono text-slate-500">{r.viewed_at || '—'}</td>
                        <td className="p-3 font-mono text-slate-500">{r.acknowledged_at || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-400 text-center py-6">Select a notice above to inspect recipient read and acknowledgement status.</p>
          )}
        </div>
      )}

      {/* Create/Edit Notice Modal */}
      {noticeModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleSaveNotice} className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-3 max-h-[90vh] overflow-y-auto text-xs">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base">{editingNotice ? 'Edit Notice' : 'Create Hospital Notice'}</h3>
              <button type="button" onClick={() => setNoticeModalOpen(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <input required placeholder="Notice Title" value={noticeForm.title} onChange={(e) => setNoticeForm({ ...noticeForm, title: e.target.value })} className="w-full px-3 py-2 bg-slate-100 rounded-xl" />
            <div className="grid grid-cols-2 gap-3">
              <select value={noticeForm.category} onChange={(e) => setNoticeForm({ ...noticeForm, category: e.target.value })} className="px-3 py-2 bg-slate-100 rounded-xl">
                {['General', 'Urgent', 'Clinical/Safety', 'HR', 'Training', 'Maintenance', 'Events', 'Patient Information'].map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              <select value={noticeForm.priority} onChange={(e) => setNoticeForm({ ...noticeForm, priority: e.target.value })} className="px-3 py-2 bg-slate-100 rounded-xl">
                <option value="Normal">Normal</option>
                <option value="High">High</option>
                <option value="Urgent">Urgent</option>
                <option value="Emergency">Emergency</option>
              </select>
              <select value={noticeForm.audience} onChange={(e) => setNoticeForm({ ...noticeForm, audience: e.target.value })} className="px-3 py-2 bg-slate-100 rounded-xl">
                <option value="all">All Hospital Users</option>
                <option value="staff">All Staff</option>
                <option value="patients">Patients</option>
                <option value="doctors">Doctors</option>
                <option value="nurses">Nurses</option>
              </select>
              <select value={noticeForm.department_id} onChange={(e) => setNoticeForm({ ...noticeForm, department_id: e.target.value })} className="px-3 py-2 bg-slate-100 rounded-xl">
                <option value="">All Departments</option>
                {(dash?.departments || []).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <div>
                <label className="block text-slate-500 mb-1">Start Date</label>
                <input type="date" value={noticeForm.start_date} onChange={(e) => setNoticeForm({ ...noticeForm, start_date: e.target.value })} className="w-full px-3 py-2 bg-slate-100 rounded-xl" />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">Expiry Date</label>
                <input type="date" value={noticeForm.expiry_date} onChange={(e) => setNoticeForm({ ...noticeForm, expiry_date: e.target.value })} className="w-full px-3 py-2 bg-slate-100 rounded-xl" />
              </div>
            </div>
            <textarea required rows={4} placeholder="Notice content..." value={noticeForm.body} onChange={(e) => setNoticeForm({ ...noticeForm, body: e.target.value })} className="w-full px-3 py-2 bg-slate-100 rounded-xl" />
            <label className="block text-slate-600">
              Attachment (PDF/Image, Optional)
              <input type="file" accept=".pdf,image/*" onChange={(e) => setNoticeFile(e.target.files?.[0] || null)} className="mt-1 block w-full text-[11px]" />
            </label>
            {!editingNotice && (
              <select value={noticeForm.submit_for_approval} onChange={(e) => setNoticeForm({ ...noticeForm, submit_for_approval: e.target.value })} className="w-full px-3 py-2 bg-slate-100 rounded-xl font-semibold">
                <option value="true">Submit Immediately for Approver Review</option>
                <option value="false">Save as Draft</option>
              </select>
            )}
            <button type="submit" className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-semibold">Save Notice</button>
          </form>
        </div>
      )}

      {/* Campaign Modal */}
      {campModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleSaveCampaign} className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base">Create Advertisement / Health Campaign</h3>
              <button type="button" onClick={() => setCampModalOpen(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <input required placeholder="Campaign Name" value={campForm.name} onChange={(e) => setCampForm({ ...campForm, name: e.target.value })} className="w-full px-3 py-2 bg-slate-100 rounded-xl" />
            <textarea required rows={3} placeholder="Campaign description..." value={campForm.description} onChange={(e) => setCampForm({ ...campForm, description: e.target.value })} className="w-full px-3 py-2 bg-slate-100 rounded-xl" />
            <div className="grid grid-cols-2 gap-3">
              <input placeholder="Destination URL" value={campForm.destination_url} onChange={(e) => setCampForm({ ...campForm, destination_url: e.target.value })} className="px-3 py-2 bg-slate-100 rounded-xl" />
              <input placeholder="Target Audience" value={campForm.audience} onChange={(e) => setCampForm({ ...campForm, audience: e.target.value })} className="px-3 py-2 bg-slate-100 rounded-xl" />
              <input type="date" value={campForm.start_date} onChange={(e) => setCampForm({ ...campForm, start_date: e.target.value })} className="px-3 py-2 bg-slate-100 rounded-xl" />
              <input type="date" value={campForm.end_date} onChange={(e) => setCampForm({ ...campForm, end_date: e.target.value })} className="px-3 py-2 bg-slate-100 rounded-xl" />
            </div>
            <label className="block text-slate-600">
              Campaign Banner Image (Optional)
              <input type="file" accept="image/*" onChange={(e) => setCampBannerFile(e.target.files?.[0] || null)} className="mt-1 block w-full text-[11px]" />
            </label>
            <select value={campForm.submit_for_approval} onChange={(e) => setCampForm({ ...campForm, submit_for_approval: e.target.value })} className="w-full px-3 py-2 bg-slate-100 rounded-xl font-semibold">
              <option value="true">Submit for Approver Review</option>
              <option value="false">Save as Draft</option>
            </select>
            <button type="submit" className="w-full py-2.5 bg-indigo-600 text-white rounded-xl font-semibold">Create Campaign</button>
          </form>
        </div>
      )}

      {/* Preview Notice Modal */}
      {previewNotice && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-3 text-xs">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="font-bold text-base">Notice Preview — {previewNotice.category}</h3>
              <button onClick={() => setPreviewNotice(null)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="p-4 bg-blue-50/50 border border-blue-200 rounded-xl space-y-2">
              <div className="font-bold text-base text-slate-900">{previewNotice.title}</div>
              <div className="text-slate-500">Priority: {previewNotice.priority} · Valid: {previewNotice.start_date} – {previewNotice.expiry_date}</div>
              <p className="text-slate-800 whitespace-pre-wrap">{previewNotice.body}</p>
            </div>
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
      {confirmArchive && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 space-y-4 text-xs">
            <h3 className="font-bold text-base text-slate-900">
              Archive {confirmArchive.kind === 'notice' ? 'Hospital Notice' : 'Campaign'}?
            </h3>
            <p className="text-slate-600">
              Confirm archiving <strong>{confirmArchive.item.title || confirmArchive.item.name}</strong>. Archived items are hidden from live dashboards.
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirmArchive(null)} className="flex-1 py-2 bg-slate-100 rounded-xl font-semibold">Cancel</button>
              <button
                type="button"
                onClick={async () => {
                  const target = confirmArchive;
                  setConfirmArchive(null);
                  if (target.kind === 'notice') {
                    await handleNoticeAction(target.item.id, 'archive');
                  } else {
                    await handleCampaignStatus(target.item.id, 'Archived');
                  }
                }}
                className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-semibold"
              >
                Confirm Archive
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
