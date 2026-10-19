import { useState, useRef, useEffect } from 'react';
import { Icon } from './Icon';
import { sanitizeEmail, sanitizeMobile, isValidIranianMobile } from '../lib/sanitize';
import { requestEmailOtp, verifyEmailOtp, type UserProfile } from '../services/authService';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import './AuthModal.css';

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: (user: UserProfile) => void;
}

export function AuthModal({ open, onClose, onSuccess }: Props) {
  useBodyScrollLock(open);
  const [authMode, setAuthMode] = useState<'register' | 'login'>('register');
  const [step, setStep] = useState<1 | 2>(1);
  const [fullName, setFullName] = useState('');
  const [gmail, setGmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [otpCode, setOtpCode] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alreadyExists, setAlreadyExists] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [simulationCode, setSimulationCode] = useState<string | null>(null);

  // تایمر ۶۰ ثانیه‌ای ارسال مجدد کد
  const [timer, setTimer] = useState(60);
  const timerRef = useRef<number | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const otpInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setAlreadyExists(false);
      setNotFound(false);
      setSimulationCode(null);
      setStep(1);
      setOtpCode('');
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [open]);

  // مدیریت شمارش معکوس تایمر
  useEffect(() => {
    if (step === 2 && timer > 0) {
      timerRef.current = window.setInterval(() => {
        setTimer((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    } else if (timer === 0 && timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [step, timer]);

  if (!open) return null;

  // مرحله ۱: ارسال کد تایید به جیمیل خریدار با بررسی یکتا بودن اکانت
  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setAlreadyExists(false);
    setNotFound(false);

    if (authMode === 'register' && fullName.trim().length < 3) {
      setError('لطفاً نام و نام خانوادگی خود را کامل وارد فرمایید.');
      return;
    }

    const cleanGmail = sanitizeEmail(gmail);
    if (!cleanGmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanGmail)) {
      setError('لطفاً یک آدرس ایمیل معتبر (مانند yourname@gmail.com) وارد فرمایید.');
      return;
    }

    if (authMode === 'register' && mobile.trim() && !isValidIranianMobile(mobile)) {
      setError('شماره موبایل وارد شده باید ۱۱ رقم و با ۰۹ شروع شود.');
      return;
    }

    setLoading(true);
    const cleanMobile = sanitizeMobile(mobile);
    const result = await requestEmailOtp(cleanGmail, fullName, cleanMobile, authMode);
    setLoading(false);

    if (result.success) {
      setStep(2);
      setTimer(result.cooldownSeconds || 60);
      if (result.simulationCode) {
        setSimulationCode(result.simulationCode);
      }
      setTimeout(() => otpInputRef.current?.focus(), 100);
    } else {
      setError(result.error || 'خطا در ارسال کد تایید ایمیلی.');
      if (result.alreadyExists) setAlreadyExists(true);
      if (result.notFound) setNotFound(true);
    }
  };

  // مرحله ۲: بررسی کد و ورود قطعی
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setAlreadyExists(false);

    const cleanCode = otpCode.trim().replace(/\D/g, '');
    if (cleanCode.length < 4) {
      setError('لطفاً کد تایید ۵ رقمی ارسال‌شده را به طور کامل وارد فرمایید.');
      return;
    }

    setLoading(true);
    const cleanGmail = sanitizeEmail(gmail);
    const cleanMobile = sanitizeMobile(mobile);
    const result = await verifyEmailOtp(cleanGmail, cleanCode, fullName, cleanMobile, authMode);
    setLoading(false);

    if (result.success && result.user) {
      onSuccess(result.user);
      onClose();
    } else {
      setError(result.error || 'کد تایید وارد شده نادرست است.');
      if (result.alreadyExists) setAlreadyExists(true);
    }
  };

  // ارسال مجدد کد ایمیلی
  const handleResendOtp = async () => {
    if (timer > 0 || loading) return;
    setError(null);
    setLoading(true);

    const cleanGmail = sanitizeEmail(gmail);
    const cleanMobile = sanitizeMobile(mobile);
    const result = await requestEmailOtp(cleanGmail, fullName, cleanMobile, authMode);
    setLoading(false);

    if (result.success) {
      setTimer(result.cooldownSeconds || 60);
      if (result.simulationCode) {
        setSimulationCode(result.simulationCode);
      }
    } else {
      setError(result.error || 'خطا در ارسال مجدد کد تایید.');
    }
  };

  return (
    <div className="auth-overlay" dir="rtl" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="auth-card" role="dialog" aria-modal="true">
        <div className="auth-card__header">
          <div className="auth-card__icon-wrap">
            <Icon name={step === 1 ? (authMode === 'register' ? 'user' : 'shield') : 'shield'} size={24} />
          </div>

          {step === 1 ? (
            <>
              {/* تب‌های انتخاب میان ایجاد حساب جدید یا ورود */}
              <div className="auth-card__tabs">
                <button
                  type="button"
                  className={`auth-card__tab ${authMode === 'register' ? 'is-active' : ''}`}
                  onClick={() => {
                    setAuthMode('register');
                    setError(null);
                    setAlreadyExists(false);
                    setNotFound(false);
                  }}
                >
                  ایجاد حساب جدید
                </button>
                <button
                  type="button"
                  className={`auth-card__tab ${authMode === 'login' ? 'is-active' : ''}`}
                  onClick={() => {
                    setAuthMode('login');
                    setError(null);
                    setAlreadyExists(false);
                    setNotFound(false);
                  }}
                >
                  ورود به حساب
                </button>
              </div>

              <p>
                {authMode === 'register'
                  ? 'هر کاربر تنها مجاز به ساخت یک حساب با هر آدرس جیمیل می‌باشد.'
                  : 'اگر قبلاً حسابی ساخته‌اید، آدرس جیمیل خود را جهت دریافت کد ورود وارد کنید.'}
              </p>
            </>
          ) : (
            <>
              <h2>تأیید آدرس ایمیل</h2>
              <p>کد تایید ۵ رقمی ارسال‌شده به <span className="en font-bold text-blue-600">{gmail}</span> را وارد فرمایید:</p>
            </>
          )}

          <button className="auth-card__close" onClick={onClose} aria-label="بستن">
            <Icon name="close" size={18} />
          </button>
        </div>

        {error && (
          <div className="auth-card__error-box">
            <div className="auth-card__error">{error}</div>
            {alreadyExists && (
              <button
                type="button"
                className="btn btn--outline auth-card__quick-switch-btn"
                onClick={() => {
                  setAuthMode('login');
                  setError(null);
                  setAlreadyExists(false);
                  setStep(1);
                }}
              >
                <span>ورود به حساب با این ایمیل</span>
                <Icon name="arrow" size={14} />
              </button>
            )}
            {notFound && (
              <button
                type="button"
                className="btn btn--outline auth-card__quick-switch-btn"
                onClick={() => {
                  setAuthMode('register');
                  setError(null);
                  setNotFound(false);
                  setStep(1);
                }}
              >
                <span>ثبت‌نام و ایجاد حساب جدید</span>
                <Icon name="arrow" size={14} />
              </button>
            )}
          </div>
        )}

        {simulationCode && (
          <div className="auth-card__sim-code">
            <span>کد تستی شبیه‌ساز (دمو): </span>
            <b className="en">{simulationCode}</b>
            <button
              type="button"
              className="btn-fill-sim"
              onClick={() => setOtpCode(simulationCode)}
            >
              درج خودکار
            </button>
          </div>
        )}

        {step === 1 ? (
          <form onSubmit={handleRequestOtp} className="auth-card__form">
            {authMode === 'register' && (
              <div className="auth-card__field">
                <label>نام و نام خانوادگی:</label>
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="مثال: علی محمدی"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>
            )}

            <div className="auth-card__field">
              <label>
                {authMode === 'register'
                  ? 'آدرس ایمیل / جیمیل شخصی (جهت دریافت کد تأیید):'
                  : 'آدرس ایمیل / جیمیل ثبت‌شده:'}
              </label>
              <input
                ref={authMode === 'login' ? inputRef : undefined}
                type="email"
                placeholder="name@gmail.com"
                dir="ltr"
                value={gmail}
                onChange={(e) => setGmail(e.target.value)}
                required
              />
              <small className="auth-card__hint">
                کد تأیید ورود و فعال‌سازی برای شما به این آدرس جیمیل ارسال خواهد شد
              </small>
            </div>

            {authMode === 'register' && (
              <div className="auth-card__field">
                <label>شماره تماس همراه (جهت هماهنگی و پشتیبانی):</label>
                <input
                  type="tel"
                  placeholder="۰۹۱۲۳۴۵۶۷۸۹"
                  dir="ltr"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  required
                />
              </div>
            )}

            <div className="auth-card__actions">
              <button
                type="submit"
                className="btn btn--accent auth-card__submit-btn"
                disabled={loading}
              >
                <span>
                  {loading
                    ? 'در حال ارسال ایمیل...'
                    : authMode === 'register'
                    ? 'دریافت کد تایید و ساخت حساب'
                    : 'ارسال کد تایید ورود'}
                </span>
                <Icon name="arrow" size={16} />
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="auth-card__form">
            <div className="auth-card__field">
              <label>کد تایید ۵ رقمی:</label>
              <input
                ref={otpInputRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="• • • • •"
                dir="ltr"
                className="auth-card__otp-input en"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                required
              />
            </div>

            <div className="auth-card__timer-row">
              {timer > 0 ? (
                <span className="auth-card__countdown">
                  ارسال مجدد کد پس از: <b>{Math.floor(timer / 60)}:{(timer % 60).toString().padStart(2, '0')}</b>
                </span>
              ) : (
                <button
                  type="button"
                  className="auth-card__resend-btn"
                  onClick={handleResendOtp}
                  disabled={loading}
                >
                  ارسال مجدد ایمیل کد
                </button>
              )}
              <button
                type="button"
                className="auth-card__edit-btn"
                onClick={() => {
                  setStep(1);
                  setOtpCode('');
                }}
              >
                ویرایش مشخصات
              </button>
            </div>

            <div className="auth-card__actions">
              <button
                type="submit"
                className="btn btn--accent auth-card__submit-btn"
                disabled={loading}
              >
                <span>
                  {loading
                    ? 'در حال بررسی کد...'
                    : authMode === 'register'
                    ? 'تایید کد و ساخت حساب'
                    : 'تایید و ورود به حساب'}
                </span>
                <Icon name="check" size={16} />
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
