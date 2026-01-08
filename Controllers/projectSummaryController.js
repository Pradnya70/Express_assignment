const pool = require('../config/db');
const { getCache, setCache } = require('../utils/cache');

exports.getSummary = async (req, res, next) => {
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

    const [taskAgg] = await pool.query(
      `SELECT status, COUNT(*) as count
       FROM tasks
       WHERE project_id = ? AND is_deleted = 0
       GROUP BY status`,
      [id]
    );

    const [priorityAgg] = await pool.query(
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

    const totalTasks = taskAgg.reduce((acc, row) => acc + row.count, 0);
    const doneRow = taskAgg.find((r) => r.status === 'done');
    const completion = totalTasks ? (doneRow ? doneRow.count : 0) / totalTasks : 0;

    const summary = {
      project: projectRows[0],
      tasksByStatus: taskAgg,
      tasksByPriority: priorityAgg,
      completionRate: completion,
      recentActivity: logs,
    };

    setCache(cacheKey, summary, 60 * 1000); // 1 minute cache
    res.json({ success: true, data: summary });
  } catch (err) {
    next(err);
  }
};
