-- ==============================================================================
-- ✦ اسکریپت ساخت دیتابیس نهایی و استاندارد فروشگاه Gemini Shop (Zero-State Schema)
-- سازگار با PostgreSQL (Neon.tech, Supabase, Vercel Postgres) و Cloudflare D1 (SQLite)
-- طراحی‌شده بر اساس استانداردهای امنیت سایبری، پسوردهای سالت‌دار و پشتیبانی از Gmail OTP
-- ==============================================================================

-- ۱. جدول ادمین‌ها و مدیر ارشد با رمز عبور هش‌شده و سالت‌دار (RBAC)
CREATE TABLE IF NOT EXISTS admins (
    id VARCHAR(64) PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL, -- فرمت: sha256:salt:hash یا pbkdf2:salt:hash
    full_name VARCHAR(100) NOT NULL,
    role VARCHAR(30) DEFAULT 'regular_admin' CHECK (role IN ('head_admin', 'regular_admin')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP WITH TIME ZONE
);

-- ایندکس جستجوی نام کاربری
CREATE INDEX IF NOT EXISTS idx_admins_username ON admins (LOWER(username));

-- ۲. جدول مشتریان و خریداران احراز هویت شده از طریق Gmail OTP
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    gmail VARCHAR(150) UNIQUE NOT NULL,
    mobile VARCHAR(20),
    password_hash VARCHAR(255), -- اختیاری جهت رمزنگاری اطلاعات حساس مشتری
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_gmail ON users (LOWER(gmail));
CREATE INDEX IF NOT EXISTS idx_users_mobile ON users (mobile);

-- ۳. جدول سفارشات و فیش‌های واریزی فروشگاه
CREATE TABLE IF NOT EXISTS orders (
    id VARCHAR(32) PRIMARY KEY, -- مثال: GP-742195
    user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    full_name VARCHAR(100) NOT NULL,
    gmail VARCHAR(150) NOT NULL,
    mobile VARCHAR(20),
    product_name VARCHAR(150) NOT NULL,
    amount_toman INTEGER NOT NULL,
    payment_method VARCHAR(40) DEFAULT 'bezanbekart', -- 'bezanbekart' | 'card_to_card'
    payment_ref VARCHAR(100),
    status VARCHAR(30) DEFAULT 'pending_verification' CHECK (status IN ('pending_verification', 'approved', 'rejected')),
    activation_link TEXT, -- لینک رسمی گوگل وان
    admin_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    approved_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_gmail ON orders (LOWER(gmail));
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders (created_at DESC);

-- ۴. جدول کدهای تأیید یکبارمصرف ایمیلی (Gmail OTP) با انقضای خودکار
CREATE TABLE IF NOT EXISTS otp_codes (
    email VARCHAR(150) PRIMARY KEY,
    code_hash VARCHAR(128) NOT NULL,
    full_name VARCHAR(100),
    mobile VARCHAR(20),
    attempts INTEGER DEFAULT 0,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ۵. جدول پیام‌های پشتیبانی آنلاین و تیکت‌ها
CREATE TABLE IF NOT EXISTS chat_messages (
    id VARCHAR(64) PRIMARY KEY,
    session_id VARCHAR(64) NOT NULL,
    sender VARCHAR(20) NOT NULL CHECK (sender IN ('user', 'bot', 'admin')),
    text TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chat_session ON chat_messages (session_id, created_at ASC);

-- ۶. جدول تنظیمات سیستمی، درگاه پرداخت و جیمیل SMTP
CREATE TABLE IF NOT EXISTS settings (
    key VARCHAR(64) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- درج تنظیمات اولیه در صورت عدم وجود
INSERT INTO settings (key, value)
VALUES 
    ('pricing', '{"priceToman": 599000}'),
    ('payment', '{"cardNumber": "6037997512345678", "cardHolder": "نریمان موذنی", "bankName": "بانک ملی ایران"}'),
    ('smtp', '{"host": "smtp.gmail.com", "port": 465, "user": "", "configured": false}')
ON CONFLICT (key) DO NOTHING;
