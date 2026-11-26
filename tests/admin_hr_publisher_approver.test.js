import assert from 'node:assert/strict';
import test from 'node:test';
import { startTestServer } from './helpers.js';

function makeMultipart(fields = {}, files = {}) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined && v !== null) form.append(k, String(v));
  }
  for (const [k, fileInfo] of Object.entries(files)) {
    const blob = new Blob([fileInfo.content], { type: fileInfo.type || 'application/pdf' });
    form.append(k, blob, fileInfo.filename);
  }
  return form;
}

test('Four Login Portals enforce expected_portal and expected_role separation', async () => {
  const srv = await startTestServer();
  try {
    const client = srv.createClient();

    // Patient succeeds on patient portal, rejected on staff, admin, hr_publisher
    let r = await client.post('/api/auth/login', {
      identifier: 'patient@demo.com',
      password: 'Patient@123',
      expected_portal: 'patient'
    });
    assert.equal(r.status, 200);
    assert.equal(r.data.user.role, 'patient');

    for (const portal of ['staff', 'admin', 'hr_publisher']) {
      r = await client.post('/api/auth/login', {
        identifier: 'patient@demo.com',
        password: 'Patient@123',
        expected_portal: portal
      });
      assert.equal(r.status, 403);
    }

    // Candidate allowed on patient portal (subtle candidate sub-toggle), blocked elsewhere
    r = await client.post('/api/auth/login', {
      identifier: 'candidate@demo.com',
      password: 'Candidate@123',
      expected_portal: 'patient',
      expected_role: 'candidate'
    });
    assert.equal(r.status, 200);
    assert.equal(r.data.user.role, 'candidate');

    // Doctor/Nurse succeed on staff portal, blocked on admin, hr_publisher, patient
    r = await client.post('/api/auth/login', {
      identifier: 'doctor@demo.com',
      password: 'Doctor@123',
      expected_portal: 'staff'
    });
    assert.equal(r.status, 200);

    for (const portal of ['admin', 'hr_publisher', 'patient']) {
      r = await client.post('/api/auth/login', {
        identifier: 'doctor@demo.com',
        password: 'Doctor@123',
        expected_portal: portal
      });
      assert.equal(r.status, 403);
    }

    // Admin succeeds on admin portal, blocked on staff, hr_publisher, patient
    r = await client.post('/api/auth/login', {
      identifier: 'admin@demo.com',
      password: 'Admin@123',
      expected_portal: 'admin'
    });
    assert.equal(r.status, 200);

    for (const portal of ['staff', 'hr_publisher', 'patient']) {
      r = await client.post('/api/auth/login', {
        identifier: 'admin@demo.com',
        password: 'Admin@123',
        expected_portal: portal
      });
      assert.equal(r.status, 403);
    }

    // HR, Publisher, Approver each succeed on hr_publisher with matching expected_role, blocked elsewhere
    const hrPubCreds = [
      ['hr@demo.com', 'Hr@123', 'hr'],
      ['publisher@demo.com', 'Publish@123', 'publisher'],
      ['approver@demo.com', 'Approve@123', 'approver']
    ];
    for (const [email, pass, role] of hrPubCreds) {
      r = await client.post('/api/auth/login', {
        identifier: email,
        password: pass,
        expected_portal: 'hr_publisher',
        expected_role: role
      });
      assert.equal(r.status, 200);
      assert.equal(r.data.user.role, role);

      const wrongPortalStaff = await client.post('/api/auth/login', {
        identifier: email,
        password: pass,
        expected_portal: 'staff'
      });
      assert.equal(wrongPortalStaff.status, 403);

      const wrongPortalAdmin = await client.post('/api/auth/login', {
        identifier: email,
        password: pass,
        expected_portal: 'admin'
      });
      assert.equal(wrongPortalAdmin.status, 403);

      const wrongSubRole = await client.post('/api/auth/login', {
        identifier: email,
        password: pass,
        expected_portal: 'hr_publisher',
        expected_role: role === 'hr' ? 'publisher' : 'hr'
      });
      assert.equal(wrongSubRole.status, 403);
    }
  } finally {
    await srv.close();
  }
});

