const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mysql = require('mysql2/promise');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'devsecret';
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';
const SLA_RESPONSE_HOURS = parseInt(process.env.SLA_RESPONSE_HOURS || '4', 10);
const SLA_RESOLUTION_HOURS = parseInt(process.env.SLA_RESOLUTION_HOURS || '24', 10);
const WEBHOOK_URL = process.env.WEBHOOK_URL || '';

// MariaDB pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || 'tgs_dev',
  connectionLimit: 10,
});

// CORS & JSON
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(express.json());

// Ensure upload directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
app.use('/uploads', express.static(uploadDir));

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + '-' + file.originalname.replace(/\s+/g, '_'));
  },
});
const upload = multer({ storage });

function addHours(date, hours) {
  const d = new Date(date);
  d.setHours(d.getHours() + hours);
  return d; // return Date for DATETIME columns
}

async function sendWebhook(event, payload) {
  if (!WEBHOOK_URL) return;
  try {
    if (typeof fetch === 'function') {
      await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event, payload }),
      });
    }
  } catch (err) {
    console.error('Webhook error:', err.message);
  }
}

function signToken(user) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '1d' });
}

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const token = auth.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (e) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function agentOnly(req, res, next) {
  if (!['agent', 'admin'].includes(req.user?.role)) return res.status(403).json({ error: 'Forbidden' });
  next();
}

function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  next();
}

