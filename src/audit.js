const db = require('./db');

// Fire-and-forget audit entry; never breaks the request.
function audit(req, action, entity, entityId) {
  db.query('INSERT INTO audit_log(user_id,action,entity,entity_id,ip) VALUES($1,$2,$3,$4,$5)', [
    req.user?.id || null, action, entity || null, entityId ? String(entityId) : null, req.ip,
  ]).catch(() => {});
}

module.exports = audit;