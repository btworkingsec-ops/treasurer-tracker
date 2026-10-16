require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const path = require('path');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const recordsRoutes = require('./routes/records');
const { optionalAuth } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Security
app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'", "cdn.jsdelivr.net", "'unsafe-inline'"], styleSrc: ["'self'", "cdn.jsdelivr.net", "fonts.googleapis.com", "'unsafe-inline'"], fontSrc: ["'self'", "fonts.gstatic.com", "cdn.jsdelivr.net"], imgSrc: ["'self'", "data:"], connectSrc: ["'self'"] } } }));
app.use(rateLimit({ windowMs: 60000, max: 200, standardHeaders: true, legacyHeaders: false }));
app.set('trust proxy', 1);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '../public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/records', recordsRoutes);

// Poll endpoint for live updates
app.get('/api/poll/:recordId', async (req, res) => {
  try {
    const pool = require('./db');
    const result = await pool.query(
      'SELECT updated_at, current_stage_id FROM tracking_records WHERE id = $1 AND status = $2',
      [req.params.recordId, 'active']
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'ไม่พบข้อมูล' });
    res.json(result.rows[0]);
  } catch { res.status(500).json({ error: 'เกิดข้อผิดพลาด' }); }
});

// Page routes
app.get('/', optionalAuth, (req, res) => res.render('public/index', { user: req.user || null }));
app.get('/track/:id', optionalAuth, (req, res) => res.render('public/track', { recordId: req.params.id, user: req.user || null }));
app.get('/login', (req, res) => res.render('admin/login'));
app.get('/admin', (req, res) => {
  const jwt = require('jsonwebtoken');
  try {
    const token = req.cookies?.token;
    if (!token) return res.redirect('/login');
    jwt.verify(token, process.env.JWT_SECRET);
    res.render('admin/dashboard');
  } catch { res.redirect('/login'); }
});
app.get('/admin/records/:id', (req, res) => {
  const jwt = require('jsonwebtoken');
  try {
    const token = req.cookies?.token;
    if (!token) return res.redirect('/login');
    jwt.verify(token, process.env.JWT_SECRET);
    res.render('admin/record-detail', { recordId: req.params.id });
  } catch { res.redirect('/login'); }
});
app.get('/admin/settings', (req, res) => {
  const jwt = require('jsonwebtoken');
  try {
    const token = req.cookies?.token;
    if (!token) return res.redirect('/login');
    jwt.verify(token, process.env.JWT_SECRET);
    res.render('admin/settings');
  } catch { res.redirect('/login'); }
});

app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
