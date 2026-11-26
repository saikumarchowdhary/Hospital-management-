import express from 'express';
import { body } from 'express-validator';
import { AppError, asyncHandler } from '../middleware/errors.js';
import { requireRole } from '../middleware/roles.js';
import { validateRequest } from '../middleware/validation.js';
import { logAudit } from '../services/audit.js';

export function registerHospitalIdsRoutes(router, db, eventBroker = null) {
  const subRouter = express.Router();
  subRouter.use(requireRole('admin'));

  // GET /api/admin/hospital-ids
  subRouter.get(
    '/',
    asyncHandler(async (req, res) => {
      const { status = 'all', search = '', role = '' } = req.query;

      let whereClauses = [];
      let params = [];

      if (status === 'unused') {
        whereClauses.push('hid.is_used = 0');
      } else if (status === 'used') {
        whereClauses.push('hid.is_used = 1');
      }

      if (role) {
        whereClauses.push('hid.assigned_role = ?');
        params.push(role);
      }

      if (search && String(search).trim()) {
        const s = `%${String(search).trim()}%`;
        whereClauses.push(
          '(hid.hospital_id LIKE ? OR hid.notes LIKE ? OR u.full_name LIKE ? OR u.email LIKE ?)'
        );
        params.push(s, s, s, s);
      }

      const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

      const query = `
        SELECT
          hid.id,
          hid.hospital_id,
          hid.assigned_role,
          hid.department_id,
          hid.is_used,
          hid.used_by_user_id,
          hid.used_at,
          hid.created_by,
          hid.notes,
          hid.created_at,
          hid.updated_at,
          d.name as department_name,
          u.full_name as used_by_name,
          u.email as used_by_email,
          r.code as used_by_role,
          r.name as used_by_role_name
        FROM hospital_ids hid
        LEFT JOIN departments d ON d.id = hid.department_id
        LEFT JOIN users u ON u.id = hid.used_by_user_id
        LEFT JOIN roles r ON r.id = u.role_id
        ${whereSql}
        ORDER BY hid.hospital_id ASC
      `;

      const list = db.all(query, params);

      const totalRow = db.get('SELECT COUNT(*) as total, SUM(CASE WHEN is_used = 1 THEN 1 ELSE 0 END) as used, SUM(CASE WHEN is_used = 0 THEN 1 ELSE 0 END) as unused FROM hospital_ids');

      res.json({
        hospitalIds: list,
        summary: {
          total: totalRow?.total || 0,
          used: totalRow?.used || 0,
          unused: totalRow?.unused || 0
        }
      });
    })
  );

  // POST /api/admin/hospital-ids (Create single custom Hospital ID)
  subRouter.post(
    '/',
    [
      body('hospital_id')
        .trim()
        .matches(/^MED\d{3}$/i)
        .withMessage('Hospital ID must follow the format MED followed by 3 digits (e.g. MED001).')
    ],
    validateRequest,
    asyncHandler(async (req, res) => {
      const { hospital_id, assigned_role = null, department_id = null, notes = '' } = req.body;
      const normalizedId = String(hospital_id).trim().toUpperCase();

      const existing = db.get('SELECT id FROM hospital_ids WHERE upper(hospital_id) = ?', [normalizedId]);
      if (existing) {
        throw new AppError(409, `Hospital ID "${normalizedId}" already exists.`);
      }

      const deptId = department_id ? Number(department_id) : null;
      const info = db.run(
        `INSERT INTO hospital_ids (hospital_id, assigned_role, department_id, created_by, notes)
         VALUES (?, ?, ?, ?, ?)`,
        [normalizedId, assigned_role || null, deptId, req.user.id, notes ? String(notes).trim() : null]
      );

      const created = db.get('SELECT * FROM hospital_ids WHERE id = ?', [info.lastInsertRowid]);

      logAudit(db, {
        actorUserId: req.user.id,
        actorRole: req.user.role,
        action: 'admin.hospital_id_created',
        entityType: 'hospital_id',
        entityId: created.id,
        details: JSON.stringify({ hospital_id: normalizedId, assigned_role })
      });

      res.status(201).json({
        message: `Hospital ID ${normalizedId} created successfully.`,
        hospitalId: created
      });
    })
  );

  // POST /api/admin/hospital-ids/generate (Batch or Auto-next sequential generation)
  subRouter.post(
    '/generate',
    asyncHandler(async (req, res) => {
      const count = Math.min(Math.max(Number(req.body.count || 1), 1), 50);
      const assigned_role = req.body.assigned_role || null;
      const department_id = req.body.department_id ? Number(req.body.department_id) : null;
      const notes = req.body.notes ? String(req.body.notes).trim() : 'Auto-generated ID';

      // Find highest number currently in hospital_ids
      const allRows = db.all('SELECT hospital_id FROM hospital_ids');
      let maxNum = 0;
      for (const row of allRows) {
        const match = String(row.hospital_id).toUpperCase().match(/^MED(\d{3})$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) maxNum = num;
        }
      }

      const generated = [];
      db.transaction(() => {
        for (let i = 1; i <= count; i++) {
          const nextNum = maxNum + i;
          if (nextNum > 999) {
            throw new AppError(400, 'Maximum 3-digit Hospital ID limit (MED999) reached.');
          }
          const nextId = `MED${String(nextNum).padStart(3, '0')}`;
          const existing = db.get('SELECT id FROM hospital_ids WHERE upper(hospital_id) = ?', [nextId]);
          if (!existing) {
            const ins = db.run(
              `INSERT INTO hospital_ids (hospital_id, assigned_role, department_id, created_by, notes)
               VALUES (?, ?, ?, ?, ?)`,
              [nextId, assigned_role, department_id, req.user.id, notes]
            );
            generated.push({ id: ins.lastInsertRowid, hospital_id: nextId, assigned_role });
          }
        }
      })();

      logAudit(db, {
        actorUserId: req.user.id,
        actorRole: req.user.role,
        action: 'admin.hospital_ids_generated',
        entityType: 'hospital_id',
        entityId: generated[0]?.id || null,
        details: JSON.stringify({ count: generated.length, ids: generated.map((g) => g.hospital_id) })
      });

      res.status(201).json({
        message: `Generated ${generated.length} new Hospital ID(s).`,
        generated,
        count: generated.length
      });
    })
  );

  // DELETE /api/admin/hospital-ids/:id
  subRouter.delete(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      const item = db.get('SELECT * FROM hospital_ids WHERE id = ?', [id]);
      if (!item) {
        throw new AppError(404, 'Hospital ID not found.');
      }
      if (item.is_used) {
        throw new AppError(400, 'Cannot delete a Hospital ID that is already in use.');
      }

      db.run('DELETE FROM hospital_ids WHERE id = ?', [id]);

      logAudit(db, {
        actorUserId: req.user.id,
        actorRole: req.user.role,
        action: 'admin.hospital_id_deleted',
        entityType: 'hospital_id',
        entityId: id,
        details: JSON.stringify({ hospital_id: item.hospital_id })
      });

      res.json({ message: `Hospital ID ${item.hospital_id} deleted successfully.` });
    })
  );

  router.use('/hospital-ids', subRouter);
}
