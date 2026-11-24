import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'text/plain',
  'text/csv'
]);

const ALLOWED_EXT = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.txt', '.csv']);

export function createUploadMiddleware(customDir) {
  const uploadDir = path.resolve(customDir || process.env.HMS_UPLOAD_DIR || path.join(process.cwd(), 'uploads'));
  fs.mkdirSync(uploadDir, { recursive: true });

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const safeExt = ALLOWED_EXT.has(ext) ? ext : '.bin';
      cb(null, `${Date.now()}-${crypto.randomUUID()}${safeExt}`);
    }
  });

  const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      if (!ALLOWED_MIME.has(file.mimetype) || !ALLOWED_EXT.has(ext)) {
        return cb(new Error('Unsupported file type. Allowed: PDF, PNG, JPG, TXT, CSV up to 5MB.'));
      }
      return cb(null, true);
    }
  });

  return { upload, uploadDir };
}

export function resolveSafeUploadPath(uploadDir, storedName) {
  const baseDir = path.resolve(uploadDir);
  const target = path.resolve(baseDir, path.basename(storedName));
  if (!target.startsWith(baseDir + path.sep)) {
    throw new Error('Invalid file path.');
  }
  return target;
}
