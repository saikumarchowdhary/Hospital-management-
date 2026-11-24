export class EventBroker {
  constructor(db) {
    this.db = db;
    this.clients = new Set();
  }

  addClient(res, user) {
    const client = { res, userId: user.id, role: user.role, isStaff: Boolean(user.is_staff) };
    this.clients.add(client);
    res.write(`event: connected\ndata: ${JSON.stringify({ userId: user.id, role: user.role, ts: new Date().toISOString() })}\n\n`);
    return client;
  }

  removeClient(client) {
    this.clients.delete(client);
  }

  publish(eventType, payload, target = {}) {
    const targetRole = target.role || null;
    const targetRoles = target.roles || null;
    const targetUserId = target.userId || null;

    const info = this.db.run(
      `INSERT INTO system_events (event_type, target_role, target_user_id, payload_json)
       VALUES (?, ?, ?, ?)`,
      [eventType, targetRoles ? targetRoles.join(',') : targetRole, targetUserId, JSON.stringify(payload)]
    );

    const frame = `id: ${info.lastInsertRowid}\nevent: ${eventType}\ndata: ${JSON.stringify({ id: info.lastInsertRowid, eventType, ...payload, ts: new Date().toISOString() })}\n\n`;

    for (const client of this.clients) {
      if (this.canReceive(client, targetUserId, targetRole, targetRoles)) {
        try {
          client.res.write(frame);
        } catch {
          this.clients.delete(client);
        }
      }
    }
    return info.lastInsertRowid;
  }

  canReceive(client, targetUserId, targetRole, targetRoles) {
    if (targetUserId && client.userId === targetUserId) return true;
    if (targetRole && (client.role === targetRole || client.role === 'admin')) return true;
    if (targetRoles && (targetRoles.includes(client.role) || client.role === 'admin')) return true;
    if (!targetUserId && !targetRole && !targetRoles && client.isStaff) return true;
    return false;
  }

  getMissedEvents(sinceId, user) {
    const rows = this.db.all('SELECT * FROM system_events WHERE id > ? ORDER BY id ASC LIMIT 50', [Number(sinceId) || 0]);
    return rows.filter((r) => {
      if (r.target_user_id && r.target_user_id === user.id) return true;
      if (r.target_role) {
        const roles = r.target_role.split(',');
        return roles.includes(user.role) || user.role === 'admin';
      }
      return Boolean(user.is_staff);
    });
  }
}
