const express = require('express');
const router = express.Router();
const db = require('../database');

router.get('/', (req, res) => {
  const productCount = db.query("SELECT COUNT(*) as count FROM products")[0].count;
  const orderCount = db.query("SELECT COUNT(*) as count FROM orders")[0].count;
  const customerCount = db.query("SELECT COUNT(*) as count FROM customers")[0].count;
  const pendingOrders = db.query("SELECT COUNT(*) as count FROM orders WHERE status = 'pending'")[0].count;
  const recentOrders = db.query(
    "SELECT o.*, c.name as customer_name FROM orders o JOIN customers c ON o.customer_id = c.id ORDER BY o.created_at DESC LIMIT 5"
  );
  const lowStock = db.query("SELECT COUNT(*) as count FROM products WHERE available = 0")[0].count;
  res.render('admin/dashboard', {
    productCount, orderCount, customerCount, pendingOrders, recentOrders, lowStock
  });
});

router.get('/products', (req, res) => {
  const products = db.query(
    "SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id ORDER BY p.name"
  );
  const categories = db.query("SELECT * FROM categories");
  res.render('admin/products', { products, categories });
});

router.post('/products', (req, res) => {
  const { name, slug, description, price, category_id, available } = req.body;
  const catId = category_id ? parseInt(category_id) : null;
  db.run(
    "INSERT INTO products (name, slug, description, price, category_id, available) VALUES (?, ?, ?, ?, ?, ?)",
    [name, slug, description, parseFloat(price), catId, available ? 1 : 0]
  );
  res.redirect('/admin/products');
});

router.post('/products/:id/edit', (req, res) => {
  const { name, slug, description, price, category_id, available } = req.body;
  const catId = category_id ? parseInt(category_id) : null;
  db.run(
    "UPDATE products SET name=?, slug=?, description=?, price=?, category_id=?, available=? WHERE id=?",
    [name, slug, description, parseFloat(price), catId, available ? 1 : 0, req.params.id]
  );
  res.redirect('/admin/products');
});

router.post('/products/:id/delete', (req, res) => {
  db.run("DELETE FROM products WHERE id=?", [req.params.id]);
  res.redirect('/admin/products');
});

router.post('/products/:id/toggle', (req, res) => {
  const product = db.query("SELECT available FROM products WHERE id=?", [req.params.id]);
  if (product.length > 0) {
    const newVal = product[0].available ? 0 : 1;
    db.run("UPDATE products SET available=? WHERE id=?", [newVal, req.params.id]);
  }
  res.redirect('/admin/products');
});

router.get('/orders', (req, res) => {
  const status = req.query.status || '';
  let orders;
  if (status) {
    orders = db.query(
      "SELECT o.*, c.name as customer_name FROM orders o JOIN customers c ON o.customer_id = c.id WHERE o.status = ? ORDER BY o.created_at DESC",
      [status]
    );
  } else {
    orders = db.query(
      "SELECT o.*, c.name as customer_name FROM orders o JOIN customers c ON o.customer_id = c.id ORDER BY o.created_at DESC"
    );
  }
  res.render('admin/orders', { orders, activeStatus: status });
});

router.get('/orders/:id', (req, res) => {
  const order = db.query(
    "SELECT o.*, c.name as customer_name, c.email, c.phone, c.address FROM orders o JOIN customers c ON o.customer_id = c.id WHERE o.id = ?",
    [req.params.id]
  );
  if (order.length === 0) return res.redirect('/admin/orders');
  const items = db.query(
    "SELECT oi.*, p.name as product_name FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?",
    [req.params.id]
  );
  res.render('admin/order-detail', { order: order[0], items });
});

router.post('/orders/:id/status', (req, res) => {
  const { status } = req.body;
  db.run("UPDATE orders SET status=? WHERE id=?", [status, req.params.id]);
  res.redirect(`/admin/orders/${req.params.id}`);
});

router.get('/customers', (req, res) => {
  const search = req.query.search || '';
  let customers;
  if (search) {
    customers = db.query(
      "SELECT c.*, (SELECT COUNT(*) FROM orders WHERE customer_id = c.id) as order_count FROM customers c WHERE c.name LIKE ? OR c.email LIKE ? OR c.phone LIKE ? ORDER BY c.name",
      [`%${search}%`, `%${search}%`, `%${search}%`]
    );
  } else {
    customers = db.query(
      "SELECT c.*, (SELECT COUNT(*) FROM orders WHERE customer_id = c.id) as order_count FROM customers c ORDER BY c.name"
    );
  }
  res.render('admin/customers', { customers, search });
});

router.get('/customers/:id', (req, res) => {
  const customer = db.query("SELECT * FROM customers WHERE id=?", [req.params.id]);
  if (customer.length === 0) return res.redirect('/admin/customers');
  const orders = db.query("SELECT * FROM orders WHERE customer_id=? ORDER BY created_at DESC", [req.params.id]);
  res.render('admin/customer-detail', { customer: customer[0], orders });
});

router.post('/customers/:id/edit', (req, res) => {
  const { name, email, phone, address, notes } = req.body;
  db.run("UPDATE customers SET name=?, email=?, phone=?, address=?, notes=? WHERE id=?",
    [name, email, phone, address, notes, req.params.id]);
  res.redirect(`/admin/customers/${req.params.id}`);
});

module.exports = router;
