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
import { AuthModal } from './components/AuthModal';
import { AdminSignupsPanel } from './components/AdminSignupsPanel';
import { DoctorScheduleWizardModal } from './components/DoctorScheduleWizardModal';
import { CandidateCareersPanel } from './components/CandidateCareersPanel';

interface AuthUser {
  id: number;
  user_code: string;
  email: string;
  full_name: string;
  role: string;
  role_name: string;
  permissions: string[];
  schedule_configured?: number | boolean;
  doctor_id?: number;
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
  const [needsSetup, setNeedsSetup] = useState(false);
  const [demoAccounts, setDemoAccounts] = useState<any[]>([]);
  const [pendingSignupsCount, setPendingSignupsCount] = useState(0);
  const [doctorWizardOpen, setDoctorWizardOpen] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);

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
              status: String(al.action || '').includes('fail') || String(al.action || '').includes('blocked') ? 'Error' : 'Success',
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
          if (res.user.role === 'candidate') setActiveTab('careers');
          if (res.user.role === 'doctor' && !res.user.schedule_configured) setDoctorWizardOpen(true);
          loadAuthenticatedWorkspace(res.user);
        }
      })
      .catch(() => {
        setAuthModalOpen(true);
      });
  }, [loadAuthenticatedWorkspace]);

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
      setActiveTab(res.user.role === 'candidate' ? 'careers' : 'dashboard');
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

  // Role-gated navigation definition driven by authenticated permissions
  const navigationItems = useMemo(() => {
    if (userRoleCode === 'candidate') {
      return [{ id: 'careers', label: 'Careers & Applications', icon: Briefcase }];
    }
    const perms = new Set(authUser?.permissions || []);
    const items: Array<{ id: string; label: string; icon: any; badge?: number }> = [
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
      items.push({ id: 'pharmacy', label: 'Pharmacy, Lab & Blood', icon: Pill });
    }
    if (perms.has('finance.manage') || perms.has('insurance.manage') || userRoleCode === 'patient') {
      items.push({ id: 'billing', label: 'Billing & Insurance', icon: CreditCard });
    }
    if (['admin', 'hr', 'publisher', 'approver', 'accountant', 'receptionist', 'external_coordinator'].includes(userRoleCode)) {
      items.push({ id: 'operations', label: 'HR & Integrations', icon: Briefcase });
    }
    if (userRoleCode === 'admin') {
      items.push({ id: 'users_signups', label: 'Users & Signups', icon: UserCheck, badge: pendingSignupsCount });
      items.push({ id: 'settings', label: 'Compliance & RBAC', icon: Settings, badge: activityLogs.length });
    }
    return items;
  }, [authUser, userRoleCode, userRoleLabel, beds, activityLogs.length, pendingSignupsCount]);

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
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
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
              <div className="overflow-hidden">
                <p className="text-sm font-semibold text-slate-900 truncate">{authUser.full_name}</p>
                <p className="text-xs text-slate-500 truncate">{authUser.role_name} · {authUser.user_code}</p>
              </div>
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
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs text-blue-900">
                <strong>Authentication Required for Live SQLite Sync:</strong> Sign in with a hospital account to load live database records and open a WebSocket channel.
              </div>
              <button
                onClick={() => setAuthModalOpen(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold shrink-0"
              >
                Open Sign-In Portal
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

          {/* CANDIDATE PORTAL */}
          {activeTab === 'careers' && userRoleCode === 'candidate' && (
            <CandidateCareersPanel onNotify={notify} refreshSignal={refreshSignal} />
          )}

          {/* DASHBOARD */}
          {activeTab === 'dashboard' && userRoleCode !== 'candidate' && (
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

          {activeTab === 'patients' && (
            <PatientsPanel searchQuery={searchQuery} userRole={userRoleCode} onNotify={notify} refreshSignal={refreshSignal} />
          )}

          {(activeTab === 'doctors' || activeTab === 'appointments') && (
            <DoctorsAppointmentsPanel mode={activeTab as 'doctors' | 'appointments'} searchQuery={searchQuery} userRole={userRoleCode} onNotify={notify} refreshSignal={refreshSignal} />
          )}

          {activeTab === 'pharmacy' && (
            <ClinicalDiagnosticsPanel searchQuery={searchQuery} userRole={userRoleCode} onNotify={notify} refreshSignal={refreshSignal} />
          )}

          {activeTab === 'billing' && (
            <BillingInsurancePanel userRole={userRoleCode} onNotify={notify} refreshSignal={refreshSignal} />
          )}

          {activeTab === 'operations' && (
            <OperationsIntegrationsPanel userRole={userRoleCode} onNotify={notify} refreshSignal={refreshSignal} />
          )}

          {activeTab === 'users_signups' && userRoleCode === 'admin' && (
            <AdminSignupsPanel
              onNotify={notify}
              refreshSignal={refreshSignal}
              onDataChanged={() => {
                if (authUser) loadAuthenticatedWorkspace(authUser);
              }}
            />
          )}

          {/* ADMISSIONS & BEDS WITH 7-DAY LINE CHART & BED TRANSFER MODAL */}
          {activeTab === 'beds' && (
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
          {activeTab === 'settings' && (
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
                          {filteredLogs.map((log, idx) => {
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
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                          <div className="text-xs font-bold text-amber-800 mb-1 flex items-center gap-1"><Code className="w-3.5 h-3.5" /> Before State</div>
                                          <pre className="bg-slate-950 text-emerald-400 p-3 rounded-lg text-xs font-mono overflow-x-auto">{JSON.stringify(log.before, null, 2)}</pre>
                                        </div>
                                        <div>
                                          <div className="text-xs font-bold text-emerald-800 mb-1 flex items-center gap-1"><Code className="w-3.5 h-3.5" /> After State</div>
                                          <pre className="bg-slate-950 text-emerald-400 p-3 rounded-lg text-xs font-mono overflow-x-auto">{JSON.stringify(log.after, null, 2)}</pre>
                                        </div>
                                      </div>
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
                </div>
              )}

              {settingsSubTab === 'roles' && rbacOverview && (
                <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
                  <h3 className="font-bold text-slate-900 text-lg">Server-Enforced RBAC Matrix</h3>
                  <div className="space-y-3">
                    {(rbacOverview.roles || []).filter((r: any) => r.code !== 'pending_staff').slice(0, 8).map((role: any) => {
                      const assigned = new Set((rbacOverview.rolePermissions || []).filter((rp: any) => rp.role_id === role.id).map((rp: any) => rp.permission_id));
                      return (
                        <div key={role.id} className="p-4 bg-slate-50 rounded-xl border border-slate-200/60 space-y-2">
                          <div className="font-bold text-sm text-slate-900">{role.name} ({role.code})</div>
                          <div className="flex flex-wrap gap-2">
                            {(rbacOverview.permissions || []).slice(0, 12).map((p: any) => {
                              const on = assigned.has(p.id);
                              return (
                                <button
                                  key={p.id}
                                  onClick={() => handleToggleRolePerm(role.id, p.id)}
                                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${
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
                <div className="bg-white rounded-2xl border border-slate-200/80 p-8 text-center shadow-xs">
                  <Shield className="w-10 h-10 text-blue-600 mx-auto mb-3" />
                  <h3 className="text-lg font-bold text-slate-900 capitalize">{settingsSubTab} Policy Enforcement</h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-lg mx-auto">
                    CSRF headers, HMAC webhook signature validation, parameterized SQLite queries, and JWT session rotation are enforced on the Express backend.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Unified First-Run Setup, Sign In, Sign Up & Forgot Password Modal */}
      <AuthModal
        open={authModalOpen}
        canClose={Boolean(authUser)}
        needsSetup={needsSetup}
        demoAccounts={demoAccounts}
        onClose={() => setAuthModalOpen(false)}
        onSetupComplete={() => setNeedsSetup(false)}
        onAuthenticated={(user, message) => {
          setAuthUser(user);
          setAuthModalOpen(false);
          setActiveTab(user.role === 'candidate' ? 'careers' : 'dashboard');
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
