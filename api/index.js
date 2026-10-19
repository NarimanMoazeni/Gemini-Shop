/**
 * Vercel Serverless Function Entrypoint
 * کلیه درخواست‌های ارسال شده به مسیرهای /api/* توسط این تابع سرورلس پردازش می‌شوند.
 * سازگار با پروتکل بومی Node.js و پشتیبانی مستقیم از TLS 465 برای ارسال کد OTP جیمیل.
 */

import handleApiRequest from '../server/index.js';

export default async function handler(req, res) {
  return handleApiRequest(req, res);
}
