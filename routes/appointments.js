import express from 'express';
import { body } from 'express-validator';
import { AppError, asyncHandler } from '../middleware/errors.js';
import { validateRequest } from '../middleware/validation.js';
import { bookAppointmentTx, transitionAppointmentTx } from '../services/appointments.js';

export function createAppointmentsRouter(db, broker, authenticate) {
  const router = express.Router();
  router.use(authenticate);

  router.get('/', asyncHandler(async (req, res) => {
    const { status, date, doctorId, departmentId } = req.query;
    const where = ['1=1'];
    const params = [];

    if (req.user.role === 'patient') {
      where.push('a.patient_id = ?');
      params.push(req.user.patient_id);
    } else if (req.user.role === 'doctor') {
      where.push('a.doctor_id = ?');
      params.push(req.user.doctor_id);
    } else if (!['admin', 'receptionist', 'nurse', 'case_manager'].includes(req.user.role)) {
      throw new AppError(403, 'Access denied to appointment schedule.');
    }

    if (status) { where.push('a.status = ?'); params.push(status); }
    if (date) { where.push('a.appointment_date = ?'); params.push(date); }
    if (doctorId && req.user.role !== 'doctor') { where.push('a.doctor_id = ?'); params.push(Number(doctorId)); }
    if (departmentId) { where.push('a.department_id = ?'); params.push(Number(departmentId)); }

    const appointments = db.all(
      `SELECT a.*, pu.full_name as patient_name, p.patient_code,
              du.full_name as doctor_name, s.name as specialty_name,
              d.name as department_name, b.name as branch_name
       FROM appointments a
       JOIN patient_profiles p ON p.id = a.patient_id
       JOIN users pu ON pu.id = p.user_id
       JOIN doctor_profiles doc ON doc.id = a.doctor_id
       JOIN users du ON du.id = doc.user_id
       JOIN specialties s ON s.id = doc.specialty_id
       JOIN departments d ON d.id = a.department_id
       JOIN branches b ON b.id = a.branch_id
       WHERE ${where.join(' AND ')}
       ORDER BY a.appointment_date DESC, a.appointment_time ASC
       LIMIT 150`,
      params
    );
    res.json({ appointments });
  }));

  router.post(
    '/',
    [
      body('doctor_id').isInt().withMessage('Doctor selection is required.'),
      body('appointment_date').notEmpty().withMessage('Appointment date is required.'),
      body('appointment_time').notEmpty().withMessage('Appointment time is required.')
    ],
    validateRequest,
    asyncHandler(async (req, res) => {
      let patientId = req.body.patient_id ? Number(req.body.patient_id) : null;
      if (req.user.role === 'patient') {
        patientId = req.user.patient_id;
      } else if (!['admin', 'receptionist', 'doctor'].includes(req.user.role)) {
        throw new AppError(403, 'Not authorized to book appointments.');
      }
      if (!patientId) throw new AppError(400, 'Patient ID is required.');

      const appointment = bookAppointmentTx(db, broker, {
        patientId,
        doctorId: Number(req.body.doctor_id),
        appointmentDate: req.body.appointment_date,
        appointmentTime: req.body.appointment_time,
        visitType: req.body.visit_type || 'In-Person',
        reason: req.body.reason || '',
        actor: req.user
      });
      res.status(201).json({ appointment });
    })
  );

  router.patch('/:id/status', asyncHandler(async (req, res) => {
    const { status, new_date, new_time, notes } = req.body;
    if (!status) throw new AppError(400, 'Target status is required.');
    if (req.user.role === 'patient' && !['Cancelled', 'Rescheduled'].includes(status)) {
      throw new AppError(403, 'Patients may only cancel or reschedule appointments.');
    }
    const updated = transitionAppointmentTx(db, broker, {
      appointmentId: Number(req.params.id),
      toStatus: status,
      newDate: new_date,
      newTime: new_time,
      actor: req.user,
      notes
    });
    res.json({ appointment: updated });
  }));

  return router;
}
