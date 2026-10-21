/**
 * سرویس مدیریت پروفایل و احراز هویت خریداران فروشگاه Gemini Shop
 * ارتباط با وب‌سرویس جهت ارسال و اعتبارسنجی کد ۵ رقمی تأیید یکبارمصرف ایمیل (Gmail OTP)
 */

import { sanitizeInput, sanitizeMobile, sanitizeEmail } from '../lib/sanitize';
import { getStoredOrders, fetchCustomerOrdersRemote, type StoreOrder } from './orderStorage';
import { API_BASE } from '../config/api';

export interface UserProfile {
  id: string;
  fullName: string;
  username?: string;
  mobile: string;
  gmail: string;
  createdAt: string;
}

const AUTH_STORAGE_KEY = 'gemini_customer_profile_v1';

/**
 * دریافت مشخصات مشتری جاری از حافظه محلی
 */
export function getCurrentUser(): UserProfile | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error loading user profile:', err);
    return null;
  }
}

/**
 * ذخیره مشخصات کاربر در حافظه محلی و انتشار تغییرات در سراسر کامپوننت‌ها
 */
export function saveCurrentUser(user: UserProfile) {
  try {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
    window.dispatchEvent(new CustomEvent('gemini_auth_changed', { detail: user }));
  } catch (err) {
    console.error('Error saving user profile:', err);
  }
}

/**
 * بررسی ثبت‌بودن آدرس جیمیل در سیستم
 */
export async function checkEmailExists(email: string): Promise<boolean> {
  const cleanEmail = sanitizeEmail(email);
  if (!cleanEmail) return false;
  try {
    const res = await fetch(`${API_BASE}/auth/check-email?email=${encodeURIComponent(cleanEmail)}`);
    if (res.ok) {
      const data = await res.json();
      return Boolean(data.exists);
    }
  } catch (err) {
    console.warn('Backend unavailable for email check, checking local records:', err);
  }

  // بررسی حافظه محلی در صورت آفلاین بودن
  const existing = getCurrentUser();
  if (existing && sanitizeEmail(existing.gmail) === cleanEmail) return true;
  try {
    const registered = JSON.parse(localStorage.getItem('gemini_all_registered_emails') || '[]');
    return Array.isArray(registered) && registered.includes(cleanEmail);
  } catch {
    return false;
  }
}

/**
 * بررسی آزاد بودن نام کاربری (Check Username)
 */
export async function checkUsernameExists(username: string): Promise<{ exists: boolean; available: boolean }> {
  const cleanUser = sanitizeInput(username).trim().toLowerCase();
  if (!cleanUser) return { exists: false, available: true };
  try {
    const res = await fetch(`${API_BASE}/auth/check-username?username=${encodeURIComponent(cleanUser)}`);
    if (res.ok) {
      const data = await res.json();
      return { exists: Boolean(data.exists), available: Boolean(data.available) };
    }
  } catch (err) {
    console.warn('Backend unavailable for username check:', err);
  }
  const existing = getCurrentUser();
  if (existing && existing.username && existing.username.toLowerCase() === cleanUser) {
    return { exists: true, available: false };
  }
  return { exists: false, available: true };
}

/**
 * ورود مستقیم خریدار با استفاده از نام کاربری / ایمیل و رمز عبور (بدون نیاز به کد یکبارمصرف OTP)
 */
