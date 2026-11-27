import express from 'express';
import { AppError, asyncHandler } from '../middleware/errors.js';
import { requirePermission } from '../middleware/roles.js';

export function createBedsRouter(db, authenticate, broker = null) {
  const router = express.Router();
  router.use(authenticate);

  router.get('/', requirePermission('admissions.manage', 'housekeeping.manage', 'patients.read_all'), asyncHandler(async (_req, res) => {
    const beds = db.all(
      `SELECT b.*, r.room_number, r.room_type, r.daily_rate, w.name as ward_name, w.ward_type, w.floor,
              a.id as active_admission_id, a.admission_ref, a.department_id,
              d.name as department_name, pu.full_name as patient_name, p.patient_code
       FROM beds b
       JOIN rooms r ON r.id = b.room_id
       JOIN wards w ON w.id = r.ward_id
       LEFT JOIN bed_allocations ba ON ba.bed_id = b.id AND ba.status = 'Active'
       LEFT JOIN admissions a ON a.id = ba.admission_id
       LEFT JOIN departments d ON d.id = a.department_id
       LEFT JOIN patient_profiles p ON p.id = a.patient_id
       LEFT JOIN users pu ON pu.id = p.user_id
       ORDER BY w.id, r.room_number, b.bed_code`
    );
    const wards = db.all('SELECT * FROM wards');
    res.json({ beds, wards });
  }));

  router.patch('/:id/status', requirePermission('admissions.manage', 'housekeeping.manage'), asyncHandler(async (req, res) => {
    const bedId = Number(req.params.id);
    const { status } = req.body;
    const bed = db.get('SELECT * FROM beds WHERE id = ?', [bedId]);
    if (!bed) throw new AppError(404, 'Bed not found.');

    if (bed.status === 'Cleaning' && status === 'Available') {
      const pendingInsp = db.get(
        `SELECT id FROM housekeeping_tasks WHERE bed_id = ? AND status != 'Completed'`,
        [bedId]
      );
      if (pendingInsp) {
        throw new AppError(409, 'Bed cannot be marked Available until housekeeping cleaning and inspection pass.');
      }
    }

    const previousStatus = bed.status;
    db.run('UPDATE beds SET status = ?, updated_at = datetime(\'now\') WHERE id = ?', [status, bedId]);
    const updatedBed = db.get(
      `SELECT b.*, r.room_number, w.name as ward_name
       FROM beds b
       JOIN rooms r ON r.id = b.room_id
       JOIN wards w ON w.id = r.ward_id
       WHERE b.id = ?`,
      [bedId]
    );

    if (broker && previousStatus !== status) {
      broker.publish(
        status === 'Available' ? 'bed:released' : 'bed:status_changed',
        {
          bedId,
          bedCode: updatedBed?.bed_code || bed.bed_code,
          wardName: updatedBed?.ward_name || '',
          roomNumber: updatedBed?.room_number || '',
          previousStatus,
          status,
          title: status === 'Available' ? 'Bed Now Available' : 'Bed Status Updated',
          message: `Bed ${updatedBed?.bed_code || bed.bed_code} transitioned from ${previousStatus} to ${status}.`
        },
        {
          roles: ['admin', 'department_admin', 'doctor', 'nurse', 'receptionist', 'case_manager', 'housekeeping', 'housekeeping_supervisor']
        }
      );
    }

    res.json({ bed: updatedBed });
  }));

  return router;
}
