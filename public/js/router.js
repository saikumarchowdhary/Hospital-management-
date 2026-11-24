import { renderAdminControlPage, renderAdminDashboard } from './pages/admin.js';
import { renderAdminMembersPage } from './pages/admin_members.js';
import { renderAdmissionsPage } from './pages/admissions.js';
import { renderBookAppointment, renderPatientAppointments } from './pages/appointments.js';
import { renderBedsPage } from './pages/beds.js';
import { renderBloodBankPage } from './pages/bloodbank.js';
import { renderCampaignsPage } from './pages/campaigns.js';
import { renderDoctorPortal } from './pages/doctor-portal.js';
import { renderDoctorDiscovery } from './pages/doctors.js';
import { renderExternalPage } from './pages/external.js';
import { renderFinancePage } from './pages/finance.js';
import { renderHousekeepingPage } from './pages/housekeeping.js';
import { renderHrPage } from './pages/hr.js';
import { renderInsurancePage } from './pages/insurance.js';
import { renderLaboratoryPage } from './pages/laboratory.js';
import { renderNursePortal } from './pages/nurse.js';
import { renderPatientDocuments, renderPatientSupport, renderSpecializationsDirectory } from './pages/patient-extras.js';
import { renderPatientHome } from './pages/patient.js';
import { renderPharmacyPage } from './pages/pharmacy.js';
import { renderProfilePage } from './pages/profile.js';
import { renderPublisherPage } from './pages/publisher.js';
import { renderRadiologyPage } from './pages/radiology.js';
import { renderReceptionistPortal } from './pages/receptionist.js';
import { renderPatientLabBooking, renderPatientMedicines, renderPatientRecords } from './pages/records.js';
import { renderReportsPage } from './pages/reports.js';
import { esc } from './ui.js';

const DEFAULT_ROUTES = {
  patient: 'patient/home',
  candidate: 'hr/careers',
  admin: 'admin/dashboard',
  doctor: 'doctor/portal',
  nurse: 'nurse/portal',
  receptionist: 'reception/portal',
  case_manager: 'admissions',
  lab_staff: 'laboratory',
  radiologist: 'radiology',
  pharmacist: 'pharmacy',
  accountant: 'finance',
  hr: 'hr',
  publisher: 'publisher',
  approver: 'publisher',
  housekeeping: 'housekeeping',
  bloodbank_staff: 'bloodbank',
  external_coordinator: 'external'
};

export function getDefaultRoute(role) {
  return DEFAULT_ROUTES[role] || 'profile';
}

