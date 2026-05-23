const express = require('express');
const db = require('../database');
const { encrypt, decrypt, decryptCustomerFields } = require('../security');
const fb = require('../facebook');

module.exports = function(upload, fileUploadSecurity) {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.render('welcome');
  });

router.get('/home', async (req, res) => {
  const categories = await db.query("SELECT * FROM categories");
  const services = await db.query("SELECT * FROM services WHERE available = 1 ORDER BY name");
  res.render('index', { categories, services });
});

router.get('/social', async (req, res) => {
  let posts = [];
  let fbError = null;
  const tokenSet = !!process.env.FACEBOOK_PAGE_TOKEN;
  if (tokenSet) {
    try {
      posts = await fb.fetchPosts();
    } catch (e) {
      fbError = e.message;
    }
  }
  res.render('social', { posts, fbError, tokenSet });
});

  router.get('/signature-treats', async (req, res) => {
    const featured = await db.query("SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.featured = 1 AND p.available = 1 LIMIT 4");
    res.render('signature-treats', { featured });
  });

  router.get('/menu', async (req, res) => {
    const { category } = req.query;
    let products;
    if (category) {
      products = await db.query(
        "SELECT p.*, c.name as category_name FROM products p JOIN categories c ON p.category_id = c.id WHERE p.available = 1 AND c.slug = ? ORDER BY p.name",
        [category]
      );
    } else {
      products = await db.query(
        "SELECT p.*, c.name as category_name FROM products p JOIN categories c ON p.category_id = c.id WHERE p.available = 1 ORDER BY c.name, p.name"
      );
    }
    const categories = await db.query("SELECT * FROM categories");
    res.render('menu', { products, categories, activeCategory: category || '' });
  });

  router.get('/order', async (req, res) => {
    const products = await db.query(
      "SELECT p.*, c.name as category_name FROM products p JOIN categories c ON p.category_id = c.id WHERE p.available = 1 ORDER BY c.name, p.name"
    );
    const categories = await db.query("SELECT * FROM categories");
    res.render('order', { products, categories });
  });

  router.post('/order', async (req, res) => {
    const { name, email, phone, address, items, notes, order_type, delivery_date, delivery_time, pickup_time } = req.body;
    if (!items || items.length === 0) {
      return res.redirect('/order?error=empty');
    }

    const customers = await db.query("SELECT id FROM customers WHERE email = ?", [email]);
    let customerId;
    if (customers.length > 0) {
      customerId = customers[0].id;
    } else {
      customerId = await db.run("INSERT INTO customers (name, email, phone, address) VALUES (?, ?, ?, ?)",
        [encrypt(name), email, encrypt(phone || ''), encrypt(address || '')]);
    }

    const parsedItems = typeof items === 'string' ? JSON.parse(items) : items;
    let total = 0;
    for (const item of parsedItems) {
      const product = await db.query("SELECT price FROM products WHERE id = ?", [item.product_id]);
      if (product.length > 0) {
        total += parseFloat(product[0].price) * item.quantity;
      }
    }

    let fullNotes = notes || '';
    if (order_type === 'delivery') {
      const dateNote = delivery_date ? `Delivery Date: ${delivery_date}` : '';
      const timeNote = delivery_time ? `Delivery Time: ${delivery_time}` : '';
      const extra = [dateNote, timeNote].filter(Boolean).join(' | ');
      if (extra) fullNotes = fullNotes ? `${extra} | ${fullNotes}` : extra;
    } else {
      if (pickup_time) fullNotes = fullNotes ? `Pickup Time: ${pickup_time} | ${fullNotes}` : `Pickup Time: ${pickup_time}`;
    }

    const orderId = await db.run("INSERT INTO orders (customer_id, order_type, status, total, notes) VALUES (?, ?, 'pending', ?, ?)",
      [customerId, order_type || 'pickup', total, fullNotes]);

    for (const item of parsedItems) {
      const product = await db.query("SELECT price FROM products WHERE id = ?", [item.product_id]);
      if (product.length > 0) {
        await db.run("INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)",
          [orderId, item.product_id, item.quantity, parseFloat(product[0].price)]);
      }
    }

    res.redirect(`/order/confirmation/${orderId}`);
  });

  router.get('/order/confirmation/:id', async (req, res) => {
    const order = await db.query(
      "SELECT o.*, c.name as customer_name, c.email as customer_email FROM orders o JOIN customers c ON o.customer_id = c.id WHERE o.id = ?",
      [req.params.id]
    );
    if (order.length === 0) return res.redirect('/menu');
    order[0] = decryptCustomerFields(order[0]);
    const items = await db.query(
      "SELECT oi.*, p.name as product_name FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?",
      [req.params.id]
    );
    res.render('confirmation', { order: order[0], items });
  });

  router.get('/services', async (req, res) => {
    const services = await db.query("SELECT * FROM services WHERE available = 1 ORDER BY name");
    res.render('services', { services, submitted: req.query.submitted });
  });

  router.post('/services', upload.single('inspo_image'), fileUploadSecurity, async (req, res) => {
    const { service_id, customer_name, customer_email, customer_phone, details, buffet_tier } = req.body;
    const inspo_image = req.file ? req.file.filename : null;
    const fullDetails = buffet_tier ? `Buffet Tier: ${buffet_tier}\n${details}` : details;
    await db.run(
      "INSERT INTO service_orders (service_id, customer_name, customer_email, customer_phone, details, inspo_image) VALUES (?, ?, ?, ?, ?, ?)",
      [service_id, encrypt(customer_name), customer_email, encrypt(customer_phone || ''), fullDetails, inspo_image]
    );
    res.redirect('/services?submitted=1');
  });

  router.get('/api/menu', async (req, res) => {
    const products = await db.query(
      "SELECT p.id, p.name, p.price, c.name as category_name, c.slug as category_slug FROM products p JOIN categories c ON p.category_id = c.id WHERE p.available = 1 ORDER BY c.name, p.name"
    );
    const categories = await db.query("SELECT * FROM categories");
    res.json({ products, categories });
  });

  router.get('/api/orders', async (req, res) => {
    const orders = await db.query(
      "SELECT o.*, c.name as customer_name FROM orders o JOIN customers c ON o.customer_id = c.id ORDER BY o.created_at DESC LIMIT 50"
    );
    orders.forEach(o => { if (o.customer_name) o.customer_name = decrypt(o.customer_name); });
    res.json(orders);
  });

  router.get('/api/pending-orders', async (req, res) => {
    const since = req.query.since || new Date(0).toISOString();
    const scope = req.query.scope || 'active';
    let statusFilter = '';
    if (scope === 'active') {
      statusFilter = "AND o.status IN ('pending', 'preparing', 'ready')";
    }
    const orders = await db.query(
      "SELECT o.*, c.name as customer_name, c.email as customer_email FROM orders o JOIN customers c ON o.customer_id = c.id WHERE o.created_at > ? AND o.order_type IN ('delivery', 'pickup') " + statusFilter + " ORDER BY o.created_at ASC",
      [since]
    );
    orders.forEach(o => { if (o.customer_name) o.customer_name = decrypt(o.customer_name); });
    res.json(orders);
  });

  router.post('/api/orders/:id/status', async (req, res) => {
    const { status } = req.body;
    await db.run("UPDATE orders SET status=? WHERE id=?", [status, req.params.id]);
    res.json({ success: true });
  });

  return router;
};
