const faDigits = '۰۱۲۳۴۵۶۷۸۹';

/** تبدیل ارقام انگلیسی به فارسی */
export const toFaDigits = (value: string | number): string =>
  String(value).replace(/\d/g, (d) => faDigits[Number(d)]);

/** 599000 -> ۵۹۹,۰۰۰ */
export const formatToman = (amount: number): string =>
  toFaDigits(amount.toLocaleString('en-US'));
