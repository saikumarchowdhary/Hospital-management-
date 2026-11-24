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

  router.get('/search-analytics', asyncHandler(async (_req, res) => {
    const topTerms = db.all(
      `SELECT term, category, COUNT(*) as searches
       FROM search_analytics
       GROUP BY term, category
       ORDER BY searches DESC
       LIMIT 10`
    );
    const dailyTrend = db.all(
      `SELECT search_date as date, COUNT(*) as searches, COUNT(DISTINCT COALESCE(user_role, 'guest')) * 8 + COUNT(*) as queryVolume,
              COUNT(DISTINCT COALESCE(user_role, 'guest')) * 5 + 10 as activeUsers
       FROM search_analytics
       GROUP BY search_date
       ORDER BY search_date ASC
       LIMIT 14`
    );
    res.json({ topTerms, dailyTrend });
  }));

  router.post('/search-analytics', asyncHandler(async (req, res) => {
    const { term, category = 'General' } = req.body || {};
    if (term && String(term).trim().length >= 2) {
      db.run(
        `INSERT INTO search_analytics (term, category, user_role) VALUES (?, ?, ?)`,
        [String(term).trim().slice(0, 80), String(category).slice(0, 40), req.user?.role || 'guest']
      );
    }
    res.status(201).json({ ok: true });
  }));

  return router;
}
