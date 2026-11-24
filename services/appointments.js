import { AppError } from '../middleware/errors.js';
import { validateAndRecordTransition } from './workflow.js';

export function bookAppointmentTx(db, broker, { patientId, doctorId, appointmentDate, appointmentTime, visitType = 'In-Person', reason = '', actor }) {
  const tx = db.transaction(() => {
    const doc = db.get(
      `SELECT dp.*, u.id as doctor_user_id, u.full_name as doctor_name
       FROM doctor_profiles dp JOIN users u ON u.id = dp.user_id
       WHERE dp.id = ? AND dp.is_active = 1`,
      [doctorId]
    );
    if (!doc) throw new AppError(404, 'Selected doctor is not available.');

    const existing = db.get(
      `SELECT id FROM appointments
       WHERE doctor_id = ? AND appointment_date = ? AND appointment_time = ?
       AND status NOT IN ('Cancelled', 'Rescheduled')`,
      [doctorId, appointmentDate, appointmentTime]
    );
    if (existing) {
      throw new AppError(409, 'This appointment slot has already been booked. Please select another time.');
    }

    let slot = db.get(
      `SELECT * FROM appointment_slots
       WHERE doctor_id = ? AND slot_date = ? AND slot_time = ?`,
      [doctorId, appointmentDate, appointmentTime]
    );
    if (slot && slot.status !== 'Available') {
      throw new AppError(409, 'Selected slot is no longer available.');
    }
    if (!slot) {
      const sInfo = db.run(
        `INSERT INTO appointment_slots (doctor_id, branch_id, slot_date, slot_time, status)
         VALUES (?, ?, ?, ?, 'Booked')`,
        [doctorId, doc.branch_id, appointmentDate, appointmentTime]
      );
      slot = { id: sInfo.lastInsertRowid };
    } else {
      db.run('UPDATE appointment_slots SET status = ?, updated_at = datetime(\'now\') WHERE id = ?', ['Booked', slot.id]);
    }

    const ref = `APT-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
    const info = db.run(
      `INSERT INTO appointments (appointment_ref, patient_id, doctor_id, branch_id, department_id, slot_id, appointment_date, appointment_time, visit_type, reason, fee, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Booked', ?)`,
      [ref, patientId, doctorId, doc.branch_id, doc.department_id, slot.id, appointmentDate, appointmentTime, visitType, reason, doc.consultation_fee, actor.id]
    );

    const pat = db.get('SELECT u.id as user_id, u.full_name FROM patient_profiles p JOIN users u ON u.id = p.user_id WHERE p.id = ?', [patientId]);

    db.run(
      `INSERT INTO workflow_history (entity_type, entity_id, from_status, to_status, actor_id, notes)
       VALUES ('appointment', ?, NULL, 'Booked', ?, 'Appointment created')`,
      [info.lastInsertRowid, actor.id]
    );

    return { appointmentId: info.lastInsertRowid, ref, doc, pat };
  });

  const result = tx();
  if (broker) {
    broker.publish('appointment:created', {
      appointmentId: result.appointmentId,
      ref: result.ref,
      title: 'New Appointment Booked',
      message: `${result.pat.full_name} booked ${result.ref} with ${result.doc.doctor_name}`
    }, { userId: result.doc.doctor_user_id, roles: ['receptionist', 'admin'] });
  }

  return db.get(
    `SELECT a.*, u.full_name as doctor_name, pu.full_name as patient_name, p.patient_code,
            b.name as branch_name, d.name as department_name
     FROM appointments a
     JOIN doctor_profiles doc ON doc.id = a.doctor_id
     JOIN users u ON u.id = doc.user_id
     JOIN patient_profiles p ON p.id = a.patient_id
     JOIN users pu ON pu.id = p.user_id
     JOIN branches b ON b.id = a.branch_id
     JOIN departments d ON d.id = a.department_id
     WHERE a.id = ?`,
    [result.appointmentId]
  );
}

export function transitionAppointmentTx(db, broker, { appointmentId, toStatus, newDate, newTime, actor, notes }) {
  return db.transaction(() => {
    const apt = db.get(
      `SELECT a.*, p.user_id as patient_user_id, doc.user_id as doctor_user_id
       FROM appointments a
       JOIN patient_profiles p ON p.id = a.patient_id
       JOIN doctor_profiles doc ON doc.id = a.doctor_id
       WHERE a.id = ?`,
      [appointmentId]
    );
    if (!apt) throw new AppError(404, 'Appointment not found.');
    if (actor.role === 'patient' && apt.patient_user_id !== actor.id) {
      throw new AppError(403, 'You can only modify your own appointments.');
    }

    if (toStatus === 'Rescheduled') {
      if (!newDate || !newTime) throw new AppError(400, 'New date and time are required to reschedule.');
      const conflict = db.get(
        `SELECT id FROM appointments WHERE doctor_id = ? AND appointment_date = ? AND appointment_time = ? AND id != ? AND status NOT IN ('Cancelled','Rescheduled')`,
        [apt.doctor_id, newDate, newTime, apt.id]
      );
      if (conflict) throw new AppError(409, 'Target slot is already booked.');
      if (apt.slot_id) db.run('UPDATE appointment_slots SET status = ? WHERE id = ?', ['Available', apt.slot_id]);
      db.run('UPDATE appointment_slots SET status = ? WHERE doctor_id = ? AND slot_date = ? AND slot_time = ?', ['Booked', apt.doctor_id, newDate, newTime]);
      db.run('UPDATE appointments SET appointment_date = ?, appointment_time = ?, status = ?, updated_at = datetime(\'now\') WHERE id = ?',
        [newDate, newTime, 'Confirmed', apt.id]);
    } else {
      if (toStatus === 'Cancelled' && apt.slot_id) {
        db.run('UPDATE appointment_slots SET status = ? WHERE id = ?', ['Available', apt.slot_id]);
      }
      const checkedInAt = toStatus === 'Checked In' ? new Date().toISOString() : apt.checked_in_at;
      const checkedOutAt = toStatus === 'Checked Out' ? new Date().toISOString() : apt.checked_out_at;
      db.run('UPDATE appointments SET status = ?, checked_in_at = ?, checked_out_at = ?, updated_at = datetime(\'now\') WHERE id = ?',
        [toStatus, checkedInAt, checkedOutAt, apt.id]);
    }

    validateAndRecordTransition(db, broker, {
      entityType: 'appointment',
      entityId: apt.id,
      fromStatus: apt.status,
      toStatus,
      actor,
      notes,
      notify: {
        userId: apt.patient_user_id,
        roles: ['doctor', 'receptionist'],
        title: `Appointment ${toStatus}`,
        message: `Appointment ${apt.appointment_ref} is now ${toStatus}.`,
        eventType: 'appointment:updated'
      }
    });

    if (toStatus === 'Checked In' && broker) {
      broker.publish('patient:checked_in', {
        appointmentId: apt.id,
        ref: apt.appointment_ref,
        title: 'Patient Checked In',
        message: `Appointment ${apt.appointment_ref} has checked in.`
      }, { userId: apt.doctor_user_id, roles: ['doctor', 'nurse', 'receptionist'] });
    }

    return db.get('SELECT * FROM appointments WHERE id = ?', [apt.id]);
  })();
}
