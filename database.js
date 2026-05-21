const fs = require('fs');
const path = require('path');

const usePg = !!process.env.DATABASE_URL;
let pgPool = null;
let db = null;

async function getDb() {
  if (usePg) return getPgPool();
  return getSqlite();
}

async function getPgPool() {
  if (pgPool) return pgPool;
  const { Pool } = require('pg');
  pgPool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await pgPool.query('SELECT 1');
  return pgPool;
}

async function getSqlite() {
  if (db) return db;
  const initSqlJs = require('sql.js');
  const DB_PATH = path.join(__dirname, 'sweetworks.db');
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    db = new SQL.Database();
  }
  return db;
}

function saveSqlite() {
  if (!db) return;
  const DB_PATH = path.join(__dirname, 'sweetworks.db');
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
}

function toPgParams(sql) {
  let i = 0;
  return { text: sql.replace(/\?/g, () => `$${++i}`), pgIdx: i };
}

async function query(sql, params = []) {
  if (usePg) {
    const pool = await getPgPool();
    const { text } = toPgParams(sql);
    const result = await pool.query(text, params);
    return result.rows;
  }
  const d = await getSqlite();
  const stmt = d.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

async function run(sql, ...params) {
  const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;

  if (usePg) {
    const pool = await getPgPool();
    const { text } = toPgParams(sql);
    const fullSql = sql.trim().toUpperCase().startsWith('INSERT')
      ? text + ' RETURNING id'
      : text;
    try {
      const result = await pool.query(fullSql, flatParams);
      return result.rows.length > 0 ? result.rows[0].id : null;
    } catch (err) {
      console.error('PG Error:', err.message, fullSql, flatParams);
      throw err;
    }
  }

  const d = await getSqlite();
  d.run(sql, flatParams);
  const id = d.exec("SELECT last_insert_rowid() as id")[0].values[0][0];
  saveSqlite();
  return id;
}

async function initDb() {
  if (usePg) {
    const pool = await getPgPool();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        description TEXT
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        description TEXT,
        price NUMERIC(10,2) NOT NULL,
        category_id INTEGER REFERENCES categories(id),
        featured INTEGER DEFAULT 0,
        available INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        address TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER REFERENCES customers(id),
        order_type TEXT NOT NULL DEFAULT 'online',
        status TEXT NOT NULL DEFAULT 'pending',
        total NUMERIC(10,2) NOT NULL DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES orders(id),
        product_id INTEGER NOT NULL REFERENCES products(id),
        quantity INTEGER NOT NULL DEFAULT 1,
        price NUMERIC(10,2) NOT NULL
      )
    `);
    return;
  }

  const d = await getSqlite();
  d.run("CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, description TEXT)");
  d.run("CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, description TEXT, price REAL NOT NULL, category_id INTEGER, featured INTEGER DEFAULT 0, available INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (category_id) REFERENCES categories(id))");
  d.run("CREATE TABLE IF NOT EXISTS customers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT, phone TEXT, address TEXT, notes TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
  d.run("CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER, order_type TEXT NOT NULL DEFAULT 'online', status TEXT NOT NULL DEFAULT 'pending', total REAL NOT NULL DEFAULT 0, notes TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (customer_id) REFERENCES customers(id))");
  d.run("CREATE TABLE IF NOT EXISTS order_items (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL, product_id INTEGER NOT NULL, quantity INTEGER NOT NULL DEFAULT 1, price REAL NOT NULL, FOREIGN KEY (order_id) REFERENCES orders(id), FOREIGN KEY (product_id) REFERENCES products(id))");
  saveSqlite();
}

async function seedData() {
  if (usePg) {
    const pool = await getPgPool();
    const result = await pool.query("SELECT COUNT(*) as c FROM categories");
    if (parseInt(result.rows[0].c) > 0) return;

    await pool.query("INSERT INTO categories (name, slug, description) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", ['Cakes', 'cakes', 'Celebration cakes, layer cakes, and more']);
    await pool.query("INSERT INTO categories (name, slug, description) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", ['Pastries', 'pastries', 'Flaky croissants, danishes, and puff pastry treats']);
    await pool.query("INSERT INTO categories (name, slug, description) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", ['Cookies', 'cookies', 'Freshly baked cookies in every flavor']);
    await pool.query("INSERT INTO categories (name, slug, description) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", ['Bread', 'bread', 'Artisan breads baked daily']);
    await pool.query("INSERT INTO categories (name, slug, description) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", ['Specialty', 'specialty', 'Seasonal specials and custom creations']);

    const products = [
      ['Classic Chocolate Cake', 'classic-chocolate-cake', 'Rich chocolate cake with ganache frosting', 850.00, 1, 1, 1],
      ['Vanilla Birthday Cake', 'vanilla-birthday-cake', 'Classic vanilla layer cake with buttercream', 780.00, 1, 1, 1],
      ['Red Velvet Cake', 'red-velvet-cake', 'Velvety red cake with cream cheese frosting', 920.00, 1, 0, 1],
      ['Tiramisu', 'tiramisu', 'Italian coffee-flavored layered dessert', 650.00, 1, 1, 1],
      ['Butter Croissant', 'butter-croissant', 'Flaky French-style butter croissant', 85.00, 2, 1, 1],
      ['Almond Danish', 'almond-danish', 'Flaky danish with almond paste and sliced almonds', 95.00, 2, 1, 1],
      ['Apple Turnover', 'apple-turnover', 'Puff pastry filled with cinnamon apples', 90.00, 2, 0, 1],
      ['Chocolate Eclair', 'chocolate-eclair', 'Choux pastry filled with vanilla cream', 110.00, 2, 1, 1],
      ['Chocolate Chip Cookie', 'chocolate-chip-cookie', 'Classic chewy chocolate chip cookie', 55.00, 3, 1, 1],
      ['Double Fudge Brownie', 'double-fudge-brownie', 'Rich fudge brownie with chocolate chunks', 75.00, 3, 1, 1],
      ['Macaron (Box of 6)', 'macaron-box-6', 'Assorted French macarons', 350.00, 3, 1, 1],
      ['Snickerdoodle', 'snickerdoodle', 'Cinnamon sugar cookie', 45.00, 3, 0, 1],
      ['Sourdough Loaf', 'sourdough-loaf', 'Artisan sourdough with crispy crust', 150.00, 4, 1, 1],
      ['Brioche Loaf', 'brioche-loaf', 'Soft, buttery French bread', 170.00, 4, 0, 1],
      ['Ciabatta', 'ciabatta', 'Italian white bread with open crumb', 110.00, 4, 0, 1],
      ['Focaccia', 'focaccia', 'Herb-topped Italian flatbread', 130.00, 4, 1, 1],
      ['Seasonal Fruit Tart', 'seasonal-fruit-tart', 'Fresh seasonal fruits on vanilla custard', 580.00, 5, 1, 1],
      ['Cannoli (Box of 4)', 'cannoli-box-4', 'Crispy shells filled with sweet ricotta', 280.00, 5, 1, 1],
      ['Creme Brulee', 'creme-brulee', 'Classic French vanilla custard with caramelized sugar', 150.00, 5, 1, 1],
      ['Custom Celebration Cake', 'custom-celebration-cake', 'Fully customizable cake for any occasion', 1200.00, 5, 1, 1],
    ];
    for (const p of products) {
      await pool.query("INSERT INTO products (name, slug, description, price, category_id, featured, available) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING", p);
    }
    return;
  }

  const d = await getSqlite();
  const count = d.exec("SELECT COUNT(*) as c FROM categories");
  if (count.length > 0 && count[0].values[0][0] > 0) return;

  run("INSERT INTO categories (name, slug, description) VALUES (?, ?, ?)", ['Cakes', 'cakes', 'Celebration cakes, layer cakes, and more']);
  run("INSERT INTO categories (name, slug, description) VALUES (?, ?, ?)", ['Pastries', 'pastries', 'Flaky croissants, danishes, and puff pastry treats']);
  run("INSERT INTO categories (name, slug, description) VALUES (?, ?, ?)", ['Cookies', 'cookies', 'Freshly baked cookies in every flavor']);
  run("INSERT INTO categories (name, slug, description) VALUES (?, ?, ?)", ['Bread', 'bread', 'Artisan breads baked daily']);
  run("INSERT INTO categories (name, slug, description) VALUES (?, ?, ?)", ['Specialty', 'specialty', 'Seasonal specials and custom creations']);

  const products = [
    ['Classic Chocolate Cake', 'classic-chocolate-cake', 'Rich chocolate cake with ganache frosting', 850.00, 1, 1, 1],
    ['Vanilla Birthday Cake', 'vanilla-birthday-cake', 'Classic vanilla layer cake with buttercream', 780.00, 1, 1, 1],
    ['Red Velvet Cake', 'red-velvet-cake', 'Velvety red cake with cream cheese frosting', 920.00, 1, 0, 1],
    ['Tiramisu', 'tiramisu', 'Italian coffee-flavored layered dessert', 650.00, 1, 1, 1],
    ['Butter Croissant', 'butter-croissant', 'Flaky French-style butter croissant', 85.00, 2, 1, 1],
    ['Almond Danish', 'almond-danish', 'Flaky danish with almond paste and sliced almonds', 95.00, 2, 1, 1],
    ['Apple Turnover', 'apple-turnover', 'Puff pastry filled with cinnamon apples', 90.00, 2, 0, 1],
    ['Chocolate Eclair', 'chocolate-eclair', 'Choux pastry filled with vanilla cream', 110.00, 2, 1, 1],
    ['Chocolate Chip Cookie', 'chocolate-chip-cookie', 'Classic chewy chocolate chip cookie', 55.00, 3, 1, 1],
    ['Double Fudge Brownie', 'double-fudge-brownie', 'Rich fudge brownie with chocolate chunks', 75.00, 3, 1, 1],
    ['Macaron (Box of 6)', 'macaron-box-6', 'Assorted French macarons', 350.00, 3, 1, 1],
    ['Snickerdoodle', 'snickerdoodle', 'Cinnamon sugar cookie', 45.00, 3, 0, 1],
    ['Sourdough Loaf', 'sourdough-loaf', 'Artisan sourdough with crispy crust', 150.00, 4, 1, 1],
    ['Brioche Loaf', 'brioche-loaf', 'Soft, buttery French bread', 170.00, 4, 0, 1],
    ['Ciabatta', 'ciabatta', 'Italian white bread with open crumb', 110.00, 4, 0, 1],
    ['Focaccia', 'focaccia', 'Herb-topped Italian flatbread', 130.00, 4, 1, 1],
    ['Seasonal Fruit Tart', 'seasonal-fruit-tart', 'Fresh seasonal fruits on vanilla custard', 580.00, 5, 1, 1],
    ['Cannoli (Box of 4)', 'cannoli-box-4', 'Crispy shells filled with sweet ricotta', 280.00, 5, 1, 1],
    ['Creme Brulee', 'creme-brulee', 'Classic French vanilla custard with caramelized sugar', 150.00, 5, 1, 1],
    ['Custom Celebration Cake', 'custom-celebration-cake', 'Fully customizable cake for any occasion', 1200.00, 5, 1, 1],
  ];
  for (const p of products) {
    run("INSERT INTO products (name, slug, description, price, category_id, featured, available) VALUES (?, ?, ?, ?, ?, ?, ?)", p);
  }
  saveSqlite();
}

module.exports = { initDb, seedData, query, run, getDb };
