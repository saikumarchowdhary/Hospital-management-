export function getAdminDashboardStats(db) {
  const totalPatients = db.get('SELECT COUNT(*) as c FROM patient_profiles').c;
  const totalDoctors = db.get('SELECT COUNT(*) as c FROM doctor_profiles WHERE is_active = 1').c;
  const totalStaff = db.get('SELECT COUNT(*) as c FROM employee_profiles WHERE employment_status = ?', ['Active']).c;
  const totalEmployees = db.get('SELECT COUNT(*) as c FROM employee_profiles').c;
  const totalUsers = db.get('SELECT COUNT(*) as c FROM users').c;
  const totalDepartments = db.get('SELECT COUNT(*) as c FROM departments WHERE is_active = 1').c;
  const totalAppointments = db.get('SELECT COUNT(*) as c FROM appointments').c;
  const todaysAppointments = db.get('SELECT COUNT(*) as c FROM appointments WHERE appointment_date = date(\'now\')').c;
  const activeAdmissions = db.get(`SELECT COUNT(*) as c FROM admissions WHERE status IN ('Admitted','Active Care','Discharge Pending')`).c;
  const availableBeds = db.get('SELECT COUNT(*) as c FROM beds WHERE status = ?', ['Available']).c;
  const occupiedBeds = db.get('SELECT COUNT(*) as c FROM beds WHERE status = ?', ['Occupied']).c;
  const pendingLabs = db.get(`SELECT COUNT(*) as c FROM lab_orders WHERE status != 'Released'`).c;
  const lowStockMeds = db.get(
    `SELECT COUNT(*) as c FROM medicines m JOIN pharmacy_inventory pi ON pi.medicine_id = m.id WHERE pi.total_quantity <= m.reorder_level`
  ).c;
  const outstandingPayments = db.get(`SELECT COALESCE(SUM(balance_due), 0) as s FROM invoices WHERE status IN ('Pending','Processing')`).s;
  const totalRevenue = db.get(`SELECT COALESCE(SUM(amount), 0) as s FROM payments WHERE status = 'Paid'`).s;
  const todaysRevenue = db.get(`SELECT COALESCE(SUM(amount), 0) as s FROM payments WHERE date(paid_at) = date('now') AND status = 'Paid'`).s;
  const systemNotifications = db.get(`SELECT COUNT(*) as c FROM notifications`).c;
  const pendingNoticeApprovals = db.get(`SELECT COUNT(*) as c FROM announcements WHERE status IN ('Submitted','Pending Approval','Under Review')`).c;
  const pendingCampaignApprovals = db.get(`SELECT COUNT(*) as c FROM campaigns WHERE status IN ('Submitted','Pending Approval','Under Review')`).c;

  const appointmentsByStatus = db.all('SELECT status as label, COUNT(*) as value FROM appointments GROUP BY status');
  const deptPerformance = db.all(
    `SELECT d.name as label, COUNT(a.id) as value
     FROM departments d LEFT JOIN appointments a ON a.department_id = d.id
     WHERE d.category = 'clinical'
     GROUP BY d.id ORDER BY value DESC LIMIT 6`
  );
  const bedStatusBreakdown = db.all('SELECT status as label, COUNT(*) as value FROM beds GROUP BY status');
  const revenueByDay = db.all(
    `SELECT date(created_at) as label, ROUND(SUM(total_amount), 2) as value
     FROM invoices GROUP BY date(created_at) ORDER BY label ASC LIMIT 7`
  );
  const registrationsTrend = db.all(
    `SELECT date(created_at) as label, COUNT(*) as value
     FROM patient_profiles GROUP BY date(created_at) ORDER BY label ASC LIMIT 7`
  );
  const labTurnaround = db.all('SELECT status as label, COUNT(*) as value FROM lab_orders GROUP BY status');

  const recentActivity = db.all(
    `SELECT al.action, al.entity_type, al.entity_id, al.actor_role, al.created_at, u.full_name as actor_name
     FROM audit_logs al LEFT JOIN users u ON u.id = al.actor_user_id
     ORDER BY al.id DESC LIMIT 12`
  );

  const escalatedExternal = db.all(
    `SELECT id, request_ref as ref, request_type as category, 'External Coordination' as module_name, 'Leena Paul' as owner_name, 'Overdue 2d' as age_label, 'Escalated external request' as title, created_at
     FROM external_requests WHERE status = 'Escalated'`
  );
  const unassignedAmbulance = db.all(
    `SELECT id, ambulance_ref as ref, emergency_type as category, 'Emergency Dispatch' as module_name, 'Unassigned' as owner_name, 'Unassigned' as age_label, 'Unassigned emergency ambulance' as title, created_at
     FROM ambulance_requests WHERE status IN ('Submitted', 'Received') AND assigned_user_id IS NULL`
  );
  const expiringBlood = db.all(
    `SELECT bi.id, bi.bag_code as ref, bg.group_name as category, 'Blood Bank' as module_name, 'Farhan Ali' as owner_name, 'Near Expiry' as age_label, 'Blood unit near expiry / stock alert' as title, bi.created_at
     FROM blood_inventory bi JOIN blood_groups bg ON bg.id = bi.blood_group_id
     WHERE bi.status = 'Available' AND bi.expiry_date <= datetime('now', '+3 days')`
  );

  const attentionQueue = [...escalatedExternal, ...unassignedAmbulance, ...expiringBlood];

  return {
    kpis: {
      totalPatients,
      totalDoctors,
      totalStaff,
      activeStaff: totalStaff,
      totalEmployees,
      totalUsers,
      totalDepartments,
      totalAppointments,
      todaysAppointments,
      activeAdmissions,
      availableBeds,
      occupiedBeds,
      pendingLabs,
      lowStockMeds,
      outstandingPayments: Number(outstandingPayments.toFixed(2)),
      pendingPayments: Number(outstandingPayments.toFixed(2)),
      totalRevenue: Number(totalRevenue.toFixed(2)),
      todaysRevenue: Number(todaysRevenue.toFixed(2)),
      systemNotifications,
      pendingApprovalsCount: pendingNoticeApprovals + pendingCampaignApprovals
    },
    charts: {
      appointmentsByStatus,
      deptPerformance,
      bedStatusBreakdown,
      revenueByDay,
      registrationsTrend,
      labTurnaround
    },
    recentActivity,
    attentionQueue
  };
}

