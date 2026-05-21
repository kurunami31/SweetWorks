const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'sweetworks.db');

let db = null;

async function getDb() {
  if (db) return db;
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }
  return db;
}

function saveDb() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

async function initDb() {
  const db = await getDb();
  db.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      price REAL NOT NULL,
      category_id INTEGER,
      image TEXT,
      featured INTEGER DEFAULT 0,
      available INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      address TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER,
      order_type TEXT NOT NULL DEFAULT 'online',
      status TEXT NOT NULL DEFAULT 'pending',
      total REAL NOT NULL DEFAULT 0,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      price REAL NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `);
  saveDb();
}

async function seedData() {
  await getDb();
  const count = db.exec("SELECT COUNT(*) as c FROM categories");
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
    run("INSERT INTO products (name, slug, description, price, category_id, featured, available) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [p[0], p[1], p[2], p[3], p[4], p[5], p[6]]);
  }

  saveDb();
}

function query(sql, params = []) {
  if (!db) throw new Error('Database not initialized');
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function run(sql, ...params) {
  if (!db) throw new Error('Database not initialized');
  const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
  db.run(sql, flatParams);
  const id = db.exec("SELECT last_insert_rowid() as id")[0].values[0][0];
  saveDb();
  return id;
}

function getLastInsertId() {
  if (!db) throw new Error('Database not initialized');
  const result = db.exec("SELECT last_insert_rowid() as id");
  return result[0].values[0][0];
}

module.exports = { initDb, seedData, query, run, getLastInsertId };
