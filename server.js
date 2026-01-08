require('dotenv').config();
const app = require('./app');
const { start: startCron } = require('./corn/jobProcessor');

const PORT = process.env.PORT || 3000;
process.env.STARTED_AT = new Date().toISOString();

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Health check: http://localhost:' + PORT + '/system/health');
  
  startCron();
});
