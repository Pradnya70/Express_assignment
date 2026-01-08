const express = require('express');
const pool = require('../config/db');

const router = express.Router();

router.get('/health', async (req, res, next) => {
  try {
    const startedAt = process.env.STARTED_AT;
    const uptimeSeconds = process.uptime();

    await pool.query('SELECT 1');

    const [queueCounts] = await pool.query(
      'SELECT status, COUNT(*) as count FROM job_queue GROUP BY status'
    );

    const queue = queueCounts.reduce((acc, row) => {
      acc[row.status] = parseInt(row.count);
      return acc;
    }, {});

    res.json({
      success: true,
      uptimeSeconds: Math.round(uptimeSeconds),
      startedAt,
      db: 'ok',
      queue,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    err.status = 503;
    err.publicMessage = 'System unhealthy';
    next(err);
  }
});

module.exports = router;
