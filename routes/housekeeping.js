import express from 'express';
import { AppError, asyncHandler } from '../middleware/errors.js';
import { requirePermission } from '../middleware/roles.js';
import { validateAndRecordTransition } from '../services/workflow.js';

export function createHousekeepingRouter(db, broker, authenticate) {
  const router = express.Router();
  router.use(authenticate);

  router.get('/tasks', requirePermission('housekeeping.manage', 'admissions.manage'), asyncHandler(async (_req, res) => {
    const tasks = db.all(
      `SELECT ht.*, w.name as ward_name, r.room_number, b.bed_code, b.status as bed_status,
              u.full_name as assigned_name,
              (SELECT passed FROM room_inspections ri WHERE ri.housekeeping_task_id = ht.id ORDER BY ri.id DESC LIMIT 1) as last_inspection_passed
       FROM housekeeping_tasks ht
       LEFT JOIN wards w ON w.id = ht.ward_id
       LEFT JOIN rooms r ON r.id = ht.room_id
       LEFT JOIN beds b ON b.id = ht.bed_id
       LEFT JOIN users u ON u.id = ht.assigned_to
       ORDER BY ht.id DESC`
    );
    const rooms = db.all('SELECT r.*, w.name as ward_name FROM rooms r JOIN wards w ON w.id = r.ward_id');
    const beds = db.all('SELECT b.*, r.room_number, w.name as ward_name FROM beds b JOIN rooms r ON r.id = b.room_id JOIN wards w ON w.id = r.ward_id ORDER BY b.bed_code');
    const maintenance = db.all(
      `SELECT mr.*, r.room_number, b.bed_code, w.name as ward_name, u.full_name as reporter_name
       FROM maintenance_requests mr
       LEFT JOIN rooms r ON r.id = mr.room_id
       LEFT JOIN beds b ON b.id = mr.bed_id
       LEFT JOIN wards w ON w.id = r.ward_id
       JOIN users u ON u.id = mr.reported_by
       ORDER BY mr.id DESC LIMIT 50`
    );
    res.json({ tasks, rooms, beds, maintenance });
  }));

  router.post('/tasks', requirePermission('housekeeping.manage', 'admissions.manage'), asyncHandler(async (req, res) => {
    const { bed_id = null, room_id = null, priority = 'Normal', notes = '' } = req.body;
    let wardId = null;
    let resolvedRoomId = room_id ? Number(room_id) : null;
    if (bed_id) {
      const b = db.get('SELECT b.room_id, r.ward_id FROM beds b JOIN rooms r ON r.id = b.room_id WHERE b.id = ?', [Number(bed_id)]);
      if (b) { resolvedRoomId = b.room_id; wardId = b.ward_id; }
    }
    const ref = `HSK-${Date.now().toString().slice(-6)}`;
    const info = db.run(
      `INSERT INTO housekeeping_tasks (task_ref, ward_id, room_id, bed_id, assigned_to, priority, status, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 'Assigned', ?, ?)`,
      [ref, wardId, resolvedRoomId, bed_id ? Number(bed_id) : null, req.user.id, priority, notes, req.user.id]
    );
    res.status(201).json({ task: db.get('SELECT * FROM housekeeping_tasks WHERE id = ?', [info.lastInsertRowid]) });
  }));

  router.patch('/tasks/:id/status', requirePermission('housekeeping.manage', 'admissions.manage'), asyncHandler(async (req, res) => {
    const taskId = Number(req.params.id);
    const { status } = req.body;
    const task = db.get('SELECT * FROM housekeeping_tasks WHERE id = ?', [taskId]);
    if (!task) throw new AppError(404, 'Housekeeping task not found.');
    if (status === 'Completed') {
      throw new AppError(409, 'Room/bed tasks must pass inspection before completing.');
    }

    db.transaction(() => {
      if (status === 'In Progress') {
        db.run('UPDATE housekeeping_tasks SET status = ?, started_at = datetime(\'now\'), assigned_to = COALESCE(assigned_to, ?), updated_at = datetime(\'now\') WHERE id = ?',
          [status, req.user.id, taskId]);
      } else {
        db.run('UPDATE housekeeping_tasks SET status = ?, completed_at = datetime(\'now\'), updated_at = datetime(\'now\') WHERE id = ?',
          [status, taskId]);
      }
      validateAndRecordTransition(db, broker, {
        entityType: 'housekeeping', entityId: taskId, fromStatus: task.status, toStatus: status, actor: req.user
      });
    })();

    if (broker) {
      broker.publish('housekeeping:updated', { taskId, status }, { roles: ['housekeeping', 'nurse', 'case_manager', 'admin'] });
    }
    res.json({ task: db.get('SELECT * FROM housekeeping_tasks WHERE id = ?', [taskId]) });
  }));

  router.post('/tasks/:id/inspect', requirePermission('housekeeping.manage', 'admissions.manage'), asyncHandler(async (req, res) => {
    const taskId = Number(req.params.id);
    const { passed, checklist_notes = '' } = req.body;
    const task = db.get('SELECT * FROM housekeeping_tasks WHERE id = ?', [taskId]);
    if (!task) throw new AppError(404, 'Housekeeping task not found.');
    if (task.status !== 'Awaiting Inspection') {
      throw new AppError(409, 'Task must be in "Awaiting Inspection" state before inspecting.');
    }

    const didPass = passed === true || passed === 'true' || passed === 1;
    const nextStatus = didPass ? 'Completed' : 'Assigned';

    db.transaction(() => {
      db.run(
        `INSERT INTO room_inspections (housekeeping_task_id, room_id, bed_id, inspector_id, passed, checklist_notes)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [task.id, task.room_id, task.bed_id, req.user.id, didPass ? 1 : 0, checklist_notes]
      );
      db.run('UPDATE housekeeping_tasks SET status = ?, updated_at = datetime(\'now\') WHERE id = ?', [nextStatus, task.id]);
      if (didPass && task.bed_id) {
        db.run('UPDATE beds SET status = \'Available\', updated_at = datetime(\'now\') WHERE id = ?', [task.bed_id]);
      }
      validateAndRecordTransition(db, broker, {
        entityType: 'housekeeping',
        entityId: task.id,
        fromStatus: task.status,
        toStatus: nextStatus,
        actor: req.user,
        notes: didPass ? 'Inspection passed; bed marked Available' : `Inspection failed: ${checklist_notes}`,
        notify: didPass && task.bed_id ? {
          roles: ['nurse', 'case_manager', 'admin'],
          title: 'Bed Ready for Admission',
          message: `Housekeeping inspection passed for ${task.task_ref}. Bed is now Available.`,
          eventType: 'bed:released'
        } : null
      });
    })();

    res.json({ task: db.get('SELECT * FROM housekeeping_tasks WHERE id = ?', [task.id]), passed: didPass });
  }));

  router.post('/maintenance', requirePermission('housekeeping.manage', 'admissions.manage'), asyncHandler(async (req, res) => {
    const { room_id = null, bed_id = null, issue, priority = 'Normal' } = req.body;
    if (!issue || !String(issue).trim()) throw new AppError(400, 'Maintenance issue description is required.');
    const info = db.run(
      'INSERT INTO maintenance_requests (room_id, bed_id, issue, priority, status, reported_by) VALUES (?, ?, ?, ?, \'Open\', ?)',
      [room_id ? Number(room_id) : null, bed_id ? Number(bed_id) : null, String(issue).trim(), priority, req.user.id]
    );
    res.status(201).json({ maintenance: db.get('SELECT * FROM maintenance_requests WHERE id = ?', [info.lastInsertRowid]) });
  }));

  router.patch('/maintenance/:id', requirePermission('housekeeping.manage', 'admissions.manage'), asyncHandler(async (req, res) => {
    const { status = 'Resolved' } = req.body;
    db.run('UPDATE maintenance_requests SET status = ?, updated_at = datetime(\'now\') WHERE id = ?', [status, Number(req.params.id)]);
    res.json({ maintenance: db.get('SELECT * FROM maintenance_requests WHERE id = ?', [Number(req.params.id)]) });
  }));

  return router;
}
