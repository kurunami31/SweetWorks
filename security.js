const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY
  ? Buffer.from(process.env.ENCRYPTION_KEY, 'hex')
  : crypto.scryptSync('sweetworks-default-key-change-in-production', 'salt', 32);
const ALGORITHM = 'aes-256-gcm';

function encrypt(text) {
  if (!text || typeof text !== 'string') return text;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return iv.toString('hex') + ':' + authTag + ':' + encrypted;
}

function decrypt(encryptedData) {
  if (!encryptedData || typeof encryptedData !== 'string') return encryptedData;
  if (!encryptedData.includes(':')) return encryptedData;
  try {
    const parts = encryptedData.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return encryptedData;
  }
}

function encryptCustomerFields(customer) {
  if (!customer) return customer;
  const fields = ['name', 'email', 'phone', 'address'];
  for (const field of fields) {
    if (customer[field]) customer[field] = encrypt(customer[field]);
  }
  return customer;
}

function decryptCustomerFields(customer) {
  if (!customer) return customer;
  const fields = ['name', 'email', 'phone', 'address'];
  for (const field of fields) {
    if (customer[field]) customer[field] = decrypt(customer[field]);
  }
  return customer;
}

const SUSPICIOUS_PATTERNS = [
  { pattern: /(\b(UNION|SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|EXEC|EXECUTE|OR\s+1=1)\b)/i, type: 'SQL Injection' },
  { pattern: /(<script[\s>]|javascript:\s*|on\w+\s*=|alert\s*\(|prompt\s*\(|confirm\s*\()/i, type: 'XSS' },
  { pattern: /(\.\.\/|\.\.\\)|%2e%2e\/|%2e%2e\\|etc\/passwd|boot\.ini|windows\\system32/i, type: 'Path Traversal' },
  { pattern: /([|;&`$\n]|\|\||&&|\(\)\s*\{)/i, type: 'Command Injection' },
  { pattern: /(\b0x[0-9a-fA-F]+\b|\bunion\b.*\bselect\b)/i, type: 'Hex/SQL Attack' },
];

const SUSPICIOUS_LOG = path.join(__dirname, 'suspicious.log');

function logSuspicious(req, type, content) {
  const entry = `[${new Date().toISOString()}] ${type} | IP: ${req.ip} | URL: ${req.originalUrl} | Content: ${content}\n`;
  fs.appendFileSync(SUSPICIOUS_LOG, entry);
  console.warn(`[SECURITY] ${type} detected from ${req.ip} on ${req.originalUrl}`);
}

function sanitizeValue(val) {
  if (typeof val !== 'string') return val;
  return val
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

function deepSanitize(obj) {
  if (typeof obj === 'string') return sanitizeValue(obj);
  if (Array.isArray(obj)) return obj.map(deepSanitize);
  if (obj && typeof obj === 'object') {
    const sanitized = {};
    for (const key of Object.keys(obj)) {
      sanitized[key] = deepSanitize(obj[key]);
    }
    return sanitized;
  }
  return obj;
}

function detectMalicious(value) {
  if (typeof value !== 'string') return null;
  for (const { pattern, type } of SUSPICIOUS_PATTERNS) {
    if (pattern.test(value)) return type;
  }
  return null;
}

function maliciousRequestDetector(req, res, next) {
  const checks = ['body', 'query', 'params'];
  for (const source of checks) {
    const data = req[source];
    if (!data) continue;
    const values = typeof data === 'object' ? Object.values(data) : [String(data)];
    for (const val of values) {
      const type = detectMalicious(val);
      if (type) {
        logSuspicious(req, type, val);
        return res.status(403).render('error', { message: 'Request blocked by security system.' });
      }
    }
  }
  next();
}

function csrfProtection(req, res, next) {
  if (!req.session) return next();

  if (!req.session.csrfSecret) {
    req.session.csrfSecret = crypto.randomBytes(32).toString('hex');
  }

  res.locals.csrfToken = crypto
    .createHash('sha256')
    .update(req.session.csrfSecret + req.sessionID)
    .digest('hex');

  const methods = ['POST', 'PUT', 'PATCH', 'DELETE'];
  if (methods.includes(req.method)) {
    const token = req.body._csrf || req.headers['x-csrf-token'];
    const expected = res.locals.csrfToken;
    if (!token || token !== expected) {
      logSuspicious(req, 'CSRF Violation', token || 'no token');
      return res.status(403).render('error', { message: 'Invalid or missing security token.' });
    }
  }
  next();
}

function fileUploadSecurity(req, res, next) {
  if (!req.file) return next();

  const allowedMimeTypes = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf',
  ];

  if (!allowedMimeTypes.includes(req.file.mimetype)) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).render('error', { message: 'File type not allowed.' });
  }

  const ext = path.extname(req.file.originalname).toLowerCase();
  const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf'];
  if (!allowedExts.includes(ext)) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).render('error', { message: 'File extension not allowed.' });
  }

  const maxSize = 5 * 1024 * 1024;
  if (req.file.size > maxSize) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).render('error', { message: 'File too large. Maximum 5MB.' });
  }

  try {
    const fd = fs.openSync(req.file.path, 'r');
    const buffer = Buffer.alloc(8);
    fs.readSync(fd, buffer, 0, 8, 0);
    fs.closeSync(fd);

    const magicBytes = {
      'ffd8ff': 'image/jpeg',
      '89504e47': 'image/png',
      '47494638': 'image/gif',
      '52494646': 'image/webp',
    };

    const hex = buffer.toString('hex', 0, 4);
    let matched = false;
    for (const [magic, mime] of Object.entries(magicBytes)) {
      if (hex.startsWith(magic)) { matched = true; break; }
    }

    if (!matched) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).render('error', { message: 'File appears to be corrupted or not a valid image.' });
    }
  } catch {
    fs.unlink(req.file.path, () => {});
    return res.status(400).render('error', { message: 'Could not verify file integrity.' });
  }

  next();
}

module.exports = {
  maliciousRequestDetector,
  csrfProtection,
  fileUploadSecurity,
  deepSanitize,
  encrypt,
  decrypt,
  encryptCustomerFields,
  decryptCustomerFields,
};
