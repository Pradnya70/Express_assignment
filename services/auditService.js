exports.logActivity = async (conn, { entityType, entityId, action, metadata }) => {
  await conn.query(
    'INSERT INTO activity_logs (entity_type, entity_id, action, metadata) VALUES (?, ?, ?, ?)',
    [entityType, entityId, action, JSON.stringify(metadata || null)]
  );
};
