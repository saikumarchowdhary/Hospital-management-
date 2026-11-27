import assert from 'node:assert/strict';
import test from 'node:test';
import { startTestServer } from './helpers.js';

test('Admissions & Housekeeping: bed allocation, duplicate bed conflict, discharge -> cleaning -> inspection fail/pass', async () => {
  const ctx = await startTestServer();
  try {
    const cm = ctx.createClient();
    await cm.login('case@demo.com', 'Case@123');
    const hsk = ctx.createClient();
    await hsk.login('housekeeping@demo.com', 'House@123');

    const pats = (await cm.get('/api/patients')).data.patients;
    const pat1 = pats.find((p) => p.patient_code === 'MRN-1001');
    const pat2 = pats.find((p) => p.patient_code === 'MRN-1002');
    const docs = (await cm.get('/api/doctors')).data.doctors;
    const bedsRes = (await cm.get('/api/beds')).data.beds;
    const availBed = bedsRes.find((b) => b.status === 'Available');
    assert.ok(availBed);

    // Create admission for pat1 and allocate availBed
    const adm1 = await cm.post('/api/admissions', {
      patient_id: pat1.id,
      department_id: docs[0].department_id,
      doctor_id: docs[0].id,
      admission_type: 'Emergency',
      reason: 'Observation for chest discomfort'
    });
    assert.equal(adm1.status, 201);
    const adm1Id = adm1.data.admission.id;

    const alloc1 = await cm.post(`/api/admissions/${adm1Id}/allocate-bed`, { bed_id: availBed.id });
    assert.equal(alloc1.status, 200);
    assert.equal(alloc1.data.admission.bed_id, availBed.id);

    const occupiedCheck = (await cm.get('/api/beds')).data.beds.find((b) => b.id === availBed.id);
    assert.equal(occupiedCheck.status, 'Occupied');
    assert.equal(occupiedCheck.patient_code, 'MRN-1001');
    assert.ok(occupiedCheck.admission_ref);
    assert.ok(occupiedCheck.department_name);

    // Duplicate bed allocation for pat2's existing open admission blocked (409)
    const adms = (await cm.get('/api/admissions')).data.admissions;
    const adm2 = adms.find((a) => a.patient_id === pat2.id && a.status !== 'Discharged');
    assert.ok(adm2);
    const dupBed = await cm.post(`/api/admissions/${adm2.id}/allocate-bed`, { bed_id: availBed.id });
    assert.equal(dupBed.status, 409);

    // Discharge pat1 -> bed becomes Cleaning + housekeeping task created
    const disch = await cm.post(`/api/admissions/${adm1Id}/discharge`, {
      summary: 'Patient stable on oral therapy',
      follow_up_instructions: 'Return in 7 days'
    });
    assert.equal(disch.status, 200);
    assert.equal(disch.data.admission.status, 'Discharged');

    const tasksAfterDisch = (await hsk.get('/api/housekeeping/tasks')).data.tasks;
    const cleanTask = tasksAfterDisch.find((t) => t.bed_id === availBed.id && t.status !== 'Completed');
    assert.ok(cleanTask);

    // Direct attempt to mark bed Available while Cleaning must be rejected (409)
    const bypass = await cm.patch(`/api/beds/${availBed.id}/status`, { status: 'Available' });
    assert.equal(bypass.status, 409);

    // Housekeeping cleans -> Awaiting Inspection -> Fail -> Reopened (Assigned)
    await hsk.patch(`/api/housekeeping/tasks/${cleanTask.id}/status`, { status: 'In Progress' });
    await hsk.patch(`/api/housekeeping/tasks/${cleanTask.id}/status`, { status: 'Awaiting Inspection' });
    const failInsp = await hsk.post(`/api/housekeeping/tasks/${cleanTask.id}/inspect`, {
      passed: false,
      checklist_notes: 'Sanitizer tray missing'
    });
    assert.equal(failInsp.status, 200);
    assert.equal(failInsp.data.task.status, 'Assigned');

    // Re-clean & Pass inspection -> Task Completed & Bed Available
    await hsk.patch(`/api/housekeeping/tasks/${cleanTask.id}/status`, { status: 'In Progress' });
    await hsk.patch(`/api/housekeeping/tasks/${cleanTask.id}/status`, { status: 'Awaiting Inspection' });
    const passInsp = await hsk.post(`/api/housekeeping/tasks/${cleanTask.id}/inspect`, {
      passed: true,
      checklist_notes: 'All surfaces disinfected'
    });
    assert.equal(passInsp.status, 200);
    assert.equal(passInsp.data.task.status, 'Completed');

    const updatedBed = (await cm.get('/api/beds')).data.beds.find((b) => b.id === availBed.id);
    assert.equal(updatedBed.status, 'Available');

    // Transitioning to Maintenance and back to Available returns enriched bed metadata for push alerts
    const toMaint = await cm.patch(`/api/beds/${availBed.id}/status`, { status: 'Maintenance' });
    assert.equal(toMaint.status, 200);
    assert.equal(toMaint.data.bed.status, 'Maintenance');
    const backAvail = await cm.patch(`/api/beds/${availBed.id}/status`, { status: 'Available' });
    assert.equal(backAvail.status, 200);
    assert.equal(backAvail.data.bed.status, 'Available');
    assert.ok(backAvail.data.bed.ward_name);
    assert.ok(backAvail.data.bed.room_number);
  } finally {
    await ctx.close();
  }
});