test('Complete Admin dashboard module: KPIs, members, departments, branches, roles, finance, docs, settings & audit logs', async () => {
  const srv = await startTestServer();
  try {
    const admin = srv.createClient();
    const loginRes = await admin.login('admin@demo.com', 'Admin@123');
    assert.equal(loginRes.status, 200);

    // 1. Overview KPIs
    const ov = await admin.get('/api/admin/overview');
    assert.equal(ov.status, 200);
    const kpis = ov.data.stats.kpis;
    assert.ok(kpis.totalPatients >= 1);
    assert.ok(kpis.totalDoctors >= 1);
    assert.ok(kpis.totalEmployees >= 1);
    assert.ok(kpis.totalDepartments >= 1);
    assert.ok('activeStaff' in kpis);
    assert.ok('totalRevenue' in kpis);
    assert.ok('pendingPayments' in kpis);

    // 2. Member lookup, edit, role assign, password reset token, login activity
    const hrUser = ov.data.users.find((u) => u.email === 'hr@demo.com');
    assert.ok(hrUser);

    const profileRes = await admin.get(`/api/admin/members/${hrUser.id}`);
    assert.equal(profileRes.status, 200);
    assert.equal(profileRes.data.member.email, 'hr@demo.com');

    const editMemberRes = await admin.patch(`/api/admin/members/${hrUser.id}`, {
      phone: '+1-555-9900',
      designation: 'Senior HR Lead'
    });
    assert.equal(editMemberRes.status, 200);

    const resetTokenRes = await admin.post(`/api/admin/members/${hrUser.id}/reset-token`, {});
    assert.equal(resetTokenRes.status, 200);
    assert.ok(resetTokenRes.data.resetCode);

    // Create custom user, assign new role
    const nurseRole = ov.data.roles.find((r) => r.code === 'nurse');
    const labRole = ov.data.roles.find((r) => r.code === 'lab_staff');
    const newStaffRes = await admin.post('/api/admin/users', {
      full_name: 'Maya Lin',
      email: 'maya.lin@hms.org',
      phone: '+1-555-7777',
      role_id: nurseRole.id,
      department_id: ov.data.departments[0].id,
      branch_id: ov.data.branches[0].id,
      password: 'Password@123'
    });
    assert.equal(newStaffRes.status, 201);

    const roleAssignRes = await admin.patch(`/api/admin/members/${newStaffRes.data.user.id}/role`, {
      role_id: labRole.id
    });
    assert.equal(roleAssignRes.status, 200);
    assert.equal(roleAssignRes.data.role.code, 'lab_staff');

    const loginActivity = await admin.get('/api/admin/login-activity');
    assert.equal(loginActivity.status, 200);
    assert.ok(loginActivity.data.events.length >= 1);

    // 3. Department CRUD + head assignment + employee listing
    const deptCreate = await admin.post('/api/admin/departments', {
      code: 'ONCO',
      name: 'Oncology Center',
      branch_id: ov.data.branches[0].id,
      category: 'clinical',
      head_user_id: newStaffRes.data.user.id,
      description: 'Cancer care & infusion wing'
    });
    assert.equal(deptCreate.status, 201);
    const deptId = deptCreate.data.department.id;

    const deptPatch = await admin.patch(`/api/admin/departments/${deptId}`, {
      description: 'Updated oncology & radiotherapy unit',
      is_active: true
    });
    assert.equal(deptPatch.status, 200);
    assert.equal(deptPatch.data.department.description, 'Updated oncology & radiotherapy unit');

    const deptEmps = await admin.get(`/api/admin/departments/${deptId}/employees`);
    assert.equal(deptEmps.status, 200);
    assert.ok(Array.isArray(deptEmps.data.employees));

    // 4. Branch CRUD
    const brCreate = await admin.post('/api/admin/branches', {
      code: 'WEST',
      name: 'MediCore West Medical Hub',
      address: '900 Westview Pkwy',
      phone: '+1-555-8300',
      email: 'west@medicore-hms.org',
      city: 'Metro City'
    });
    assert.equal(brCreate.status, 201);
    const brPatch = await admin.patch(`/api/admin/branches/${brCreate.data.branch.id}`, {
      phone: '+1-555-8399',
      is_active: true
    });
    assert.equal(brPatch.status, 200);
    assert.equal(brPatch.data.branch.phone, '+1-555-8399');

    // 5. Custom Role creation & Permission update
    const permSlice = ov.data.permissions.slice(0, 2).map((p) => p.id);
    const customRoleRes = await admin.post('/api/admin/roles', {
      code: 'quality_auditor',
      name: 'Quality Auditor',
      description: 'Inspects hospital compliance & reports',
      is_staff: true,
      permission_ids: permSlice
    });
    assert.equal(customRoleRes.status, 201);
    const permPut = await admin.put(`/api/admin/roles/${customRoleRes.data.role.id}/permissions`, {
      permission_ids: ov.data.permissions.slice(0, 3).map((p) => p.id)
    });
    assert.equal(permPut.status, 200);

    // 6. Finance & Payroll monitoring, Documents, Bulk Settings, Audit Logs
    const finRes = await admin.get('/api/admin/finance-payroll');
    assert.equal(finRes.status, 200);
    assert.ok('totalInvoiced' in finRes.data.totals);
    assert.ok('totalPayrollGross' in finRes.data.totals);

    const docsRes = await admin.get('/api/admin/documents');
    assert.equal(docsRes.status, 200);
    assert.ok(Array.isArray(docsRes.data.documents));

    const bulkSettingsRes = await admin.put('/api/admin/settings/bulk', {
      settings: {
        hospital_name: 'MediCore Flagship HMS',
        allow_self_approval: 'false',
        session_timeout_minutes: '120'
      }
    });
    assert.equal(bulkSettingsRes.status, 200);

    const auditRes = await admin.get('/api/admin/audit-logs?action=admin.department_created');
    assert.equal(auditRes.status, 200);
    assert.ok(auditRes.data.logs.length >= 1);
  } finally {
    await srv.close();
  }
});

