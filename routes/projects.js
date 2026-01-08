const express = require('express');
const { body, param, validationResult } = require('express-validator');
const pool = require('../config/db');
const auth = require('../middleware/auth');
const { logActivity } = require('../services/auditService');
const { getCache, setCache } = require('../utils/cache');

const router = express.Router();

const validateProjectId = [param('id').isInt({ min: 1 })];

const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
};

router.post(
  '/',
  auth(['manager', 'admin']),
  [
    body('name').isString().trim().isLength({ min: 3, max: 150 }),
    body('description').optional().isString(),
    body('status').optional().isIn(['planned', 'active', 'completed', 'archived'])
  ],
  handleValidation,
  async (req, res, next) => {
    const conn = await pool.getConnection();
    try {
      const { name, description, status } = req.body;

      await conn.beginTransaction();

      const [result] = await conn.query(
        'INSERT INTO projects (name, description, status) VALUES (?, ?, ?)',
        [name, description || null, status || 'planned']
      );

      await logActivity(conn, {
        entityType: 'project',
        entityId: result.insertId,
        action: 'create',
        metadata: { userId: req.user.id, userName: req.user.name }
      });

      await conn.commit();
      res.status(201).json({ success: true, id: result.insertId });
    } catch (err) {
      await conn.rollback();
      next(err);
    } finally {
      conn.release();
    }
  }
);

router.put(
  '/:id',
  auth(['manager', 'admin']),
  validateProjectId,
  [
    body('name').optional().isString().trim().isLength({ min: 3, max: 150 }),
    body('description').optional().isString(),
    body('status').optional().isIn(['planned', 'active', 'completed', 'archived'])
  ],
  handleValidation,
  async (req, res, next) => {
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

      const updates = [];
      const params = [];
      if (name !== undefined) {
        updates.push('name = ?');
        params.push(name);
      }
      if (description !== undefined) {
        updates.push('description = ?');
        params.push(description);
      }
      if (status !== undefined) {
        updates.push('status = ?');
        params.push(status);
      }

      if (updates.length > 0) {
        params.push(id);
        await conn.query(`UPDATE projects SET ${updates.join(', ')} WHERE id = ?`, params);
      }

      await logActivity(conn, {
        entityType: 'project',
        entityId: id,
        action: 'update',
        metadata: { userId: req.user.id, changes: req.body }
      });

      await conn.commit();
      res.json({ success: true });
    } catch (err) {
      await conn.rollback();
      next(err);
    } finally {
      conn.release();
    }
  }
);

router.get(
  '/:id/summary',
  auth(['manager', 'admin']),
  validateProjectId,
  handleValidation,
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const cacheKey = `project_summary_${id}`;

      const cached = getCache(cacheKey);
      if (cached) {
        return res.json({ success: true, cached: true, data: cached });
      }

      const [projectRows] = await pool.query(
        'SELECT id, name, status, created_at FROM projects WHERE id = ? AND is_deleted = 0',
        [id]
      );
      if (!projectRows.length) {
        return res.status(404).json({ success: false, message: 'Project not found' });
      }

      const [taskStatus] = await pool.query(
        `SELECT status, COUNT(*) as count
         FROM tasks
         WHERE project_id = ? AND is_deleted = 0
         GROUP BY status`,
        [id]
      );

      const [taskPriority] = await pool.query(
        `SELECT priority, COUNT(*) as count
         FROM tasks
         WHERE project_id = ? AND is_deleted = 0
         GROUP BY priority`,
        [id]
      );

      const [logs] = await pool.query(
        `SELECT action, metadata, created_at
         FROM activity_logs
         WHERE entity_type = 'project' AND entity_id = ?
         ORDER BY created_at DESC
         LIMIT 10`,
        [id]
      );

      const totalTasks = taskStatus.reduce((sum, row) => sum + row.count, 0);
      const doneRow = taskStatus.find((r) => r.status === 'done');
      const doneTasks = doneRow ? doneRow.count : 0;
      const completionRate = totalTasks ? ((doneTasks / totalTasks) * 100).toFixed(1) : 0;

      const summary = {
        project: projectRows[0],
        tasks: {
          total: totalTasks,
          byStatus: taskStatus,
          byPriority: taskPriority,
          completionRate: `${completionRate}%`
        },
        recentActivity: logs
      };

      setCache(cacheKey, summary);

      res.json({ success: true, cached: false, data: summary });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