export function generateReportData(db, { type = 'appointments', days = 30, branchId = null, departmentId = null, status = null }) {
  const daysNum = Number(days) || 30;
  const sinceExpr = `-${daysNum} days`;
  const filters = { type, days: daysNum, branchId, departmentId, status };
  let rows = [];
  let summary = [];

  if (type === 'appointments' || type === 'doctor_performance') {
    const where = [`a.created_at >= datetime('now', ?)`];
    const params = [sinceExpr];
    if (branchId) { where.push('a.branch_id = ?'); params.push(Number(branchId)); }
    if (departmentId) { where.push('a.department_id = ?'); params.push(Number(departmentId)); }
    if (status) { where.push('a.status = ?'); params.push(status); }
    rows = db.all(
      `SELECT a.appointment_ref, a.appointment_date, a.appointment_time, a.visit_type, a.status, a.fee,
              pu.full_name as patient_name, du.full_name as doctor_name, d.name as department, b.name as branch
       FROM appointments a
       JOIN patient_profiles p ON p.id = a.patient_id JOIN users pu ON pu.id = p.user_id
       JOIN doctor_profiles doc ON doc.id = a.doctor_id JOIN users du ON du.id = doc.user_id
       JOIN departments d ON d.id = a.department_id JOIN branches b ON b.id = a.branch_id
       WHERE ${where.join(' AND ')} ORDER BY a.appointment_date DESC`,
      params
    );
    summary = db.all(
      `SELECT status as label, COUNT(*) as value FROM appointments WHERE created_at >= datetime('now', ?) GROUP BY status`,
      [sinceExpr]
    );
  } else if (type === 'revenue' || type === 'collections') {
    rows = db.all(
      `SELECT i.invoice_number, date(i.created_at) as invoice_date, pu.full_name as patient_name,
              i.description, i.total_amount, i.paid_amount, i.balance_due, i.status
       FROM invoices i
       JOIN patient_profiles p ON p.id = i.patient_id JOIN users pu ON pu.id = p.user_id
       WHERE i.created_at >= datetime('now', ?) ORDER BY i.id DESC`,
      [sinceExpr]
    );
    summary = db.all(
      `SELECT status as label, ROUND(SUM(total_amount), 2) as value FROM invoices WHERE created_at >= datetime('now', ?) GROUP BY status`,
      [sinceExpr]
    );
  } else if (type === 'pharmacy_inventory' || type === 'medicine_expiry') {
    rows = db.all(
      `SELECT m.sku, m.name, mc.name as category, pi.total_quantity, m.reorder_level,
              mb.batch_number, mb.expiry_date, mb.quantity_available
       FROM medicines m
       LEFT JOIN medicine_categories mc ON mc.id = m.category_id
       LEFT JOIN pharmacy_inventory pi ON pi.medicine_id = m.id
       LEFT JOIN medicine_batches mb ON mb.medicine_id = m.id
       ORDER BY mb.expiry_date ASC`
    );
    summary = db.all(
      `SELECT m.name as label, COALESCE(pi.total_quantity, 0) as value
       FROM medicines m LEFT JOIN pharmacy_inventory pi ON pi.medicine_id = m.id`
    );
  } else if (type === 'bed_occupancy' || type === 'admissions') {
    rows = db.all(
      `SELECT a.admission_ref, pu.full_name as patient_name, d.name as department,
              b.bed_code, a.admission_type, a.status, a.admitted_at, a.discharged_at
       FROM admissions a
       JOIN patient_profiles p ON p.id = a.patient_id JOIN users pu ON pu.id = p.user_id
       JOIN departments d ON d.id = a.department_id
       LEFT JOIN beds b ON b.id = a.bed_id
       ORDER BY a.id DESC`
    );
    summary = db.all('SELECT status as label, COUNT(*) as value FROM beds GROUP BY status');
  } else if (type === 'blood_stock') {
    rows = db.all(
      `SELECT bi.bag_code, bg.group_name, bi.component, bi.collection_date, bi.expiry_date, bi.status
       FROM blood_inventory bi JOIN blood_groups bg ON bg.id = bi.blood_group_id ORDER BY bi.expiry_date ASC`
    );
    summary = db.all(
      `SELECT bg.group_name as label, COUNT(bi.id) as value
       FROM blood_groups bg LEFT JOIN blood_inventory bi ON bi.blood_group_id = bg.id AND bi.status = 'Available'
       GROUP BY bg.id`
    );
  } else {
    rows = db.all(
      `SELECT lo.order_ref, lt.name as test_name, pu.full_name as patient_name, lo.priority, lo.status, lo.created_at
       FROM lab_orders lo
       JOIN lab_tests lt ON lt.id = lo.test_id
       JOIN patient_profiles p ON p.id = lo.patient_id JOIN users pu ON pu.id = p.user_id
       ORDER BY lo.id DESC`
    );
    summary = db.all('SELECT status as label, COUNT(*) as value FROM lab_orders GROUP BY status');
  }

  return {
    generatedAt: new Date().toISOString(),
    dataSource: 'MediCore HMS SQLite Database (includes clearly marked Sample Demo data)',
    filters,
    summary,
    rows
  };
}

export function toCsv(rows) {
  if (!rows || !rows.length) return 'No data available\n';
  const headers = Object.keys(rows[0]);
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  return [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n');
}