export async function loginWithPassword(
  usernameOrEmail: string,
  password: string
): Promise<{
  success: boolean;
  user?: UserProfile;
  message?: string;
  error?: string;
  notFound?: boolean;
  needsOtpSetup?: boolean;
}> {
  const cleanIdentifier = sanitizeInput(usernameOrEmail).trim();
  const cleanPass = password ? String(password).trim() : '';

  if (!cleanIdentifier || !cleanPass) {
    return {
      success: false,
      error: 'لطفاً نام کاربری (یا ایمیل) و رمز عبور خود را وارد نمایید.',
    };
  }

  try {
    const res = await fetch(`${API_BASE}/auth/login-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usernameOrEmail: cleanIdentifier,
        password: cleanPass,
      }),
    });

    const data = await res.json();
    if (res.ok && data.success && data.user) {
      const user: UserProfile = data.user;
      saveCurrentUser(user);
      // همگام‌سازی بلادرنگ کلیه سفارشات و اشتراک‌های کاربر از دیتابیس پایدار سرور به این دستگاه
      fetchCustomerOrdersRemote({ email: user.gmail, mobile: user.mobile, userId: user.id }).catch(() => {});
      return {
        success: true,
        user,
        message: data.message || 'ورود به حساب کاربری با موفقیت انجام شد.',
      };
    }

    return {
      success: false,
      error: data.error || 'خطا در ورود به حساب کاربری.',
      notFound: data.notFound,
      needsOtpSetup: data.needsOtpSetup,
    };
  } catch (err) {
    console.warn('Backend unavailable for password login, checking offline storage:', err);
    const existing = getCurrentUser();
    if (
      existing &&
      (existing.gmail.toLowerCase() === cleanIdentifier.toLowerCase() ||
        (existing.username && existing.username.toLowerCase() === cleanIdentifier.toLowerCase()))
    ) {
      saveCurrentUser(existing);
      return {
        success: true,
        user: existing,
        message: 'ورود آفلاین موفقیت‌آمیز بود.',
      };
    }
    return {
      success: false,
      error: 'اتصال به سرور برقرار نشد یا مشخصات وارد شده نادرست است.',
    };
  }
}

/**
 * درخواست ارسال کد تأیید یکبار مصرف ایمیلی (Email / Gmail OTP)
 */
export async function requestEmailOtp(
  email: string,
  fullName?: string,
  mobile?: string,
  mode: 'register' | 'login' | 'general' = 'general',
  username?: string,
  password?: string
): Promise<{
  success: boolean;
  message: string;
  cooldownSeconds?: number;
  simulationCode?: string;
  error?: string;
  alreadyExists?: boolean;
  notFound?: boolean;
  usernameTaken?: boolean;
}> {
  const cleanEmail = sanitizeEmail(email);
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return { success: false, message: '', error: 'لطفاً یک آدرس ایمیل معتبر (مثلاً yourname@gmail.com) وارد فرمایید.' };
  }

  try {
    const res = await fetch(`${API_BASE}/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: cleanEmail,
        fullName: sanitizeInput(fullName || ''),
        username: sanitizeInput(username || '').toLowerCase(),
        password: password || undefined,
        mobile: sanitizeMobile(mobile || ''),
        mode,
      }),
    });

    const data = await res.json();
    if (res.ok && data.success) {
      return {
        success: true,
        message: data.message || 'کد تأیید به ایمیل شما ارسال شد.',
        cooldownSeconds: data.cooldownSeconds || 60,
        simulationCode: data.simulationCode,
      };
    }
    return {
      success: false,
      message: '',
      error: data.error || 'خطا در ارسال کد تأیید ایمیلی. لطفاً مجدداً تلاش کنید.',
      cooldownSeconds: data.remainingSeconds,
      alreadyExists: data.alreadyExists,
      notFound: data.notFound,
      usernameTaken: data.usernameTaken,
    };
  } catch (err) {
    console.warn('Backend unavailable for OTP, using offline simulation fallback:', err);
    // بررسی آفلاین شرط یک حساب = یک جیمیل
    const existing = getCurrentUser();
    const isTaken = existing && sanitizeEmail(existing.gmail) === cleanEmail;
    if (mode === 'register' && isTaken) {
      return {
        success: false,
        message: '',
        error: 'قبلاً با این آدرس جیمیل یک حساب کاربری ثبت شده است. لطفاً وارد حساب خود شوید.',
        alreadyExists: true,
      };
    }
    if (mode === 'login' && !isTaken && !existing) {
      return {
        success: false,
        message: '',
        error: 'حساب کاربری با این آدرس جیمیل یافت نشد. لطفاً ابتدا ثبت‌نام فرمایید.',
        notFound: true,
      };
    }

    const fallbackCode = '12345';
    sessionStorage.setItem(`offline_otp_${cleanEmail}`, fallbackCode);
    return {
      success: true,
      message: 'کد تایید ایمیلی ارسال شد (کد تستی شبیه‌ساز: ۱۲۳۴۵).',
      cooldownSeconds: 60,
      simulationCode: fallbackCode,
    };
  }
}

/**
 * بررسی صحت کد تأیید ایمیل و ورود رسمی خریدار
 */
