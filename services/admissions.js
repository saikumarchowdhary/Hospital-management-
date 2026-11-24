import { AppError } from '../middleware/errors.js';
import { validateAndRecordTransition } from './workflow.js';

export function createAdmissionTx(db, broker, { patientId, departmentId, doctorId, admissionType = 'Elective', reason, actor }) {
  return db.transaction(() => {
    const active = db.get(
      `SELECT id FROM admissions WHERE patient_id = ? AND status IN ('Requested','Approved','Admitted','Active Care','Discharge Pending')`,
      [patientId]
    );
    if (active) {
      throw new AppError(409, 'Patient already has an open admission.');
    }
    const ref = `ADM-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
    const info = db.run(
      `INSERT INTO admissions (admission_ref, patient_id, department_id, doctor_id, case_manager_id, admission_type, reason, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'Requested', ?)`,
      [ref, patientId, departmentId, doctorId, actor.role === 'case_manager' ? actor.id : null, admissionType, reason, actor.id]
    );
    db.run(
      `INSERT INTO workflow_history (entity_type, entity_id, from_status, to_status, actor_id, notes)
       VALUES ('admission', ?, NULL, 'Requested', ?, ?)`,
      [info.lastInsertRowid, actor.id, reason]
    );
    if (broker) {
      broker.publish('admission:created', {
        admissionId: info.lastInsertRowid,
        ref,
        title: 'New Admission Request',
        message: `Admission ${ref} requested.`
      }, { roles: ['case_manager', 'doctor', 'nurse', 'admin'] });
    }
    return db.get('SELECT * FROM admissions WHERE id = ?', [info.lastInsertRowid]);
  })();
}

export function allocateBedTx(db, broker, { admissionId, bedId, actor }) {
  return db.transaction(() => {
    const adm = db.get('SELECT * FROM admissions WHERE id = ?', [admissionId]);
    if (!adm) throw new AppError(404, 'Admission not found.');
    if (['Discharged', 'Cancelled'].includes(adm.status)) {
      throw new AppError(409, 'Cannot allocate a bed to a closed admission.');
    }

    const bed = db.get('SELECT * FROM beds WHERE id = ?', [bedId]);
    if (!bed) throw new AppError(404, 'Bed not found.');
    if (bed.status !== 'Available') {
      throw new AppError(409, `Bed ${bed.bed_code} is currently ${bed.status} and cannot be allocated.`);
    }

    const activeAlloc = db.get('SELECT id FROM bed_allocations WHERE bed_id = ? AND status = ?', [bedId, 'Active']);
    if (activeAlloc) {
      throw new AppError(409, `Bed ${bed.bed_code} already has an active allocation.`);
    }

    if (adm.bed_id) {
      db.run('UPDATE bed_allocations SET status = ?, released_at = datetime(\'now\') WHERE admission_id = ? AND status = ?', ['Released', adm.id, 'Active']);
      db.run('UPDATE beds SET status = ? WHERE id = ?', ['Cleaning', adm.bed_id]);
    }

    db.run('UPDATE beds SET status = ?, updated_at = datetime(\'now\') WHERE id = ?', ['Occupied', bedId]);
    db.run('INSERT INTO bed_allocations (admission_id, bed_id, allocated_by, status) VALUES (?, ?, ?, ?)', [adm.id, bedId, actor.id, 'Active']);

    const nextStatus = adm.status === 'Requested' || adm.status === 'Approved' ? 'Admitted' : adm.status;
    db.run(
      `UPDATE admissions SET bed_id = ?, status = ?, admitted_at = COALESCE(admitted_at, datetime('now')), updated_at = datetime('now') WHERE id = ?`,
      [bedId, nextStatus, adm.id]
    );

    if (nextStatus !== adm.status) {
      validateAndRecordTransition(db, broker, {
        entityType: 'admission',
        entityId: adm.id,
        fromStatus: adm.status,
        toStatus: nextStatus,
        actor,
        notes: `Allocated bed ${bed.bed_code}`
      });
    }

    if (broker) {
      broker.publish('bed:allocated', {
        admissionId: adm.id,
        bedId,
        bedCode: bed.bed_code,
        title: 'Bed Allocated',
        message: `Bed ${bed.bed_code} allocated to ${adm.admission_ref}.`
      }, { roles: ['nurse', 'case_manager', 'doctor', 'housekeeping', 'admin'] });
    }

    return db.get('SELECT * FROM admissions WHERE id = ?', [adm.id]);
  })();
}

export function dischargePatientTx(db, broker, { admissionId, summary, followUpInstructions = '', checklist = {}, actor }) {
  return db.transaction(() => {
    const adm = db.get(
      `SELECT a.*, p.user_id as patient_user_id FROM admissions a
       JOIN patient_profiles p ON p.id = a.patient_id WHERE a.id = ?`,
      [admissionId]
    );
    if (!adm) throw new AppError(404, 'Admission not found.');
    if (!['Admitted', 'Active Care', 'Discharge Pending'].includes(adm.status)) {
      throw new AppError(409, `Cannot discharge admission from status ${adm.status}.`);
    }

    db.run(
      `UPDATE admissions SET status = 'Discharged', discharged_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
      [adm.id]
    );
    db.run(
      `INSERT INTO discharge_records (admission_id, patient_id, summary, follow_up_instructions, checklist_json, discharged_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [adm.id, adm.patient_id, summary, followUpInstructions, JSON.stringify(checklist), actor.id]
    );
    db.run(
      `INSERT INTO medical_records (patient_id, record_type, title, source_module, reference_id, summary, status, is_released, created_by)
       VALUES (?, 'Discharge Summary', ?, 'Admissions', ?, ?, 'Released', 1, ?)`,
      [adm.patient_id, `Discharge Summary (${adm.admission_ref})`, adm.id, summary, actor.id]
    );

    let housekeepingTask = null;
    if (adm.bed_id) {
      db.run('UPDATE bed_allocations SET status = ?, released_at = datetime(\'now\') WHERE admission_id = ? AND status = ?', ['Released', adm.id, 'Active']);
      db.run('UPDATE beds SET status = ?, updated_at = datetime(\'now\') WHERE id = ?', ['Cleaning', adm.bed_id]);
      const bedInfo = db.get('SELECT b.id, b.bed_code, b.room_id, r.ward_id FROM beds b JOIN rooms r ON r.id = b.room_id WHERE b.id = ?', [adm.bed_id]);
      const tRef = `HSK-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
      const hInfo = db.run(
        `INSERT INTO housekeeping_tasks (task_ref, ward_id, room_id, bed_id, priority, status, notes, created_by)
         VALUES (?, ?, ?, ?, 'High', 'Assigned', ?, ?)`,
        [tRef, bedInfo.ward_id, bedInfo.room_id, bedInfo.id, `Post-discharge sanitization for ${adm.admission_ref}`, actor.id]
      );
      housekeepingTask = db.get('SELECT * FROM housekeeping_tasks WHERE id = ?', [hInfo.lastInsertRowid]);
    }

    validateAndRecordTransition(db, broker, {
      entityType: 'admission',
      entityId: adm.id,
      fromStatus: adm.status,
      toStatus: 'Discharged',
      actor,
      notes: 'Patient discharged & housekeeping scheduled',
      notify: {
        userId: adm.patient_user_id,
        roles: ['nurse', 'case_manager', 'housekeeping', 'accountant'],
        title: 'Patient Discharged',
        message: `${adm.admission_ref} discharged. Bed queued for cleaning & inspection.`,
        eventType: 'admission:discharged'
      }
    });

    return { admission: db.get('SELECT * FROM admissions WHERE id = ?', [adm.id]), housekeepingTask };
  })();
}
