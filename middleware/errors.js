export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function errorHandler(err, _req, res, _next) {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'Uploaded file exceeds the 5MB limit.' });
  }
  if (err && err.message && err.message.startsWith('Unsupported file type')) {
    return res.status(400).json({ error: err.message });
  }
  const status = err.status || 500;
  const message = status < 500 ? err.message : 'An internal server error occurred.';
  if (status >= 500) {
    console.error('[MediCore Error]', err.message);
  }
  return res.status(status).json({ error: message });
}
