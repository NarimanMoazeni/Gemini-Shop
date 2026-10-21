/**
 * سرویس ذخیره‌سازی و مدیریت سفارشات فروشگاه.
 * همگام‌سازی دوطرفه میان localStorage و پایگاه‌داده پایدار Neon PostgreSQL از طریق API متمرکز
 */

import { API_BASE } from '../config/api';

export interface StoreOrder {
  id: string; // e.g. "GP-742195"
  createdAt: string; // ISO date
  userId?: string; // شناسه کاربر خریدار
  fullName: string;
  mobile: string;
  gmail: string; // ایمیل شخصی جیمیل که اشتراک روش فعال میشه
  productName: string;
  amountToman: number;
  paymentMethod: 'bezanbekart' | 'card_to_card';
  paymentRef: string; // شماره پیگیری یا فیش واریز مشتری
  status: 'pending_verification' | 'approved' | 'rejected';
  activationLink?: string; // لینک فعال‌سازی اختصاصی گوگل
  adminNotes?: string;
  approvedAt?: string;
}

const STORAGE_KEY = 'gemini_pro_orders_v1';

export function getStoredOrders(): StoreOrder[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    console.error('Error reading orders from localStorage', e);
    return [];
  }
}

export function saveStoredOrders(orders: StoreOrder[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
    window.dispatchEvent(new CustomEvent('gemini_orders_updated', { detail: orders }));
  } catch (e) {
    console.error('Error writing orders to localStorage', e);
  }
}

/**
 * واکشی کل سفارشات برای ادمین از دیتابیس پایدار سرور (Neon PostgreSQL)
 */
export async function fetchRemoteOrders(adminToken?: string): Promise<StoreOrder[]> {
  try {
    const token = adminToken || sessionStorage.getItem('gemini_admin_token') || '';
    if (!token) return getStoredOrders();

    const res = await fetch(`${API_BASE}/orders`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        saveStoredOrders(data);
        return data;
      }
    }
  } catch (err) {
    console.warn('Error fetching remote orders:', err);
  }
  return getStoredOrders();
}

/**
 * دریافت سابقه سفارشات و اشتراک‌های مشتری از سرور بر اساس ایمیل، شماره یا شناسه کاربری
 * و ادغام خودکار با کش محلی مرورگر (حل قطعی عدم نمایش اشتراک در موبایل)
 */
export async function fetchCustomerOrdersRemote(params: {
  email?: string;
  mobile?: string;
  userId?: string;
}): Promise<StoreOrder[]> {
  const query = new URLSearchParams();
  if (params.email) query.set('email', params.email.trim().toLowerCase());
  if (params.mobile) query.set('mobile', params.mobile.trim());
  if (params.userId) query.set('userId', params.userId.trim());

  if (!query.toString()) return getStoredOrders();

  try {
    const res = await fetch(`${API_BASE}/orders?${query.toString()}`);
    if (res.ok) {
      const remoteOrders: StoreOrder[] = await res.json();
      if (Array.isArray(remoteOrders)) {
        const local = getStoredOrders();
        const map = new Map<string, StoreOrder>();
        // ابتدا سفارشات محلی را ثبت می‌کنیم
        local.forEach((o) => map.set(o.id.toUpperCase(), o));
        // سفارشات واکشی شده از سرور مرجع اصلی هستند و داده‌های تاییدیه و لینک فعال‌سازی را به روز می‌کنند
        remoteOrders.forEach((o) => map.set(o.id.toUpperCase(), o));

        const merged = Array.from(map.values()).sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        saveStoredOrders(merged);
        return merged;
      }
    }
  } catch (err) {
    console.warn('fetchCustomerOrdersRemote error:', err);
  }

  return getStoredOrders();
}

/**
 * پیگیری زنده سفارش با استعلام بلادرنگ از سرور Neon PostgreSQL
 */
export async function fetchOrderByIdRemote(orderId: string): Promise<StoreOrder | null> {
  const cleanId = orderId.trim().toUpperCase();
  const localFound = getOrderById(cleanId);

  try {
    const res = await fetch(`${API_BASE}/orders?orderId=${encodeURIComponent(cleanId)}`);
    if (res.ok) {
      const remoteOrder: StoreOrder = await res.json();
      if (remoteOrder && remoteOrder.id) {
        const local = getStoredOrders();
        const map = new Map<string, StoreOrder>();
        local.forEach((o) => map.set(o.id.toUpperCase(), o));
        map.set(remoteOrder.id.toUpperCase(), remoteOrder);
        const merged = Array.from(map.values()).sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        saveStoredOrders(merged);
        return remoteOrder;
      }
    }
  } catch (err) {
    console.warn('fetchOrderByIdRemote error:', err);
  }

  return localFound || null;
}

