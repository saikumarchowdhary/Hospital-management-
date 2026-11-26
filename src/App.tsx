/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  LayoutDashboard,
  Users,
  UserCheck,
  Calendar as CalendarIcon,
  Pill,
  CreditCard,
  BedDouble,
  BarChart3,
  Settings,
  Menu,
  X,
  Bell,
  Search,
  Plus,
  ShieldAlert,
  ChevronRight,
  ChevronDown,
  LogOut,
  Clock,
  Shield,
  Activity,
  CheckCircle2,
  AlertCircle,
  User,
  Lock,
  Globe,
  Radio,
  TrendingUp,
  SlidersHorizontal,
  PieChart as PieChartIcon,
  Printer,
  Download,
  Code,
  LogIn,
  Briefcase
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid
} from 'recharts';
import { apiRequest, buildWsUrl, setAccessToken } from './lib/api';
import { PatientsPanel } from './components/PatientsPanel';
import { DoctorsAppointmentsPanel } from './components/DoctorsAppointmentsPanel';
import { ClinicalDiagnosticsPanel } from './components/ClinicalDiagnosticsPanel';
import { BillingInsurancePanel } from './components/BillingInsurancePanel';
import { OperationsIntegrationsPanel } from './components/OperationsIntegrationsPanel';
import { AuthModal, LoginPortalType } from './components/AuthModal';
import { AdminSignupsPanel } from './components/AdminSignupsPanel';
import { AdminDashboardPanel } from './components/AdminDashboardPanel';
import { HrDashboardPanel } from './components/HrDashboardPanel';
import { PublisherDashboardPanel } from './components/PublisherDashboardPanel';
import { ApproverDashboardPanel } from './components/ApproverDashboardPanel';
import { DoctorScheduleWizardModal } from './components/DoctorScheduleWizardModal';
import { CandidateCareersPanel } from './components/CandidateCareersPanel';
import { PharmacyInventoryPanel } from './components/PharmacyInventoryPanel';
import { Megaphone, Building2, ClipboardCheck } from 'lucide-react';

interface AuthUser {
  id: number;
  user_code: string;
  email: string;
  full_name: string;
  phone?: string;
  role: string;
  role_name: string;
  branch_name?: string;
  department_name?: string;
  employee_code?: string | null;
  patient_code?: string | null;
  last_login_at?: string | null;
  permissions: string[];
  schedule_configured?: number | boolean;
  doctor_id?: number;
}

