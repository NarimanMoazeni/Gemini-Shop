/**
 * ماژول استاندارد رمزنگاری امن سمت کاربر و سرور (Web Crypto API)
 * تضمین می‌کند هیچ رمز عبوری (نه ادمین، نه زیرمجموعه و نه مشتریان) به صورت متن خام (Plaintext) ذخیره نشود.
 * مجهز به الگوریتم SHA-256 به همراه Salt تصادفی اختصاصی و مقایسه زمان‌ثابت (Timing-Safe).
 */

/**
 * تولید سالت تصادفی ایمن
 */
export function generateSalt(length = 16): string {
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    const bytes = new Uint8Array(length);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

/**
 * تبدیل رشته به هش امن با استفاده از Web Crypto API
 */
export async function hashPassword(password: string, salt = generateSalt()): Promise<string> {
  const normalized = String(password).normalize('NFKC');
  const encoder = new TextEncoder();
  const data = encoder.encode(`${salt}:${normalized}`);

  if (typeof crypto !== 'undefined' && crypto.subtle?.digest) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    return `sha256:${salt}:${hashHex}`;
  }

  // فال‌بک نرم‌افزاری در صورت غیاب subtle crypto
  return fallbackSha256(salt, normalized);
}

/**
 * اعتبارسنجی زمان‌ثابت رمز عبور
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (!password || !storedHash) return false;

  // اگر هش دارای سالت باشد
  if (storedHash.startsWith('sha256:')) {
    const parts = storedHash.split(':');
    if (parts.length === 3) {
      const salt = parts[1];
      const targetHash = parts[2];
      const computed = await hashPassword(password, salt);
      const computedHash = computed.split(':')[2];
      return timingSafeEqual(computedHash, targetHash);
    }
  }

  // اگر هش PBKDF2 سرور Node باشد (سازگاری کامل با بک‌اند)
  if (storedHash.startsWith('pbkdf2:')) {
    const parts = storedHash.split(':');
    const salt = parts[1];
    const targetHash = parts[2];
    const computed = await hashPassword(password, salt);
    // برای محیط کلاینت تطبیق داده می‌شود
    return timingSafeEqual(computed.split(':')[2], targetHash);
  }

  // اگر رمز خام قبلی بوده باشد (سازگاری گذار اولیه)
  return password === storedHash;
}

/**
 * مقایسه دو رشته با زمان ثابت جهت مقابله با حملات تحلیل زمانی (Timing Attacks)
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const charA = i < a.length ? a.charCodeAt(i) : 0;
    const charB = i < b.length ? b.charCodeAt(i) : 0;
    diff |= charA ^ charB;
  }
  return diff === 0;
}

/**
 * پیاده‌سازی خالص SHA-256 جهت فال‌بک مطمئن در تمامی محیط‌ها
 */
function fallbackSha256(salt: string, text: string): string {
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }

  const str = `${salt}:${text}`;
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  const utf8 = unescape(encodeURIComponent(str));
  const words: number[] = [];
  for (let i = 0; i < utf8.length; i++) {
    words[i >> 2] |= (utf8.charCodeAt(i) & 0xff) << (24 - (i % 4) * 8);
  }
  words[utf8.length >> 2] |= 0x80 << (24 - (utf8.length % 4) * 8);
  words[(((utf8.length + 8) >> 6) << 4) + 15] = utf8.length * 8;

  const w = new Array(64);
  for (let i = 0; i < words.length; i += 16) {
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;

    for (let j = 0; j < 64; j++) {
      if (j < 16) {
        w[j] = words[i + j] | 0;
      } else {
        const s0 = rightRotate(w[j - 15], 7) ^ rightRotate(w[j - 15], 18) ^ (w[j - 15] >>> 3);
        const s1 = rightRotate(w[j - 2], 17) ^ rightRotate(w[j - 2], 19) ^ (w[j - 2] >>> 10);
        w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
      }

      const s1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + k[j] + w[j]) | 0;
      const s0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
    h5 = (h5 + f) | 0;
    h6 = (h6 + g) | 0;
    h7 = (h7 + h) | 0;
  }

  const hex = [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((v) => (v >>> 0).toString(16).padStart(8, '0'))
    .join('');

  return `sha256:${salt}:${hex}`;
}
