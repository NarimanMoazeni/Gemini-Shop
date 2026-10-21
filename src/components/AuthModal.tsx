import { useState, useRef, useEffect } from 'react';
import { Icon } from './Icon';
import { sanitizeEmail, sanitizeInput } from '../lib/sanitize';
import {
  requestEmailOtp,
  verifyEmailOtp,
  loginWithPassword,
  checkUsernameExists,
  type UserProfile
} from '../services/authService';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import './AuthModal.css';

interface Props {
  open: boolean;
  initialMode?: 'login' | 'register';
  onClose: () => void;
  onSuccess: (user: UserProfile) => void;
}

export function AuthModal({ open, initialMode = 'register', onClose, onSuccess }: Props) {
  useBodyScrollLock(open);
  const [authMode, setAuthMode] = useState<'register' | 'login'>(initialMode);
  const [step, setStep] = useState<1 | 2>(1); // Step 1: Form, Step 2: OTP (only for register)

  // فیلدهای ثبت‌نام (۴ فیلد: نام و نام خانوادگی، نام کاربری، ایمیل، رمز عبور)
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [gmail, setGmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);

  // فیلدهای ورود (نام کاربری یا ایمیل + رمز عبور)
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // فیلد کد تایید یکبارمصرف ایمیلی (فقط برای ثبت‌نام)
  const [otpCode, setOtpCode] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alreadyExists, setAlreadyExists] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [usernameTaken, setUsernameTaken] = useState(false);
  const [simulationCode, setSimulationCode] = useState<string | null>(null);

  // تایمر ۶۰ ثانیه‌ای ارسال مجدد کد ثبت‌نام
  const [timer, setTimer] = useState(60);
  const timerRef = useRef<number | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const otpInputRef = useRef<HTMLInputElement>(null);

  // ریست و مقداردهی اولیه به محض باز شدن مدال
  useEffect(() => {
    if (open) {
      setAuthMode(initialMode);
      setError(null);
      setAlreadyExists(false);
      setNotFound(false);
      setUsernameTaken(false);
      setSimulationCode(null);
      setStep(1);
      setOtpCode('');
      setTimeout(() => inputRef.current?.focus(), 120);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [open, initialMode]);

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

  // ورود سریع با نام کاربری یا ایمیل و پسورد (بدون نیاز به OTP)
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotFound(false);

    const cleanIdentifier = loginIdentifier.trim();
    if (!cleanIdentifier) {
      setError('لطفاً نام کاربری یا ایمیل خود را وارد نمایید.');
      return;
    }

    if (!loginPassword) {
      setError('لطفاً رمز عبور خود را وارد نمایید.');
      return;
    }

    setLoading(true);
    const result = await loginWithPassword(cleanIdentifier, loginPassword);
    setLoading(false);

    if (result.success && result.user) {
      onSuccess(result.user);
      onClose();
    } else {
      setError(result.error || 'اطلاعات ورود نادرست است.');
      if (result.notFound) {
        setNotFound(true);
      }
    }
  };

  // ارسال کد تأیید ایمیلی برای ثبت‌نام (مرحله ۱ ثبت‌نام)
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setAlreadyExists(false);
    setUsernameTaken(false);

    // ۱. اعتبارسنجی نام و نام خانوادگی
    if (fullName.trim().length < 3) {
      setError('لطفاً نام و نام خانوادگی خود را کامل وارد فرمایید (حداقل ۳ حرف).');
      return;
    }

    // ۲. اعتبارسنجی نام کاربری
    const cleanUsername = username.trim().toLowerCase();
    if (cleanUsername.length < 3) {
      setError('نام کاربری باید حداقل ۳ کاراکتر و به حروف انگلیسی یا عدد باشد.');
      return;
    }
    if (!/^[a-z0-9_.-]+$/.test(cleanUsername)) {
      setError('نام کاربری فقط می‌تواند شامل حروف کوچک انگلیسی، اعداد، نقطه و خط تیره باشد.');
      return;
    }

    // ۳. اعتبارسنجی ایمیل
    const cleanGmail = sanitizeEmail(gmail);
    if (!cleanGmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanGmail)) {
      setError('لطفاً یک آدرس ایمیل معتبر (مانند user@domain.com) وارد فرمایید.');
      return;
    }

    // ۴. اعتبارسنجی رمز عبور
    if (registerPassword.length < 6) {
      setError('رمز عبور انتخابی باید حداقل ۶ کاراکتر باشد.');
      return;
    }

    // بررسی آنلاین در دسترس بودن نام کاربری
    setLoading(true);
    const userCheck = await checkUsernameExists(cleanUsername);
    if (!userCheck.available) {
      setLoading(false);
      setError('این نام کاربری قبلاً توسط کاربر دیگری انتخاب شده است. لطفاً نام دیگری برگزینید.');
      setUsernameTaken(true);
      return;
    }

    // درخواست کد تأیید ایمیلی
    const result = await requestEmailOtp(cleanGmail, fullName.trim(), '', 'register', cleanUsername, registerPassword);
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
      if (result.usernameTaken) setUsernameTaken(true);
    }
  };

  // تأیید نهایی کد OTP و تکمیل ثبت‌نام (مرحله ۲ ثبت‌نام)
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanCode = otpCode.trim().replace(/\D/g, '');
    if (cleanCode.length < 4) {
      setError('لطفاً کد تایید ۵ رقمی ارسال‌شده به ایمیل را به طور کامل وارد فرمایید.');
      return;
    }

    setLoading(true);
    const cleanGmail = sanitizeEmail(gmail);
    const cleanUsername = username.trim().toLowerCase();
    const result = await verifyEmailOtp(
      cleanGmail,
      cleanCode,
      fullName.trim(),
      '',
      'register',
      cleanUsername,
      registerPassword
    );
    setLoading(false);

    if (result.success && result.user) {
      onSuccess(result.user);
      onClose();
    } else {
      setError(result.error || 'کد تایید وارد شده نادرست است.');
      if (result.alreadyExists) setAlreadyExists(true);
    }
  };

  // ارسال مجدد کد ثبت‌نام
  const handleResendOtp = async () => {
    if (timer > 0 || loading) return;
    setError(null);
    setLoading(true);

    const cleanGmail = sanitizeEmail(gmail);
    const cleanUsername = username.trim().toLowerCase();
    const result = await requestEmailOtp(cleanGmail, fullName.trim(), '', 'register', cleanUsername, registerPassword);
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
            <Icon name={step === 1 ? (authMode === 'register' ? 'sparkle' : 'user') : 'shield'} size={24} />
          </div>

          {step === 1 ? (
            <>
              {/* تب‌های جابه‌جایی میان ورود و ثبت‌نام */}
              <div className="auth-card__tabs">
                <button
                  type="button"
                  className={`auth-card__tab ${authMode === 'register' ? 'is-active' : ''}`}
                  onClick={() => {
                    setAuthMode('register');
                    setError(null);
                    setAlreadyExists(false);
                    setNotFound(false);
                    setUsernameTaken(false);
                  }}
                >
                  <Icon name="sparkle" size={15} />
                  <span>ثبت‌نام جدید</span>
                </button>
                <button
                  type="button"
                  className={`auth-card__tab ${authMode === 'login' ? 'is-active' : ''}`}
                  onClick={() => {
                    setAuthMode('login');
                    setError(null);
                    setAlreadyExists(false);
                    setNotFound(false);
                    setUsernameTaken(false);
                  }}
                >
                  <Icon name="user" size={15} />
                  <span>ورود به حساب</span>
                </button>
              </div>

              <p className="auth-card__subtitle">
                {authMode === 'register'
                  ? 'جهت ثبت سفارش و دریافت لایسنس، اطلاعات حساب خود را وارد فرمایید.'
                  : 'برای دسترسی به سوابق و لایسنس‌ها، نام کاربری و رمز عبور خود را وارد نمایید.'}
              </p>
            </>
          ) : (
            <>
              <h2>تأیید ایمیل و ساخت حساب</h2>
              <p className="auth-card__subtitle">
                کد ۵ رقمی ارسال‌شده به <span className="en font-bold text-blue-600">{gmail}</span> را وارد فرمایید:
              </p>
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
                  setLoginIdentifier(gmail);
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
                <span>ایجاد حساب جدید (ثبت‌نام)</span>
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
          authMode === 'register' ? (
            /* فرم ثبت‌نام با ۴ فیلد: نام و نام خانوادگی، نام کاربری، ایمیل، رمز عبور */
            <form onSubmit={handleRegisterSubmit} className="auth-card__form" noValidate>
              <div className="auth-card__field">
                <label htmlFor="reg-fullname">نام و نام خانوادگی:</label>
                <div className="auth-input-wrapper">
                  <input
                    ref={inputRef}
                    id="reg-fullname"
                    name="store_user_fullname"
                    type="text"
                    autoComplete="name"
                    placeholder="مثال: علی محمدی"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="auth-card__field">
                <label htmlFor="reg-username">نام کاربری در فروشگاه (Username):</label>
                <div className={`auth-input-wrapper ${usernameTaken ? 'auth-input-wrapper--error' : ''}`}>
                  <input
                    id="reg-username"
                    name="store_user_username"
                    type="text"
                    autoComplete="username"
                    placeholder="مثال: ali_mohammadi"
                    dir="ltr"
                    className="en"
                    value={username}
                    onChange={(e) => {
                      setUsername(sanitizeInput(e.target.value).toLowerCase());
                      if (usernameTaken) setUsernameTaken(false);
                    }}
                    required
                  />
                </div>
                {usernameTaken ? (
                  <small className="auth-card__hint" style={{ color: '#dc2626', fontWeight: 600 }}>
                    این نام کاربری قبلاً رزرو شده است. لطفاً نام دیگری انتخاب فرمایید.
                  </small>
                ) : (
                  <small className="auth-card__hint">
                    شامل حروف انگلیسی و اعداد (جهت ورود به پنل کاربری در مراجعات بعدی)
                  </small>
                )}
              </div>

              <div className="auth-card__field">
                <label htmlFor="reg-email">ایمیل شخصی (جهت ارسال کد تأیید، لایسنس و فاکتور):</label>
                <div className="auth-input-wrapper">
                  <input
                    id="reg-email"
                    name="store_user_email"
                    type="email"
                    autoComplete="email"
                    placeholder="user@example.com"
                    dir="ltr"
                    className="en"
                    value={gmail}
                    onChange={(e) => setGmail(e.target.value)}
                    required
                  />
                </div>
                <small className="auth-card__hint">
                  کد تأیید یکبارمصرف و مشخصات فعال‌سازی به این آدرس ارسال خواهد شد
                </small>
              </div>

              <div className="auth-card__field">
                <label htmlFor="reg-password">رمز عبور اختصاصی برای حساب فروشگاه:</label>
                <div className="auth-input-wrapper auth-input-wrapper--password">
                  <input
                    id="reg-password"
                    name="store_user_new_password"
                    type={showRegisterPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="حداقل ۶ کاراکتر (رمز عبور دلخواه)"
                    dir="ltr"
                    className="en"
                    value={registerPassword}
                    onChange={(e) => setRegisterPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="auth-password-toggle"
                    onClick={() => setShowRegisterPassword((v) => !v)}
                    title={showRegisterPassword ? 'مخفی کردن رمز' : 'نمایش رمز'}
                  >
                    <Icon name={showRegisterPassword ? 'eyeOff' : 'eye'} size={18} />
                  </button>
                </div>
                <small className="auth-card__hint">
                  🔒 این رمز عبور، صرفاً پسورد اختصاصی حساب شما در این وب‌سایت است؛ هرگز رمز ایمیل شخصی خود را وارد نکنید.
                </small>
              </div>

              <div className="auth-card__security-badge">
                <Icon name="shield" size={16} />
                <span>
                  <strong>تضمین امنیت و حریم خصوصی:</strong> برای فعال‌سازی لایسنس، هرگز نیازی به وارد کردن رمز جیمیل یا حساب گوگل شخصی نیست و این وب‌سایت هیچ‌گاه پسورد ایمیل شما را درخواست نمی‌کند.
                </span>
              </div>

              <div className="auth-card__actions">
                <button
                  type="submit"
                  className="btn btn--accent auth-card__submit-btn"
                  disabled={loading}
                >
                  <span>{loading ? 'در حال ارسال کد تأیید...' : 'ثبت‌نام و دریافت کد تأیید ایمیل'}</span>
                  <Icon name="arrow" size={16} />
                </button>
              </div>

              <div className="auth-card__footer-switch">
                <span>قبلاً ثبت‌نام کرده‌اید؟</span>
                <button
                  type="button"
                  className="auth-card__switch-link"
                  onClick={() => {
                    setAuthMode('login');
                    setError(null);
                  }}
                >
                  ورود به حساب
                </button>
              </div>
            </form>
          ) : (
            /* فرم ورود با نام کاربری یا ایمیل و رمز عبور (بدون نیاز به OTP) */
            <form onSubmit={handleLoginSubmit} className="auth-card__form" noValidate>
              <div className="auth-card__field">
                <label htmlFor="login-identifier">نام کاربری یا آدرس ایمیل ثبت‌شده در سایت:</label>
                <div className="auth-input-wrapper">
                  <input
                    ref={inputRef}
                    id="login-identifier"
                    name="store_login_username"
                    type="text"
                    autoComplete="username"
                    placeholder="نام کاربری یا ایمیل شما"
                    dir="ltr"
                    className="en"
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="auth-card__field">
                <label htmlFor="login-pwd">رمز عبور حساب کاربری در فروشگاه:</label>
                <div className="auth-input-wrapper auth-input-wrapper--password">
                  <input
                    id="login-pwd"
                    name="store_login_password"
                    type={showLoginPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="رمز عبور تعیین‌شده در سایت"
                    dir="ltr"
                    className="en"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="auth-password-toggle"
                    onClick={() => setShowLoginPassword((v) => !v)}
                    title={showLoginPassword ? 'مخفی کردن رمز' : 'نمایش رمز'}
                  >
                    <Icon name={showLoginPassword ? 'eyeOff' : 'eye'} size={18} />
                  </button>
                </div>
              </div>

              <div className="auth-card__security-badge">
                <Icon name="shield" size={16} />
                <span>
                  <strong>حریم خصوصی:</strong> رمز عبور شما فقط جهت ورود به پنل کاربری همین سایت و مشاهده سوابق خرید و لایسنس است.
                </span>
              </div>

              <div className="auth-card__actions">
                <button
                  type="submit"
                  className="btn btn--accent auth-card__submit-btn"
                  disabled={loading}
                >
                  <span>{loading ? 'در حال بررسی...' : 'ورود به حساب کاربری'}</span>
                  <Icon name="arrow" size={16} />
                </button>
              </div>

              <div className="auth-card__footer-switch">
                <span>حساب کاربری ندارید؟</span>
                <button
                  type="button"
                  className="auth-card__switch-link font-semibold text-blue-600"
                  onClick={() => {
                    setAuthMode('register');
                    setError(null);
                  }}
                >
                  ثبت‌نام جدید و دریافت اشتراک
                </button>
              </div>
            </form>
          )
        ) : (
          /* مرحله ۲: تایید کد OTP ایمیل خریدار */
          <form onSubmit={handleVerifyOtp} className="auth-card__form">
            <div className="auth-card__field">
              <label>کد تأیید ۵ رقمی ایمیل:</label>
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
                  ارسال مجدد کد ایمیلی
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
                <span>{loading ? 'در حال ایجاد حساب...' : 'تأیید کد و تکمیل ثبت‌نام'}</span>
                <Icon name="check" size={16} />
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
