const express = require('express');
const router = express.Router();
const db = require('../database');

router.get('/', (req, res) => {
  const featured = db.query("SELECT * FROM products WHERE featured = 1 AND available = 1");
  const categories = db.query("SELECT * FROM categories");
  res.render('index', { featured, categories });
});

router.get('/menu', (req, res) => {
  const { category } = req.query;
  let products;
  if (category) {
    products = db.query(
      "SELECT p.*, c.name as category_name FROM products p JOIN categories c ON p.category_id = c.id WHERE p.available = 1 AND c.slug = ? ORDER BY p.name",
      [category]
    );
  } else {
    products = db.query(
      "SELECT p.*, c.name as category_name FROM products p JOIN categories c ON p.category_id = c.id WHERE p.available = 1 ORDER BY c.name, p.name"
    );
  }
  const categories = db.query("SELECT * FROM categories");
  res.render('menu', { products, categories, activeCategory: category || '' });
});

router.get('/order', (req, res) => {
  const products = db.query(
    "SELECT p.*, c.name as category_name FROM products p JOIN categories c ON p.category_id = c.id WHERE p.available = 1 ORDER BY c.name, p.name"
  );
  const categories = db.query("SELECT * FROM categories");
  res.render('order', { products, categories });
});

router.post('/order', (req, res) => {
  const { name, email, phone, address, items, notes } = req.body;
  if (!items || items.length === 0) {
    return res.redirect('/order?error=empty');
  }

  const customers = db.query("SELECT id FROM customers WHERE email = ?", [email]);
  let customerId;
  if (customers.length > 0) {
    customerId = customers[0].id;
  } else {
    customerId = db.run("INSERT INTO customers (name, email, phone, address) VALUES (?, ?, ?, ?)",
      [name, email, phone, address]);
  }

  const parsedItems = typeof items === 'string' ? JSON.parse(items) : items;
  let total = 0;
  for (const item of parsedItems) {
    const product = db.query("SELECT price FROM products WHERE id = ?", [item.product_id]);
    if (product.length > 0) {
      total += product[0].price * item.quantity;
    }
  }

  const orderId = db.run("INSERT INTO orders (customer_id, order_type, status, total, notes) VALUES (?, 'online', 'pending', ?, ?)",
    [customerId, total, notes || '']);

  for (const item of parsedItems) {
    const product = db.query("SELECT price FROM products WHERE id = ?", [item.product_id]);
    if (product.length > 0) {
      db.run("INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)",
        [orderId, item.product_id, item.quantity, product[0].price]);
    }
  }

  res.redirect(`/order/confirmation/${orderId}`);
});

router.get('/order/confirmation/:id', (req, res) => {
  const order = db.query(
    "SELECT o.*, c.name as customer_name, c.email as customer_email FROM orders o JOIN customers c ON o.customer_id = c.id WHERE o.id = ?",
    [req.params.id]
  );
  if (order.length === 0) return res.redirect('/menu');
  const items = db.query(
    "SELECT oi.*, p.name as product_name FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?",
    [req.params.id]
  );
  res.render('confirmation', { order: order[0], items });
});

router.get('/api/menu', (req, res) => {
  const products = db.query(
    "SELECT p.id, p.name, p.price, c.name as category_name, c.slug as category_slug FROM products p JOIN categories c ON p.category_id = c.id WHERE p.available = 1 ORDER BY c.name, p.name"
  );
  const categories = db.query("SELECT * FROM categories");
  res.json({ products, categories });
});

router.get('/api/orders', (req, res) => {
  const orders = db.query(
    "SELECT o.*, c.name as customer_name FROM orders o JOIN customers c ON o.customer_id = c.id ORDER BY o.created_at DESC LIMIT 50"
  );
  res.json(orders);
});

module.exports = router;
