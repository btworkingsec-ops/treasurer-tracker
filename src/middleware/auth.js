const jwt = require('jsonwebtoken');

function requireAdmin(req, res, next) {
  try {
    const token = req.cookies?.token || req.headers.authorization?.split(' ')[1];
    if (!token) {
      if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
      return res.redirect('/login');
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'admin') {
      if (req.path.startsWith('/api/')) return res.status(403).json({ error: 'ไม่มีสิทธิ์เข้าถึง' });
      return res.redirect('/');
    }
    req.user = decoded;
    next();
  } catch {
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Token ไม่ถูกต้องหรือหมดอายุ' });
    res.clearCookie('token');
    return res.redirect('/login');
  }
}

function optionalAuth(req, res, next) {
  try {
    const token = req.cookies?.token;
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
    }
  } catch { /* ignored */ }
  next();
}

module.exports = { requireAdmin, optionalAuth };
