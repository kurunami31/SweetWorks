const express = require('express');
const router = express.Router();
const db = require('../database');
const { encrypt, decrypt, decryptCustomerFields } = require('../security');

router.get('/', async (req, res) => {
  const products = await db.query(
    "SELECT p.*, c.name as category_name FROM products p JOIN categories c ON p.category_id = c.id WHERE p.available = 1 ORDER BY c.name, p.name"
  );
  const categories = await db.query("SELECT * FROM categories");
  const customers = await db.query("SELECT * FROM customers ORDER BY name");
  customers.forEach(c => decryptCustomerFields(c));
  res.render('pos/index', { products, categories, customers });
});

router.post('/checkout', async (req, res) => {
  const { customer_id, items, payment } = req.body;
  if (!items || items.length === 0) {
    return res.redirect('/pos?error=empty');
  }

  const parsedItems = typeof items === 'string' ? JSON.parse(items) : items;
  let total = 0;
  for (const item of parsedItems) {
    const product = await db.query("SELECT price FROM products WHERE id = ?", [item.product_id]);
    if (product.length > 0) {
      total += parseFloat(product[0].price) * item.quantity;
    }
  }

  let cid = customer_id ? parseInt(customer_id) : null;
  const orderId = await db.run("INSERT INTO orders (customer_id, order_type, status, total, notes) VALUES (?, 'pos', 'completed', ?, ?)",
    [cid, total, payment || '']);

  for (const item of parsedItems) {
    const product = await db.query("SELECT price FROM products WHERE id = ?", [item.product_id]);
    if (product.length > 0) {
      await db.run("INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)",
        [orderId, item.product_id, item.quantity, parseFloat(product[0].price)]);
    }
  }

  const order = await db.query("SELECT * FROM orders WHERE id=?", [orderId]);
  const orderItems = await db.query(
    "SELECT oi.*, p.name as product_name FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?",
    [orderId]
  );

  res.json({ success: true, order: order[0], items: orderItems });
});

router.post('/customer', async (req, res) => {
  const { name, email, phone } = req.body;
  if (!name) return res.json({ error: 'Name is required' });
  const id = await db.run("INSERT INTO customers (name, email, phone) VALUES (?, ?, ?)", [encrypt(name), email, encrypt(phone || '')]);
  const customer = await db.query("SELECT * FROM customers WHERE id=?", [id]);
  if (customer.length > 0) decryptCustomerFields(customer[0]);
  res.json({ success: true, customer: customer[0] });
});

router.get('/customers/search', async (req, res) => {
  const q = req.query.q || '';
  const customers = await db.query(
    "SELECT * FROM customers WHERE name LIKE ? OR email LIKE ? OR phone LIKE ? ORDER BY name LIMIT 20",
    [`%${q}%`, `%${q}%`, `%${q}%`]
  );
  customers.forEach(c => decryptCustomerFields(c));
  res.json(customers);
});

router.get('/receipt/:id', async (req, res) => {
  const order = await db.query(
    "SELECT o.*, c.name as customer_name FROM orders o LEFT JOIN customers c ON o.customer_id = c.id WHERE o.id=?",
    [req.params.id]
  );
  if (order.length === 0) return res.redirect('/pos');
  if (order[0].customer_name) order[0].customer_name = decrypt(order[0].customer_name);
  const items = await db.query(
    "SELECT oi.*, p.name as product_name FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id=?",
    [req.params.id]
  );
  res.render('pos/receipt', { order: order[0], items });
});

module.exports = router;
