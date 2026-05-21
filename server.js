const express = require('express');
const path = require('path');
const { initDb, seedData } = require('./database');

const app = express();
const PORT = 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use('/', require('./routes/public'));
app.use('/admin', require('./routes/admin'));
app.use('/pos', require('./routes/pos'));

app.use((req, res) => {
  res.status(404).render('error', { message: 'Page not found' });
});

async function start() {
  await initDb();
  await seedData();
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
