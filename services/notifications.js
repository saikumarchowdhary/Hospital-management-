export function createNotification(db, broker, { userId = null, roleCode = null, roles = null, title, message, category = 'info', link = null, eventType = 'notification' }) {
  const targetRoles = roles || (roleCode ? [roleCode] : [null]);
  const createdIds = [];

  for (const rc of targetRoles) {
    const info = db.run(
      `INSERT INTO notifications (user_id, role_code, title, message, category, link)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, rc, title, message, category, link]
    );
    createdIds.push(info.lastInsertRowid);
  }

  if (broker) {
    broker.publish(eventType, { title, message, category, link }, { userId, roles: roles || (roleCode ? [roleCode] : null) });
  }
  return createdIds;
}

export function getUserNotifications(db, user) {
  const rows = db.all(
    `SELECT n.*,
            CASE WHEN nr.read_at IS NOT NULL THEN 1 ELSE 0 END as is_read
     FROM notifications n
     LEFT JOIN notification_reads nr ON nr.notification_id = n.id AND nr.user_id = ?
     WHERE n.user_id = ?
        OR n.role_code = ?
        OR (n.role_code = 'all' AND ? IS NOT NULL)
     ORDER BY n.created_at DESC, n.id DESC
     LIMIT 40`,
    [user.id, user.id, user.role, user.role]
  );
  const unreadCount = rows.filter((r) => !r.is_read).length;
  return { items: rows, unreadCount };
}

export function markNotificationRead(db, notificationId, userId) {
  db.run('INSERT OR IGNORE INTO notification_reads (notification_id, user_id) VALUES (?, ?)', [notificationId, userId]);
}

export function markAllRead(db, user) {
  const { items } = getUserNotifications(db, user);
  for (const item of items) {
    if (!item.is_read) {
      db.run('INSERT OR IGNORE INTO notification_reads (notification_id, user_id) VALUES (?, ?)', [item.id, user.id]);
    }
  }
}
