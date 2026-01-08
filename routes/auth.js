const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const pool = require('../config/db');

const router = express.Router();

router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 })
  ],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const conn = await pool.getConnection();
    try {
      const { email, password } = req.body;

      const [rows] = await conn.query(
        'SELECT id, name, email, password_hash, role FROM users WHERE email = ? AND is_deleted = 0',
        [email]
      );

      const user = rows[0];
      if (!user) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      const ok = await bcrypt.compare(password, user.password_hash);
      if (!ok) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      const token = jwt.sign(
        { id: user.id, role: user.role, name: user.name },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      res.json({
        success: true,
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role
        }
      });
    } catch (err) {
      next(err);
    } finally {
      conn.release();
    }
  }
);

module.exports = router;
