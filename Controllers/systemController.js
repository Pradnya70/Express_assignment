const pool = require('../config/db');

exports.health = async (req, res, next) => {
  try {
    const startedAt = process.env.STARTED_AT || new Date().toISOString();
    const uptimeSeconds = process.uptime();

    const [queueCounts] = await pool.query(
      `SELECT status, COUNT(*) as count FROM job_queue GROUP BY status`
    );

    const metrics = queueCounts.reduce((acc, row) => {
      acc[row.status] = row.count;
      return acc;
    }, {});

    await pool.query('SELECT 1');

    res.json({
      success: true,
      uptimeSeconds,
      startedAt,
      db: 'ok',
      queue: metrics,
    });
  } catch (err) {
    err.status = 500;
    err.publicMessage = 'System unhealthy';
    next(err);
  }
};