async function initDb() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('user','agent','admin') NOT NULL DEFAULT 'user',
      created_at DATETIME NOT NULL
    ) ENGINE=InnoDB`);

    // Garantir que o ENUM inclua 'admin' quando a tabela já existir
    try {
      await conn.query("ALTER TABLE users MODIFY COLUMN role ENUM('user','agent','admin') NOT NULL DEFAULT 'user'");
    } catch (_) {}

    await conn.query(`CREATE TABLE IF NOT EXISTS tickets (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT NOT NULL,
      status ENUM('open','in_progress','pending','resolved','closed') NOT NULL DEFAULT 'open',
      priority ENUM('low','medium','high') NOT NULL DEFAULT 'medium',
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      first_response_at DATETIME NULL,
      response_due_at DATETIME NULL,
      resolution_due_at DATETIME NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`);

    await conn.query(`CREATE TABLE IF NOT EXISTS comments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      ticket_id INT NOT NULL,
      user_id INT NOT NULL,
      body TEXT NOT NULL,
      created_at DATETIME NOT NULL,
      FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`);

    await conn.query(`CREATE TABLE IF NOT EXISTS attachments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      comment_id INT NOT NULL,
      filename VARCHAR(255) NOT NULL,
      path VARCHAR(512) NOT NULL,
      mimetype VARCHAR(255) NOT NULL,
      size INT NOT NULL,
      FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`);

    const agentEmail = process.env.DEFAULT_AGENT_EMAIL;
    const agentPassword = process.env.DEFAULT_AGENT_PASSWORD;
    if (agentEmail && agentPassword) {
      const [rows] = await conn.query('SELECT id FROM users WHERE email = ?', [agentEmail]);
      if (rows.length === 0) {
        const hash = await bcrypt.hash(agentPassword, 10);
        const now = new Date();
        await conn.query(
          'INSERT INTO users (name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)',
          ['Agente', agentEmail, hash, 'agent', now]
        );
        console.log('Agente padrão criado:', agentEmail);
      }
    }

    // Seed admin padrão
    const adminEmail = process.env.DEFAULT_ADMIN_EMAIL;
    const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD;
    if (adminEmail && adminPassword) {
      const [aRows] = await conn.query('SELECT id FROM users WHERE email = ?', [adminEmail]);
      if (aRows.length === 0) {
        const hash = await bcrypt.hash(adminPassword, 10);
        const now = new Date();
        await conn.query(
          'INSERT INTO users (name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)',
          ['Admin', adminEmail, hash, 'admin', now]
        );
        console.log('Admin padrão criado:', adminEmail);
      }
    }
  } finally {
    conn.release();
  }
}

// Routes
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Auth
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) return res.status(400).json({ error: 'Missing fields' });
    const hash = await bcrypt.hash(password, 10);
    const now = new Date();
    const [result] = await pool.query(
      'INSERT INTO users (name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)',
      [name, email, hash, 'user', now]
    );
    const user = { id: result.insertId, name, email, role: 'user' };
    res.json({ user, token: signToken(user) });
  } catch (err) {
    if (err?.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Email already registered' });
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Missing fields' });
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    const user = rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });
    const payload = { id: user.id, name: user.name, email: user.email, role: user.role };
    res.json({ user: payload, token: signToken(payload) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

app.get('/api/me', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name, email, role FROM users WHERE id = ?', [req.user.id]);
    res.json({ user: rows[0] || null });
  } catch (err) {
    res.status(500).json({ error: 'DB error' });
  }
});

// Tickets
app.post('/api/tickets', authMiddleware, async (req, res) => {
  try {
    const { title, description, priority = 'medium' } = req.body || {};
    if (!title || !description) return res.status(400).json({ error: 'Missing fields' });
    const now = new Date();
    const responseDue = addHours(now, SLA_RESPONSE_HOURS);
    const resolutionDue = addHours(now, SLA_RESOLUTION_HOURS);
    const [result] = await pool.query(
      `INSERT INTO tickets (user_id, title, description, status, priority, created_at, updated_at, response_due_at, resolution_due_at)
       VALUES (?, ?, ?, 'open', ?, ?, ?, ?, ?)`,
      [req.user.id, title, description, priority, now, now, responseDue, resolutionDue]
    );
    const ticket = {
      id: result.insertId,
      user_id: req.user.id,
      title,
      description,
      status: 'open',
      priority,
      created_at: now,
      updated_at: now,
      response_due_at: responseDue,
      resolution_due_at: resolutionDue,
    };
    sendWebhook('ticket.created', ticket);
    res.json({ ticket });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

app.get('/api/tickets', authMiddleware, async (req, res) => {
  try {
    const isStaff = req.user.role === 'agent' || req.user.role === 'admin';
    const sql = isStaff ? 'SELECT * FROM tickets ORDER BY id DESC' : 'SELECT * FROM tickets WHERE user_id = ? ORDER BY id DESC';
    const params = isStaff ? [] : [req.user.id];
    const [rows] = await pool.query(sql, params);
    res.json({ tickets: rows });
  } catch (err) {
    res.status(500).json({ error: 'DB error' });
  }
});

app.get('/api/tickets/:id', authMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [rows] = await pool.query('SELECT * FROM tickets WHERE id = ?', [id]);
    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'Not found' });
    if (!(req.user.role === 'agent' || req.user.role === 'admin') && row.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    res.json({ ticket: row });
  } catch (err) {
    res.status(500).json({ error: 'DB error' });
  }
});

app.patch('/api/tickets/:id', authMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { status } = req.body || {};
    if (!status) return res.status(400).json({ error: 'Missing status' });
    if (!['agent', 'admin'].includes(req.user.role)) return res.status(403).json({ error: 'Agent only' });
    const now = new Date();
    await pool.query('UPDATE tickets SET status = ?, updated_at = ? WHERE id = ?', [status, now, id]);
    const [rows] = await pool.query('SELECT * FROM tickets WHERE id = ?', [id]);
    const row = rows[0];
    sendWebhook('ticket.updated', row);
    res.json({ ticket: row });
  } catch (err) {
    res.status(500).json({ error: 'DB error' });
  }
});

// Comments with attachments
app.post('/api/tickets/:id/comments', authMiddleware, upload.array('files'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { body } = req.body || {};
    if (!body) return res.status(400).json({ error: 'Missing body' });
    const [ticketRows] = await pool.query('SELECT * FROM tickets WHERE id = ?', [id]);
    const ticket = ticketRows[0];
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    if (!(req.user.role === 'agent' || req.user.role === 'admin') && ticket.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    const now = new Date();
    const [result] = await pool.query(
      'INSERT INTO comments (ticket_id, user_id, body, created_at) VALUES (?, ?, ?, ?)',
      [id, req.user.id, body, now]
    );
    const commentId = result.insertId;
    const files = req.files || [];
    for (const f of files) {
      await pool.query(
        'INSERT INTO attachments (comment_id, filename, path, mimetype, size) VALUES (?, ?, ?, ?, ?)',
        [commentId, f.originalname, `/uploads/${path.basename(f.path)}`, f.mimetype, f.size]
      );
    }
    if (!ticket.first_response_at && (req.user.role === 'agent' || req.user.role === 'admin')) {
      await pool.query('UPDATE tickets SET first_response_at = ?, updated_at = ? WHERE id = ?', [now, now, id]);
    }
    const [commentRows] = await pool.query('SELECT * FROM comments WHERE id = ?', [commentId]);
    const [attRows] = await pool.query('SELECT * FROM attachments WHERE comment_id = ?', [commentId]);
    sendWebhook('comment.created', { comment: commentRows[0], attachments: attRows });
    res.json({ comment: commentRows[0], attachments: attRows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

app.get('/api/tickets/:id/comments', authMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [tRows] = await pool.query('SELECT * FROM tickets WHERE id = ?', [id]);
    const ticket = tRows[0];
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    if (!(req.user.role === 'agent' || req.user.role === 'admin') && ticket.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    const [rows] = await pool.query('SELECT * FROM comments WHERE ticket_id = ? ORDER BY id ASC', [id]);
    res.json({ comments: rows });
  } catch (err) {
    res.status(500).json({ error: 'DB error' });
  }
});

// Admin: gestão de usuários
app.get('/api/admin/users', authMiddleware, adminOnly, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name, email, role, created_at FROM users ORDER BY id DESC');
    res.json({ users: rows });
  } catch (err) {
    res.status(500).json({ error: 'DB error' });
  }
});

app.post('/api/admin/users', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { name, email, password, role = 'user' } = req.body || {};
    if (!name || !email || !password) return res.status(400).json({ error: 'Missing fields' });
    if (!['user', 'agent', 'admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
    const hash = await bcrypt.hash(password, 10);
    const now = new Date();
    const [result] = await pool.query('INSERT INTO users (name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)', [name, email, hash, role, now]);
    res.json({ user: { id: result.insertId, name, email, role } });
  } catch (err) {
    if (err?.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Email already registered' });
    res.status(500).json({ error: 'DB error' });
  }
});

app.patch('/api/admin/users/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, email, password, role } = req.body || {};
    const fields = [];
    const params = [];
    if (name) { fields.push('name = ?'); params.push(name); }
    if (email) { fields.push('email = ?'); params.push(email); }
    if (role) {
      if (!['user', 'agent', 'admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
      fields.push('role = ?'); params.push(role);
    }
    if (password) { const hash = await bcrypt.hash(password, 10); fields.push('password_hash = ?'); params.push(hash); }
    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });
    params.push(id);
    await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, params);
    const [rows] = await pool.query('SELECT id, name, email, role, created_at FROM users WHERE id = ?', [id]);
    res.json({ user: rows[0] || null });
  } catch (err) {
    res.status(500).json({ error: 'DB error' });
  }
});

app.delete('/api/admin/users/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await pool.query('DELETE FROM users WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'DB error' });
  }
});

// Webhook receiver (incoming)
app.post('/api/webhooks/incoming', (req, res) => {
  console.log('Incoming webhook:', req.body);
  res.json({ received: true });
});

(async () => {
  try {
    await initDb();
    app.listen(PORT, () => {
      console.log(`API running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to initialize DB:', err);
    process.exit(1);
  }
})();