import { validationResult } from 'express-validator';

export function validateRequest(req, res, next) {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    const errors = result.array().map((e) => ({ field: e.path, message: e.msg }));
    return res.status(400).json({
      error: errors[0].message,
      details: errors
    });
  }
  return next();
}

export function isStrongPassword(val) {
  return typeof val === 'string' && val.length >= 8 && /\d/.test(val);
}
