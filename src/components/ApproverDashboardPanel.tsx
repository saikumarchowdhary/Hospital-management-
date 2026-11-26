import React, { useEffect, useState } from 'react';
import {
  ClipboardCheck,
  AlertTriangle,
  Check,
  X,
  MessageSquare,
  Eye,
  Clock,
  ShieldAlert,
} from 'lucide-react';
import { apiRequest, getAccessToken } from '../lib/api';

interface Props {
  currentUserId: number;
  onNotify: (msg: string, tone?: 'success' | 'error') => void;
  refreshSignal: number;
  initialSubTab?: 'pending_notices' | 'urgent' | 'pending_campaigns' | 'history';
}

export const ApproverDashboardPanel: React.FC<Props> = ({ currentUserId, onNotify, refreshSignal, initialSubTab = 'pending_notices' }) => {
  const [subTab, setSubTab] = useState<'pending_notices' | 'urgent' | 'pending_campaigns' | 'history'>(initialSubTab);
  const [dash, setDash] = useState<any>(null);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [noticeApprovals, setNoticeApprovals] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [campaignApprovals, setCampaignApprovals] = useState<any[]>([]);

  const [reviewModal, setReviewModal] = useState<{
    kind: 'notice' | 'campaign';
    item: any;
    decision: 'Approved' | 'Rejected' | 'Changes Requested';
  } | null>(null);
  const [reviewComments, setReviewComments] = useState('');
  const [autoPublish, setAutoPublish] = useState(true);
  const [previewDoc, setPreviewDoc] = useState<{ title: string; url: string; mime: string } | null>(null);

  const loadAll = async () => {
    try {
      const [dRes, pRes, cRes] = await Promise.all([
        apiRequest('/api/publisher/dashboard'),
        apiRequest('/api/publisher'),
        apiRequest('/api/campaigns'),
      ]);
      setDash(dRes);
      setAnnouncements(pRes.announcements || []);
      setNoticeApprovals(pRes.approvals || []);
      setCampaigns(cRes.campaigns || []);
      setCampaignApprovals(cRes.approvals || []);
    } catch (err: any) {
      onNotify(err.message || 'Unable to load approver queue.', 'error');
    }
  };

  useEffect(() => {
    setSubTab(initialSubTab);
  }, [initialSubTab]);

  useEffect(() => {
    loadAll();
  }, [refreshSignal]);

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

  const handleMarkUnderReview = async (kind: 'notice' | 'campaign', id: number) => {
    try {
      const endpoint = kind === 'notice' ? `/api/publisher/${id}/review` : `/api/campaigns/${id}/review`;
      await apiRequest(endpoint, { method: 'POST', body: { decision: 'Under Review' } });
      onNotify('Marked as Under Review.', 'success');
      loadAll();
    } catch (err: any) {
      onNotify(err.message || 'Could not update review status.', 'error');
    }
  };

  const handleSubmitDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewModal) return;
    try {
      const endpoint =
        reviewModal.kind === 'notice'
          ? `/api/publisher/${reviewModal.item.id}/review`
          : `/api/campaigns/${reviewModal.item.id}/review`;
      await apiRequest(endpoint, {
        method: 'POST',
        body: {
          decision: reviewModal.decision,
          comments: reviewComments.trim(),
          auto_publish: autoPublish,
        },
      });
      onNotify(`Decision "${reviewModal.decision}" recorded.`, 'success');
      setReviewModal(null);
      setReviewComments('');
      loadAll();
    } catch (err: any) {
      onNotify(err.message || 'Review decision failed.', 'error');
    }
  };

  const pendingNotices = announcements.filter((a) => ['Pending Approval', 'Under Review'].includes(a.status));
  const urgentNotices = pendingNotices.filter((a) => ['High', 'Urgent', 'Emergency', 'Restricted'].includes(a.priority));
  const pendingCampaigns = campaigns.filter((c) => ['Pending Approval', 'Under Review'].includes(c.status));
  const k = dash?.kpis || {};

  const renderNoticeCard = (a: any) => {
    const isSelfCreated = Number(a.created_by) === Number(currentUserId);
    return (
      <div key={a.id} className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2 text-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-sm text-slate-900">{a.title}</span>
              <span className={`px-2 py-0.5 rounded font-bold ${
                ['Urgent', 'Emergency'].includes(a.priority) ? 'bg-rose-100 text-rose-800' : a.priority === 'High' ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-700'
              }`}>{a.priority}</span>
              <span className="px-2 py-0.5 rounded bg-white border font-semibold">{a.category || 'General'}</span>
            </div>
            <div className="text-slate-500 mt-0.5">
              Submitted by <strong>{a.author_name}</strong> · Audience: {a.audience || 'all'} · {a.start_date} to {a.expiry_date}
            </div>
          </div>
          <span className="font-bold text-amber-700">{a.status}</span>
        </div>
        <p className="text-slate-700 bg-white p-3 rounded-lg border border-slate-200/70">{a.body}</p>
        {isSelfCreated && (
          <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
            <span>Separation-of-duties policy prevents approving your own submission.</span>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {a.attachment_id && (
            <button onClick={() => openAttachmentPreview(a.attachment_id, a.attachment_name || a.title)} className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-semibold inline-flex items-center gap-1">
              <Eye className="w-3.5 h-3.5" /> Inspect Attachment
            </button>
          )}
          {a.status === 'Pending Approval' && (
            <button disabled={isSelfCreated} onClick={() => handleMarkUnderReview('notice', a.id)} className="px-2.5 py-1.5 bg-slate-200 text-slate-800 rounded-lg font-semibold disabled:opacity-50 inline-flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" /> Mark Under Review
            </button>
          )}
          <button
            disabled={isSelfCreated}
            onClick={() => {
              setAutoPublish(true);
              setReviewComments('');
              setReviewModal({ kind: 'notice', item: a, decision: 'Approved' });
            }}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold disabled:opacity-50 inline-flex items-center gap-1"
          >
            <Check className="w-3.5 h-3.5" /> Approve
          </button>
          <button
            disabled={isSelfCreated}
            onClick={() => {
              setReviewComments('');
              setReviewModal({ kind: 'notice', item: a, decision: 'Changes Requested' });
            }}
            className="px-3 py-1.5 bg-amber-100 text-amber-900 rounded-lg font-semibold disabled:opacity-50 inline-flex items-center gap-1"
          >
            <MessageSquare className="w-3.5 h-3.5" /> Request Changes
          </button>
          <button
            disabled={isSelfCreated}
            onClick={() => {
              setReviewComments('');
              setReviewModal({ kind: 'notice', item: a, decision: 'Rejected' });
            }}
            className="px-3 py-1.5 bg-rose-50 text-rose-700 rounded-lg font-semibold disabled:opacity-50 inline-flex items-center gap-1"
          >
            <X className="w-3.5 h-3.5" /> Reject
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Approver Review & Compliance Queue</h2>
        <p className="text-sm text-slate-500 mt-1">Inspect submitted hospital notices, urgent alerts, and promotional campaigns before publication.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase">Pending Notices</div>
          <div className="text-2xl font-bold font-mono text-amber-700 mt-1">{pendingNotices.length}</div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase">Emergency / Urgent</div>
          <div className="text-2xl font-bold font-mono text-rose-700 mt-1">{urgentNotices.length}</div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase">Pending Campaigns</div>
          <div className="text-2xl font-bold font-mono text-indigo-700 mt-1">{pendingCampaigns.length}</div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase">Published Active</div>
          <div className="text-2xl font-bold font-mono text-emerald-700 mt-1">{k.publishedNotices ?? 0}</div>
        </div>
      </div>

      <div className="bg-white p-1.5 rounded-2xl border border-slate-200/80 flex items-center gap-1.5 overflow-x-auto">
        {[
          { id: 'pending_notices', label: `Pending Notices (${pendingNotices.length})`, icon: ClipboardCheck },
          { id: 'urgent', label: `Emergency & Urgent (${urgentNotices.length})`, icon: AlertTriangle },
          { id: 'pending_campaigns', label: `Pending Campaigns (${pendingCampaigns.length})`, icon: Eye },
          { id: 'history', label: `Approval History (${noticeApprovals.length + campaignApprovals.length})`, icon: Clock },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id as any)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap inline-flex items-center gap-1.5 ${
                subTab === t.id ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {subTab === 'pending_notices' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3">
          {pendingNotices.map(renderNoticeCard)}
          {pendingNotices.length === 0 && <p className="text-xs text-slate-400 text-center py-8">No notices awaiting approval.</p>}
        </div>
      )}

      {subTab === 'urgent' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3">
          {urgentNotices.map(renderNoticeCard)}
          {urgentNotices.length === 0 && <p className="text-xs text-slate-400 text-center py-8">No urgent or emergency notices awaiting approval.</p>}
        </div>
      )}

      {subTab === 'pending_campaigns' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3">
          {pendingCampaigns.map((c) => {
            const isSelfCreated = Number(c.created_by) === Number(currentUserId);
            return (
              <div key={c.id} className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold text-sm text-slate-900">{c.name}</div>
                    <div className="text-slate-500">By {c.creator_name} · Audience: {c.audience} · {c.start_date} to {c.end_date}</div>
                  </div>
                  <span className="font-bold text-amber-700">{c.status}</span>
                </div>
                <p className="text-slate-700 bg-white p-3 rounded-lg border border-slate-200/70">{c.description}</p>
                <div className="flex flex-wrap items-center gap-2">
                  {c.banner_attachment_id && (
                    <button onClick={() => openAttachmentPreview(c.banner_attachment_id, c.banner_name || c.name)} className="px-2.5 py-1.5 bg-white border rounded-lg font-semibold inline-flex items-center gap-1">
                      <Eye className="w-3.5 h-3.5" /> Inspect Banner
                    </button>
                  )}
                  <button
                    disabled={isSelfCreated}
                    onClick={() => {
                      setAutoPublish(true);
                      setReviewComments('');
                      setReviewModal({ kind: 'campaign', item: c, decision: 'Approved' });
                    }}
                    className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg font-semibold disabled:opacity-50"
                  >
                    Approve Campaign
                  </button>
                  <button
                    disabled={isSelfCreated}
                    onClick={() => {
                      setReviewComments('');
                      setReviewModal({ kind: 'campaign', item: c, decision: 'Changes Requested' });
                    }}
                    className="px-3 py-1.5 bg-amber-100 text-amber-900 rounded-lg font-semibold disabled:opacity-50"
                  >
                    Request Changes
                  </button>
                  <button
                    disabled={isSelfCreated}
                    onClick={() => {
                      setReviewComments('');
                      setReviewModal({ kind: 'campaign', item: c, decision: 'Rejected' });
                    }}
                    className="px-3 py-1.5 bg-rose-50 text-rose-700 rounded-lg font-semibold disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </div>
            );
          })}
          {pendingCampaigns.length === 0 && <p className="text-xs text-slate-400 text-center py-8">No campaigns awaiting approval.</p>}
        </div>
      )}

      {subTab === 'history' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4 text-xs">
          <div>
            <h3 className="font-bold text-sm text-slate-900 mb-2">Notice Approval History</h3>
            <div className="space-y-1.5">
              {noticeApprovals.map((ap) => (
                <div key={ap.id} className="p-2.5 bg-slate-50 rounded-xl flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-900">{ap.announcement_title}</span> · <span>{ap.decision}</span> by {ap.reviewer_name}
                    {ap.comments && <div className="text-slate-500">Remarks: {ap.comments}</div>}
                  </div>
                  <span className="font-mono text-slate-500">{String(ap.created_at).slice(0, 19)}</span>
                </div>
              ))}
            </div>
          </div>
          {campaignApprovals.length > 0 && (
            <div>
              <h3 className="font-bold text-sm text-slate-900 mb-2">Campaign Approval History</h3>
              <div className="space-y-1.5">
                {campaignApprovals.map((ca) => (
                  <div key={ca.id} className="p-2.5 bg-slate-50 rounded-xl flex items-center justify-between">
                    <div>
                      <span className="font-bold text-slate-900">{ca.campaign_name}</span> · <span>{ca.decision}</span> by {ca.reviewer_name}
                      {ca.comments && <div className="text-slate-500">Remarks: {ca.comments}</div>}
                    </div>
                    <span className="font-mono text-slate-500">{String(ca.created_at).slice(0, 19)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {reviewModal && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleSubmitDecision} className="bg-white rounded-2xl max-w-md w-full p-6 space-y-3 text-xs">
            <h3 className="font-bold text-base">
              {reviewModal.decision} — {reviewModal.item.title || reviewModal.item.name}
            </h3>
            {reviewModal.decision === 'Approved' && (
              <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
                <input type="checkbox" checked={autoPublish} onChange={(e) => setAutoPublish(e.target.checked)} />
                <span>Publish immediately upon approval (uncheck to mark Approved for Publisher release)</span>
              </label>
            )}
            <textarea
              required={reviewModal.decision !== 'Approved'}
              rows={3}
              value={reviewComments}
              onChange={(e) => setReviewComments(e.target.value)}
              placeholder={reviewModal.decision === 'Approved' ? 'Approval remarks (optional)...' : 'Mandatory reason / requested modifications...'}
              className="w-full px-3 py-2 bg-slate-100 rounded-xl"
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => setReviewModal(null)} className="flex-1 py-2 bg-slate-100 rounded-xl font-semibold">Cancel</button>
              <button
                type="submit"
                className={`flex-1 py-2 text-white rounded-xl font-semibold ${
                  reviewModal.decision === 'Approved' ? 'bg-emerald-600' : reviewModal.decision === 'Rejected' ? 'bg-rose-600' : 'bg-amber-600'
                }`}
              >
                Confirm {reviewModal.decision}
              </button>
            </div>
          </form>
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
    </div>
  );
};