export function getNavForRole(role) {
  if (role === 'patient') {
    return {
      isPatient: true,
      bottomNav: [
        { route: 'patient/home', label: 'Home', iconKey: 'home' },
        { route: 'patient/visits', label: 'Visits', iconKey: 'calendar' },
        { route: 'patient/records', label: 'Records', iconKey: 'file' },
        { route: 'patient/payments', label: 'Payments', iconKey: 'card' },
        { route: 'profile', label: 'Profile', iconKey: 'user' }
      ],
      sections: []
    };
  }

  if (role === 'candidate') {
    return {
      isPatient: false,
      sections: [
        { title: 'Recruitment', items: [{ route: 'hr/careers', label: 'Careers Portal', iconKey: 'file' }] },
        { title: 'Account', items: [{ route: 'profile', label: 'My Profile', iconKey: 'user' }] }
      ]
    };
  }

  const allSections = [
    {
      title: 'Overview',
      items: [
        { route: 'admin/dashboard', label: 'Dashboard', iconKey: 'home', roles: ['admin'] },
        { route: 'admin/members', label: 'All Members', iconKey: 'user', roles: ['admin'] },
        { route: 'reports', label: 'Reports & Export', iconKey: 'activity', roles: ['admin', 'doctor', 'case_manager', 'lab_staff', 'radiologist', 'pharmacist', 'accountant', 'hr', 'bloodbank_staff'] },
        { route: 'admin/control', label: 'Admin Control', iconKey: 'shield', roles: ['admin'] }
      ]
    },
    {
      title: 'Clinical & Front Office',
      items: [
        { route: 'reception/portal', label: 'Reception Desk', iconKey: 'calendar', roles: ['admin', 'receptionist'] },
        { route: 'doctor/portal', label: 'Doctor Workspace', iconKey: 'activity', roles: ['admin', 'doctor'] },
        { route: 'nurse/portal', label: 'Nurse Care', iconKey: 'activity', roles: ['admin', 'nurse'] },
        { route: 'admissions', label: 'Admissions & Care', iconKey: 'file', roles: ['admin', 'doctor', 'nurse', 'receptionist', 'case_manager'] },
        { route: 'beds', label: 'Bed Board', iconKey: 'home', roles: ['admin', 'doctor', 'nurse', 'receptionist', 'case_manager', 'housekeeping'] }
      ]
    },
    {
      title: 'Diagnostics & Pharmacy',
      items: [
        { route: 'laboratory', label: 'Laboratory', iconKey: 'activity', roles: ['admin', 'doctor', 'lab_staff'] },
        { route: 'radiology', label: 'Radiology', iconKey: 'file', roles: ['admin', 'doctor', 'lab_staff', 'radiologist'] },
        { route: 'pharmacy', label: 'Pharmacy', iconKey: 'card', roles: ['admin', 'pharmacist'] },
        { route: 'bloodbank', label: 'Blood Bank', iconKey: 'activity', roles: ['admin', 'doctor', 'nurse', 'lab_staff', 'bloodbank_staff', 'external_coordinator'] }
      ]
    },
    {
      title: 'Finance & Operations',
      items: [
        { route: 'finance', label: 'Billing & Finance', iconKey: 'card', roles: ['admin', 'accountant', 'receptionist'] },
        { route: 'insurance', label: 'Insurance / TPA', iconKey: 'shield', roles: ['admin', 'accountant', 'receptionist', 'case_manager'] },
        { route: 'hr', label: 'HR & Payroll', iconKey: 'user', roles: ['admin', 'hr'] },
        { route: 'housekeeping', label: 'Housekeeping', iconKey: 'home', roles: ['admin', 'housekeeping', 'nurse', 'case_manager'] },
        { route: 'external', label: 'External Coord.', iconKey: 'file', roles: ['admin', 'external_coordinator', 'case_manager'] }
      ]
    },
    {
      title: 'Communications',
      items: [
        { route: 'publisher', label: 'Announcements', iconKey: 'bell', roles: ['admin', 'publisher', 'approver'] },
        { route: 'campaigns', label: 'Campaigns', iconKey: 'activity', roles: ['admin', 'publisher', 'approver'] }
      ]
    },
    {
      title: 'Account',
      items: [{ route: 'profile', label: 'My Profile', iconKey: 'user', roles: ['*'] }]
    }
  ];

  return {
    isPatient: false,
    sections: allSections
      .map((sec) => ({
        title: sec.title,
        items: sec.items.filter((item) => item.roles.includes('*') || item.roles.includes(role))
      }))
      .filter((sec) => sec.items.length > 0)
  };
}