test('Complete HR workflow: KPIs, employee docs, vacancy approval & expiry, candidate CV/cert & permissions, interview evaluation, offer & accept', async () => {
  const srv = await startTestServer();
  try {
    const hr = srv.createClient();
    const approver = srv.createClient();
    const candidate = srv.createClient();
    const publisher = srv.createClient();

    await hr.login('hr@demo.com', 'Hr@123');
    await approver.login('approver@demo.com', 'Approve@123');
    await candidate.login('candidate@demo.com', 'Candidate@123');
    await publisher.login('publisher@demo.com', 'Publish@123');

    // 1. HR Dashboard KPIs
    const dash = await hr.get('/api/hr/dashboard');
    assert.equal(dash.status, 200);
    assert.ok(dash.data.kpis.totalEmployees >= 1);
    assert.ok('pendingOffers' in dash.data.kpis);

    // 2. Employee creation + document upload + protected attachment download
    const empListBefore = await hr.get('/api/hr/employees');
    assert.equal(empListBefore.status, 200);
    const nurseRole = empListBefore.data.staffRoles.find((r) => r.code === 'nurse');
    const createdEmp = await hr.post('/api/hr/employees', {
      full_name: 'Liam Carter',
      email: 'liam.carter@hms.org',
      phone: '+1-555-3200',
      role_id: nurseRole.id,
      department_id: empListBefore.data.departments[0].id,
      branch_id: empListBefore.data.branches[0].id,
      designation: 'ICU Nurse',
      employment_type: 'Full-Time',
      base_salary: 6200,
      password: 'Password@123'
    });
    assert.equal(createdEmp.status, 201);
    const empId = createdEmp.data.employee.id;

    const docForm = makeMultipart(
      { title: 'Employment Contract 2026', doc_type: 'Contract' },
      { document: { filename: 'contract.pdf', content: '%PDF-1.4\nContractBody', type: 'application/pdf' } }
    );
    const docUpload = await hr.post(`/api/hr/employees/${empId}/documents`, docForm);
    assert.equal(docUpload.status, 201);
    const empDocAttId = docUpload.data.document.attachment_id;

    // HR downloads employee doc (200), Publisher is forbidden (403)
    const hrDocDl = await hr.get(`/api/admin/attachments/${empDocAttId}`);
    assert.equal(hrDocDl.status, 200);
    const pubDocDl = await publisher.get(`/api/admin/attachments/${empDocAttId}`);
    assert.equal(pubDocDl.status, 403);

    // 3. Vacancy workflow: Draft -> Edit -> Pending Approval -> Approver approves -> HR publishes
    const vacDraft = await hr.post('/api/hr/vacancies', {
      title: 'SeniorICU Nurse',
      department_id: empListBefore.data.departments[0].id,
      branch_id: empListBefore.data.branches[0].id,
      employment_type: 'Full-Time',
      positions: 2,
      required_experience: '4+ years ICU',
      required_qualifications: 'BSN, RN',
      description: 'Critical care shift nurse',
      closing_date: '2028-12-31',
      status: 'Draft'
    });
    assert.equal(vacDraft.status, 201);
    const vacId = vacDraft.data.vacancy.id;

    const vacEdit = await hr.patch(`/api/hr/vacancies/${vacId}`, { title: 'Senior ICU Nurse' });
    assert.equal(vacEdit.status, 200);
    assert.equal(vacEdit.data.vacancy.title, 'Senior ICU Nurse');

    const vacSubmit = await hr.post(`/api/hr/vacancies/${vacId}/status`, { status: 'Pending Approval' });
    assert.equal(vacSubmit.status, 200);

    // HR blocked from publishing Pending Approval vacancy directly before approval
    const hrEarlyPub = await hr.post(`/api/hr/vacancies/${vacId}/status`, { status: 'Published' });
    assert.equal(hrEarlyPub.status, 403);

    const appApproveVac = await approver.post(`/api/hr/vacancies/${vacId}/status`, { status: 'Approved' });
    assert.equal(appApproveVac.status, 200);

    const hrPublishVac = await hr.post(`/api/hr/vacancies/${vacId}/status`, { status: 'Published' });
    assert.equal(hrPublishVac.status, 200);
    assert.equal(hrPublishVac.data.vacancy.status, 'Published');

    // Expired vacancy blocks candidate applications (400)
    const expiredVac = await hr.post('/api/hr/vacancies', {
      title: 'Expired Role',
      description: 'Already closed role',
      closing_date: '2020-01-01',
      status: 'Published'
    });
    assert.equal(expiredVac.status, 201);

    const expApply = await candidate.post('/api/hr/applications', makeMultipart({
      vacancy_id: expiredVac.data.vacancy.id,
      cover_note: 'Applying late'
    }));
    assert.equal(expApply.status, 400);

    // 4. Candidate applies with Resume + Certificate
    const applyForm = makeMultipart(
      { vacancy_id: vacId, cover_note: 'Experienced ICU nurse ready immediately.' },
      {
        resume: { filename: 'cv.pdf', content: '%PDF-1.4\nResumeContent', type: 'application/pdf' },
        certificate: { filename: 'rn_cert.pdf', content: '%PDF-1.4\nCertContent', type: 'application/pdf' }
      }
    );
    const applyRes = await candidate.post('/api/hr/applications', applyForm);
    assert.equal(applyRes.status, 201);
    const appId = applyRes.data.application.id;
    const cvAttId = applyRes.data.application.resume_attachment_id;
    assert.ok(cvAttId);
    assert.ok(applyRes.data.application.cert_attachment_id);

    // HR can download CV (200), Approver & Publisher cannot (403)
    const hrCvDl = await hr.get(`/api/admin/attachments/${cvAttId}`);
    assert.equal(hrCvDl.status, 200);
    const approverCvDl = await approver.get(`/api/admin/attachments/${cvAttId}`);
    assert.equal(approverCvDl.status, 403);
    const pubCvDl = await publisher.get(`/api/admin/attachments/${cvAttId}`);
    assert.equal(pubCvDl.status, 403);

    // 5. Status progression + Interview schedule + Interview feedback evaluation
    let st = await hr.patch(`/api/hr/applications/${appId}/status`, { status: 'Under Review' });
    assert.equal(st.status, 200);
    st = await hr.patch(`/api/hr/applications/${appId}/status`, { status: 'Shortlisted' });
    assert.equal(st.status, 200);

    const intvCreate = await hr.post('/api/hr/interviews', {
      application_id: appId,
      scheduled_at: '2026-12-01 10:30',
      interviewer_name: 'Hannah Brooks',
      mode: 'Video',
      notes: 'Panel round 1'
    });
    assert.equal(intvCreate.status, 201);

    const intvEval = await hr.patch(`/api/hr/interviews/${intvCreate.data.interview.id}`, {
      feedback: 'Strong clinical ICU protocols knowledge.',
      rating: 5,
      outcome: 'Passed'
    });
    assert.equal(intvEval.status, 200);
    assert.equal(intvEval.data.interview.rating, 5);
    assert.equal(intvEval.data.interview.outcome, 'Passed');

    st = await hr.patch(`/api/hr/applications/${appId}/status`, { status: 'Selected', notes: 'Top candidate' });
    assert.equal(st.status, 200);

    // 6. Offer issue with appointment letter PDF + Candidate accepts -> Joined
    const offerForm = makeMultipart(
      {
        application_id: appId,
        offered_salary: 7500,
        joining_date: '2026-12-15',
        employment_type: 'Full-Time',
        notes: 'Standard benefits included'
      },
      { letter: { filename: 'appointment_letter.pdf', content: '%PDF-1.4\nOfferLetter', type: 'application/pdf' } }
    );
    const offerRes = await hr.post('/api/hr/offers', offerForm);
    assert.equal(offerRes.status, 201);
    const offerId = offerRes.data.offer.id;

    // Candidate can download own offer letter
    const candOfferLetter = await candidate.get(`/api/admin/attachments/${offerRes.data.offer.letter_attachment_id}`);
    assert.equal(candOfferLetter.status, 200);

    const acceptRes = await candidate.post(`/api/hr/offers/${offerId}/respond`, {
      decision: 'Accepted',
      notes: 'Happy to join!'
    });
    assert.equal(acceptRes.status, 200);
    assert.equal(acceptRes.data.offer.status, 'Accepted');

    const finalApp = await hr.get(`/api/hr/applications/${appId}`);
    assert.equal(finalApp.status, 200);
    assert.equal(finalApp.data.application.status, 'Joined');

    // 7. Reject another candidate with reason
    const cand2 = srv.createClient();
    await cand2.post('/api/auth/register', {
      full_name: 'Candidate Two',
      email: 'cand2@demo.com',
      mobile: '+1-555-4321',
      password: 'Password@123',
      account_type: 'candidate'
    });
    const app2Res = await cand2.post('/api/hr/applications', makeMultipart({ vacancy_id: vacId, cover_note: 'Second applicant' }));
    assert.equal(app2Res.status, 201);
    const rejRes = await hr.patch(`/api/hr/applications/${app2Res.data.application.id}/status`, {
      status: 'Not Selected',
      rejection_reason: 'Position filled internally'
    });
    assert.equal(rejRes.status, 200);
    assert.equal(rejRes.data.application.rejection_reason, 'Position filled internally');

    // 8. HR Reports
    const reportsRes = await hr.get('/api/hr/reports');
    assert.equal(reportsRes.status, 200);
    assert.ok(Array.isArray(reportsRes.data.departmentDistribution));
    assert.ok(Array.isArray(reportsRes.data.vacancyReport));
    assert.ok(Array.isArray(reportsRes.data.recruitmentFunnel));
  } finally {
    await srv.close();
  }
});

