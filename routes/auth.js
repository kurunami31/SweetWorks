const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../database');

function isAuthenticated(req, res, next) {
  if (req.session && req.session.userId) return next();
  res.redirect('/login');
}

router.get('/login', (req, res) => {
  if (req.session && req.session.userId) return res.redirect('/admin');
  res.render('auth/login', { error: null });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.render('auth/login', { error: 'Username and password are required' });
  }
  const users = await db.query("SELECT * FROM users WHERE username = ?", [username]);
  if (users.length === 0) {
    return res.render('auth/login', { error: 'Invalid username or password' });
  }
  const user = users[0];
  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    return res.render('auth/login', { error: 'Invalid username or password' });
  }
  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.role = user.role;
  res.redirect('/admin');
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

router.get('/register', async (req, res) => {
  if (req.session && req.session.userId) return res.redirect('/admin');
  const existing = await db.query("SELECT COUNT(*) as count FROM users");
  const hasAdmin = existing[0].count > 0;
  res.render('auth/register', { error: null, hasAdmin });
});

router.post('/register', async (req, res) => {
  const { username, email, password, confirmPassword } = req.body;

  const existing = await db.query("SELECT COUNT(*) as count FROM users");
  if (existing[0].count > 0) {
    return res.render('auth/register', { error: 'Admin already exists. Only one admin is allowed.', hasAdmin: true });
  }

  if (!username || !email || !password || !confirmPassword) {
    return res.render('auth/register', { error: 'All fields are required', hasAdmin: false });
  }
  if (password !== confirmPassword) {
    return res.render('auth/register', { error: 'Passwords do not match', hasAdmin: false });
  }
  if (password.length < 6) {
    return res.render('auth/register', { error: 'Password must be at least 6 characters', hasAdmin: false });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const id = await db.run("INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, 'admin')",
      [username, email, hash]);
    req.session.userId = id;
    req.session.username = username;
    req.session.role = 'admin';
    res.redirect('/admin');
  } catch (err) {
    res.render('auth/register', { error: 'Username or email already taken', hasAdmin: false });
  }
});

module.exports = { router, isAuthenticated };
