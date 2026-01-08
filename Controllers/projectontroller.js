const pool = require('../config/db');
const { logActivity } = require('../services/auditService');

exports.createProject = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { name, description } = req.body;
    await conn.beginTransaction();

    const [result] = await conn.query(
      'INSERT INTO projects (name, description, status) VALUES (?, ?, ?)',
      [name, description || null, 'planned']
    );

    await logActivity(conn, {
      entityType: 'project',
      entityId: result.insertId,
      action: 'create',
      metadata: { userId: req.user.id },
    });

    await conn.commit();
    res.status(201).json({ success: true, id: result.insertId });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};

exports.updateProject = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;
    const { name, description, status } = req.body;
    await conn.beginTransaction();

    const [existing] = await conn.query(
      'SELECT id FROM projects WHERE id = ? AND is_deleted = 0',
      [id]
    );
    if (!existing.length) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    await conn.query(
      'UPDATE projects SET name = ?, description = ?, status = ? WHERE id = ?',
      [name, description, status, id]
    );

    await logActivity(conn, {
      entityType: 'project',
      entityId: id,
      action: 'update',
      metadata: { userId: req.user.id },
    });

    await conn.commit();
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};
