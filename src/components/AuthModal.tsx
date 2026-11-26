import React, { useEffect, useState } from 'react';
import {
  X,
  AlertCircle,
  CheckCircle2,
  KeyRound,
  ShieldCheck,
  Eye,
  EyeOff,
  User,
  Stethoscope,
  Shield,
  Briefcase,
  Megaphone,
  ClipboardCheck,
  Lock,
  Building2,
  UserPlus,
} from 'lucide-react';
import { apiRequest, setAccessToken } from '../lib/api';

const CONSENT_VERSION = 'v2.0';
const CONSENT_TEXT =
  'I consent to MediCore HMS storing and processing my personal identity, care records, and appointments under hospital privacy safeguards.';

export type LoginPortalType =
  | 'patient'
  | 'staff'
  | 'admin'
  | 'department_admin'
  | 'hr'
  | 'publisher'
  | 'approver'
  | 'hr_publisher';

export type HrPubSubRole = 'hr' | 'publisher' | 'approver';
export type AccountTypeOption = 'patient' | 'candidate' | 'doctor' | 'staff';

interface AuthModalProps {
  open: boolean;
  canClose: boolean;
  needsSetup: boolean;
  demoAccounts: any[];
  initialPortal?: LoginPortalType;
  initialTab?: 'login' | 'register';
  initialAccountType?: AccountTypeOption;
  onClose: () => void;
  onAuthenticated: (user: any, message: string) => void;
  onSetupComplete: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  open,
  canClose,
  needsSetup,
  demoAccounts,
  initialPortal = 'patient',
  initialTab = 'login',
  initialAccountType,
  onClose,
  onAuthenticated,
  onSetupComplete,
}) => {
  const [tab, setTab] = useState<'login' | 'register' | 'forgot'>(initialTab);
  const [portal, setPortal] = useState<LoginPortalType>(initialPortal);
  const [patientSubRole, setPatientSubRole] = useState<'patient' | 'candidate'>('patient');
  const [hrPubRole, setHrPubRole] = useState<HrPubSubRole>('hr');

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // First-run setup
  const [setupForm, setSetupForm] = useState({ full_name: '', email: '', mobile: '', password: '', confirm: '' });
  const [showSetupPass, setShowSetupPass] = useState(false);

  // Login
  const [loginId, setLoginId] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPass, setShowLoginPass] = useState(false);
  const [remember, setRemember] = useState(true);

  // Forgot password
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotStage2, setForgotStage2] = useState(false);
  const [resetCode, setResetCode] = useState('');
  const [resetNewPass, setResetNewPass] = useState('');
  const [showResetPass, setShowResetPass] = useState(false);

  // Registration Metadata
  const [regMeta, setRegMeta] = useState<{
    staffRoles: any[];
    departments: any[];
    branches: any[];
    specialties: any[];
    isDemoVerificationMode?: boolean;
    demoAdminVerificationLabel?: string | null;
  }>({
    staffRoles: [],
    departments: [],
    branches: [],
    specialties: [],
    isDemoVerificationMode: false,
    demoAdminVerificationLabel: null,
  });

  const [accountType, setAccountType] = useState<AccountTypeOption>('patient');
  const [showRegPass, setShowRegPass] = useState(false);
  const [reg, setReg] = useState({
    full_name: '',
    email: '',
    mobile: '',
    password: '',
    confirm: '',
    dob: '1992-04-15',
    gender: 'Female',
    address: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    consent: true,
    requested_role: 'nurse',
    branch_id: '',
    department_id: '',
    specialty_id: '',
    employee_id: '',
    designation: '',
    verification_code: '',
    qualification: '',
    medical_registration_number: '',
    medical_council: '',
    experience_years: '5',
    consultation_fee: '100',
  });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [licenceFile, setLicenceFile] = useState<File | null>(null);
  const [staffDocFile, setStaffDocFile] = useState<File | null>(null);

  // Optional OTP
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpHint, setOtpHint] = useState<string | null>(null);

  useEffect(() => {
    setPortal(initialPortal);
    if (initialPortal === 'admin' || initialPortal === 'department_admin') {
      setTab('login');
    }
    if (initialPortal === 'hr') setHrPubRole('hr');
    if (initialPortal === 'publisher') setHrPubRole('publisher');
    if (initialPortal === 'approver') setHrPubRole('approver');
  }, [initialPortal]);

  useEffect(() => {
    if (!open) return;
    if (initialPortal === 'admin' || initialPortal === 'department_admin' || portal === 'admin' || portal === 'department_admin') {
      setTab('login');
    } else {
      setTab(initialTab);
    }
    setErrorMsg(null);
    setSuccessMsg(null);
    setAccountType(initialAccountType || 'patient');
  }, [open, initialTab, initialAccountType, initialPortal, portal]);

  useEffect(() => {
    if (!open || needsSetup) return;
    apiRequest('/api/auth/registration-meta')
      .then((meta) => {
        setRegMeta({
          staffRoles: (meta.staffRoles || []).filter((r: any) => r.code !== 'doctor' && r.code !== 'admin' && r.code !== 'department_admin'),
          departments: meta.departments || [],
          branches: meta.branches || [],
          specialties: meta.specialties || [],
          isDemoVerificationMode: Boolean(meta.isDemoVerificationMode),
          demoAdminVerificationLabel: meta.demoAdminVerificationLabel || null,
        });
        setReg((prev) => ({
          ...prev,
          branch_id: prev.branch_id || String(meta.branches?.[0]?.id || 1),
          department_id: prev.department_id || String(meta.departments?.[0]?.id || ''),
          specialty_id: prev.specialty_id || String(meta.specialties?.[0]?.id || ''),
          requested_role:
            prev.requested_role ||
            String((meta.staffRoles || []).find((r: any) => r.code !== 'doctor' && r.code !== 'admin')?.code || 'nurse'),
        }));
      })
      .catch(() => {});
  }, [open, needsSetup]);

  if (!open) return null;

  const submitSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (setupForm.password !== setupForm.confirm) {
      setErrorMsg('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const res = await apiRequest('/api/auth/setup-admin', {
        method: 'POST',
        body: {
          full_name: setupForm.full_name,
          email: setupForm.email,
          mobile: setupForm.mobile,
          password: setupForm.password,
        },
      });
      setAccessToken(res.token || res.accessToken);
      onSetupComplete();
      onAuthenticated(res.user, `Initial administrator ${res.user.full_name} created.`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Administrator setup failed.');
    } finally {
      setBusy(false);
    }
  };

  const submitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setBusy(true);
    try {
      const payload: Record<string, any> = {
        identifier: loginId.trim(),
        password: loginPassword,
        remember,
        expected_portal: portal,
      };
      if (portal === 'patient') {
        payload.expected_role = patientSubRole;
      } else if (portal === 'admin') {
        payload.expected_role = 'admin';
      } else if (portal === 'department_admin') {
        payload.expected_role = 'department_admin';
      } else if (portal === 'hr') {
        payload.expected_role = 'hr';
      } else if (portal === 'publisher') {
        payload.expected_role = 'publisher';
      } else if (portal === 'approver') {
        payload.expected_role = 'approver';
      } else if (portal === 'hr_publisher') {
        payload.expected_role = hrPubRole;
      }

      const res = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: payload,
      });
      if (portal === 'admin' && res.user?.role !== 'admin') {
        await apiRequest('/api/auth/logout', { method: 'POST' }).catch(() => {});
        setAccessToken(null);
        setErrorMsg('You do not have admin access.');
        return;
      }
      setAccessToken(res.token || res.accessToken);
      onAuthenticated(res.user, `Signed in as ${res.user.full_name} (${res.user.role_name}).`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Sign in failed.');
    } finally {
      setBusy(false);
    }
  };

  const sendOtp = async () => {
    setErrorMsg(null);
    if (!reg.email.trim()) {
      setErrorMsg('Enter your email address before requesting a verification code.');
      return;
    }
    try {
      const res = await apiRequest('/api/auth/send-otp', {
        method: 'POST',
        body: { channel: 'email', target: reg.email.trim(), purpose: 'signup' },
      });
      setOtpSent(true);
      setOtpHint(res.sandboxCode ? `Dev OTP: ${res.sandboxCode}` : 'Verification code sent to email.');
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not send OTP.');
    }
  };

  const verifyOtp = async () => {
    setErrorMsg(null);
    try {
      await apiRequest('/api/auth/verify-otp', {
        method: 'POST',
        body: { channel: 'email', target: reg.email.trim(), code: otpCode.trim(), purpose: 'signup' },
      });
      setOtpVerified(true);
      setOtpHint('Email verified.');
    } catch (err: any) {
      setErrorMsg(err.message || 'Invalid verification code.');
    }
  };

  const submitRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    if (reg.password !== reg.confirm) {
      setErrorMsg('Passwords do not match.');
      return;
    }
    if (reg.password.length < 8 || !/\d/.test(reg.password)) {
      setErrorMsg('Password must be at least 8 characters and include a number.');
      return;
    }

    if (accountType === 'patient' && !reg.consent) {
      setErrorMsg('Please accept the hospital privacy consent terms.');
      return;
    }

    setBusy(true);
    try {
      const hasFile = Boolean((accountType === 'doctor' && (photoFile || licenceFile)) || (accountType === 'staff' && staffDocFile));
      let body: any;
      if (hasFile) {
        const fd = new FormData();
        fd.append('account_type', accountType);
        fd.append('full_name', reg.full_name.trim());
        fd.append('email', reg.email.trim());
        fd.append('mobile', reg.mobile.trim());
        fd.append('password', reg.password);
        if (otpVerified) fd.append('otp_verified', 'true');
        if (accountType === 'doctor') {
          fd.append('requested_role', 'doctor');
          fd.append('medical_registration_number', reg.medical_registration_number.trim());
          fd.append('medical_council', reg.medical_council.trim());
          fd.append('branch_id', reg.branch_id);
          fd.append('department_id', reg.department_id);
          fd.append('specialty_id', reg.specialty_id);
          fd.append('qualification', reg.qualification.trim());
          fd.append('experience_years', reg.experience_years);
          fd.append('consultation_fee', reg.consultation_fee);
          if (photoFile) fd.append('photo', photoFile);
          if (licenceFile) fd.append('licence', licenceFile);
        } else if (accountType === 'staff') {
          fd.append('requested_role', reg.requested_role);
          fd.append('branch_id', reg.branch_id);
          fd.append('department_id', reg.department_id);
          fd.append('employee_id', reg.employee_id.trim());
          fd.append('qualification', reg.qualification.trim());
          if (staffDocFile) fd.append('document_file', staffDocFile);
        }
        body = fd;
      } else {
        body = {
          account_type: accountType,
          full_name: reg.full_name.trim(),
          email: reg.email.trim(),
          mobile: reg.mobile.trim(),
          password: reg.password,
          otp_verified: otpVerified,
          ...(accountType === 'patient'
            ? {
                dob: reg.dob,
                gender: reg.gender,
                address: reg.address || 'Not provided',
                emergency_contact_name: reg.emergency_contact_name,
                emergency_contact_phone: reg.emergency_contact_phone,
                consent: reg.consent,
                consent_text: CONSENT_TEXT,
                consent_version: CONSENT_VERSION,
              }
            : {}),
          ...(accountType === 'doctor'
            ? {
                requested_role: 'doctor',
                medical_registration_number: reg.medical_registration_number.trim(),
                medical_council: reg.medical_council.trim(),
                branch_id: reg.branch_id ? Number(reg.branch_id) : 1,
                department_id: reg.department_id ? Number(reg.department_id) : undefined,
                specialty_id: reg.specialty_id ? Number(reg.specialty_id) : undefined,
                qualification: reg.qualification.trim(),
                experience_years: Number(reg.experience_years || 5),
                consultation_fee: Number(reg.consultation_fee || 100),
              }
            : {}),
          ...(accountType === 'staff'
            ? {
                requested_role: reg.requested_role,
                branch_id: reg.branch_id ? Number(reg.branch_id) : 1,
                department_id: reg.department_id ? Number(reg.department_id) : undefined,
                employee_id: reg.employee_id.trim(),
                qualification: reg.qualification.trim(),
              }
            : {}),
        };
      }

      const res = await apiRequest('/api/auth/register', { method: 'POST', body });
      if (res.pendingApproval || res.pendingVerification) {
        setSuccessMsg(res.message);
        return;
      }
      setAccessToken(res.token || res.accessToken);
      onAuthenticated(res.user, `Welcome ${res.user.full_name}! Account ${res.user.user_code} created.`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Registration failed.');
    } finally {
      setBusy(false);
    }
  };

  const submitForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await apiRequest('/api/auth/forgot-password', {
        method: 'POST',
        body: { email: forgotEmail.trim() },
      });
      setForgotStage2(true);
      setSuccessMsg(res.demoResetCode ? `${res.message} Code: ${res.demoResetCode}` : res.message);
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not process request.');
    }
  };

  const submitReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    try {
      const res = await apiRequest('/api/auth/reset-password', {
        method: 'POST',
        body: { email: forgotEmail.trim(), code: resetCode.trim(), new_password: resetNewPass },
      });
      setSuccessMsg(res.message || 'Password updated. Please sign in.');
      setForgotStage2(false);
      setTab('login');
    } catch (err: any) {
      setErrorMsg(err.message || 'Password reset failed.');
    }
  };

  const PORTAL_CARDS: Array<{ id: LoginPortalType; title: string; subtitle: string; icon: any; accent: string }> = [
    { id: 'patient', title: 'Patient / Candidate', subtitle: 'EHR & Careers', icon: User, accent: 'text-cyan-700 bg-cyan-50 border-cyan-200' },
    { id: 'staff', title: 'Hospital Staff', subtitle: 'Doctors & Clinical Ops', icon: Stethoscope, accent: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
    { id: 'hr', title: 'HR Login', subtitle: 'Workforce & Hiring', icon: Briefcase, accent: 'text-blue-700 bg-blue-50 border-blue-200' },
    { id: 'department_admin', title: 'Department Admin', subtitle: 'Scoped Dept Operations', icon: Building2, accent: 'text-indigo-700 bg-indigo-50 border-indigo-200' },
    { id: 'admin', title: 'Admin', subtitle: 'System Admin & RBAC', icon: Shield, accent: 'text-slate-900 bg-slate-100 border-slate-300' },
    { id: 'publisher', title: 'Publisher', subtitle: 'Notices & Campaigns', icon: Megaphone, accent: 'text-purple-700 bg-purple-50 border-purple-200' },
    { id: 'approver', title: 'Approver', subtitle: 'Compliance Sign-off', icon: ClipboardCheck, accent: 'text-amber-700 bg-amber-50 border-amber-200' },
  ];

  const portalHeading =
    portal === 'admin'
      ? 'Admin Secure Login'
      : portal === 'department_admin'
      ? 'Department Admin Secure Login'
      : portal === 'hr'
      ? 'HR / Workforce Portal Login'
      : portal === 'publisher'
      ? 'Publisher Portal Login'
      : portal === 'approver'
      ? 'Approver Portal Login'
      : portal === 'hr_publisher'
      ? hrPubRole === 'hr'
        ? 'HR / Hiring Team Login'
        : hrPubRole === 'publisher'
        ? 'Publisher Login'
        : 'Approver Login'
      : portal === 'staff'
      ? 'Hospital Staff Portal Login'
      : patientSubRole === 'candidate'
      ? 'Candidate Careers Login'
      : 'Patient Portal Login';

  const identifierPlaceholder =
    portal === 'admin'
      ? 'admin@hospital.org'
      : portal === 'department_admin'
      ? 'Department Admin Email or Employee ID'
      : portal === 'hr' || portal === 'publisher' || portal === 'approver'
      ? `${portal.toUpperCase()} Email or Employee ID`
      : portal === 'hr_publisher'
      ? `${hrPubRole.toUpperCase()} ID or Work Email`
      : portal === 'staff'
      ? 'Employee / Staff ID or Work Email'
      : patientSubRole === 'candidate'
      ? 'Candidate ID or Email'
      : 'Patient ID (PT-...) or Email';

  return (
    <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-6 border border-slate-100 space-y-4 my-8 max-h-[94vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-lg text-slate-900">
              {needsSetup
                ? 'Initial Hospital Administrator Setup'
                : tab === 'login'
                ? portalHeading
                : tab === 'register'
                ? 'Create Account'
                : 'Reset Password'}
            </h3>
            <p className="text-xs text-slate-500">
              {needsSetup
                ? 'Create the first Administrator account to initialize your hospital instance'
                : 'Department-aware hospital authentication & role-protected portal access'}
            </p>
          </div>
          {canClose && (
            <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600" aria-label="Close">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {!needsSetup && portal !== 'admin' && portal !== 'department_admin' && (
          <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              data-testid="tab-signin"
              onClick={() => {
                setTab('login');
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              className={`py-2 rounded-lg text-xs font-semibold ${
                tab === 'login' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              data-testid="tab-create-account"
              onClick={() => {
                setTab('register');
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              className={`py-2 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 ${
                tab === 'register' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" /> Create Account
            </button>
          </div>
        )}

        {errorMsg && (
          <div role="alert" className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{successMsg}</span>
          </div>
        )}

        {needsSetup ? (
          <form onSubmit={submitSetup} className="space-y-3">
            <input
              required
              value={setupForm.full_name}
              onChange={(e) => setSetupForm({ ...setupForm, full_name: e.target.value })}
              placeholder="Administrator Full Name"
              className="w-full px-3.5 py-2.5 bg-slate-100 rounded-xl text-sm"
            />
            <input
              required
              type="email"
              value={setupForm.email}
              onChange={(e) => setSetupForm({ ...setupForm, email: e.target.value })}
              placeholder="Administrator Email"
              className="w-full px-3.5 py-2.5 bg-slate-100 rounded-xl text-sm"
            />
            <input
              value={setupForm.mobile}
              onChange={(e) => setSetupForm({ ...setupForm, mobile: e.target.value })}
              placeholder="Mobile Number (optional)"
              className="w-full px-3.5 py-2.5 bg-slate-100 rounded-xl text-sm"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="relative">
                <input
                  required
                  type={showSetupPass ? 'text' : 'password'}
                  minLength={8}
                  value={setupForm.password}
                  onChange={(e) => setSetupForm({ ...setupForm, password: e.target.value })}
                  placeholder="Password (8+ chars, 1 number)"
                  className="w-full pl-3.5 pr-9 py-2.5 bg-slate-100 rounded-xl text-sm"
                />
                <button type="button" onClick={() => setShowSetupPass(!showSetupPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                  {showSetupPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <input
                required
                type={showSetupPass ? 'text' : 'password'}
                minLength={8}
                value={setupForm.confirm}
                onChange={(e) => setSetupForm({ ...setupForm, confirm: e.target.value })}
                placeholder="Confirm Password"
                className="w-full px-3.5 py-2.5 bg-slate-100 rounded-xl text-sm"
              />
            </div>
            <button disabled={busy} type="submit" className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl">
              Create Administrator Account
            </button>
          </form>
        ) : tab === 'login' ? (
          <>
            {/* Dedicated Role-Based Login Portals */}
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Select Role Login Portal
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {PORTAL_CARDS.map((card) => {
                  const Icon = card.icon;
                  const active = portal === card.id;
                  return (
                    <button
                      key={card.id}
                      type="button"
                      data-testid={`portal-${card.id}`}
                      onClick={() => {
                        setPortal(card.id);
                        if (card.id === 'admin' || card.id === 'department_admin') {
                          setTab('login');
                        }
                        setErrorMsg(null);
                      }}
                      className={`p-2.5 rounded-xl border text-left transition-all ${
                        active
                          ? 'border-blue-600 bg-blue-50/70 ring-2 ring-blue-600/20'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center mb-1.5 border ${card.accent}`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div className="font-bold text-xs text-slate-900 leading-tight">{card.title}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5 leading-tight">{card.subtitle}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {portal === 'patient' && (
              <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200 text-xs">
                <button
                  type="button"
                  onClick={() => setPatientSubRole('patient')}
                  className={`flex-1 py-1.5 rounded-lg font-semibold ${
                    patientSubRole === 'patient' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Patient Account
                </button>
                <button
                  type="button"
                  onClick={() => setPatientSubRole('candidate')}
                  className={`flex-1 py-1.5 rounded-lg font-semibold ${
                    patientSubRole === 'candidate' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Job Applicant / Candidate
                </button>
              </div>
            )}

            {portal === 'hr_publisher' && (
              <div className="p-2.5 bg-indigo-50/60 border border-indigo-200 rounded-xl space-y-1.5">
                <p className="text-[11px] font-semibold text-indigo-900">Select HR / Publisher Role:</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'hr', label: 'HR / Hiring Team', icon: Briefcase },
                    { id: 'publisher', label: 'Publisher', icon: Megaphone },
                    { id: 'approver', label: 'Approver', icon: ClipboardCheck },
                  ].map((sub) => {
                    const SubIcon = sub.icon;
                    const active = hrPubRole === sub.id;
                    return (
                      <button
                        key={sub.id}
                        type="button"
                        data-testid={`subrole-${sub.id}`}
                        onClick={() => {
                          setHrPubRole(sub.id as HrPubSubRole);
                          setErrorMsg(null);
                        }}
                        className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-semibold border transition-all ${
                          active
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-indigo-50'
                        }`}
                      >
                        <SubIcon className="w-3.5 h-3.5" />
                        <span className="truncate">{sub.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {(portal === 'admin' || portal === 'department_admin') && (
              <div className="p-2.5 bg-slate-900 text-white rounded-xl flex items-center gap-2.5 text-xs">
                <Lock className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  {portal === 'department_admin'
                    ? 'Department Admin Entry: Access is strictly scoped to your assigned hospital department.'
                    : 'Super Admin Entry: Full governance across all hospital departments, RBAC & audit logs.'}
                </span>
              </div>
            )}

            <form onSubmit={submitLogin} className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  {portal === 'admin'
                    ? 'Admin Email Address'
                    : portal === 'department_admin'
                    ? 'Email Address or Employee ID'
                    : 'Email, Employee ID or User ID'}
                </label>
                <input
                  required
                  type={portal === 'admin' ? 'email' : 'text'}
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  placeholder={identifierPlaceholder}
                  className="w-full px-3.5 py-2.5 bg-slate-100 rounded-xl text-sm"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Password</label>
                <div className="relative">
                  <input
                    required
                    type={showLoginPass ? 'text' : 'password'}
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full pl-3.5 pr-10 py-2.5 bg-slate-100 rounded-xl text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPass(!showLoginPass)}
                    aria-label={showLoginPass ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
                  >
                    {showLoginPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs">
                <label className="flex items-center gap-2 text-slate-600 cursor-pointer">
                  <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                  Remember Me
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setTab('forgot');
                    setErrorMsg(null);
                    setSuccessMsg(null);
                  }}
                  className="text-blue-600 font-semibold hover:underline"
                >
                  Forgot Password?
                </button>
              </div>
              <button
                disabled={busy}
                type="submit"
                className={`w-full py-2.5 font-semibold text-sm rounded-xl text-white flex items-center justify-center gap-2 ${
                  portal === 'admin'
                    ? 'bg-slate-900 hover:bg-slate-800'
                    : portal === 'department_admin'
                    ? 'bg-indigo-600 hover:bg-indigo-700'
                    : portal === 'hr' || portal === 'publisher' || portal === 'approver' || portal === 'hr_publisher'
                    ? 'bg-indigo-600 hover:bg-indigo-700'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {(portal === 'admin' || portal === 'department_admin') && <Lock className="w-4 h-4" />}
                <span>
                  {busy
                    ? 'Authenticating...'
                    : portal === 'admin' || portal === 'department_admin'
                    ? 'Secure Login'
                    : 'Sign In'}
                </span>
              </button>
            </form>

            {demoAccounts.length > 0 && (
              <div className="pt-3 border-t border-slate-100">
                <p className="text-[11px] font-semibold text-slate-500 mb-2">Quick Portal Sign-In (Staging/Demo Mode)</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-36 overflow-y-auto">
                  {demoAccounts.slice(0, 20).map((acc) => (
                    <button
                      key={acc.email}
                      type="button"
                      onClick={async () => {
                        setErrorMsg(null);
                        try {
                          const res = await apiRequest('/api/auth/login', {
                            method: 'POST',
                            body: { identifier: acc.email, password: acc.password, remember: true },
                          });
                          setAccessToken(res.token || res.accessToken);
                          onAuthenticated(res.user, `Signed in as ${res.user.full_name}.`);
                        } catch (err: any) {
                          setErrorMsg(err.message || 'Demo login failed.');
                        }
                      }}
                      className="p-2 text-left bg-slate-50 hover:bg-blue-50 border border-slate-200 rounded-xl text-[11px]"
                    >
                      <div className="font-bold text-slate-900 truncate">{acc.label}</div>
                      <div className="text-slate-500 truncate">{acc.name}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : tab === 'forgot' ? (
          <div className="space-y-4">
            <form onSubmit={submitForgot} className="space-y-3">
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <KeyRound className="w-4 h-4 text-blue-600" />
                <span>Enter your registered email to receive password reset instructions.</span>
              </div>
              <input
                required
                type="email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="Account email"
                className="w-full px-3.5 py-2.5 bg-slate-100 rounded-xl text-sm"
              />
              <button type="submit" className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-xs font-semibold">
                Send Reset Instructions
              </button>
            </form>
            {forgotStage2 && (
              <form onSubmit={submitReset} className="space-y-3 pt-3 border-t border-slate-100">
                <input
                  required
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value)}
                  placeholder="6-digit Reset Code"
                  className="w-full px-3.5 py-2.5 bg-slate-100 rounded-xl text-sm"
                />
                <div className="relative">
                  <input
                    required
                    type={showResetPass ? 'text' : 'password'}
                    minLength={8}
                    value={resetNewPass}
                    onChange={(e) => setResetNewPass(e.target.value)}
                    placeholder="New Password (8+ chars, 1 number)"
                    className="w-full pl-3.5 pr-10 py-2.5 bg-slate-100 rounded-xl text-sm"
                  />
                  <button type="button" onClick={() => setShowResetPass(!showResetPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                    {showResetPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <button type="submit" className="w-full py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-semibold">
                  Update Password
                </button>
              </form>
            )}
            <button type="button" onClick={() => setTab('login')} className="text-xs font-semibold text-blue-600">
              Back to Sign In
            </button>
          </div>
        ) : (
          <form onSubmit={submitRegister} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">I am a...</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: 'patient', label: 'Patient' },
                  { id: 'doctor', label: 'Doctor' },
                  { id: 'candidate', label: 'Candidate' },
                  { id: 'staff', label: 'Hospital Staff' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    data-testid={`reg-type-${opt.id}`}
                    onClick={() => {
                      setAccountType(opt.id as AccountTypeOption);
                      setErrorMsg(null);
                    }}
                    className={`py-2 px-2 rounded-xl text-xs font-semibold border transition-all ${
                      accountType === opt.id
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5">
                Administrator accounts cannot be created via public sign-up. Contact an existing administrator.
              </p>
            </div>

            <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    required
                    value={reg.full_name}
                    onChange={(e) => setReg({ ...reg, full_name: e.target.value })}
                    placeholder="Full Legal Name"
                    className="sm:col-span-2 w-full px-3.5 py-2.5 bg-slate-100 rounded-xl text-sm"
                  />
                  <input
                    required
                    type="email"
                    value={reg.email}
                    onChange={(e) => setReg({ ...reg, email: e.target.value })}
                    placeholder={accountType === 'doctor' || accountType === 'staff' ? 'Work Email' : 'Email Address'}
                    className="w-full px-3.5 py-2.5 bg-slate-100 rounded-xl text-sm"
                  />
                  <input
                    required
                    value={reg.mobile}
                    onChange={(e) => setReg({ ...reg, mobile: e.target.value })}
                    placeholder="Mobile Number (+1-555-0199)"
                    className="w-full px-3.5 py-2.5 bg-slate-100 rounded-xl text-sm"
                  />
                </div>

                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600 font-medium flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-blue-600" /> Optional Email Verification (OTP)
                    </span>
                    <button type="button" onClick={sendOtp} className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg font-semibold text-blue-700">
                      Send Code
                    </button>
                  </div>
                  {otpSent && (
                    <div className="flex items-center gap-2">
                      <input
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value)}
                        placeholder="6-digit code"
                        className="flex-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                      />
                      <button type="button" onClick={verifyOtp} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold">
                        Verify
                      </button>
                    </div>
                  )}
                  {otpHint && <div className={`text-[11px] font-medium ${otpVerified ? 'text-emerald-700' : 'text-slate-600'}`}>{otpHint}</div>}
                </div>

                {accountType === 'patient' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input type="date" value={reg.dob} onChange={(e) => setReg({ ...reg, dob: e.target.value })} className="px-3.5 py-2 bg-slate-100 rounded-xl text-xs" />
                    <select value={reg.gender} onChange={(e) => setReg({ ...reg, gender: e.target.value })} className="px-3.5 py-2 bg-slate-100 rounded-xl text-xs">
                      <option value="Female">Female</option>
                      <option value="Male">Male</option>
                      <option value="Other">Other</option>
                    </select>
                    <input
                      value={reg.address}
                      onChange={(e) => setReg({ ...reg, address: e.target.value })}
                      placeholder="Residential Address"
                      className="sm:col-span-2 px-3.5 py-2 bg-slate-100 rounded-xl text-xs"
                    />
                    <input
                      value={reg.emergency_contact_name}
                      onChange={(e) => setReg({ ...reg, emergency_contact_name: e.target.value })}
                      placeholder="Emergency Contact Name"
                      className="px-3.5 py-2 bg-slate-100 rounded-xl text-xs"
                    />
                    <input
                      value={reg.emergency_contact_phone}
                      onChange={(e) => setReg({ ...reg, emergency_contact_phone: e.target.value })}
                      placeholder="Emergency Contact Phone"
                      className="px-3.5 py-2 bg-slate-100 rounded-xl text-xs"
                    />
                  </div>
                )}

                {accountType === 'doctor' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <input
                      required
                      value={reg.medical_registration_number}
                      onChange={(e) => setReg({ ...reg, medical_registration_number: e.target.value })}
                      placeholder="Medical Registration Number *"
                      className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs"
                    />
                    <input
                      required
                      value={reg.medical_council}
                      onChange={(e) => setReg({ ...reg, medical_council: e.target.value })}
                      placeholder="Medical Council *"
                      className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs"
                    />
                    <select value={reg.branch_id} onChange={(e) => setReg({ ...reg, branch_id: e.target.value })} className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs">
                      {regMeta.branches.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                    <select value={reg.department_id} onChange={(e) => setReg({ ...reg, department_id: e.target.value })} className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs">
                      {regMeta.departments.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                    <select value={reg.specialty_id} onChange={(e) => setReg({ ...reg, specialty_id: e.target.value })} className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs">
                      {regMeta.specialties.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    <input
                      required
                      value={reg.qualification}
                      onChange={(e) => setReg({ ...reg, qualification: e.target.value })}
                      placeholder="Qualifications (e.g. MBBS, MD) *"
                      className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs"
                    />
                    <input
                      type="number"
                      min={0}
                      value={reg.experience_years}
                      onChange={(e) => setReg({ ...reg, experience_years: e.target.value })}
                      placeholder="Experience (yrs)"
                      className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs"
                    />
                    <input
                      type="number"
                      min={10}
                      value={reg.consultation_fee}
                      onChange={(e) => setReg({ ...reg, consultation_fee: e.target.value })}
                      placeholder="Consultation Fee ($)"
                      className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs"
                    />
                    <label className="text-[11px] text-slate-600">
                      Photo (Optional)
                      <input type="file" accept="image/png,image/jpeg" onChange={(e) => setPhotoFile(e.target.files?.[0] || null)} className="mt-1 block w-full text-[11px]" />
                    </label>
                    <label className="text-[11px] text-slate-600">
                      Medical Licence (PDF/Image)
                      <input type="file" accept=".pdf,image/png,image/jpeg" onChange={(e) => setLicenceFile(e.target.files?.[0] || null)} className="mt-1 block w-full text-[11px]" />
                    </label>
                  </div>
                )}

                {accountType === 'staff' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <select value={reg.requested_role} onChange={(e) => setReg({ ...reg, requested_role: e.target.value })} className="sm:col-span-2 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold">
                      {regMeta.staffRoles.map((r) => (
                        <option key={r.code} value={r.code}>{r.name}</option>
                      ))}
                    </select>
                    <select value={reg.branch_id} onChange={(e) => setReg({ ...reg, branch_id: e.target.value })} className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs">
                      {regMeta.branches.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                    <select value={reg.department_id} onChange={(e) => setReg({ ...reg, department_id: e.target.value })} className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs">
                      {regMeta.departments.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                    <input
                      value={reg.employee_id}
                      onChange={(e) => setReg({ ...reg, employee_id: e.target.value })}
                      placeholder="Employee / Badge ID"
                      className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs"
                    />
                    <input
                      value={reg.qualification}
                      onChange={(e) => setReg({ ...reg, qualification: e.target.value })}
                      placeholder="Qualification"
                      className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs"
                    />
                    <label className="sm:col-span-2 text-[11px] text-slate-600">
                      ID / Credential Upload (Optional)
                      <input type="file" accept=".pdf,image/*" onChange={(e) => setStaffDocFile(e.target.files?.[0] || null)} className="mt-1 block w-full text-[11px]" />
                    </label>
                  </div>
                )}


              </>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="relative">
                <input
                  required
                  type={showRegPass ? 'text' : 'password'}
                  minLength={8}
                  value={reg.password}
                  onChange={(e) => setReg({ ...reg, password: e.target.value })}
                  placeholder="Password (8+ chars, 1 number)"
                  className="w-full pl-3.5 pr-9 py-2.5 bg-slate-100 rounded-xl text-sm"
                />
                <button type="button" onClick={() => setShowRegPass(!showRegPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                  {showRegPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <input
                required
                type={showRegPass ? 'text' : 'password'}
                minLength={8}
                value={reg.confirm}
                onChange={(e) => setReg({ ...reg, confirm: e.target.value })}
                placeholder="Confirm Password"
                className="px-3.5 py-2.5 bg-slate-100 rounded-xl text-sm"
              />
            </div>

            {accountType === 'patient' && (
              <label className="flex items-start gap-2 text-[11px] text-slate-600 cursor-pointer">
                <input type="checkbox" checked={reg.consent} onChange={(e) => setReg({ ...reg, consent: e.target.checked })} className="mt-0.5" />
                <span>
                  {CONSENT_TEXT} <span className="font-mono text-slate-400">({CONSENT_VERSION})</span>
                </span>
              </label>
            )}

            <button
              disabled={busy}
              type="submit"
              className="w-full py-2.5 font-semibold text-sm rounded-xl text-white bg-blue-600 hover:bg-blue-700"
            >
              {busy
                ? 'Submitting...'
                : accountType === 'patient'
                ? 'Create Patient Account'
                : accountType === 'candidate'
                ? 'Create Candidate Account'
                : accountType === 'doctor'
                ? 'Submit Doctor Verification'
                : 'Submit Staff Request'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
