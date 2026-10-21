/**
 * ماژول رسمی مدیریت دیتابیس پایدار Neon PostgreSQL فروشگاه Gemini Shop
 * بر پایه‌ی پروتکل Serverless HTTP API اختصاصی Neon
 * کاملاً بدون وابستگی بومی، سازگار با محیط‌های Vercel Serverless و Node.js
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'gemini_store_data.json');

const DEFAULT_NEON_URI =
  'postgresql://neondb_owner:npg_G4eVplQfKU5o@ep-sweet-feather-bahusr0d-pooler.c-8.eu-central-1.aws.neon.tech/neondb?sslmode=require';

function getDbUri() {
  return process.env.DATABASE_URL || DEFAULT_NEON_URI;
}

function getDbHost(uri) {
  try {
    const url = new URL(uri);
    return url.host;
  } catch {
    return 'ep-sweet-feather-bahusr0d-pooler.c-8.eu-central-1.aws.neon.tech';
  }
}

/**
 * اجرای پرس‌وجوی SQL پارامتری روی Neon Postgres
 */
export async function queryNeon(query, params = []) {
  const uri = getDbUri();
  const host = getDbHost(uri);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(`https://${host}/sql`, {
      method: 'POST',
      headers: {
        'Neon-Connection-String': uri,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, params }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Neon SQL Error (${res.status}): ${errText}`);
    }
    return await res.json();
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

// -----------------------------------------------------------------------------
// مدیریت ادمین‌ها (RBAC Admins)
// -----------------------------------------------------------------------------

export async function ensureHeadAdmin(defaultPasswordHash) {
  try {
    const res = await queryNeon(
      'SELECT id, username, full_name, password_hash, role FROM admins WHERE LOWER(username) = $1 LIMIT 1;',
      ['admin']
    );
    if (!res.rows || res.rows.length === 0) {
      console.log('⚡ Initializing Head Admin in Neon PostgreSQL...');
      await queryNeon(
        `INSERT INTO admins (id, username, password_hash, full_name, role, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (username) DO NOTHING;`,
        ['adm_head_1', 'admin', defaultPasswordHash, 'نریمان موذنی (مدیر ارشد)', 'head_admin']
      );
    }
  } catch (err) {
    console.error('Failed to ensure Head Admin in Neon:', err.message);
  }
}

export async function getAllAdmins() {
  try {
    const res = await queryNeon(
      `SELECT id, username, full_name as "fullName", role, password_hash as "passwordHash", created_at as "createdAt"
       FROM admins
       ORDER BY created_at ASC;`
    );
    return res.rows;
  } catch (err) {
    console.error('Neon getAllAdmins fallback:', err.message);
    return null;
  }
}

export async function getAdminByUsername(username) {
  try {
    const clean = String(username).trim().toLowerCase();
    const res = await queryNeon(
      `SELECT id, username, full_name as "fullName", role, password_hash as "passwordHash", created_at as "createdAt"
       FROM admins
       WHERE LOWER(username) = $1
       LIMIT 1;`,
      [clean]
    );
    return res.rows[0] || null;
  } catch (err) {
    console.error('Neon getAdminByUsername error:', err.message);
    return null;
  }
}

export async function insertAdmin({ id, username, passwordHash, fullName, role }) {
  const cleanUsername = String(username).trim().toLowerCase();
  const res = await queryNeon(
    `INSERT INTO admins (id, username, password_hash, full_name, role, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     RETURNING id, username, full_name as "fullName", role, created_at as "createdAt";`,
    [id, cleanUsername, passwordHash, fullName, role || 'regular_admin']
  );
  return res.rows[0];
}

export async function deleteAdmin(id) {
  const res = await queryNeon('DELETE FROM admins WHERE id = $1;', [id]);
  return res.rowCount > 0;
}

export async function updateAdminPassword(id, newPasswordHash) {
  const res = await queryNeon(
    'UPDATE admins SET password_hash = $1 WHERE id = $2 RETURNING id;',
    [newPasswordHash, id]
  );
  return res.rowCount > 0;
}

// -----------------------------------------------------------------------------
// مدیریت کاربران و مشتریان (Users)
// -----------------------------------------------------------------------------

export async function getAllUsers() {
  try {
    const res = await queryNeon(
      `SELECT id, full_name as "fullName", username, gmail, mobile, password_hash as "passwordHash", created_at as "createdAt"
       FROM users
       ORDER BY created_at DESC;`
    );
    return res.rows;
  } catch (err) {
    console.error('Neon getAllUsers fallback:', err.message);
    return null;
  }
}

export async function getUserByIdentifier(identifier) {
  try {
    const clean = String(identifier).trim().toLowerCase();
    const res = await queryNeon(
      `SELECT id, full_name as "fullName", username, gmail, mobile, password_hash as "passwordHash", created_at as "createdAt"
       FROM users
       WHERE LOWER(username) = $1 OR LOWER(gmail) = $1
       LIMIT 1;`,
      [clean]
    );
    return res.rows[0] || null;
  } catch (err) {
    console.error('Neon getUserByIdentifier error:', err.message);
    return null;
  }
}

export async function getUserByGmail(gmail) {
  try {
    const clean = String(gmail).trim().toLowerCase();
    const res = await queryNeon(
      `SELECT id, full_name as "fullName", username, gmail, mobile, password_hash as "passwordHash", created_at as "createdAt"
       FROM users
       WHERE LOWER(gmail) = $1
       LIMIT 1;`,
      [clean]
    );
    return res.rows[0] || null;
  } catch (err) {
    console.error('Neon getUserByGmail error:', err.message);
    return null;
  }
}

export async function getUserByUsername(username) {
  try {
    const clean = String(username).trim().toLowerCase();
    const res = await queryNeon(
      `SELECT id, full_name as "fullName", username, gmail, mobile, password_hash as "passwordHash", created_at as "createdAt"
       FROM users
       WHERE LOWER(username) = $1
       LIMIT 1;`,
      [clean]
    );
    return res.rows[0] || null;
  } catch (err) {
    console.error('Neon getUserByUsername error:', err.message);
    return null;
  }
}

export async function insertUser({ id, fullName, username, gmail, mobile, passwordHash }) {
  const cleanUsername = username ? String(username).trim().toLowerCase() : null;
  const cleanGmail = String(gmail).trim().toLowerCase();
  const res = await queryNeon(
    `INSERT INTO users (id, full_name, username, gmail, mobile, password_hash, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     RETURNING id, full_name as "fullName", username, gmail, mobile, created_at as "createdAt";`,
    [id, fullName, cleanUsername, cleanGmail, mobile || '', passwordHash || null]
  );
  return res.rows[0];
}

// -----------------------------------------------------------------------------
// مدیریت سفارشات و تراکنش‌ها (Orders)
// -----------------------------------------------------------------------------

export async function getAllOrders() {
  try {
    const res = await queryNeon(
      `SELECT id, user_id as "userId", full_name as "fullName", gmail, mobile, product_name as "productName",
              amount_toman as "amountToman", payment_method as "paymentMethod", payment_ref as "paymentRef",
              status, activation_link as "activationLink", admin_notes as "adminNotes",
              created_at as "createdAt", approved_at as "approvedAt"
       FROM orders
       ORDER BY created_at DESC;`
    );
    return res.rows;
  } catch (err) {
    console.error('Neon getAllOrders fallback:', err.message);
    return null;
  }
}

export async function insertOrder(order) {
  const res = await queryNeon(
    `INSERT INTO orders (id, full_name, gmail, mobile, product_name, amount_toman, payment_method, payment_ref, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
     RETURNING *;`,
    [
      order.id,
      order.fullName,
      order.gmail.trim().toLowerCase(),
      order.mobile || '',
      order.productName || 'Google AI Pro 18 Months',
      order.amountToman || 599000,
      order.paymentMethod || 'bezanbekart',
      order.paymentRef || '',
      order.status || 'pending_verification',
    ]
  );
  return res.rows[0];
}

export async function updateOrder(id, { status, activationLink, adminNotes }) {
  const res = await queryNeon(
    `UPDATE orders
     SET status = COALESCE($1, status),
         activation_link = COALESCE($2, activation_link),
         admin_notes = COALESCE($3, admin_notes),
         approved_at = CASE WHEN $1 = 'approved' THEN NOW() ELSE approved_at END
     WHERE id = $4
     RETURNING *;`,
    [status || null, activationLink || null, adminNotes || null, id]
  );
  return res.rows[0] || null;
}

export async function deleteOrder(id) {
  const res = await queryNeon('DELETE FROM orders WHERE id = $1;', [id]);
  return res.rowCount > 0;
}

// -----------------------------------------------------------------------------
// تنظیمات سیستمی (Settings)
// -----------------------------------------------------------------------------

export async function getSettingsMap() {
  try {
    const res = await queryNeon('SELECT key, value FROM settings;');
    const map = {};
    for (const r of res.rows) {
      map[r.key] = r.value;
    }
    return map;
  } catch (err) {
    console.error('Neon getSettings error:', err.message);
    return {};
  }
}

export async function saveSetting(key, value) {
  try {
    await queryNeon(
      `INSERT INTO settings (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();`,
      [key, JSON.stringify(value)]
    );
  } catch (err) {
    console.error(`Neon saveSetting [${key}] error:`, err.message);
  }
}

// -----------------------------------------------------------------------------
// بازنشانی وضعیت صفر (Zero-State Database Reset)
// -----------------------------------------------------------------------------

export async function zeroStateReset(headAdminPasswordHash) {
  console.log('🔄 Executing Zero-State Database Reset in Neon PostgreSQL...');
  try {
    // پاک کردن سفارشات، پیام‌های پشتیبانی، کدهای OTP و خریداران
    await queryNeon('TRUNCATE orders, users, chat_messages, otp_codes CASCADE;');
    
    // پاک کردن تمامی ادمین‌های زیرشاخه و بازگرداندن ادمین اصلی
    await queryNeon("DELETE FROM admins WHERE LOWER(username) != 'admin';");

    // تضمین وجود حساب مدیر ارشد با رمز عبور هش‌شده
    const checkHead = await queryNeon("SELECT id FROM admins WHERE LOWER(username) = 'admin' LIMIT 1;");
    if (checkHead.rows.length === 0) {
      await queryNeon(
        `INSERT INTO admins (id, username, password_hash, full_name, role, created_at)
         VALUES ('adm_head_1', 'admin', $1, 'نریمان موذنی (مدیر ارشد)', 'head_admin', NOW());`,
        [headAdminPasswordHash]
      );
    }

    // ریست قیمت و تنظیمات در جدول settings
    await saveSetting('pricing', { priceToman: 599000 });

    return { success: true };
  } catch (err) {
    console.error('Zero-state reset error:', err.message);
    throw err;
  }
}
