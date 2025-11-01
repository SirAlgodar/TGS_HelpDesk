const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'devsecret';
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';
const SLA_RESPONSE_HOURS = parseInt(process.env.SLA_RESPONSE_HOURS || '4', 10);
const SLA_RESOLUTION_HOURS = parseInt(process.env.SLA_RESOLUTION_HOURS || '24', 10);
const WEBHOOK_URL = process.env.WEBHOOK_URL || '';

// CORS
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
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + '-' + file.originalname.replace(/\s+/g, '_'));
  },
});
const upload = multer({ storage });

// DB setup
const dbPath = path.join(__dirname, 'helpdesk.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    priority TEXT NOT NULL DEFAULT 'medium',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    first_response_at TEXT,
    response_due_at TEXT,
    resolution_due_at TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(ticket_id) REFERENCES tickets(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    comment_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    path TEXT NOT NULL,
    mimetype TEXT NOT NULL,
    size INTEGER NOT NULL,
    FOREIGN KEY(comment_id) REFERENCES comments(id)
  )`);

  // Seed default agent if not exists
  const agentEmail = process.env.DEFAULT_AGENT_EMAIL;
  const agentPassword = process.env.DEFAULT_AGENT_PASSWORD;
  if (agentEmail && agentPassword) {
    db.get('SELECT id FROM users WHERE email = ?', [agentEmail], async (err, row) => {
      if (!row) {
        const hash = await bcrypt.hash(agentPassword, 10);
        const now = new Date().toISOString();
        db.run(
          'INSERT INTO users (name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)',
          ['Agente', agentEmail, hash, 'agent', now]
        );
        console.log('Agente padrão criado:', agentEmail);
      }
    });
  }
});

// Helpers
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
  if (req.user?.role !== 'agent') return res.status(403).json({ error: 'Forbidden' });
  next();
}

function addHours(date, hours) {
  const d = new Date(date);
  d.setHours(d.getHours() + hours);
  return d.toISOString();
}

async function sendWebhook(event, payload) {
  if (!WEBHOOK_URL) return;
  try {
    // Prefer global fetch if available; fallback to https request not implemented for brevity
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

// Routes
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Auth
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'Missing fields' });
  const now = new Date().toISOString();
  const hash = await bcrypt.hash(password, 10);
  db.run(
    'INSERT INTO users (name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)',
    [name, email, hash, 'user', now],
    function (err) {
      if (err) {
        if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Email already registered' });
        return res.status(500).json({ error: 'DB error' });
      }
      const user = { id: this.lastID, name, email, role: 'user' };
      res.json({ user, token: signToken(user) });
    }
  );
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Missing fields' });
  db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });
    const payload = { id: user.id, name: user.name, email: user.email, role: user.role };
    res.json({ user: payload, token: signToken(payload) });
  });
});

app.get('/api/me', authMiddleware, (req, res) => {
  db.get('SELECT id, name, email, role FROM users WHERE id = ?', [req.user.id], (err, user) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json({ user });
  });
});

// Tickets
app.post('/api/tickets', authMiddleware, (req, res) => {
  const { title, description, priority = 'medium' } = req.body || {};
  if (!title || !description) return res.status(400).json({ error: 'Missing fields' });
  const now = new Date().toISOString();
  const responseDue = addHours(now, SLA_RESPONSE_HOURS);
  const resolutionDue = addHours(now, SLA_RESOLUTION_HOURS);

  db.run(
    `INSERT INTO tickets (user_id, title, description, status, priority, created_at, updated_at, response_due_at, resolution_due_at)
     VALUES (?, ?, ?, 'open', ?, ?, ?, ?, ?)`,
    [req.user.id, title, description, priority, now, now, responseDue, resolutionDue],
    function (err) {
      if (err) return res.status(500).json({ error: 'DB error' });
      const ticket = {
        id: this.lastID,
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
    }
  );
});

app.get('/api/tickets', authMiddleware, (req, res) => {
  const isAgent = req.user.role === 'agent';
  const query = isAgent ? 'SELECT * FROM tickets ORDER BY id DESC' : 'SELECT * FROM tickets WHERE user_id = ? ORDER BY id DESC';
  const params = isAgent ? [] : [req.user.id];
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json({ tickets: rows });
  });
});

app.get('/api/tickets/:id', authMiddleware, (req, res) => {
  const id = parseInt(req.params.id, 10);
  db.get('SELECT * FROM tickets WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    if (!row) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'agent' && row.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    res.json({ ticket: row });
  });
});

app.patch('/api/tickets/:id', authMiddleware, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { status } = req.body || {};
  if (!status) return res.status(400).json({ error: 'Missing status' });
  if (req.user.role !== 'agent') return res.status(403).json({ error: 'Agent only' });
  const now = new Date().toISOString();
  db.run('UPDATE tickets SET status = ?, updated_at = ? WHERE id = ?', [status, now, id], function (err) {
    if (err) return res.status(500).json({ error: 'DB error' });
    db.get('SELECT * FROM tickets WHERE id = ?', [id], (err2, row) => {
      if (err2) return res.status(500).json({ error: 'DB error' });
      sendWebhook('ticket.updated', row);
      res.json({ ticket: row });
    });
  });
});

// Comments with attachments
app.post('/api/tickets/:id/comments', authMiddleware, upload.array('files'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { body } = req.body || {};
  if (!body) return res.status(400).json({ error: 'Missing body' });
  const now = new Date().toISOString();
  db.get('SELECT * FROM tickets WHERE id = ?', [id], (err, ticket) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    if (req.user.role !== 'agent' && ticket.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    db.run(
      'INSERT INTO comments (ticket_id, user_id, body, created_at) VALUES (?, ?, ?, ?)',
      [id, req.user.id, body, now],
      function (err2) {
        if (err2) return res.status(500).json({ error: 'DB error' });
        const commentId = this.lastID;
        const files = req.files || [];
        files.forEach((f) => {
          db.run(
            'INSERT INTO attachments (comment_id, filename, path, mimetype, size) VALUES (?, ?, ?, ?, ?)',
            [commentId, f.originalname, `/uploads/${path.basename(f.path)}`, f.mimetype, f.size]
          );
        });
        // First response tracking
        if (!ticket.first_response_at && req.user.role === 'agent') {
          db.run('UPDATE tickets SET first_response_at = ?, updated_at = ? WHERE id = ?', [now, now, id]);
        }
        db.get('SELECT * FROM comments WHERE id = ?', [commentId], (err3, comment) => {
          if (err3) return res.status(500).json({ error: 'DB error' });
          db.all('SELECT * FROM attachments WHERE comment_id = ?', [commentId], (err4, atts) => {
            sendWebhook('comment.created', { comment, attachments: atts });
            res.json({ comment, attachments: atts });
          });
        });
      }
    );
  });
});

app.get('/api/tickets/:id/comments', authMiddleware, (req, res) => {
  const id = parseInt(req.params.id, 10);
  db.get('SELECT * FROM tickets WHERE id = ?', [id], (err, ticket) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    if (req.user.role !== 'agent' && ticket.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    db.all('SELECT * FROM comments WHERE ticket_id = ? ORDER BY id ASC', [id], (err2, comments) => {
      if (err2) return res.status(500).json({ error: 'DB error' });
      res.json({ comments });
    });
  });
});

// Webhook receiver (incoming)
app.post('/api/webhooks/incoming', (req, res) => {
  console.log('Incoming webhook:', req.body);
  res.json({ received: true });
});

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});