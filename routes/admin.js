const express = require('express');
const router = express.Router();
const db = require('../database');

router.get('/', async (req, res) => {
  const productCount = (await db.query("SELECT COUNT(*) as count FROM products"))[0].count;
  const orderCount = (await db.query("SELECT COUNT(*) as count FROM orders"))[0].count;
  const customerCount = (await db.query("SELECT COUNT(*) as count FROM customers"))[0].count;
  const pendingOrders = (await db.query("SELECT COUNT(*) as count FROM orders WHERE status = 'pending'"))[0].count;
  const recentOrders = await db.query(
    "SELECT o.*, c.name as customer_name FROM orders o JOIN customers c ON o.customer_id = c.id ORDER BY o.created_at DESC LIMIT 5"
  );
  const lowStock = (await db.query("SELECT COUNT(*) as count FROM products WHERE available = 0"))[0].count;
  const serviceOrderCount = (await db.query("SELECT COUNT(*) as count FROM service_orders"))[0].count;
  const pendingServiceOrders = (await db.query("SELECT COUNT(*) as count FROM service_orders WHERE status = 'pending'"))[0].count;
  res.render('admin/dashboard', {
    productCount, orderCount, customerCount, pendingOrders, recentOrders, lowStock,
    serviceOrderCount, pendingServiceOrders
  });
});

router.get('/products', async (req, res) => {
  const products = await db.query(
    "SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id ORDER BY p.name"
  );
  const categories = await db.query("SELECT * FROM categories");
  res.render('admin/products', { products, categories });
});

router.post('/products', async (req, res) => {
  const { name, slug, description, price, category_id, available } = req.body;
  const catId = category_id ? parseInt(category_id) : null;
  await db.run(
    "INSERT INTO products (name, slug, description, price, category_id, available) VALUES (?, ?, ?, ?, ?, ?)",
    [name, slug, description, parseFloat(price), catId, available ? 1 : 0]
  );
  res.redirect('/admin/products');
});

router.post('/products/:id/edit', async (req, res) => {
  const { name, slug, description, price, category_id, available } = req.body;
  const catId = category_id ? parseInt(category_id) : null;
  await db.run(
    "UPDATE products SET name=?, slug=?, description=?, price=?, category_id=?, available=? WHERE id=?",
    [name, slug, description, parseFloat(price), catId, available ? 1 : 0, req.params.id]
  );
  res.redirect('/admin/products');
});

router.post('/products/:id/delete', async (req, res) => {
  await db.run("DELETE FROM products WHERE id=?", [req.params.id]);
  res.redirect('/admin/products');
});

router.post('/products/:id/toggle', async (req, res) => {
  const product = await db.query("SELECT available FROM products WHERE id=?", [req.params.id]);
  if (product.length > 0) {
    const newVal = product[0].available ? 0 : 1;
    await db.run("UPDATE products SET available=? WHERE id=?", [newVal, req.params.id]);
  }
  res.redirect('/admin/products');
});

router.get('/orders', async (req, res) => {
  const status = req.query.status || '';
  let orders;
  if (status) {
    orders = await db.query(
      "SELECT o.*, c.name as customer_name FROM orders o JOIN customers c ON o.customer_id = c.id WHERE o.status = ? ORDER BY o.created_at DESC",
      [status]
    );
  } else {
    orders = await db.query(
      "SELECT o.*, c.name as customer_name FROM orders o JOIN customers c ON o.customer_id = c.id ORDER BY o.created_at DESC"
    );
  }
  res.render('admin/orders', { orders, activeStatus: status });
});

router.get('/orders/:id', async (req, res) => {
  const order = await db.query(
    "SELECT o.*, c.name as customer_name, c.email, c.phone, c.address FROM orders o JOIN customers c ON o.customer_id = c.id WHERE o.id = ?",
    [req.params.id]
  );
  if (order.length === 0) return res.redirect('/admin/orders');
  const items = await db.query(
    "SELECT oi.*, p.name as product_name FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?",
    [req.params.id]
  );
  res.render('admin/order-detail', { order: order[0], items });
});

router.post('/orders/:id/status', async (req, res) => {
  const { status } = req.body;
  await db.run("UPDATE orders SET status=? WHERE id=?", [status, req.params.id]);
  res.redirect(`/admin/orders/${req.params.id}`);
});

router.get('/customers', async (req, res) => {
  const search = req.query.search || '';
  let customers;
  if (search) {
    customers = await db.query(
      "SELECT c.*, (SELECT COUNT(*) FROM orders WHERE customer_id = c.id) as order_count FROM customers c WHERE c.name LIKE ? OR c.email LIKE ? OR c.phone LIKE ? ORDER BY c.name",
      [`%${search}%`, `%${search}%`, `%${search}%`]
    );
  } else {
    customers = await db.query(
      "SELECT c.*, (SELECT COUNT(*) FROM orders WHERE customer_id = c.id) as order_count FROM customers c ORDER BY c.name"
    );
  }
  res.render('admin/customers', { customers, search });
});

router.get('/customers/:id', async (req, res) => {
  const customer = await db.query("SELECT * FROM customers WHERE id=?", [req.params.id]);
  if (customer.length === 0) return res.redirect('/admin/customers');
  const orders = await db.query("SELECT * FROM orders WHERE customer_id=? ORDER BY created_at DESC", [req.params.id]);
  res.render('admin/customer-detail', { customer: customer[0], orders });
});

router.post('/customers/:id/edit', async (req, res) => {
  const { name, email, phone, address, notes } = req.body;
  await db.run("UPDATE customers SET name=?, email=?, phone=?, address=?, notes=? WHERE id=?",
    [name, email, phone, address, notes, req.params.id]);
  res.redirect(`/admin/customers/${req.params.id}`);
});

router.get('/service-orders', async (req, res) => {
  const orders = await db.query(
    "SELECT so.*, s.name as service_name FROM service_orders so LEFT JOIN services s ON so.service_id = s.id ORDER BY so.created_at DESC"
  );
  res.render('admin/service-orders', { orders });
});

router.get('/service-orders/:id', async (req, res) => {
  const order = await db.query(
    "SELECT so.*, s.name as service_name, s.type as service_type, s.price as service_price FROM service_orders so LEFT JOIN services s ON so.service_id = s.id WHERE so.id=?",
    [req.params.id]
  );
  if (order.length === 0) return res.redirect('/admin/service-orders');
  res.render('admin/service-order-detail', { order: order[0] });
});

router.post('/service-orders/:id/status', async (req, res) => {
  const { status } = req.body;
  await db.run("UPDATE service_orders SET status=? WHERE id=?", [status, req.params.id]);
  res.redirect(`/admin/service-orders/${req.params.id}`);
});

module.exports = router;