export async function verifyEmailOtp(
  email: string,
  code: string,
  fullName?: string,
  mobile?: string,
  mode: 'register' | 'login' | 'general' = 'general',
  username?: string,
  password?: string
): Promise<{
  success: boolean;
  user?: UserProfile;
  message?: string;
  error?: string;
  alreadyExists?: boolean;
}> {
  const cleanEmail = sanitizeEmail(email);
  const cleanCode = sanitizeInput(code).replace(/\D/g, '');

  try {
    const res = await fetch(`${API_BASE}/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: cleanEmail,
        code: cleanCode,
        fullName: sanitizeInput(fullName || ''),
        username: sanitizeInput(username || '').toLowerCase(),
        password: password || undefined,
        mobile: sanitizeMobile(mobile || ''),
        mode,
      }),
    });

    const data = await res.json();
    if (res.ok && data.success) {
      const user: UserProfile = data.user;
      saveCurrentUser(user);
      // همگام‌سازی بلادرنگ سفارشات و اشتراک‌ها پس از ثبت‌نام یا ورود با کد تأیید
      fetchCustomerOrdersRemote({ email: user.gmail, mobile: user.mobile, userId: user.id }).catch(() => {});
      // ثبت ایمیل در کش محلی
      try {
        const registered = JSON.parse(localStorage.getItem('gemini_all_registered_emails') || '[]');
        if (!registered.includes(cleanEmail)) {
          registered.push(cleanEmail);
          localStorage.setItem('gemini_all_registered_emails', JSON.stringify(registered));
        }
      } catch {}
      return { success: true, user, message: data.message };
    }
    return {
      success: false,
      error: data.error || 'کد تایید وارد شده نادرست است.',
      alreadyExists: data.alreadyExists,
    };
  } catch (err) {
    console.warn('Backend unavailable, validating against offline simulation:', err);
    const saved = sessionStorage.getItem(`offline_otp_${cleanEmail}`);
    if (cleanCode === '12345' || (saved && saved === cleanCode)) {
      sessionStorage.removeItem(`offline_otp_${cleanEmail}`);
      const cleanMob = sanitizeMobile(mobile || '');
      const existing = getCurrentUser();
      const isSameUser = existing && (existing.gmail === cleanEmail || (cleanMob && existing.mobile === cleanMob));
      
      const user: UserProfile = isSameUser
        ? {
            ...existing,
            fullName: sanitizeInput(fullName || existing.fullName || 'کاربر گرامی'),
            mobile: cleanMob || existing.mobile || '',
            gmail: cleanEmail,
          }
        : {
            id: `cust_${cleanEmail.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`,
            fullName: sanitizeInput(fullName || 'کاربر گرامی'),
            mobile: cleanMob,
            gmail: cleanEmail,
            createdAt: new Date().toISOString(),
          };
      saveCurrentUser(user);
      return { success: true, user, message: 'ورود با موفقیت انجام شد.' };
    }
    return { success: false, error: 'کد تایید وارد شده نادرست است (کد تستی آفلاین: ۱۲۳۴۵).' };
  }
}

/**
 * ورود یا ایجاد مستقیم پروفایل کاربری با نام، ایمیل و شماره موبایل
 * تضمین عدم ایجاد حساب تکراری برای یک خریدار
 */
export function loginOrRegisterCustomer(data: {
  fullName: string;
  gmail: string;
  mobile?: string;
}): UserProfile {
  const cleanName = sanitizeInput(data.fullName);
  const cleanGmail = sanitizeEmail(data.gmail);
  const cleanMobile = sanitizeMobile(data.mobile || '');

  // بررسی اکانت موجود برای جلوگیری از ایجاد اکانت تکراری
  const existing = getCurrentUser();
  if (existing && (existing.gmail === cleanGmail || (cleanMobile && existing.mobile === cleanMobile))) {
    const updated: UserProfile = {
      ...existing,
      fullName: cleanName || existing.fullName,
      mobile: cleanMobile || existing.mobile,
      gmail: cleanGmail || existing.gmail,
    };
    saveCurrentUser(updated);
    return updated;
  }

  // شناسه یکتا و پایدار بر پایه ایمیل یا موبایل
  const canonicalId = `cust_${(cleanGmail || cleanMobile).replace(/[^a-z0-9]/gi, '_').toLowerCase()}`;
  const user: UserProfile = {
    id: canonicalId,
    fullName: cleanName || 'کاربر گرامی',
    mobile: cleanMobile,
    gmail: cleanGmail,
    createdAt: new Date().toISOString(),
  };

  saveCurrentUser(user);
  return user;
}

/**
 * خروج مشتری از حساب کاربری
 */
export function logoutCustomer() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  window.dispatchEvent(new CustomEvent('gemini_auth_changed', { detail: null }));
}

/**
 * دریافت سابقه سفارشات متعلق به مشتری جاری (بر اساس ایمیل یا شماره موبایل)
 */
export function getCustomerOrders(identifier: string): StoreOrder[] {
  if (!identifier) return [];
  const cleanEmail = sanitizeEmail(identifier);
  const cleanMobile = sanitizeMobile(identifier);

  const allOrders = getStoredOrders();
  return allOrders.filter(
    (o) =>
      (cleanEmail && sanitizeEmail(o.gmail) === cleanEmail) ||
      (cleanMobile && sanitizeMobile(o.mobile) === cleanMobile)
  );
}

/**
 * همگام‌سازی بلادرنگ سفارشات مشتری جاری با دیتابیس پایدار Neon
 */
export async function syncCustomerOrders(user: UserProfile): Promise<StoreOrder[]> {
  return fetchCustomerOrdersRemote({
    email: user.gmail,
    mobile: user.mobile,
    userId: user.id,
  });
}

// توابع سازگاری گذشته (Backwards Compatibility)
export const requestSmsOtp = (mobileOrEmail: string) => requestEmailOtp(mobileOrEmail);
export const verifySmsOtp = (mobileOrEmail: string, code: string, fullName?: string, gmail?: string) =>
  verifyEmailOtp(gmail || mobileOrEmail, code, fullName, mobileOrEmail);
