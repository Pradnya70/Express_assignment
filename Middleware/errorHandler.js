module.exports = (err, req, res, next) => {
  console.error(err); 

  const status = err.status || 500;
  const message = err.publicMessage || 'Internal server error';

  res.status(status).json({
    success: false,
    message,
    details: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
};
