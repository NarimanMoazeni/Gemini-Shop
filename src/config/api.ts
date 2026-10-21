/**
 * پیکربندی متمرکز آدرس Backend API فروشگاه Gemini Shop
 * در محیط لوکال به localhost:3001 متصل می‌شود و در محیط پروداکشن کلادفلر مستقیماً به سرور امن Vercel متصل می‌گردد.
 */

export const API_BASE: string =
  (import.meta as any).env?.VITE_API_BASE ||
  (typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'http://localhost:3001/api'
    : 'https://gemini-shop-backend.vercel.app/api');
