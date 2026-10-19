# 🚀 راهنمای جامع و صفر تا صد استقرار روی Cloudflare و Vercel (با دیتابیس ابری و Gmail OTP)

این سند، راهنمای رسمی، گام‌به‌گام و استاندارد برای استقرار کامل پروژه **Gemini Shop** بر روی دو پلتفرم قدرتمند ابری **Cloudflare Pages** (برای میزبانی فرانت‌اند با CDN جهانی و امنیت DDoS) و **Vercel** (برای پردازش توابع سرورلس، دیتابیس و ارسال کدهای تأیید ایمیلی Gmail OTP) می‌باشد.

---

## 🏗️ معماری نهایی سیستم (System Architecture)

```
[کاربران و خریداران در سراسر دنیا]
               │
               ▼
   [Cloudflare Pages - فرانت‌اند]
   - بارگذاری فوق‌سریع و کش جهانی CDN
   - گواهی SSL رایگان و محافظت DDoS
   - اتصال دامنه اختصاصی (.ir یا .com)
               │
               ▼ (درخواست‌های /api/*)
       [Vercel Serverless API]
               ├── ارسال ایمیل کد OTP ۵ رقمی از طریق پورت TLS 465 گوگل
               └── ذخیره و بازیابی در [دیتابیس ابری Neon / Supabase]
```

---

## 📋 گام اول: ساخت دیتابیس ابری رایگان (Neon PostgreSQL یا Supabase)

برای ذخیره‌سازی دائمی سفارشات، اطلاعات مشتریان و سطوح دسترسی ادمین‌ها، بهترین گزینه استفاده از یک دیتابیس ابری پایدار و پرسرعت است:

