const express = require('express');
const session = require('express-session');
const path = require('path');
const multer = require('multer');
const { initDb, seedData, seedServices, seedAdmin } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

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
  secret: 'sweetworks-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

app.use((req, res, next) => {
  res.locals.user = req.session.userId ? {
    id: req.session.userId,
    username: req.session.username,
    role: req.session.role
  } : null;
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const { router: authRouter, isAuthenticated } = require('./routes/auth');

app.use('/', require('./routes/public')(upload));
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