function AuditDiffViewer({ before, after }: { before: any; after: any }) {
  const [diffMode, setDiffMode] = useState<'visual' | 'raw'>('visual');

  const beforeObj = typeof before === 'object' && before !== null ? before : { value: before };
  const afterObj = typeof after === 'object' && after !== null ? after : { value: after };

  const allKeys = Array.from(new Set([...Object.keys(beforeObj || {}), ...Object.keys(afterObj || {})]));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <span className="text-xs font-bold text-slate-700">Side-by-Side Diff Verification</span>
          <span className="bg-blue-100 text-blue-800 text-[10px] font-semibold px-2 py-0.5 rounded-full">
            {allKeys.length} properties analyzed
          </span>
        </div>
        <div className="bg-slate-200 p-0.5 rounded-lg flex items-center space-x-1 text-xs">
          <button
            onClick={() => setDiffMode('visual')}
            className={`px-2.5 py-1 rounded-md font-semibold ${diffMode === 'visual' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'}`}
          >
            Visual Property Diff
          </button>
          <button
            onClick={() => setDiffMode('raw')}
            className={`px-2.5 py-1 rounded-md font-semibold ${diffMode === 'raw' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'}`}
          >
            Raw JSON Split
          </button>
        </div>
      </div>

      {diffMode === 'visual' ? (
        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
          <div className="grid grid-cols-2 bg-slate-100 border-b border-slate-200 text-xs font-semibold text-slate-600">
            <div className="p-2.5 border-r border-slate-200 flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              <span>Before State (Previous)</span>
            </div>
            <div className="p-2.5 flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>After State (Current / Result)</span>
            </div>
          </div>
          <div className="divide-y divide-slate-100 text-xs font-mono">
            {allKeys.length === 0 ? (
              <div className="p-4 text-center text-slate-400 italic">No state changes recorded.</div>
            ) : (
              allKeys.map((key) => {
                const hasBefore = Object.prototype.hasOwnProperty.call(beforeObj, key);
                const hasAfter = Object.prototype.hasOwnProperty.call(afterObj, key);
                const valBefore = hasBefore ? beforeObj[key] : undefined;
                const valAfter = hasAfter ? afterObj[key] : undefined;
                const isModified = hasBefore && hasAfter && JSON.stringify(valBefore) !== JSON.stringify(valAfter);
                const isAdded = !hasBefore && hasAfter;
                const isRemoved = hasBefore && !hasAfter;
                const isUnchanged = hasBefore && hasAfter && JSON.stringify(valBefore) === JSON.stringify(valAfter);

                let rowBg = 'bg-white';
                let beforeHighlight = 'text-slate-700';
                let afterHighlight = 'text-slate-700';
                let statusBadge = null;

                if (isModified) {
                  rowBg = 'bg-amber-50/40';
                  beforeHighlight = 'text-amber-900 bg-amber-100/60 font-semibold';
                  afterHighlight = 'text-emerald-900 bg-emerald-100/60 font-semibold';
                  statusBadge = <span className="text-[10px] bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded font-sans">Modified</span>;
                } else if (isAdded) {
                  rowBg = 'bg-emerald-50/30';
                  beforeHighlight = 'text-slate-400 italic';
                  afterHighlight = 'text-emerald-900 bg-emerald-100/70 font-semibold';
                  statusBadge = <span className="text-[10px] bg-emerald-200 text-emerald-900 px-1.5 py-0.5 rounded font-sans">Added</span>;
                } else if (isRemoved) {
                  rowBg = 'bg-rose-50/30';
                  beforeHighlight = 'text-rose-900 bg-rose-100/70 font-semibold';
                  afterHighlight = 'text-slate-400 italic';
                  statusBadge = <span className="text-[10px] bg-rose-200 text-rose-900 px-1.5 py-0.5 rounded font-sans">Removed</span>;
                }

                return (
                  <div key={key} className={`grid grid-cols-2 items-stretch ${rowBg} hover:bg-slate-50 transition-colors`}>
                    <div className="p-2.5 border-r border-slate-200 break-all flex flex-col justify-between">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-slate-800 font-sans">{key}</span>
                        {statusBadge}
                      </div>
                      <div className={`p-1.5 rounded ${beforeHighlight}`}>
                        {hasBefore ? (typeof valBefore === 'object' ? JSON.stringify(valBefore, null, 2) : String(valBefore)) : '(not present)'}
                      </div>
                    </div>
                    <div className="p-2.5 break-all flex flex-col justify-between">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-slate-800 font-sans">{key}</span>
                        {isUnchanged && <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-sans">Unchanged</span>}
                      </div>
                      <div className={`p-1.5 rounded ${afterHighlight}`}>
                        {hasAfter ? (typeof valAfter === 'object' ? JSON.stringify(valAfter, null, 2) : String(valAfter)) : '(removed)'}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-xs font-bold text-amber-800 mb-1 flex items-center gap-1">
              <Code className="w-3.5 h-3.5" /> Before State (Raw JSON)
            </div>
            <pre className="bg-slate-950 text-emerald-400 p-3 rounded-lg text-xs font-mono overflow-x-auto max-h-80">
              {JSON.stringify(before, null, 2)}
            </pre>
          </div>
          <div>
            <div className="text-xs font-bold text-emerald-800 mb-1 flex items-center gap-1">
              <Code className="w-3.5 h-3.5" /> After State (Raw JSON)
            </div>
            <pre className="bg-slate-950 text-emerald-400 p-3 rounded-lg text-xs font-mono overflow-x-auto max-h-80">
              {JSON.stringify(after, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [settingsSubTab, setSettingsSubTab] = useState<'general' | 'logs' | 'security' | 'roles'>('logs');

  // Auth & WebSocket state
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authPortal, setAuthPortal] = useState<LoginPortalType>('patient');
  const [needsSetup, setNeedsSetup] = useState(false);
  const [demoAccounts, setDemoAccounts] = useState<any[]>([]);
  const [pendingSignupsCount, setPendingSignupsCount] = useState(0);
  const [doctorWizardOpen, setDoctorWizardOpen] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);
  const [liveNotices, setLiveNotices] = useState<any[]>([]);
  const [newRoleOpen, setNewRoleOpen] = useState(false);
  const [newRoleForm, setNewRoleForm] = useState({ code: '', name: '', description: '', is_staff: true });
  const [hrSubTab, setHrSubTab] = useState<'overview' | 'employees' | 'vacancies' | 'candidates' | 'interviews' | 'offers' | 'reports'>('overview');
  const [pubSubTab, setPubSubTab] = useState<'overview' | 'notices' | 'campaigns' | 'acknowledgements'>('overview');
  const [appSubTab, setAppSubTab] = useState<'pending_notices' | 'urgent' | 'pending_campaigns' | 'history'>('pending_notices');
  const [logPage, setLogPage] = useState(1);
  const LOG_PAGE_SIZE = 15;
  const [profileForm, setProfileForm] = useState({ full_name: '', phone: '' });
  const [pwdForm, setPwdForm] = useState({ current_password: '', new_password: '', confirm_password: '' });

  const notify = useCallback((message: string, tone: 'success' | 'error' = 'success') => {
    setToast({ message, tone });
    setTimeout(() => {
      setToast((curr) => (curr?.message === message ? null : curr));
    }, 4500);
  }, []);

  // Live Refresh polling toggle for real-time compliance monitoring
  const [isLiveRefreshActive, setIsLiveRefreshActive] = useState(true);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(new Date().toLocaleTimeString());

  // Multi-select date-range picker state for Activity Logs
  const todayStr = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState('2026-01-01');
  const [endDate, setEndDate] = useState('2027-12-31');
  const [datePreset, setDatePreset] = useState('all');

  // Expanded row state for activity logs
  const [expandedLogIds, setExpandedLogIds] = useState<Record<string, boolean>>({});
  const [isAutoScrollActive, setIsAutoScrollActive] = useState(false);
  const logTableContainerRef = useRef<HTMLDivElement>(null);

  // Modals for Bed management
  const [selectedBedForChange, setSelectedBedForChange] = useState<any>(null);
  const [bedEditStatus, setBedEditStatus] = useState('Available');
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferData, setTransferData] = useState({
    fromBedId: '',
    toBedId: '',
    reason: 'Condition Worsened (Requires ICU / Specialized Care)',
    releaseStatus: 'Cleaning',
  });

  // Backend-synced Dashboard, Beds, Admin RBAC & Audit state
  const [dashboardStats, setDashboardStats] = useState<any>(null);
  const [searchAnalyticsData, setSearchAnalyticsData] = useState<{ topTerms: any[]; dailyTrend: any[] }>({
    topTerms: [],
    dailyTrend: [],
  });

  const [beds, setBeds] = useState<any[]>([]);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [rbacOverview, setRbacOverview] = useState<any>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);

  const userRoleCode = authUser?.role || 'guest';
  const userRoleLabel = authUser?.role_name || 'Guest';

  useEffect(() => {
    if (authUser) {
      setProfileForm({ full_name: authUser.full_name || '', phone: authUser.phone || '' });
    }
  }, [authUser]);

  const loadAuthenticatedWorkspace = useCallback(async (user: AuthUser) => {
    try {
      const notifRes = await apiRequest('/api/notifications').catch(() => ({ notifications: [] }));
      setNotifications(notifRes.notifications || []);

      const searchRes = await apiRequest('/api/reports/search-analytics').catch(() => null);
      if (searchRes) {
        setSearchAnalyticsData({
          topTerms: Array.isArray(searchRes.topTerms) ? searchRes.topTerms : [],
          dailyTrend: Array.isArray(searchRes.dailyTrend) ? searchRes.dailyTrend : [],
        });
      }

      if (user.permissions.includes('reports.view') || user.permissions.includes('admin.all')) {
        const dash = await apiRequest('/api/reports/dashboard').catch(() => null);
        if (dash) setDashboardStats(dash);
      }

      if (user.permissions.includes('admissions.manage') || user.permissions.includes('patients.read_all') || user.permissions.includes('housekeeping.manage')) {
        const bedsRes = await apiRequest('/api/beds').catch(() => ({ beds: [] }));
        const mappedBeds = (bedsRes.beds || []).map((b: any) => ({
          id: b.id,
          code: b.bed_code,
          ward: b.ward_name,
          room: b.room_number,
          type: b.bed_type || b.room_type,
          status: b.status,
          patient: b.patient_name || null,
          active_admission_id: b.active_admission_id || null,
        }));
        setBeds(mappedBeds);
      }

      const pubNoticesRes = await apiRequest('/api/publisher').catch(() => ({ announcements: [] }));
      setLiveNotices(pubNoticesRes.announcements || []);

      if (user.role === 'admin') {
        const [adminRes, signupRes] = await Promise.all([
          apiRequest('/api/admin/overview').catch(() => null),
          apiRequest('/api/admin/signup-requests').catch(() => null),
        ]);
        if (signupRes) {
          setPendingSignupsCount(Number(signupRes.pendingCount || 0));
        }
        if (adminRes) {
          setRbacOverview(adminRes);
          const logs = (adminRes.auditLogs || []).map((al: any) => {
            let parsed: any = {};
            try {
              parsed = typeof al.details === 'string' ? JSON.parse(al.details) : al.details || {};
            } catch {
              parsed = { raw: al.details };
            }
            const created = al.created_at || new Date().toISOString();
            return {
              id: `LOG-${al.id}`,
              user: al.actor_name || `User #${al.actor_user_id || 'System'}`,
              role: al.actor_role || 'system',
              action: al.action,
              module: al.entity_type || 'system',
              timestamp: created.replace('T', ' ').slice(0, 19),
              date: created.slice(0, 10),
              ip: al.ip_address || '127.0.0.1',
              status: String(al.action || '').includes('fail') || String(al.action || '').includes('blocked') || String(al.action || '').includes('denied') ? 'Error' : 'Success',
              before: parsed.before || { entity: al.entity_type, id: al.entity_id },
              after: parsed.after || parsed,
            };
          });
          setActivityLogs(logs);
          if (logs[0]) setExpandedLogIds((prev) => ({ ...prev, [logs[0].id]: true }));
        }
      }
    } catch (err: any) {
      notify(err.message || 'Workspace sync issue', 'error');
    }
  }, [notify]);

  const getHomeTabForRole = useCallback((role: string) => {
    if (role === 'candidate') return 'careers';
    if (role === 'hr') return 'hr_workspace';
    if (role === 'publisher') return 'publisher_workspace';
    if (role === 'approver') return 'approver_workspace';
    return 'dashboard';
  }, []);

  // Initial session hydration, setup check & optional demo account catalog
  useEffect(() => {
    apiRequest<{ needsSetup: boolean; demoAccountsVisible: boolean }>('/api/auth/setup-status')
      .then((res) => {
        setNeedsSetup(Boolean(res?.needsSetup));
        if (res?.demoAccountsVisible) {
          apiRequest('/api/demo-accounts')
            .then((dRes) => {
              if (dRes.visible && Array.isArray(dRes.accounts)) setDemoAccounts(dRes.accounts);
            })
            .catch(() => {});
        }
      })
      .catch(() => {});

    apiRequest<{ user: AuthUser }>('/api/auth/me')
      .then((res) => {
        if (res.user) {
          setAuthUser(res.user);
          setActiveTab(getHomeTabForRole(res.user.role));
          if (res.user.role === 'doctor' && !res.user.schedule_configured) setDoctorWizardOpen(true);
          loadAuthenticatedWorkspace(res.user);
        }
      })
      .catch(() => {
        setAuthModalOpen(true);
      });
  }, [loadAuthenticatedWorkspace, getHomeTabForRole]);

  // Real multi-user WebSocket client connection
  useEffect(() => {
    if (!authUser) {
      setWsConnected(false);
      return;
    }

    let ws: WebSocket | null = null;
    let closedByEffect = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      try {
        ws = new WebSocket(buildWsUrl());
        ws.onopen = () => setWsConnected(true);
        ws.onclose = () => {
          setWsConnected(false);
          if (!closedByEffect) {
            reconnectTimer = setTimeout(connect, 4000);
          }
        };
        ws.onerror = () => setWsConnected(false);
        ws.onmessage = (evt) => {
          try {
            const payload = JSON.parse(evt.data);
            if (payload.eventType === 'connected' || payload.eventType === 'pong') return;
            if (payload.title || payload.message) {
              notify(`${payload.title ? `${payload.title}: ` : ''}${payload.message || payload.eventType}`, 'success');
            }
            setRefreshSignal((s) => s + 1);
            loadAuthenticatedWorkspace(authUser);
          } catch {}
        };
      } catch {
        setWsConnected(false);
      }
    };

    connect();
    return () => {
      closedByEffect = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, [authUser, loadAuthenticatedWorkspace, notify]);

  // 30-second live refresh polling for compliance activity logs
  useEffect(() => {
    if (!isLiveRefreshActive || !authUser) return;
    const interval = setInterval(() => {
      setLastRefreshedAt(new Date().toLocaleTimeString());
      loadAuthenticatedWorkspace(authUser);
    }, 30000);
    return () => clearInterval(interval);
  }, [isLiveRefreshActive, authUser, loadAuthenticatedWorkspace]);

  // Auto-scroll effect for activity logs
  useEffect(() => {
    if (isAutoScrollActive && logTableContainerRef.current) {
      logTableContainerRef.current.scrollTo({
        top: logTableContainerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [activityLogs, isAutoScrollActive]);

  const handleLogin = async (identifier: string, password: string) => {
    try {
      const res = await apiRequest<{ token: string; user: AuthUser }>('/api/auth/login', {
        method: 'POST',
        body: { identifier, password, remember: true },
      });
      setAccessToken(res.token);
      setAuthUser(res.user);
      setAuthModalOpen(false);
      setActiveTab(getHomeTabForRole(res.user.role));
      setDoctorWizardOpen(Boolean(res.user.role === 'doctor' && !res.user.schedule_configured));
      notify(`Signed in as ${res.user.full_name} (${res.user.role_name}).`, 'success');
      loadAuthenticatedWorkspace(res.user);
    } catch (err: any) {
      notify(err.message || 'Sign in failed', 'error');
    }
  };

  const handleLogout = async () => {
    await apiRequest('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setAccessToken(null);
    setAuthUser(null);
    setBeds([]);
    setActivityLogs([]);
    setDashboardStats(null);
    setAuthModalOpen(true);
    notify('Signed out securely.', 'success');
  };

  const handleDatePreset = (preset: string) => {
    setDatePreset(preset);
    if (preset === 'today') {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === 'week') {
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      setStartDate(weekAgo);
      setEndDate(todayStr);
    } else {
      setStartDate('2026-01-01');
      setEndDate('2027-12-31');
    }
  };

  const toggleRowExpansion = (id: string) => {
    setExpandedLogIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredBeds = useMemo(() => {
    return beds.filter((b) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        String(b.code).toLowerCase().includes(q) ||
        String(b.ward).toLowerCase().includes(q) ||
        String(b.room).toLowerCase().includes(q) ||
        (b.patient && String(b.patient).toLowerCase().includes(q));
      const matchesStatus = statusFilter === 'All' || b.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [beds, searchQuery, statusFilter]);

  const filteredLogs = useMemo(() => {
    return activityLogs.filter((log) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        log.user.toLowerCase().includes(q) ||
        log.action.toLowerCase().includes(q) ||
        log.module.toLowerCase().includes(q) ||
        log.role.toLowerCase().includes(q);
      const matchesDateRange = (!startDate || log.date >= startDate) && (!endDate || log.date <= endDate);
      return matchesSearch && matchesDateRange;
    });
  }, [activityLogs, searchQuery, startDate, endDate]);

  useEffect(() => {
    setLogPage(1);
  }, [searchQuery, startDate, endDate]);

  const totalLogPages = Math.max(1, Math.ceil(filteredLogs.length / LOG_PAGE_SIZE));
  const pagedLogs = useMemo(
    () => filteredLogs.slice((logPage - 1) * LOG_PAGE_SIZE, logPage * LOG_PAGE_SIZE),
    [filteredLogs, logPage]
  );

  const logSummaryCounts = useMemo(() => {
    const total = filteredLogs.length;
    const success = filteredLogs.filter((l) => l.status === 'Success').length;
    return { total, success, errors: total - success };
  }, [filteredLogs]);

  const handleExportCSV = () => {
    const headers = ['Log ID', 'User', 'Role', 'Action', 'Module', 'Timestamp', 'IP Address', 'Status'];
    const rows = filteredLogs.map((l) => [
      l.id,
      `"${l.user}"`,
      `"${l.role}"`,
      `"${l.action}"`,
      `"${l.module}"`,
      l.timestamp,
      l.ip,
      l.status,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `CareLine_Compliance_Audit_Logs_${startDate}_to_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleUpdateBedStatus = async () => {
    if (!selectedBedForChange) return;
    try {
      await apiRequest(`/api/beds/${selectedBedForChange.id}/status`, {
        method: 'PATCH',
        body: { status: bedEditStatus },
      });
      notify(`Bed ${selectedBedForChange.code} updated to ${bedEditStatus}.`, 'success');
      setSelectedBedForChange(null);
      if (authUser) loadAuthenticatedWorkspace(authUser);
    } catch (err: any) {
      notify(err.message || 'Bed status update blocked by compliance policy', 'error');
    }
  };

  const handleExecuteBedTransfer = async () => {
    try {
      const res = await apiRequest('/api/admissions/transfer', {
        method: 'POST',
        body: {
          from_bed_id: Number(transferData.fromBedId),
          to_bed_id: Number(transferData.toBedId),
          reason: transferData.reason,
          release_status: transferData.releaseStatus,
        },
      });
      notify(`Transfer ${res.transfer?.transfer_ref || ''} executed & logged atomically.`, 'success');
      setTransferModalOpen(false);
      if (authUser) loadAuthenticatedWorkspace(authUser);
    } catch (err: any) {
      notify(err.message || 'Transfer rejected by server validation', 'error');
    }
  };

  const handleToggleRolePerm = async (roleId: number, permId: number) => {
    if (!rbacOverview) return;
    const currentPermIds = (rbacOverview.rolePermissions || [])
      .filter((rp: any) => rp.role_id === roleId)
      .map((rp: any) => rp.permission_id);
    const nextPermIds = currentPermIds.includes(permId)
      ? currentPermIds.filter((id: number) => id !== permId)
      : [...currentPermIds, permId];
    try {
      await apiRequest(`/api/admin/roles/${roleId}/permissions`, {
        method: 'PUT',
        body: { permission_ids: nextPermIds },
      });
      notify('Role permissions matrix updated in SQLite.', 'success');
      if (authUser) loadAuthenticatedWorkspace(authUser);
    } catch (err: any) {
      notify(err.message || 'Failed updating role permissions', 'error');
    }
  };

  // Charts data derived strictly from backend stats
  const bedStatusPieData = useMemo(() => {
    const raw = dashboardStats?.charts?.bedStatusBreakdown;
    const palette: Record<string, string> = {
      Occupied: '#1E5EFF',
      Available: '#10B981',
      Cleaning: '#F59E0B',
      Maintenance: '#EF4444',
    };
    if (Array.isArray(raw) && raw.length) {
      return raw.map((item: any) => ({
        name: item.label,
        value: item.value,
        color: palette[item.label] || '#6366F1',
      }));
    }
    return [
      { name: 'Occupied', value: beds.filter((b) => b.status === 'Occupied').length, color: '#1E5EFF' },
      { name: 'Available', value: beds.filter((b) => b.status === 'Available').length, color: '#10B981' },
      { name: 'Cleaning', value: beds.filter((b) => b.status === 'Cleaning').length, color: '#F59E0B' },
    ];
  }, [dashboardStats, beds]);

  const bedOccupancyTrendData = useMemo(() => {
    const rev = dashboardStats?.charts?.registrationsTrend;
    const totalBeds = Math.max(1, (dashboardStats?.kpis?.occupiedBeds || 0) + (dashboardStats?.kpis?.availableBeds || 0));
    const occRate = dashboardStats?.kpis
      ? Math.round(((dashboardStats.kpis.occupiedBeds || 0) / totalBeds) * 100)
      : 0;
    if (Array.isArray(rev) && rev.length) {
      return rev.map((r: any) => ({
        day: r.label,
        occupancy: occRate,
      }));
    }
    return [];
  }, [dashboardStats]);

  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/admin/roles', { method: 'POST', body: newRoleForm });
      notify(`Role "${newRoleForm.name}" created.`, 'success');
      setNewRoleOpen(false);
      setNewRoleForm({ code: '', name: '', description: '', is_staff: true });
      if (authUser) loadAuthenticatedWorkspace(authUser);
    } catch (err: any) {
      notify(err.message || 'Role creation failed', 'error');
    }
  };

  const handleAcknowledgeNotice = async (noticeId: number) => {
    try {
      await apiRequest(`/api/publisher/${noticeId}/ack`, { method: 'POST', body: {} });
      notify('Notice acknowledged.', 'success');
      if (authUser) loadAuthenticatedWorkspace(authUser);
    } catch (err: any) {
      notify(err.message || 'Could not acknowledge notice', 'error');
    }
  };

  const handleSaveMyProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiRequest<{ user: AuthUser; message: string }>('/api/auth/profile', {
        method: 'PATCH',
        body: { full_name: profileForm.full_name, phone: profileForm.phone },
      });
      setAuthUser(res.user);
      notify(res.message || 'Profile updated.', 'success');
    } catch (err: any) {
      notify(err.message || 'Failed updating profile.', 'error');
    }
  };

  const handleChangeMyPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwdForm.new_password !== pwdForm.confirm_password) {
      notify('New password and confirmation do not match.', 'error');
      return;
    }
    try {
      const res = await apiRequest<{ message: string }>('/api/auth/change-password', {
        method: 'POST',
        body: { current_password: pwdForm.current_password, new_password: pwdForm.new_password },
      });
      setPwdForm({ current_password: '', new_password: '', confirm_password: '' });
      notify(res.message || 'Password updated.', 'success');
    } catch (err: any) {
      notify(err.message || 'Password change failed.', 'error');
    }
  };

  // Role-gated navigation definition driven by authenticated permissions
  const navigationItems = useMemo(() => {
    if (!authUser) return [];
    if (userRoleCode === 'candidate') {
      return [
        { id: 'careers', label: 'Careers & Applications', icon: Briefcase },
        { id: 'profile', label: 'My Profile', icon: User },
      ];
    }
    if (userRoleCode === 'hr') {
      return [
        { id: 'hr_workspace', subTab: 'overview', label: 'HR Overview', icon: LayoutDashboard },
        { id: 'hr_workspace', subTab: 'employees', label: 'Employees & Payroll', icon: Users },
        { id: 'hr_workspace', subTab: 'vacancies', label: 'Job Vacancies', icon: Briefcase },
        { id: 'hr_workspace', subTab: 'candidates', label: 'Candidate Pipeline', icon: UserCheck },
        { id: 'hr_workspace', subTab: 'interviews', label: 'Interviews', icon: CalendarIcon },
        { id: 'hr_workspace', subTab: 'offers', label: 'Job Offers', icon: CheckCircle2 },
        { id: 'hr_workspace', subTab: 'reports', label: 'HR Reports', icon: BarChart3 },
        { id: 'profile', label: 'My Profile', icon: User },
      ];
    }
    if (userRoleCode === 'publisher') {
      return [
        { id: 'publisher_workspace', subTab: 'overview', label: 'Publisher Overview', icon: LayoutDashboard },
        { id: 'publisher_workspace', subTab: 'notices', label: 'Notice Management', icon: Megaphone },
        { id: 'publisher_workspace', subTab: 'campaigns', label: 'Ads & Campaigns', icon: TrendingUp },
        { id: 'publisher_workspace', subTab: 'acknowledgements', label: 'Acknowledgements', icon: Users },
        { id: 'profile', label: 'My Profile', icon: User },
      ];
    }
    if (userRoleCode === 'approver') {
      return [
        { id: 'approver_workspace', subTab: 'pending_notices', label: 'Pending Notices', icon: ClipboardCheck },
        { id: 'approver_workspace', subTab: 'urgent', label: 'Emergency & Urgent', icon: ShieldAlert },
        { id: 'approver_workspace', subTab: 'pending_campaigns', label: 'Pending Campaigns', icon: TrendingUp },
        { id: 'approver_workspace', subTab: 'history', label: 'Approval History', icon: Clock },
        { id: 'profile', label: 'My Profile', icon: User },
      ];
    }

    const perms = new Set(authUser?.permissions || []);
    const items: Array<{ id: string; subTab?: string; label: string; icon: any; badge?: number }> = [
      { id: 'dashboard', label: `${userRoleLabel} Home`, icon: LayoutDashboard },
    ];
    if (perms.has('patients.read_all') || userRoleCode === 'patient') {
      items.push({ id: 'patients', label: userRoleCode === 'patient' ? 'My EHR Profile' : 'Patients', icon: Users });
    }
    if (['admin', 'doctor', 'receptionist', 'nurse', 'case_manager', 'patient'].includes(userRoleCode)) {
      items.push({ id: 'doctors', label: 'Find Doctors', icon: UserCheck });
      items.push({ id: 'appointments', label: 'Appointments', icon: CalendarIcon });
    }
    if (perms.has('admissions.manage') || perms.has('housekeeping.manage')) {
      items.push({
        id: 'beds',
        label: 'Admissions & Beds',
        icon: BedDouble,
        badge: beds.filter((b) => b.status === 'Occupied').length,
      });
    }
    if (
      perms.has('pharmacy.dispense') ||
      perms.has('lab.process') ||
      perms.has('radiology.process') ||
      perms.has('bloodbank.manage') ||
      ['doctor', 'patient', 'nurse'].includes(userRoleCode)
    ) {
      items.push({ id: 'pharmacy', label: 'Pharmacy & Inventory', icon: Pill });
    }
    if (perms.has('finance.manage') || perms.has('insurance.manage') || userRoleCode === 'patient') {
      items.push({ id: 'billing', label: 'Billing & Insurance', icon: CreditCard });
    }
    if (['accountant', 'receptionist', 'external_coordinator'].includes(userRoleCode)) {
      items.push({ id: 'operations', label: 'Integrations & Notices', icon: Briefcase });
    }
    if (userRoleCode === 'admin') {
      items.push({ id: 'users_signups', label: 'Users & Staff', icon: UserCheck, badge: pendingSignupsCount });
      items.push({ id: 'departments', label: 'Departments', icon: Building2 });
      items.push({ id: 'finance_payroll', label: 'Finance & Payroll', icon: CreditCard });
      items.push({ id: 'hr_workspace', label: 'HR Oversight', icon: Briefcase });
      items.push({ id: 'admin_notices_docs', label: 'Notices & Docs', icon: Megaphone });
      items.push({ id: 'admin_settings', label: 'System Settings', icon: SlidersHorizontal });
      items.push({ id: 'settings', label: 'RBAC & Audit Logs', icon: Settings, badge: activityLogs.length });
    }
    items.push({ id: 'profile', label: 'My Profile', icon: User });
    return items;
  }, [authUser, userRoleCode, userRoleLabel, beds, activityLogs.length, pendingSignupsCount]);

  const allowedTabIds = useMemo(() => new Set(navigationItems.map((i) => i.id)), [navigationItems]);
  const isRouteAuthorized = !authUser || allowedTabIds.has(activeTab);

  // Sync URL hash to activeTab & listen to hash navigation with route protection
  useEffect(() => {
    const syncFromHash = () => {
      const h = window.location.hash.replace(/^#\/?/, '').trim();
      if (h && ['dashboard', 'careers', 'hr_workspace', 'publisher_workspace', 'approver_workspace', 'patients', 'doctors', 'appointments', 'beds', 'pharmacy', 'billing', 'operations', 'users_signups', 'departments', 'finance_payroll', 'admin_notices_docs', 'admin_settings', 'settings', 'profile'].includes(h)) {
        setActiveTab(h);
      }
    };
    window.addEventListener('hashchange', syncFromHash);
    return () => window.removeEventListener('hashchange', syncFromHash);
  }, []);

  useEffect(() => {
    if (authUser && activeTab) {
      const expectedHash = `#/${activeTab}`;
      if (window.location.hash !== expectedHash) {
        window.history.replaceState(null, '', expectedHash);
      }
    }
  }, [authUser, activeTab]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col md:flex-row">
      {/* Global Non-Blocking Notification Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className={`fixed top-4 right-4 z-[60] max-w-md px-4 py-3 rounded-xl shadow-lg border text-xs font-semibold flex items-center space-x-2 ${
              toast.tone === 'error'
                ? 'bg-rose-50 border-rose-200 text-rose-800'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800'
            }`}
          >
            {toast.tone === 'error' ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
            <span>{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-30">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 rounded-lg text-slate-600 hover:bg-slate-100"
            aria-label="Toggle Menu"
          >
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold">+</div>
            <span className="font-bold text-lg text-slate-900">CareLine HMS</span>
          </div>
        </div>
        <button onClick={() => setAuthModalOpen(true)} className="text-xs font-semibold text-blue-600">
          {authUser ? authUser.user_code : 'Sign In'}
        </button>
      </div>

      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 z-40 md:hidden backdrop-blur-sm"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed md:sticky top-0 h-screen w-72 bg-white border-r border-slate-200 flex flex-col z-50 transition-transform duration-300 ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-xl shadow-md">
              +
            </div>
            <div>
              <h1 className="font-bold text-slate-900 text-lg leading-tight">CareLine HMS</h1>
              <p className="text-xs text-slate-500 font-medium">Real-Time Clinical Suite</p>
            </div>
          </div>
        </div>

        {/* Authenticated Portal Quick Switcher */}
        <div className="p-4 border-b border-slate-100 bg-slate-50/70 space-y-2">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
            <span>Authenticated Session</span>
            <span className={wsConnected ? 'text-emerald-600' : 'text-slate-400'}>
              {wsConnected ? 'WS Live' : 'Offline'}
            </span>
          </div>
          {demoAccounts.length > 0 && (
            <select
              value={authUser?.email || ''}
              onChange={(e) => {
                const chosen = demoAccounts.find((a) => a.email === e.target.value);
                if (chosen) handleLogin(chosen.email, chosen.password);
              }}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-blue-700"
            >
              <option value="" disabled>Switch Demo Account...</option>
              {demoAccounts.slice(0, 20).map((acc) => (
                <option key={acc.email} value={acc.email}>
                  {acc.label} — {acc.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              activeTab === item.id &&
              (!item.subTab ||
                (item.id === 'hr_workspace' && hrSubTab === item.subTab) ||
                (item.id === 'publisher_workspace' && pubSubTab === item.subTab) ||
                (item.id === 'approver_workspace' && appSubTab === item.subTab));
            return (
              <button
                key={`${item.id}-${item.subTab || 'main'}`}
                onClick={() => {
                  setActiveTab(item.id);
                  if (item.id === 'hr_workspace' && item.subTab) setHrSubTab(item.subTab as any);
                  if (item.id === 'publisher_workspace' && item.subTab) setPubSubTab(item.subTab as any);
                  if (item.id === 'approver_workspace' && item.subTab) setAppSubTab(item.subTab as any);
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className={`text-xs font-semibold ${isActive ? 'text-blue-100' : 'text-slate-500'}`}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50/50">
          {authUser ? (
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('profile');
                  setIsMobileMenuOpen(false);
                }}
                className="overflow-hidden text-left hover:opacity-80"
                title="View My Profile"
              >
                <p className="text-sm font-semibold text-slate-900 truncate">{authUser.full_name}</p>
                <p className="text-xs text-slate-500 truncate">{authUser.role_name} · {authUser.user_code}</p>
              </button>
              <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-rose-600 rounded-lg" title="Sign Out">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAuthModalOpen(true)}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-2"
            >
              <LogIn className="w-4 h-4" /> Sign In to CareLine HMS
            </button>
          )}
        </div>
      </aside>

      {/* Main Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <header className="hidden md:flex items-center justify-between bg-white border-b border-slate-200 px-8 py-4 sticky top-0 z-20">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (authUser && searchQuery.trim().length >= 2) {
                apiRequest('/api/reports/search-analytics', {
                  method: 'POST',
                  body: { term: searchQuery.trim(), category: activeTab },
                }).catch(() => {});
              }
            }}
            className="flex items-center space-x-3 flex-1 max-w-xl"
          >
            <div className="relative w-full">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Real-time filter in ${activeTab}...`}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-100 border border-transparent rounded-xl text-sm focus:bg-white focus:border-blue-600 focus:outline-none"
              />
            </div>
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery('')} className="text-xs font-semibold text-blue-600">
                Clear
              </button>
            )}
          </form>

          <div className="flex items-center space-x-4 relative">
            <span className="text-xs font-medium text-slate-600">
              {authUser ? `${authUser.role_name} · ${authUser.email}` : 'Not Signed In'}
            </span>
            <button
              onClick={() => setNotifOpen(!notifOpen)}
              className="p-2 text-slate-600 hover:bg-slate-100 rounded-xl relative"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5" />
              {notifications.some((n) => !n.is_read) && (
                <span className="absolute top-2 right-2 w-2 h-2 bg-rose-500 rounded-full" />
              )}
            </button>
            <button
              onClick={() => setAuthModalOpen(true)}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-semibold text-slate-700"
            >
              {authUser ? 'Switch Account' : 'Sign In'}
            </button>

            {notifOpen && (
              <div className="absolute right-0 top-12 w-80 bg-white rounded-2xl shadow-xl border border-slate-200 p-4 z-50 space-y-2 max-h-96 overflow-y-auto">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="font-bold text-xs text-slate-900">Real-Time Notifications</span>
                  <button onClick={() => setNotifOpen(false)} className="text-xs text-slate-400">Close</button>
                </div>
                {notifications.length === 0 ? (
                  <p className="text-xs text-slate-400 py-4 text-center">No notifications yet.</p>
                ) : (
                  notifications.slice(0, 8).map((n) => (
                    <div key={n.id} className="p-2.5 bg-slate-50 rounded-xl text-xs">
                      <div className="font-semibold text-slate-900">{n.title}</div>
                      <div className="text-slate-600 mt-0.5">{n.message}</div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </header>

        <div className="p-4 md:p-8 flex-1 max-w-7xl w-full mx-auto">
          {!authUser && (
            <div className="mb-6 bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">CareLine HMS — Four Role-Protected Login Portals</h2>
                <p className="text-xs text-slate-500 mt-0.5">Select your designated hospital portal to authenticate with role-based access control.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { portal: 'patient' as LoginPortalType, title: '1. Patient Login', desc: 'Appointments, EHR, Reports & Careers' },
                  { portal: 'staff' as LoginPortalType, title: '2. Hospital Staff Login', desc: 'Doctors, Nurses, Reception, Lab & Pharmacy' },
                  { portal: 'admin' as LoginPortalType, title: '3. Administrator Login', desc: 'Governance, Users, RBAC & Audit Logs' },
                  { portal: 'hr_publisher' as LoginPortalType, title: '4. HR / Publisher Login', desc: 'HR Hiring Team, Publisher & Approver' },
                ].map((entry) => (
                  <button
                    key={entry.portal}
                    onClick={() => {
                      setAuthPortal(entry.portal);
                      setAuthModalOpen(true);
                    }}
                    className="p-4 text-left bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-xl transition-all"
                  >
                    <div className="font-bold text-sm text-slate-900">{entry.title}</div>
                    <div className="text-xs text-slate-500 mt-1">{entry.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {authUser && !isRouteAuthorized && (
            <div className="bg-white border border-rose-200 rounded-2xl p-8 text-center space-y-3 shadow-xs">
              <ShieldAlert className="w-10 h-10 text-rose-600 mx-auto" />
              <h2 className="text-lg font-bold text-slate-900">403 — Access Restricted</h2>
              <p className="text-xs text-slate-600 max-w-md mx-auto">
                Your role ({authUser.role_name}) is not authorized to view the <strong>{activeTab}</strong> module.
              </p>
              <button
                onClick={() => setActiveTab(getHomeTabForRole(authUser.role))}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold"
              >
                Return to My Authorized Dashboard
              </button>
            </div>
          )}

          {authUser?.role === 'doctor' && !authUser.schedule_configured && (
            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs text-amber-900">
                <strong>Schedule Setup Required:</strong> Configure your working days, hours, breaks, and slot duration so patients can discover and book you.
              </div>
              <button
                onClick={() => setDoctorWizardOpen(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold shrink-0"
              >
                Open Schedule Wizard
              </button>
            </div>
          )}

          {/* DEDICATED ROLE WORKSPACES */}
          {isRouteAuthorized && activeTab === 'careers' && userRoleCode === 'candidate' && (
            <CandidateCareersPanel onNotify={notify} refreshSignal={refreshSignal} />
          )}

          {isRouteAuthorized && activeTab === 'hr_workspace' && ['hr', 'admin'].includes(userRoleCode) && (
            <HrDashboardPanel onNotify={notify} refreshSignal={refreshSignal} initialSubTab={hrSubTab} />
          )}

          {isRouteAuthorized && activeTab === 'publisher_workspace' && ['publisher', 'admin'].includes(userRoleCode) && (
            <PublisherDashboardPanel onNotify={notify} refreshSignal={refreshSignal} initialSubTab={pubSubTab} />
          )}

          {isRouteAuthorized && activeTab === 'approver_workspace' && ['approver', 'admin'].includes(userRoleCode) && (
            <ApproverDashboardPanel currentUserId={authUser!.id} onNotify={notify} refreshSignal={refreshSignal} initialSubTab={appSubTab} />
          )}

          {isRouteAuthorized && activeTab === 'profile' && authUser && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">My Profile & Account Security</h2>
                <p className="text-sm text-slate-500 mt-1">Review your assigned role, hospital department details, contact information, and password security.</p>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <form onSubmit={handleSaveMyProfile} className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4 text-xs">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div>
                      <h3 className="font-bold text-base text-slate-900">{authUser.full_name}</h3>
                      <p className="font-mono text-blue-700 font-semibold">{authUser.user_code} · {authUser.role_name}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl">
                    <div><span className="text-slate-500 block">Email</span><span className="font-semibold">{authUser.email}</span></div>
                    <div><span className="text-slate-500 block">Branch</span><span className="font-semibold">{authUser.branch_name || 'Main Campus'}</span></div>
                    <div><span className="text-slate-500 block">Department</span><span className="font-semibold">{authUser.department_name || '—'}</span></div>
                    <div><span className="text-slate-500 block">Staff / Patient Code</span><span className="font-mono font-semibold">{authUser.employee_code || authUser.patient_code || authUser.user_code}</span></div>
                    <div className="col-span-2"><span className="text-slate-500 block">Last Login</span><span className="font-mono">{authUser.last_login_at ? String(authUser.last_login_at).slice(0, 19) : 'Active Session'}</span></div>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">Full Name</label>
                    <input required value={profileForm.full_name} onChange={(e) => setProfileForm({ ...profileForm, full_name: e.target.value })} className="w-full px-3 py-2 bg-slate-100 rounded-xl" />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">Phone Number</label>
                    <input value={profileForm.phone} onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })} placeholder="+1-555-0100" className="w-full px-3 py-2 bg-slate-100 rounded-xl" />
                  </div>
                  <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold">
                    Save Profile Changes
                  </button>
                </form>

                <form onSubmit={handleChangeMyPassword} className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4 text-xs">
                  <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                    <Lock className="w-4 h-4 text-blue-600" />
                    <h3 className="font-bold text-base text-slate-900">Change Account Password</h3>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">Current Password</label>
                    <input required type="password" value={pwdForm.current_password} onChange={(e) => setPwdForm({ ...pwdForm, current_password: e.target.value })} className="w-full px-3 py-2 bg-slate-100 rounded-xl" />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">New Password (8+ chars, 1 number)</label>
                    <input required type="password" minLength={8} value={pwdForm.new_password} onChange={(e) => setPwdForm({ ...pwdForm, new_password: e.target.value })} className="w-full px-3 py-2 bg-slate-100 rounded-xl" />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">Confirm New Password</label>
                    <input required type="password" minLength={8} value={pwdForm.confirm_password} onChange={(e) => setPwdForm({ ...pwdForm, confirm_password: e.target.value })} className="w-full px-3 py-2 bg-slate-100 rounded-xl" />
                  </div>
                  <button type="submit" className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-semibold">
                    Update Password
                  </button>
                </form>
              </div>
            </div>
          )}

          {isRouteAuthorized && ['departments', 'finance_payroll', 'admin_notices_docs', 'admin_settings'].includes(activeTab) && userRoleCode === 'admin' && (
            <AdminDashboardPanel
              section={activeTab as any}
              onNotify={notify}
              refreshSignal={refreshSignal}
              onDataChanged={() => {
                if (authUser) loadAuthenticatedWorkspace(authUser);
              }}
            />
          )}

          {/* DASHBOARD */}
          {isRouteAuthorized && activeTab === 'dashboard' && !['candidate', 'hr', 'publisher', 'approver'].includes(userRoleCode) && (
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">{userRoleLabel} Dashboard</h2>
                  <p className="text-sm text-slate-500 mt-1">Real-time hospital telemetry, capacity overview, and search query insights.</p>
                </div>
                <div className="flex items-center gap-3">
                  {userRoleCode === 'doctor' && (
                    <button onClick={() => setDoctorWizardOpen(true)} className="px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-xl text-xs font-semibold">
                      Configure Schedule
                    </button>
                  )}
                  <span className="text-xs font-semibold text-emerald-700">
                    {wsConnected ? 'WebSocket Synchronized' : 'Standby Mode'}
                  </span>
                </div>
              </div>

              {userRoleCode === 'admin' && dashboardStats?.kpis && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  {[
                    { label: 'Total Patients', value: dashboardStats.kpis.totalPatients },
                    { label: 'Total Doctors', value: dashboardStats.kpis.totalDoctors },
                    { label: 'Total Employees', value: dashboardStats.kpis.totalEmployees ?? 0 },
                    { label: 'Active Staff', value: dashboardStats.kpis.activeStaff ?? 0 },
                    { label: 'Total Departments', value: dashboardStats.kpis.totalDepartments ?? 0 },
                    { label: 'Total Appointments', value: dashboardStats.kpis.totalAppointments ?? 0 },
                    { label: 'Beds (Avail / Occ)', value: `${dashboardStats.kpis.availableBeds}/${dashboardStats.kpis.occupiedBeds}` },
                    { label: 'Total Revenue', value: `$${Number(dashboardStats.kpis.totalRevenue ?? 0).toLocaleString()}` },
                    { label: 'Pending Payments', value: `$${Number(dashboardStats.kpis.pendingPayments ?? dashboardStats.kpis.outstandingPayments ?? 0).toLocaleString()}` },
                    { label: 'System Notifications', value: dashboardStats.kpis.systemNotifications ?? notifications.length },
                  ].map((kpi) => (
                    <div key={kpi.label} className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
                      <div className="text-[11px] font-semibold text-slate-500 uppercase">{kpi.label}</div>
                      <div className="text-2xl font-bold font-mono text-slate-900 mt-1">{kpi.value}</div>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <motion.div whileHover={{ scale: 1.03, y: -3 }} className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Patients</span>
                    <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl"><Users className="w-5 h-5" /></div>
                  </div>
                  <div className="mt-4 flex items-baseline justify-between">
                    <h3 className="text-3xl font-bold text-slate-900 font-mono tabular-nums">
                      {dashboardStats?.kpis?.totalPatients ?? '—'}
                    </h3>
                    <span className="text-xs font-semibold text-slate-500">SQLite Live</span>
                  </div>
                </motion.div>

                <motion.div whileHover={{ scale: 1.03, y: -3 }} className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Doctors</span>
                    <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl"><UserCheck className="w-5 h-5" /></div>
                  </div>
                  <div className="mt-4 flex items-baseline justify-between">
                    <h3 className="text-3xl font-bold text-slate-900 font-mono tabular-nums">
                      {dashboardStats?.kpis?.totalDoctors ?? '—'}
                    </h3>
                    <span className="text-xs font-semibold text-slate-500">Verified Specialists</span>
                  </div>
                </motion.div>

                <motion.div whileHover={{ scale: 1.03, y: -3 }} className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Beds Occupied / Avail</span>
                    <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl"><BedDouble className="w-5 h-5" /></div>
                  </div>
                  <div className="mt-4 flex items-baseline justify-between">
                    <h3 className="text-3xl font-bold text-slate-900 font-mono tabular-nums">
                      {dashboardStats?.kpis ? `${dashboardStats.kpis.occupiedBeds}/${dashboardStats.kpis.availableBeds}` : '—'}
                    </h3>
                    <span className="text-xs font-semibold text-slate-500">Inpatient Capacity</span>
                  </div>
                </motion.div>

                <motion.div whileHover={{ scale: 1.03, y: -3 }} className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Outstanding Billing</span>
                    <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl"><CreditCard className="w-5 h-5" /></div>
                  </div>
                  <div className="mt-4 flex items-baseline justify-between">
                    <h3 className="text-3xl font-bold text-slate-900 font-mono tabular-nums">
                      {dashboardStats?.kpis ? `$${dashboardStats.kpis.outstandingPayments}` : '—'}
                    </h3>
                    <span className="text-xs font-semibold text-emerald-700">Ledger Verified</span>
                  </div>
                </motion.div>
              </div>

              {liveNotices.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3">
                  <div className="flex items-center gap-2">
                    <Megaphone className="w-4 h-4 text-blue-600" />
                    <h3 className="font-bold text-sm text-slate-900">Published Hospital Notices</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {liveNotices.slice(0, 4).map((n) => (
                      <div key={n.id} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/70 text-xs space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900">{n.title}</span>
                          <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-semibold">{n.priority}</span>
                        </div>
                        <p className="text-slate-600">{n.body}</p>
                        <div className="flex items-center justify-between pt-1">
                          <span className="text-slate-400">{n.category || 'General'} · Valid until {n.expiry_date}</span>
                          {n.my_acknowledged_at ? (
                            <span className="text-emerald-700 font-semibold inline-flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Acknowledged
                            </span>
                          ) : (
                            <button onClick={() => handleAcknowledgeNotice(n.id)} className="px-2.5 py-1 bg-blue-600 text-white rounded-lg font-semibold">
                              Acknowledge
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs">
                  <div className="flex items-center space-x-3 mb-4">
                    <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl"><PieChartIcon className="w-5 h-5" /></div>
                    <div>
                      <h3 className="font-bold text-slate-900 text-lg">Hospital Bed Distribution</h3>
                      <p className="text-xs text-slate-500">Live occupancy breakdown from ward database</p>
                    </div>
                  </div>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={bedStatusPieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={4} dataKey="value">
                          {bedStatusPieData.map((entry, idx) => (
                            <Cell key={`cell-${idx}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ backgroundColor: '#0F172A', borderRadius: '12px', color: '#fff', border: 'none' }} />
                        <Legend verticalAlign="bottom" align="center" iconType="circle" />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs">
                  <div className="flex items-center space-x-3 mb-4">
                    <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl"><TrendingUp className="w-5 h-5" /></div>
                    <div>
                      <h3 className="font-bold text-slate-900 text-lg">Top Searches & Query Analytics</h3>
                      <p className="text-xs text-slate-500">Aggregated search frequency across modules</p>
                    </div>
                  </div>
                  <div className="h-64">
                    {searchAnalyticsData.topTerms.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={searchAnalyticsData.topTerms} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                          <XAxis dataKey="term" tick={{ fontSize: 11 }} stroke="#64748B" />
                          <YAxis tick={{ fontSize: 11 }} stroke="#64748B" />
                          <Tooltip contentStyle={{ backgroundColor: '#0F172A', borderRadius: '12px', color: '#fff', border: 'none' }} />
                          <Bar dataKey="searches" fill="#1E5EFF" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-sm text-slate-400 border border-dashed border-slate-200 rounded-xl">
                        No query analytics recorded yet.
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs lg:col-span-2">
                  <div className="flex items-center space-x-3 mb-4">
                    <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl"><Activity className="w-5 h-5" /></div>
                    <div>
                      <h3 className="font-bold text-slate-900 text-lg">Search Insights & Daily Volume Trend</h3>
                      <p className="text-xs text-slate-500">Combined query volume, daily searches, and active searchers</p>
                    </div>
                  </div>
                  <div className="h-72">
                    {searchAnalyticsData.dailyTrend.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={searchAnalyticsData.dailyTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                          <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#64748B" />
                          <YAxis tick={{ fontSize: 11 }} stroke="#64748B" />
                          <Tooltip contentStyle={{ backgroundColor: '#0F172A', borderRadius: '12px', color: '#fff', border: 'none' }} />
                          <Legend verticalAlign="top" align="right" iconType="circle" />
                          <Area type="monotone" dataKey="queryVolume" name="Query Volume" fill="#3B82F6" stroke="#1D4ED8" fillOpacity={0.15} />
                          <Bar dataKey="searches" name="Daily Searches" fill="#6366F1" radius={[4, 4, 0, 0]} barSize={24} />
                          <Line type="monotone" dataKey="activeUsers" name="Active Searchers" stroke="#10B981" strokeWidth={3} dot={{ r: 4 }} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-sm text-slate-400 border border-dashed border-slate-200 rounded-xl">
                        No daily search trend data available yet.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {isRouteAuthorized && activeTab === 'patients' && (
            <PatientsPanel searchQuery={searchQuery} userRole={userRoleCode} onNotify={notify} refreshSignal={refreshSignal} />
          )}

          {isRouteAuthorized && (activeTab === 'doctors' || activeTab === 'appointments') && (
            <DoctorsAppointmentsPanel mode={activeTab as 'doctors' | 'appointments'} searchQuery={searchQuery} userRole={userRoleCode} onNotify={notify} refreshSignal={refreshSignal} />
          )}

          {isRouteAuthorized && activeTab === 'pharmacy' && (
            <PharmacyInventoryPanel searchQuery={searchQuery} userRole={userRoleCode} onNotify={notify} refreshSignal={refreshSignal} />
          )}

          {isRouteAuthorized && activeTab === 'billing' && (
            <BillingInsurancePanel userRole={userRoleCode} onNotify={notify} refreshSignal={refreshSignal} />
          )}

          {isRouteAuthorized && activeTab === 'operations' && (
            <OperationsIntegrationsPanel userRole={userRoleCode} onNotify={notify} refreshSignal={refreshSignal} />
          )}

          {isRouteAuthorized && activeTab === 'users_signups' && userRoleCode === 'admin' && (
            <AdminSignupsPanel
              onNotify={notify}
              refreshSignal={refreshSignal}
              onDataChanged={() => {
                if (authUser) loadAuthenticatedWorkspace(authUser);
              }}
            />
          )}

          {/* ADMISSIONS & BEDS WITH 7-DAY LINE CHART & BED TRANSFER MODAL */}
          {isRouteAuthorized && activeTab === 'beds' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">Inpatient Admissions & Bed Map</h2>
                  <p className="text-sm text-slate-500 mt-1">Atomic SQLite bed transfers with optimistic locking, cleaning compliance gates, and occupancy trend.</p>
                </div>
                <div className="flex items-center space-x-2">
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700"
                  >
                    <option value="All">All Statuses</option>
                    <option value="Available">Available</option>
                    <option value="Occupied">Occupied</option>
                    <option value="Cleaning">Cleaning</option>
                  </select>
                  <button
                    onClick={() => {
                      const occ = beds.find((b) => b.status === 'Occupied');
                      const avail = beds.find((b) => b.status === 'Available');
                      setTransferData((prev) => ({
                        ...prev,
                        fromBedId: occ ? String(occ.id) : (beds[0] ? String(beds[0].id) : ''),
                        toBedId: avail ? String(avail.id) : (beds[1] ? String(beds[1].id) : ''),
                      }));
                      setTransferModalOpen(true);
                    }}
                    className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-xs font-semibold shadow-sm"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Verify & Transfer Bed</span>
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl"><BarChart3 className="w-5 h-5" /></div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-lg">Bed Occupancy Trend (Last 7 Days)</h3>
                    <p className="text-xs text-slate-500">Hospital capacity utilization across wards</p>
                  </div>
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={bedOccupancyTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis dataKey="day" tick={{ fontSize: 12 }} stroke="#64748B" />
                      <YAxis domain={[30, 100]} tick={{ fontSize: 12 }} stroke="#64748B" />
                      <Tooltip contentStyle={{ backgroundColor: '#0F172A', borderRadius: '12px', color: '#fff', border: 'none' }} />
                      <Line type="monotone" dataKey="occupancy" stroke="#1E5EFF" strokeWidth={3} dot={{ r: 5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs">
                <h3 className="font-bold text-slate-900 text-lg mb-4">Hospital Ward Floor Map</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                  {filteredBeds.map((bed, idx) => (
                    <motion.div
                      key={bed.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, delay: idx * 0.02 }}
                      onClick={() => {
                        setSelectedBedForChange(bed);
                        setBedEditStatus(bed.status);
                      }}
                      className={`p-4 rounded-2xl border cursor-pointer hover:shadow-md transition-all ${
                        bed.status === 'Occupied' ? 'bg-blue-50/60 border-blue-200' :
                        bed.status === 'Available' ? 'bg-emerald-50/60 border-emerald-200' :
                        'bg-amber-50/60 border-amber-200'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-slate-900 text-sm">{bed.code}</span>
                        <span className="text-xs font-bold text-slate-700">{bed.status}</span>
                      </div>
                      <p className="text-xs font-semibold text-slate-700">{bed.ward}</p>
                      <p className="text-[11px] text-slate-500 mb-3">Room {bed.room} · {bed.type}</p>
                      <div className="pt-2 border-t border-slate-200/60 text-xs">
                        {bed.patient ? (
                          <span className="font-semibold text-blue-900 flex items-center gap-1">
                            <User className="w-3.5 h-3.5" /> {bed.patient}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Unassigned</span>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* SETTINGS & COMPLIANCE AUDITS */}
          {isRouteAuthorized && activeTab === 'settings' && userRoleCode === 'admin' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Settings & Compliance Audits</h2>
                <p className="text-sm text-slate-500 mt-1">Chronological SQLite audit trail, Before/After diffs, CSV/Print reporting, and live RBAC permission matrix.</p>
              </div>

              <div className="bg-white p-2 rounded-2xl border border-slate-200/80 shadow-xs flex items-center space-x-2 overflow-x-auto">
                {[
                  { id: 'logs', label: 'Activity Logs & Compliance', icon: Activity },
                  { id: 'roles', label: 'Roles & Permissions', icon: Shield },
                  { id: 'security', label: 'Security & Access', icon: Lock },
                  { id: 'general', label: 'General Preferences', icon: Globe },
                ].map((sub) => {
                  const SubIcon = sub.icon;
                  return (
                    <button
                      key={sub.id}
                      onClick={() => setSettingsSubTab(sub.id as any)}
                      className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap ${
                        settingsSubTab === sub.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      <SubIcon className="w-4 h-4" />
                      <span>{sub.label}</span>
                    </button>
                  );
                })}
              </div>

              {settingsSubTab === 'logs' && (
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
                  <div className="p-6 border-b border-slate-100 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                    <div>
                      <h3 className="font-bold text-slate-900 text-lg">Chronological Compliance Audit Trail</h3>
                      <p className="text-xs text-slate-500">
                        {isLiveRefreshActive ? `Live polling active (Refreshed at ${lastRefreshedAt})` : 'Live polling paused'}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="bg-slate-100 p-1 rounded-xl flex items-center space-x-1">
                        {[{ id: 'today', label: 'Today' }, { id: 'week', label: 'Last 7 Days' }, { id: 'all', label: 'All Logs' }].map((preset) => (
                          <button
                            key={preset.id}
                            onClick={() => handleDatePreset(preset.id)}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold ${
                              datePreset === preset.id ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center space-x-2 bg-slate-100 px-3 py-2 rounded-xl text-xs">
                        <SlidersHorizontal className="w-3.5 h-3.5 text-blue-600" />
                        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="bg-transparent font-medium" />
                        <span>to</span>
                        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="bg-transparent font-medium" />
                      </div>
                      <button
                        onClick={() => setIsLiveRefreshActive(!isLiveRefreshActive)}
                        className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-semibold border ${
                          isLiveRefreshActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                      >
                        <Radio className="w-3.5 h-3.5" />
                        <span>{isLiveRefreshActive ? 'Live: ON' : 'Live: OFF'}</span>
                      </button>
                      <button
                        onClick={() => setIsAutoScrollActive(!isAutoScrollActive)}
                        className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-semibold border ${
                          isAutoScrollActive ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                      >
                        <Clock className="w-3.5 h-3.5" />
                        <span>{isAutoScrollActive ? 'Auto-Scroll: ON' : 'Auto-Scroll: OFF'}</span>
                      </button>
                      <button onClick={() => window.print()} className="flex items-center space-x-1.5 bg-slate-800 text-white px-3.5 py-2 rounded-xl text-xs font-semibold">
                        <Printer className="w-3.5 h-3.5" /><span>Print</span>
                      </button>
                      <button onClick={handleExportCSV} className="flex items-center space-x-1.5 bg-blue-600 text-white px-3.5 py-2 rounded-xl text-xs font-semibold">
                        <Download className="w-3.5 h-3.5" /><span>Export CSV</span>
                      </button>
                    </div>
                  </div>

                  {/* Summary Counts Above Activity Logs Table */}
                  <div className="p-4 bg-slate-50/80 border-b border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-4 px-6">
                    <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 flex items-center justify-between">
                      <div>
                        <span className="text-[11px] font-semibold text-slate-500">Total Logs (In Range)</span>
                        <h4 className="text-xl font-bold text-slate-900 font-mono">{logSummaryCounts.total}</h4>
                      </div>
                      <Activity className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 flex items-center justify-between">
                      <div>
                        <span className="text-[11px] font-semibold text-slate-500">Success Logs</span>
                        <h4 className="text-xl font-bold text-emerald-600 font-mono">{logSummaryCounts.success}</h4>
                      </div>
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 flex items-center justify-between">
                      <div>
                        <span className="text-[11px] font-semibold text-slate-500">Error / Blocked Logs</span>
                        <h4 className="text-xl font-bold text-amber-600 font-mono">{logSummaryCounts.errors}</h4>
                      </div>
                      <AlertCircle className="w-4 h-4 text-amber-600" />
                    </div>
                  </div>

                  <div ref={logTableContainerRef} className="overflow-x-auto max-h-[500px] overflow-y-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold text-xs uppercase">
                          <th className="p-4 w-12 text-center">Diff</th>
                          <th className="p-4">Log ID</th>
                          <th className="p-4">Actor & Role</th>
                          <th className="p-4">Action</th>
                          <th className="p-4">Module</th>
                          <th className="p-4">Timestamp</th>
                          <th className="p-4">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        <AnimatePresence>
                          {pagedLogs.map((log, idx) => {
                            const isExpanded = !!expandedLogIds[log.id];
                            return (
                              <React.Fragment key={log.id}>
                                <motion.tr
                                  initial={{ opacity: 0, y: 10 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  exit={{ opacity: 0, y: -10 }}
                                  transition={{ duration: 0.2, delay: Math.min(idx * 0.02, 0.2) }}
                                  className={isExpanded ? 'bg-blue-50/40' : 'hover:bg-slate-50/80'}
                                >
                                  <td className="p-4 text-center">
                                    <button onClick={() => toggleRowExpansion(log.id)} className="p-1.5 rounded-lg bg-slate-100 hover:bg-blue-100">
                                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                    </button>
                                  </td>
                                  <td className="p-4 font-mono text-xs font-semibold text-blue-600">{log.id}</td>
                                  <td className="p-4 text-xs">
                                    <div className="font-semibold text-slate-900">{log.user}</div>
                                    <div className="text-slate-500">{log.role}</div>
                                  </td>
                                  <td className="p-4 text-xs font-medium text-slate-800">{log.action}</td>
                                  <td className="p-4 text-xs text-slate-700">{log.module}</td>
                                  <td className="p-4 text-xs font-mono text-slate-500">{log.timestamp}</td>
                                  <td className="p-4 text-xs font-semibold text-emerald-700">{log.status}</td>
                                </motion.tr>
                                {isExpanded && (
                                  <tr className="bg-slate-50 border-b border-slate-200">
                                    <td colSpan={7} className="p-5">
                                      <AuditDiffViewer before={log.before} after={log.after} />
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </AnimatePresence>
                      </tbody>
                    </table>
                  </div>
                  {filteredLogs.length > LOG_PAGE_SIZE && (
                    <div className="px-6 py-3 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                      <span>Showing {(logPage - 1) * LOG_PAGE_SIZE + 1}–{Math.min(logPage * LOG_PAGE_SIZE, filteredLogs.length)} of {filteredLogs.length} audit events</span>
                      <div className="flex items-center gap-1.5">
                        <button disabled={logPage <= 1} onClick={() => setLogPage((p) => Math.max(1, p - 1))} className="px-3 py-1 bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-40 rounded-lg font-semibold">Previous</button>
                        <span className="font-mono px-2">Page {logPage} / {totalLogPages}</span>
                        <button disabled={logPage >= totalLogPages} onClick={() => setLogPage((p) => Math.min(totalLogPages, p + 1))} className="px-3 py-1 bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-40 rounded-lg font-semibold">Next</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {settingsSubTab === 'roles' && rbacOverview && (
                <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-slate-900 text-lg">Complete Server-Enforced RBAC Matrix</h3>
                      <p className="text-xs text-slate-500">Toggle live role permissions or create custom hospital roles.</p>
                    </div>
                    <button onClick={() => setNewRoleOpen(true)} className="px-3.5 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5">
                      <Plus className="w-4 h-4" /> Create Role
                    </button>
                  </div>
                  <div className="space-y-3">
                    {(rbacOverview.roles || []).filter((r: any) => r.code !== 'pending_staff').map((role: any) => {
                      const assigned = new Set((rbacOverview.rolePermissions || []).filter((rp: any) => rp.role_id === role.id).map((rp: any) => rp.permission_id));
                      return (
                        <div key={role.id} className="p-4 bg-slate-50 rounded-xl border border-slate-200/60 space-y-2">
                          <div className="font-bold text-sm text-slate-900">{role.name} ({role.code})</div>
                          <div className="flex flex-wrap gap-1.5">
                            {(rbacOverview.permissions || []).map((p: any) => {
                              const on = assigned.has(p.id);
                              return (
                                <button
                                  key={p.id}
                                  onClick={() => handleToggleRolePerm(role.id, p.id)}
                                  className={`px-2 py-1 rounded-lg text-[11px] font-semibold border ${
                                    on ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200'
                                  }`}
                                >
                                  {p.code}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {(settingsSubTab === 'security' || settingsSubTab === 'general') && (
                <AdminDashboardPanel
                  section="admin_settings"
                  onNotify={notify}
                  refreshSignal={refreshSignal}
                  onDataChanged={() => {
                    if (authUser) loadAuthenticatedWorkspace(authUser);
                  }}
                />
              )}
            </div>
          )}
        </div>
      </main>

      {newRoleOpen && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleCreateRole} className="bg-white rounded-2xl max-w-md w-full p-6 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base">Create Custom Role</h3>
              <button type="button" onClick={() => setNewRoleOpen(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <input required placeholder="Role Code (e.g. compliance_officer)" value={newRoleForm.code} onChange={(e) => setNewRoleForm({ ...newRoleForm, code: e.target.value })} className="w-full px-3 py-2 bg-slate-100 rounded-xl" />
            <input required placeholder="Role Display Name" value={newRoleForm.name} onChange={(e) => setNewRoleForm({ ...newRoleForm, name: e.target.value })} className="w-full px-3 py-2 bg-slate-100 rounded-xl" />
            <input placeholder="Description" value={newRoleForm.description} onChange={(e) => setNewRoleForm({ ...newRoleForm, description: e.target.value })} className="w-full px-3 py-2 bg-slate-100 rounded-xl" />
            <label className="flex items-center gap-2 text-slate-700">
              <input type="checkbox" checked={newRoleForm.is_staff} onChange={(e) => setNewRoleForm({ ...newRoleForm, is_staff: e.target.checked })} />
              <span>Hospital Staff Role</span>
            </label>
            <button type="submit" className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-semibold">Create Role</button>
          </form>
        </div>
      )}

      {/* Unified First-Run Setup, Sign In, Sign Up & Forgot Password Modal */}
      <AuthModal
        open={authModalOpen}
        canClose={Boolean(authUser)}
        needsSetup={needsSetup}
        demoAccounts={demoAccounts}
        initialPortal={authPortal}
        onClose={() => setAuthModalOpen(false)}
        onSetupComplete={() => setNeedsSetup(false)}
        onAuthenticated={(user, message) => {
          setAuthUser(user);
          setAuthModalOpen(false);
          setActiveTab(getHomeTabForRole(user.role));
          setDoctorWizardOpen(Boolean(user.role === 'doctor' && !user.schedule_configured));
          notify(message, 'success');
          loadAuthenticatedWorkspace(user);
        }}
      />

      <DoctorScheduleWizardModal
        open={doctorWizardOpen}
        onClose={() => setDoctorWizardOpen(false)}
        onNotify={notify}
        onCompleted={() => {
          setDoctorWizardOpen(false);
          setAuthUser((prev) => (prev ? { ...prev, schedule_configured: 1 } : prev));
          if (authUser) loadAuthenticatedWorkspace(authUser);
        }}
      />

      {/* Bed Status Update Modal */}
      {selectedBedForChange && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-slate-100 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg text-slate-900">Update Bed Status</h3>
                <p className="text-xs text-blue-600 font-semibold">{selectedBedForChange.code} — {selectedBedForChange.ward}</p>
              </div>
              <button onClick={() => setSelectedBedForChange(null)} className="p-1 text-slate-400"><X className="w-5 h-5" /></button>
            </div>
            <select
              value={bedEditStatus}
              onChange={(e) => setBedEditStatus(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-100 rounded-xl text-sm"
            >
              <option value="Available">Available</option>
              <option value="Occupied">Occupied</option>
              <option value="Cleaning">Cleaning</option>
              <option value="Maintenance">Maintenance</option>
            </select>
            <div className="flex space-x-3">
              <button onClick={() => setSelectedBedForChange(null)} className="flex-1 py-2.5 bg-slate-100 text-slate-700 font-semibold text-sm rounded-xl">Cancel</button>
              <button onClick={handleUpdateBedStatus} className="flex-1 py-2.5 bg-blue-600 text-white font-semibold text-sm rounded-xl">Save Status</button>
            </div>
          </div>
        </div>
      )}

      {/* Formal Bed Transfer Verification Modal */}
      {transferModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 border border-slate-100 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg text-slate-900">Bed Transfer Verification</h3>
                <p className="text-xs text-slate-500">Executes transactional bed transfer & logs compliance audit diff</p>
              </div>
              <button onClick={() => setTransferModalOpen(false)} className="p-1 text-slate-400"><X className="w-5 h-5" /></button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Origin Bed</label>
                <select
                  value={transferData.fromBedId}
                  onChange={(e) => setTransferData({ ...transferData, fromBedId: e.target.value })}
                  className="w-full px-3 py-2.5 bg-slate-100 rounded-xl text-xs font-semibold"
                >
                  {beds.map((b) => (
                    <option key={b.id} value={b.id}>{b.code} ({b.status}{b.patient ? ` - ${b.patient}` : ''})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Destination Bed</label>
                <select
                  value={transferData.toBedId}
                  onChange={(e) => setTransferData({ ...transferData, toBedId: e.target.value })}
                  className="w-full px-3 py-2.5 bg-slate-100 rounded-xl text-xs font-semibold"
                >
                  {beds.map((b) => (
                    <option key={b.id} value={b.id}>{b.code} ({b.ward} - {b.status})</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Mandatory Reason for Transfer</label>
              <select
                value={transferData.reason}
                onChange={(e) => setTransferData({ ...transferData, reason: e.target.value })}
                className="w-full px-3 py-2.5 bg-slate-100 rounded-xl text-xs font-semibold"
              >
                <option value="Condition Worsened (Requires ICU / Specialized Care)">Condition Worsened (Requires ICU / Specialized Care)</option>
                <option value="Ward Upgrade Requested by Family">Ward Upgrade Requested by Family</option>
                <option value="Post-Surgery Recovery & Step-Down">Post-Surgery Recovery & Step-Down</option>
                <option value="Infection Control & Isolation Protocol">Infection Control & Isolation Protocol</option>
                <option value="Attending Physician Direct Order">Attending Physician Direct Order</option>
              </select>
            </div>

            <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-xs text-amber-800 flex items-start space-x-2">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>Origin bed must hold an active admission and destination bed must be Available. Occupied destinations are rejected server-side with HTTP 409.</span>
            </div>

            <div className="flex space-x-3 pt-2">
              <button onClick={() => setTransferModalOpen(false)} className="flex-1 py-2.5 bg-slate-100 text-slate-700 font-semibold text-sm rounded-xl">Cancel</button>
              <button onClick={handleExecuteBedTransfer} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl">
                Verify & Execute Transfer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
