const express = require('express');
const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/auth', require('./Routes/auth'));
app.use('/users', require('./Routes/users'));
app.use('/projects', require('./Routes/projects'));
app.use('/tasks', require('./Routes/tasks'));
app.use('/system', require('./Routes/system'));



app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Endpoint not found' });
});

app.use((err, req, res, next) => {
  console.error('Error:', err);
  const status = err.status || 500;
  const message = err.publicMessage || 'Internal server error';
  res.status(status).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { details: err.message })
  });
});

module.exports = app;