test('Publisher & Approver separation of duties, workflow states, expiry filtering, acknowledgements & campaigns CTR', async () => {
  const srv = await startTestServer();
  try {
    const publisher = srv.createClient();
    const approver = srv.createClient();
    const nurse = srv.createClient();
    const patient = srv.createClient();

    await publisher.login('publisher@demo.com', 'Publish@123');
    await approver.login('approver@demo.com', 'Approve@123');
    await nurse.login('nurse@demo.com', 'Nurse@123');
    await patient.login('patient@demo.com', 'Patient@123');

    const pubDash = await publisher.get('/api/publisher/dashboard');
    assert.equal(pubDash.status, 200);
    assert.ok('pendingNotices' in pubDash.data.kpis);

    // 1. Publisher creates Draft -> edits -> submits -> Approver marks Under Review -> Changes Requested
    const draftRes = await publisher.post('/api/publisher', makeMultipart({
      title: 'Fire Drill Notice Draft',
      body: 'Scheduled safety drill on Friday 10 AM.',
      category: 'Safety',
      priority: 'High',
      audience: 'staff',
      expiry_date: '2028-12-31',
      submit_for_approval: 'false'
    }));
    assert.equal(draftRes.status, 201);
    assert.equal(draftRes.data.announcement.status, 'Draft');
    const annId = draftRes.data.announcement.id;

    // Cannot publish unapproved draft (403)
    const earlyPub = await publisher.post(`/api/publisher/${annId}/publish`, {});
    assert.equal(earlyPub.status, 403);

    const editRes = await publisher.patch(`/api/publisher/${annId}`, makeMultipart({
      title: 'Hospital Fire Safety Drill',
      priority: 'Urgent'
    }));
    assert.equal(editRes.status, 200);
    assert.equal(editRes.data.announcement.title, 'Hospital Fire Safety Drill');

    const subRes = await publisher.post(`/api/publisher/${annId}/submit`, {});
    assert.equal(subRes.status, 200);
    assert.equal(subRes.data.announcement.status, 'Pending Approval');

    // Publisher cannot self-approve own notice (403)
    const selfReview = await publisher.post(`/api/publisher/${annId}/review`, { decision: 'Approved' });
    assert.equal(selfReview.status, 403);

    // Approver marks Under Review
    const urRes = await approver.post(`/api/publisher/${annId}/review`, { decision: 'Under Review', comments: 'Checking dates' });
    assert.equal(urRes.status, 200);
    assert.equal(urRes.data.announcement.status, 'Under Review');

    // Changes Requested without comments fails (400)
    const badChanges = await approver.post(`/api/publisher/${annId}/review`, { decision: 'Changes Requested', comments: '' });
    assert.equal(badChanges.status, 400);

    const crRes = await approver.post(`/api/publisher/${annId}/review`, {
      decision: 'Changes Requested',
      comments: 'Specify exact assembly point.'
    });
    assert.equal(crRes.status, 200);
    assert.equal(crRes.data.announcement.status, 'Changes Requested');

    // Publisher edits -> resubmits -> Approver approves (auto_publish: false) -> Publisher publishes
    await publisher.patch(`/api/publisher/${annId}`, makeMultipart({
      body: 'Scheduled safety drill on Friday 10 AM at North Courtyard.'
    }));
    await publisher.post(`/api/publisher/${annId}/submit`, {});

    const approvedRes = await approver.post(`/api/publisher/${annId}/review`, {
      decision: 'Approved',
      comments: 'Clear and verified',
      auto_publish: false
    });
    assert.equal(approvedRes.status, 200);
    assert.equal(approvedRes.data.announcement.status, 'Approved');

    const pubRes = await publisher.post(`/api/publisher/${annId}/publish`, {});
    assert.equal(pubRes.status, 200);
    assert.equal(pubRes.data.announcement.status, 'Published');

    // 2. Audience & Expiry checks
    // Expired published notice created directly and approved should NOT show to nurse or patient
    const expAnn = await publisher.post('/api/publisher', makeMultipart({
      title: 'Expired Past Bulletin',
      body: 'Old news from 2020',
      audience: 'all',
      start_date: '2020-01-01',
      expiry_date: '2020-01-10',
      submit_for_approval: 'true'
    }));
    await approver.post(`/api/publisher/${expAnn.data.announcement.id}/review`, { decision: 'Approved', auto_publish: true });

    const nurseFeed = await nurse.get('/api/publisher');
    assert.equal(nurseFeed.status, 200);
    assert.ok(nurseFeed.data.announcements.some((a) => a.id === annId));
    assert.ok(!nurseFeed.data.announcements.some((a) => a.id === expAnn.data.announcement.id));

    // Patient should NOT see staff-only notice or expired notice
    const patientFeed = await patient.get('/api/publisher');
    assert.equal(patientFeed.status, 200);
    assert.ok(!patientFeed.data.announcements.some((a) => a.id === annId));
    assert.ok(!patientFeed.data.announcements.some((a) => a.id === expAnn.data.announcement.id));

    // Nurse views & acknowledges
    assert.equal((await nurse.post(`/api/publisher/${annId}/view`, {})).status, 200);
    assert.equal((await nurse.post(`/api/publisher/${annId}/ack`, {})).status, 200);

    const ackReport = await publisher.get(`/api/publisher/${annId}/acknowledgements`);
    assert.equal(ackReport.status, 200);
    assert.ok(ackReport.data.summary.acknowledgedCount >= 1);
    assert.ok(ackReport.data.acknowledgements.some((a) => a.role_code === 'nurse'));

    // Archive notice
    const archRes = await publisher.post(`/api/publisher/${annId}/archive`, {});
    assert.equal(archRes.status, 200);
    assert.equal(archRes.data.announcement.status, 'Archived');

    // 3. Campaign Draft -> Submit -> Approve -> Pause -> Archive + CTR tracking
    const campDraft = await publisher.post('/api/campaigns', makeMultipart({
      name: 'Annual Health Drive',
      description: 'Discounted cardiac checkups.',
      audience: 'Patients',
      end_date: '2028-12-31',
      submit_for_approval: 'false'
    }));
    assert.equal(campDraft.status, 201);
    const campId = campDraft.data.campaign.id;

    assert.equal((await publisher.post(`/api/campaigns/${campId}/submit`, {})).status, 200);
    assert.equal((await publisher.post(`/api/campaigns/${campId}/review`, { decision: 'Approved' })).status, 403);
    assert.equal((await approver.post(`/api/campaigns/${campId}/review`, { decision: 'Approved', auto_publish: true })).status, 200);

    await patient.post(`/api/campaigns/${campId}/track`, { event: 'impression' });
    await patient.post(`/api/campaigns/${campId}/track`, { event: 'click' });

    const campsRes = await publisher.get('/api/campaigns');
    const tracked = campsRes.data.campaigns.find((c) => c.id === campId);
    assert.equal(tracked.impressions, 1);
    assert.equal(tracked.clicks, 1);

    assert.equal((await publisher.post(`/api/campaigns/${campId}/status`, { status: 'Paused' })).status, 200);
    assert.equal((await publisher.post(`/api/campaigns/${campId}/status`, { status: 'Archived' })).status, 200);
  } finally {
    await srv.close();
  }
});

