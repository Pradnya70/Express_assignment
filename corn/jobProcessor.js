const cron = require('node-cron');
const pool = require('../config/db');

const MAX_RETRIES = 3;

async function processJob(job) {
  await new Promise((resolve) => setTimeout(resolve, 100 + Math.random() * 200));

  if (Math.random() < 0.2) {
    throw new Error(`External system failure for job ${job.id}`);
  }
  console.log(`✅ Job ${job.id} (${job.job_type}) processed`);
}

async function processQueue() {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [jobs] = await conn.query(
      `SELECT * FROM job_queue
       WHERE (status = 'pending' OR (status = 'failed' AND retry_count < ?))
       ORDER BY created_at ASC
       LIMIT 10
       FOR UPDATE`,
      [MAX_RETRIES]
    );

    if (!jobs.length) {
      await conn.commit();
      return;
    }

    console.log(`Processing ${jobs.length} jobs...`);

    for (const job of jobs) {
      try {
        await conn.query(
          'UPDATE job_queue SET status = "processing", last_attempt_at = NOW() WHERE id = ?',
          [job.id]
        );

        await processJob(job);

        await conn.query(
          'UPDATE job_queue SET status = "completed" WHERE id = ?',
          [job.id]
        );
      } catch (err) {
        await conn.query(
          'UPDATE job_queue SET status = "failed", retry_count = retry_count + 1, last_attempt_at = NOW() WHERE id = ?',
          [job.id]
        );
        console.error(`❌ Job ${job.id} failed:`, err.message);
      }
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    console.error('Job queue transaction error:', err);
  } finally {
    conn.release();
  }
}

const start = () => {
  cron.schedule('*/2 * * * *', () => {
    console.log('⏱️ Running job queue processor...');
    processQueue().catch(console.error);
  });
  console.log('Cron started (every 2 minutes)');
};

module.exports = { start, processQueue };
