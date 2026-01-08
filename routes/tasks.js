const express = require('express');
const { body, param, validationResult } = require('express-validator');
const pool = require('../config/db');
const auth = require('../middleware/auth');
const { logActivity } = require('../services/auditService');

const router = express.Router();

const validateId = [param('id').isInt({ min: 1 })];

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
    body('project_id').isInt({ min: 1 }),
    body('title').isString().trim().isLength({ min: 3, max: 150 }),
    body('description').optional().isString(),
    body('priority').optional().isIn(['low', 'medium', 'high', 'critical']),
    body('status').optional().isIn(['todo', 'in_progress', 'done', 'blocked'])
  ],
  handleValidation,
  async (req, res, next) => {
    const conn = await pool.getConnection();
    try {
      const { project_id, title, description, priority, status } = req.body;

      await conn.beginTransaction();

      const [project] = await conn.query(
        'SELECT id FROM projects WHERE id = ? AND is_deleted = 0',
        [project_id]
      );
      if (!project.length) {
        await conn.rollback();
        return res.status(404).json({ success: false, message: 'Project not found' });
      }

      const [result] = await conn.query(
        'INSERT INTO tasks (project_id, title, description, priority, status) VALUES (?, ?, ?, ?, ?)',
        [project_id, title, description || null, priority || 'medium', status || 'todo']
      );

      await logActivity(conn, {
        entityType: 'task',
        entityId: result.insertId,
        action: 'create',
        metadata: { projectId: project_id, userId: req.user.id }
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
  '/:id/status',
  auth(['manager', 'admin']),
  validateId,
  [body('status').isIn(['todo', 'in_progress', 'done', 'blocked'])],
  handleValidation,
  async (req, res, next) => {
    const conn = await pool.getConnection();
    try {
      const { id } = req.params;
      const { status } = req.body;

      await conn.beginTransaction();

      const [task] = await conn.query(
        'SELECT status, project_id FROM tasks WHERE id = ? AND is_deleted = 0',
        [id]
      );
      if (!task.length) {
        await conn.rollback();
        return res.status(404).json({ success: false, message: 'Task not found' });
      }

      await conn.query('UPDATE tasks SET status = ? WHERE id = ?', [status, id]);

      await logActivity(conn, {
        entityType: 'task',
        entityId: id,
        action: 'status_change',
        metadata: {
          projectId: task[0].project_id,
          oldStatus: task[0].status,
          newStatus: status,
          userId: req.user.id
        }
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

module.exports = router;
