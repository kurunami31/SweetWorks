const express = require('express');
const session = require('express-session');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { initDb, seedData, seedServices, seedAdmin } = require('./database');
const { maliciousRequestDetector, csrfProtection, fileUploadSecurity } = require('./security');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/login', authLimiter);
app.use('/register', authLimiter);

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'uploads')),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

if (!require('fs').existsSync(path.join(__dirname, 'uploads'))) {
  require('fs').mkdirSync(path.join(__dirname, 'uploads'));
}

app.use(session({
  secret: process.env.SESSION_SECRET || crypto.randomBytes(64).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'strict',
  }
}));

app.use((req, res, next) => {
  res.locals.user = req.session.userId ? {
    id: req.session.userId,
    username: req.session.username,
    role: req.session.role
  } : null;
  next();
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(maliciousRequestDetector);

app.use(csrfProtection);

const { router: authRouter, isAuthenticated } = require('./routes/auth');

app.use('/', require('./routes/public')(upload, fileUploadSecurity));
app.use('/', authRouter);
app.use('/admin', isAuthenticated, require('./routes/admin'));
app.use('/pos', isAuthenticated, require('./routes/pos'));

app.use((req, res) => {
  res.status(404).render('error', { message: 'Page not found' });
});

async function start() {
  await initDb();
  await seedData();
  await seedServices();
  await seedAdmin();
  app.listen(PORT, () => {
    console.log(`SweetWorks Pastry Shop running at http://localhost:${PORT}`);
    console.log(`  Public site:  http://localhost:${PORT}`);
    console.log(`  Admin panel:  http://localhost:${PORT}/admin`);
    console.log(`  POS system:   http://localhost:${PORT}/pos`);
  });
}

start().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
