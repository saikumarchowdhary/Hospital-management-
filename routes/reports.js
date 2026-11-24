import express from 'express';
import { asyncHandler } from '../middleware/errors.js';
import { requirePermission } from '../middleware/roles.js';
import { generateReportData, getAdminDashboardStats, toCsv } from '../services/reports.js';

export function createReportsRouter(db, authenticate) {
  const router = express.Router();
  router.use(authenticate);

  router.get('/dashboard', requirePermission('reports.view', 'admin.all'), asyncHandler(async (_req, res) => {
    res.json(getAdminDashboardStats(db));
  }));

  router.get('/', requirePermission('reports.view', 'admin.all'), asyncHandler(async (req, res) => {
    const data = generateReportData(db, {
      type: req.query.type || 'appointments',
      days: req.query.days || 30,
      branchId: req.query.branchId || null,
      departmentId: req.query.departmentId || null,
      status: req.query.status || null
    });
    res.json(data);
  }));

  router.get('/export.csv', requirePermission('reports.view', 'admin.all'), asyncHandler(async (req, res) => {
    const data = generateReportData(db, {
      type: req.query.type || 'appointments',
      days: req.query.days || 30,
      branchId: req.query.branchId || null,
      departmentId: req.query.departmentId || null,
      status: req.query.status || null
    });
    const csv = toCsv(data.rows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="medicore-${data.filters.type}-report.csv"`);
    res.send(csv);
  }));

  return router;
}