test('Strict cross-role RBAC isolation returns 403 and logs authz.denied in audit_logs', async () => {
  const srv = await startTestServer();
  try {
    const hr = srv.createClient();
    const publisher = srv.createClient();
    const approver = srv.createClient();
    const patient = srv.createClient();
    const admin = srv.createClient();

    await hr.login('hr@demo.com', 'Hr@123');
    await publisher.login('publisher@demo.com', 'Publish@123');
    await approver.login('approver@demo.com', 'Approve@123');
    await patient.login('patient@demo.com', 'Patient@123');
    await admin.login('admin@demo.com', 'Admin@123');

    // HR blocked from Admin, Clinical Patients, and Approver review
    assert.equal((await hr.get('/api/admin/overview')).status, 403);
    assert.equal((await hr.get('/api/patients')).status, 403);
    assert.equal((await hr.post('/api/publisher/1/review', { decision: 'Approved' })).status, 403);

    // Publisher blocked from HR employees, Admin finance, Lab orders
    assert.equal((await publisher.get('/api/hr/employees')).status, 403);
    assert.equal((await publisher.get('/api/admin/finance-payroll')).status, 403);
    assert.equal((await publisher.get('/api/laboratory/orders')).status, 403);

    // Approver blocked from HR employees, Billing invoices, Publisher create
    assert.equal((await approver.get('/api/hr/employees')).status, 403);
    assert.equal((await approver.get('/api/billing/invoices')).status, 403);
    assert.equal((await approver.post('/api/publisher', makeMultipart({ title: 'X', body: 'Y' }))).status, 403);

    // Patient blocked from Admin, HR, Publisher create, Approver review
    assert.equal((await patient.get('/api/admin/overview')).status, 403);
    assert.equal((await patient.get('/api/hr/employees')).status, 403);
    assert.equal((await patient.post('/api/publisher', makeMultipart({ title: 'X', body: 'Y' }))).status, 403);
    assert.equal((await patient.post('/api/publisher/1/review', { decision: 'Approved' })).status, 403);

    // Verify authz.denied events logged in audit_logs
    const deniedLogs = await admin.get('/api/admin/audit-logs?action=authz.denied');
    assert.equal(deniedLogs.status, 200);
    assert.ok(deniedLogs.data.logs.length >= 10);
  } finally {
    await srv.close();
  }
});

