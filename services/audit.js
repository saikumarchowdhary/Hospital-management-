export function logAudit(db, { actorUserId = null, actorRole = null, action, entityType, entityId = null, details = null, ip = null }) {
  const detailStr = typeof details === 'string' ? details : details ? JSON.stringify(details) : null;
  db.run(
    `INSERT INTO audit_logs (actor_user_id, actor_role, action, entity_type, entity_id, details, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [actorUserId, actorRole, action, entityType, entityId !== null ? String(entityId) : null, detailStr, ip]
  );
}