const ROUTE_TABLE = {
  'patient/home': { roles: ['patient'], render: (el, u, nav) => renderPatientHome(el, u, nav) },
  'patient/doctors': { roles: ['patient'], render: (el, u, nav, q) => renderDoctorDiscovery(el, u, nav, q) },
  'patient/specialties': { roles: ['patient'], render: (el, u, nav) => renderSpecializationsDirectory(el, u, nav) },
  'patient/book': { roles: ['patient'], render: (el, u, nav, q) => renderBookAppointment(el, u, nav, q) },
  'patient/visits': { roles: ['patient'], render: (el, u, nav) => renderPatientAppointments(el, u, nav) },
  'patient/records': { roles: ['patient'], render: (el, u, _nav, q) => renderPatientRecords(el, u, q) },
  'patient/documents': { roles: ['patient'], render: (el, u, nav) => renderPatientDocuments(el, u, nav) },
  'patient/support': { roles: ['patient'], render: (el, u, nav) => renderPatientSupport(el, u, nav) },
  'patient/lab-booking': { roles: ['patient'], render: (el) => renderPatientLabBooking(el) },
  'patient/medicines': { roles: ['patient'], render: (el) => renderPatientMedicines(el) },
  'patient/payments': { roles: ['patient'], render: (el, u) => renderFinancePage(el, u) },
  profile: { roles: ['*'], render: (el, u, _nav, _q, onLogout) => renderProfilePage(el, u, onLogout) },
  'admin/dashboard': { roles: ['admin'], render: (el) => renderAdminDashboard(el) },
  'admin/members': { roles: ['admin'], render: (el) => renderAdminMembersPage(el) },
  'admin/control': { roles: ['admin'], render: (el) => renderAdminControlPage(el) },
  'doctor/portal': { roles: ['admin', 'doctor'], render: (el, u) => renderDoctorPortal(el, u) },
  'nurse/portal': { roles: ['admin', 'nurse'], render: (el) => renderNursePortal(el) },
  'reception/portal': { roles: ['admin', 'receptionist'], render: (el) => renderReceptionistPortal(el) },
  admissions: { roles: ['admin', 'doctor', 'nurse', 'receptionist', 'case_manager'], render: (el) => renderAdmissionsPage(el) },
  beds: { roles: ['admin', 'doctor', 'nurse', 'receptionist', 'case_manager', 'housekeeping'], render: (el) => renderBedsPage(el) },
  laboratory: { roles: ['admin', 'doctor', 'lab_staff'], render: (el) => renderLaboratoryPage(el) },
  radiology: { roles: ['admin', 'doctor', 'lab_staff', 'radiologist'], render: (el) => renderRadiologyPage(el) },
  pharmacy: { roles: ['admin', 'pharmacist'], render: (el) => renderPharmacyPage(el) },
  bloodbank: { roles: ['admin', 'doctor', 'nurse', 'lab_staff', 'bloodbank_staff', 'external_coordinator'], render: (el) => renderBloodBankPage(el) },
  finance: { roles: ['admin', 'accountant', 'receptionist'], render: (el, u) => renderFinancePage(el, u) },
  insurance: { roles: ['admin', 'accountant', 'receptionist', 'case_manager'], render: (el) => renderInsurancePage(el) },
  hr: { roles: ['admin', 'hr'], render: (el, u) => renderHrPage(el, u) },
  'hr/careers': { roles: ['candidate', 'admin', 'hr'], render: (el, u) => renderHrPage(el, u) },
  publisher: { roles: ['admin', 'publisher', 'approver'], render: (el, u) => renderPublisherPage(el, u) },
  campaigns: { roles: ['admin', 'publisher', 'approver'], render: (el, u) => renderCampaignsPage(el, u) },
  housekeeping: { roles: ['admin', 'housekeeping', 'nurse', 'case_manager'], render: (el) => renderHousekeepingPage(el) },
  external: { roles: ['admin', 'external_coordinator', 'case_manager'], render: (el) => renderExternalPage(el) },
  reports: { roles: ['admin', 'doctor', 'case_manager', 'lab_staff', 'radiologist', 'pharmacist', 'accountant', 'hr', 'bloodbank_staff'], render: (el) => renderReportsPage(el) }
};

export function parseHash() {
  const raw = (window.location.hash || '').replace(/^#/, '');
  const [routePart, queryPart] = raw.split('?');
  const query = {};
  if (queryPart) {
    for (const [k, v] of new URLSearchParams(queryPart).entries()) query[k] = v;
  }
  return { route: routePart || '', query };
}

export async function dispatchRoute(container, user, navigate, onLogout) {
  let { route, query } = parseHash();
  if (!route || !ROUTE_TABLE[route]) {
    route = getDefaultRoute(user.role);
    window.location.hash = `#${route}`;
    return;
  }
  const entry = ROUTE_TABLE[route];
  if (!entry.roles.includes('*') && !entry.roles.includes(user.role)) {
    const fallback = getDefaultRoute(user.role);
    container.innerHTML = `
      <div class="card" style="text-align:center;padding:34px 20px">
        <h2 style="color:var(--danger)">Access Restricted</h2>
        <p class="muted text-sm" style="margin:8px auto 14px">Role <strong>${esc(user.role)}</strong> is not authorized to view <code>#${esc(route)}</code>.</p>
        <button class="btn btn-primary btn-sm" id="back-home-btn">Return to My Workspace</button>
      </div>
    `;
    container.querySelector('#back-home-btn').onclick = () => navigate(fallback);
    return;
  }
  await entry.render(container, user, navigate, query, onLogout);
}