test('Self-service profile update and password change endpoints persist changes and enforce current password validation', async () => {
  const srv = await startTestServer();
  try {
    const client = srv.createClient();
    const loginRes = await client.login('publisher@demo.com', 'Publish@123');
    assert.equal(loginRes.status, 200);

    // Update profile
    const profRes = await client.patch('/api/auth/profile', {
      full_name: 'Clara Vance-Updated',
      phone: '+1-555-8888'
    });
    assert.equal(profRes.status, 200);
    assert.equal(profRes.data.user.full_name, 'Clara Vance-Updated');
    assert.equal(profRes.data.user.phone, '+1-555-8888');

    // Wrong current password rejected
    const badPwd = await client.post('/api/auth/change-password', {
      current_password: 'WrongPassword1',
      new_password: 'NewPublish@123'
    });
    assert.equal(badPwd.status, 400);

    // Valid password change succeeds and authenticates
    const goodPwd = await client.post('/api/auth/change-password', {
      current_password: 'Publish@123',
      new_password: 'NewPublish@123'
    });
    assert.equal(goodPwd.status, 200);

    const reLoginOld = await srv.createClient().post('/api/auth/login', {
      identifier: 'publisher@demo.com',
      password: 'Publish@123'
    });
    assert.equal(reLoginOld.status, 401);

    const reLoginNew = await srv.createClient().post('/api/auth/login', {
      identifier: 'publisher@demo.com',
      password: 'NewPublish@123'
    });
    assert.equal(reLoginNew.status, 200);
  } finally {
    await srv.close();
  }
});