export function createStoreOrder(data: {
  fullName: string;
  mobile: string;
  gmail: string;
  productName: string;
  amountToman: number;
  paymentMethod: 'bezanbekart' | 'card_to_card';
  paymentRef: string;
  userId?: string;
}): StoreOrder {
  // ساخت کد رهگیری ۶ رقمی رندوم
  const randomNum = Math.floor(100000 + Math.random() * 900000);
  const id = `GP-${randomNum}`;

  const newOrder: StoreOrder = {
    id,
    userId: data.userId,
    createdAt: new Date().toISOString(),
    fullName: data.fullName.trim(),
    mobile: data.mobile.trim(),
    gmail: data.gmail.trim().toLowerCase(),
    productName: data.productName,
    amountToman: data.amountToman,
    paymentMethod: data.paymentMethod,
    paymentRef: data.paymentRef.trim(),
    status: 'pending_verification',
  };

  const existing = getStoredOrders();
  saveStoredOrders([newOrder, ...existing.filter((o) => o.id !== newOrder.id)]);

  // ثبت آنی در سرور و دیتابیس Neon
  try {
    fetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newOrder),
    }).catch((e) => console.warn('Background order post notice:', e.message));
  } catch {}

  return newOrder;
}

export function getOrderById(id: string): StoreOrder | undefined {
  const cleanId = id.trim().toUpperCase();
  const orders = getStoredOrders();
  return orders.find((o) => o.id.toUpperCase() === cleanId);
}

export function findOrders(query: string): StoreOrder[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const orders = getStoredOrders();
  return orders.filter(
    (o) =>
      o.id.toLowerCase().includes(q) ||
      o.mobile.replace(/\s+/g, '').includes(q) ||
      o.gmail.toLowerCase().includes(q)
  );
}

export function approveOrder(
  orderId: string,
  customLink?: string,
  adminNotes?: string
): StoreOrder | null {
  const orders = getStoredOrders();
  const idx = orders.findIndex((o) => o.id.toUpperCase() === orderId.trim().toUpperCase());
  if (idx === -1) return null;

  const defaultLink = `https://one.google.com/promo/google-ai-pro-invite?order=${orders[idx].id}&account=${encodeURIComponent(orders[idx].gmail)}`;

  const updated: StoreOrder = {
    ...orders[idx],
    status: 'approved',
    activationLink: customLink?.trim() || defaultLink,
    adminNotes: adminNotes || 'واریز بررسی و تأیید گردید.',
    approvedAt: new Date().toISOString(),
  };

  orders[idx] = updated;
  saveStoredOrders(orders);
  return updated;
}

export async function approveOrderRemote(
  orderId: string,
  customLink?: string,
  adminNotes?: string,
  adminToken?: string
): Promise<StoreOrder | null> {
  const updated = approveOrder(orderId, customLink, adminNotes);
  const token = adminToken || sessionStorage.getItem('gemini_admin_token') || '';
  if (token && updated) {
    try {
      await fetch(`${API_BASE}/orders/${orderId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status: 'approved',
          activationLink: updated.activationLink,
          adminNotes: updated.adminNotes,
        }),
      });
    } catch (e) {
      console.warn('Approve order remote notice:', e);
    }
  }
  return updated;
}

export function rejectOrder(orderId: string, adminNotes?: string): StoreOrder | null {
  const orders = getStoredOrders();
  const idx = orders.findIndex((o) => o.id.toUpperCase() === orderId.trim().toUpperCase());
  if (idx === -1) return null;

  const updated: StoreOrder = {
    ...orders[idx],
    status: 'rejected',
    adminNotes: adminNotes || 'فیش واریزی معتبر نبود یا مبلغ همخوانی نداشت.',
  };

  orders[idx] = updated;
  saveStoredOrders(orders);
  return updated;
}

export async function rejectOrderRemote(
  orderId: string,
  adminNotes?: string,
  adminToken?: string
): Promise<StoreOrder | null> {
  const updated = rejectOrder(orderId, adminNotes);
  const token = adminToken || sessionStorage.getItem('gemini_admin_token') || '';
  if (token && updated) {
    try {
      await fetch(`${API_BASE}/orders/${orderId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status: 'rejected',
          adminNotes: updated.adminNotes,
        }),
      });
    } catch (e) {
      console.warn('Reject order remote notice:', e);
    }
  }
  return updated;
}

export function deleteOrder(orderId: string): boolean {
  const orders = getStoredOrders();
  const filtered = orders.filter((o) => o.id.toUpperCase() !== orderId.trim().toUpperCase());
  if (filtered.length === orders.length) return false;
  saveStoredOrders(filtered);
  return true;
}

export async function deleteOrderRemote(orderId: string, adminToken?: string): Promise<boolean> {
  const ok = deleteOrder(orderId);
  const token = adminToken || sessionStorage.getItem('gemini_admin_token') || '';
  if (token) {
    try {
      await fetch(`${API_BASE}/orders/${orderId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (e) {
      console.warn('Delete order remote notice:', e);
    }
  }
  return ok;
}