### روش راه‌اندازی در Neon.tech (پیشنهادی - ۱۰۰٪ رایگان و فوق‌سریع):
1. وارد سایت [https://neon.tech](https://neon.tech) شوید و با اکانت گیت‌هاب خود لاگین کنید.
2. روی دکمه **Create Project** کلیک کنید:
   - **Project Name:** `gemini-shop-db`
   - **Region:** نزدیک‌ترین منطقه (مثلاً `Frankfurt - eu-central-1`)
3. پس از ساخته شدن پروژه، به تب **SQL Editor** بروید.
4. فایل [`server/schema.sql`](file:///C:/Users/NariManoV/Pictures/Gemini%20pro%20logo/gemini-pro-store-frontend/server/schema.sql) موجود در سورس پروژه را باز کنید، کل کدهای SQL آن را کپی کرده و در SQL Editor نئون پیست کنید و دکمه **Run** را بزنید.
   - *تمام جداول `admins`، `users`، `orders`، `otp_codes`، `chat_messages` و `settings` با ایندکس‌های پرسرعت ساخته می‌شوند.*
5. از داشبورد Neon، آدرس اتصال پایگاه داده (**Connection String** / `DATABASE_URL`) را کپی و یادداشت کنید:
   ```text
   postgresql://user:password@ep-xyz.eu-central-1.aws.neon.tech/gemini-shop-db?sslmode=require
   ```

---

## 🔑 گام دوم: دریافت رمز عبور اپلیکیشن جیمیل (Gmail App Password)

جهت فعال‌سازی ارسال زنده کدهای تأیید ۵ رقمی OTP به ایمیل خریداران از طریق پورت ۴۶۵:

1. به حساب گوگل خود در [https://myaccount.google.com](https://myaccount.google.com) بروید.
2. وارد بخش **Security** (امنیت) شوید و اطمینان حاصل کنید **2-Step Verification** (تأیید دو مرحله‌ای) اکانت فعال باشد.
3. در کادر جستجوی بالای تنظیمات گوگل، عبارت **App Passwords** (رمزهای عبور برنامه) را جستجو کنید.
4. یک رمز جدید به نام `Gemini Shop` بسازید.
5. گوگل یک کد **۱۶ کاراکتری اختصاصی** (مثلاً `abcd efgh ijkl mnop`) به شما نمایش می‌دهد. این کد را بدون فاصله کپی کنید.

---

## ⚡ گام سوم: دیپلوی بک‌اند روی Vercel (جهت API و ارسال ایمیل)

1. وارد سایت [https://vercel.com](https://vercel.com) شوید و با اکانت گیت‌هاب لاگین کنید.
2. روی **Add New...** -> **Project** کلیک کرده و مخزن **`NariManoV21/Gemini-Shop`** را انتخاب و دکمه **Import** را بزنید.
3. در تنظیمات پروژه:
   - **Framework Preset:** `Vite` (یا `Other`)
   - **Root Directory:** `./`
4. بخش **Environment Variables** (متغیرهای محیطی) را باز کنید و مقادیر زیر را اضافه کنید:
   - `SMTP_USER`: آدرس جیمیل شما (مثلاً `yourshop@gmail.com`)
   - `SMTP_PASS`: کد ۱۶ رقمی App Password مرحله قبل (بدون فاصله)
   - `SMTP_HOST`: `smtp.gmail.com`
   - `SMTP_PORT`: `465`
   - `DATABASE_URL`: آدرس دیتابیس ابری کپی‌شده از Neon در گام اول
   - `ADMIN_PASSWORD`: رمز اولیه مدیریت (مثلاً یک رمز امن دلخواه)
5. روی دکمه **Deploy** کلیک کنید.
6. پس از اتمام دیپلوی، ورسل یک دامنه به شما می‌دهد (مثلاً `https://gemini-shop-backend.vercel.app`).
   - مسیر API شما این خواهد بود: `https://gemini-shop-backend.vercel.app/api`

---

## ☁️ گام چهارم: دیپلوی فرانت‌اند روی Cloudflare Pages

1. وارد داشبورد کلادفلر به نشانی [https://dash.cloudflare.com](https://dash.cloudflare.com) شوید.
2. از منوی سمت چپ به مسیر **Workers & Pages** -> **Overview** بروید.
3. روی دکمه **Create application** و سپس سربرگ **Pages** کلیک کنید.
4. گزینه **Connect to Git** را انتخاب کرده و دسترسی به مخزن **`NariManoV21/Gemini-Shop`** را تأیید کنید.
5. در بخش تنظیمات ساخت (**Build Settings**):
   - **Project Name:** `gemini-shop`
   - **Production branch:** `main`
   - **Framework preset:** `Vite`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Root directory:** `/` (خالی بگذارید)
6. در بخش **Environment variables** (متغیرهای ساخت):
   - متغیر نام: `VITE_API_BASE`
   - متغیر مقدار: `https://gemini-shop-backend.vercel.app/api` (آدرس بک‌اند ورسل از گام سوم)
   - متغیر نام: `NODE_VERSION`
   - متغیر مقدار: `20`
7. روی دکمه **Save and Deploy** کلیک کنید.
8. در عرض کمتر از ۱ دقیقه، سایت روی دامنه‌ای شبیه به `https://gemini-shop.pages.dev` آنلاین و فعال خواهد شد.

---

## 🌐 گام پنجم: اتصال دامنه اختصاصی (Custom Domain در Cloudflare)

1. در صفحه پروژه خود در **Cloudflare Pages**، به تب **Custom domains** بروید.
2. روی دکمه **Set up a custom domain** کلیک کنید.
3. نام دامنه خود (مانند `geminishop.ir` یا `store.yourdomain.com`) را وارد کنید.
4. کلادفلر به صورت خودکار رکوردهای DNS را ست کرده و گواهی رایگان و خودکار **SSL (HTTPS)** را برای دامنه فعال می‌نماید.

---

## 🧪 گام ششم: تست نهایی و تحویل کامل به کارفرما

1. **تست لاگین مدیر ارشد:**
   - با زدن کلید میانبر یا آیکون مدیریت، وارد پنل شوید.
   - رمز عبور اختصاصی خود را تنظیم کرده و تایید فرمایید.
   - از تب «همکاران و دسترسی‌ها»، یک ادمین آزمایشی بسازید و با نام کاربری و رمز او ورود را تست کنید.
2. **تست ارسال ایمیل Gmail OTP:**
   - در سایت روی خرید اشتراک کلیک کرده، نام و ایمیل جیمیل خود را وارد نمایید.
   - کد ۵ رقمی بلافاصله به جیمیل شما ایمیل می‌شود. آن را وارد کرده و وارد حساب شوید.
3. **تست پیگیری سفارش و چت پشتیبانی:**
   - یک سفارش تستی ثبت کنید، در چت آنلاین استعلام وضعیت را بزنید.
   - سپس از تب تنظیمات پنل مدیریت، دکمه **«🧹 پاکسازی و بازنشانی دیتابیس صفر»** را بزنید تا سایت کاملاً خام و پاکسازی‌شده تحویل نهایی شود.
