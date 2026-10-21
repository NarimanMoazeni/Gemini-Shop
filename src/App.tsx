import { useCallback, useEffect, useState } from 'react';
import { AdminPanel } from './components/AdminPanel';
import { AuthModal } from './components/AuthModal';
import { CheckoutModal } from './components/CheckoutModal';
import { Faq } from './components/Faq';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { Hero } from './components/Hero';
import { OrderTrackingModal } from './components/OrderTrackingModal';
import { Activation, Benefits, CtaBand, Pricing, Trust, UseCases } from './components/Sections';
import { StarScene } from './components/StarScene';
import { SupportChatWidget } from './components/SupportChatWidget';
import { UserProfileModal } from './components/UserProfileModal';
import { WaveDivider } from './components/WaveDivider';
import { useProduct } from './hooks/useProduct';
import { getCurrentUser, type UserProfile } from './services/authService';

export default function App() {
  const product = useProduct(); // قیمت و اطلاعات محصول فقط از لایه‌ی سرویس/config
  const [checkout, setCheckout] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState<1 | 2>(1);
  const [isReturnFromGateway, setIsReturnFromGateway] = useState(false);
  const [trackingOpen, setTrackingOpen] = useState(false);
  const [trackOrderId, setTrackOrderId] = useState<string | undefined>(undefined);
  const [adminOpen, setAdminOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      const p = window.location.pathname.toLowerCase();
      const h = window.location.hash.toLowerCase();
      const s = new URLSearchParams(window.location.search);
      return (
        p === '/admin' ||
        p === '/admin/' ||
        h === '#admin' ||
        h === '#admin-portal' ||
        s.get('portal') === 'admin' ||
        s.get('admin') === '1'
      );
    }
    return false;
  });

  // وضعیت احراز هویت و پروفایل مشتری
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => getCurrentUser());
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('register');
  const [pendingCheckoutAfterAuth, setPendingCheckoutAfterAuth] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  // گوش دادن به تغییرات وضعیت لاگین/پروفایل
  useEffect(() => {
    const handleAuth = () => {
      setCurrentUser(getCurrentUser());
    };
    window.addEventListener('gemini_auth_changed', handleAuth);
    return () => window.removeEventListener('gemini_auth_changed', handleAuth);
  }, []);

  // باز کردن اختصاصی پنل ادمین از طریق آدرس /admin، هش URL، پارامتر پورتال یا کلید میانبر کیبورد (Ctrl + Shift + A)
  useEffect(() => {
    const checkAdminTrigger = () => {
      const path = window.location.pathname.toLowerCase();
      const hash = window.location.hash.toLowerCase();
      const params = new URLSearchParams(window.location.search);

      // تشخیص بازگشت از درگاه پرداخت بزن به کارت و ادامه خرید در مرحله ۲
      if (
        params.get('payment') === 'success' ||
        params.get('return_gateway') === '1' ||
        params.get('status') === 'success' ||
        hash === '#payment-success'
      ) {
        setCheckoutStep(2);
        setIsReturnFromGateway(true);
        setCheckout(true);
      }

      const shouldOpenAdmin = (
        path === '/admin' ||
        path === '/admin/' ||
        hash === '#admin-portal' ||
        hash === '#admin' ||
        params.get('portal') === 'admin' ||
        params.get('admin') === '1'
      );

      if (shouldOpenAdmin) {
        setAdminOpen(true);
        document.title = 'Gemini Shop | پنل اختصاصی مدیریت و مانیتورینگ';
      } else if (path !== '/admin' && path !== '/admin/') {
        setAdminOpen(false);
      }

      if (
        hash === '#profile' ||
        hash === '#user-profile' ||
        params.get('portal') === 'profile'
      ) {
        setProfileOpen(true);
      }
    };

    checkAdminTrigger();
    window.addEventListener('hashchange', checkAdminTrigger);
    window.addEventListener('popstate', checkAdminTrigger);

    // کلید میانبر امن برای مدیران سایت: Ctrl + Shift + A یا Cmd + Shift + A
    const handleAdminKeydown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'a' || e.key === 'A' || e.key === 'ش')) {
        e.preventDefault();
        setAdminOpen((prev) => {
          const next = !prev;
          if (next) {
            if (window.location.pathname.toLowerCase() !== '/admin') {
              window.history.pushState({ portal: 'admin' }, '', '/admin');
            }
            document.title = 'Gemini Shop | پنل اختصاصی مدیریت و مانیتورینگ';
          } else {
            if (window.location.pathname.toLowerCase() === '/admin' || window.location.pathname.toLowerCase() === '/admin/') {
              window.history.pushState(null, '', '/');
            }
            document.title = 'Google AI Pro | اکانت رسمی جمینای پرو (Gemini Pro)';
          }
          return next;
        });
      }
    };
    window.addEventListener('keydown', handleAdminKeydown);

    return () => {
      window.removeEventListener('hashchange', checkAdminTrigger);
      window.removeEventListener('popstate', checkAdminTrigger);
      window.removeEventListener('keydown', handleAdminKeydown);
    };
  }, []);

  const closeCheckout = useCallback(() => setCheckout(false), []);

  // کلیک روی دکمه خرید: در صورت نبود اکانت، ابتدا ثبت‌نام باز می‌شود
  const handleBuy = useCallback(() => {
    const user = getCurrentUser();
    if (!user) {
      setAuthMode('register');
      setPendingCheckoutAfterAuth(true);
      setAuthOpen(true);
    } else {
      setCheckout(true);
    }
  }, []);

  const openTracking = useCallback((orderId?: string) => {
    setTrackOrderId(orderId);
    setTrackingOpen(true);
  }, []);

  const closeTracking = useCallback(() => {
    setTrackingOpen(false);
    setTrackOrderId(undefined);
  }, []);

  const closeAdmin = useCallback(() => {
    setAdminOpen(false);
    if (window.location.pathname.toLowerCase() === '/admin' || window.location.pathname.toLowerCase() === '/admin/') {
      window.history.pushState(null, '', '/');
    }
    const hash = window.location.hash.toLowerCase();
    if (hash === '#admin-portal' || hash === '#admin') {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    const params = new URLSearchParams(window.location.search);
    if (params.get('portal') === 'admin' || params.get('admin') === '1') {
      params.delete('portal');
      params.delete('admin');
      const cleanSearch = params.toString() ? `?${params.toString()}` : '';
      history.replaceState(null, '', window.location.pathname + cleanSearch + window.location.hash);
    }
    document.title = 'Google AI Pro | اکانت رسمی جمینای پرو (Gemini Pro)';
  }, []);

  const openAuth = useCallback((mode: 'login' | 'register' = 'register') => {
    setAuthMode(mode);
    setPendingCheckoutAfterAuth(false);
    setAuthOpen(true);
  }, []);
  const closeAuth = useCallback(() => {
    setAuthOpen(false);
    setPendingCheckoutAfterAuth(false);
  }, []);

  const openProfile = useCallback(() => {
    const latestUser = getCurrentUser();
    if (!latestUser) {
      setAuthMode('login');
      setAuthOpen(true);
    } else {
      setCurrentUser(latestUser);
      setProfileOpen(true);
    }
  }, []);

  const closeProfile = useCallback(() => setProfileOpen(false), []);

  return (
    <>
      <Header
        onBuy={handleBuy}
        onTrackOrder={() => openTracking()}
        onOpenAuth={openAuth}
        onOpenProfile={openProfile}
        currentUser={currentUser}
      />
      <StarScene />
      <main>
        <Hero product={product} onBuy={handleBuy} />
        <Benefits />
        <UseCases />
        <Pricing product={product} onBuy={handleBuy} />
        <Activation />
        <Trust />
        <WaveDivider color="tint" />
        <Faq />
        <CtaBand product={product} onBuy={handleBuy} />
      </main>
      <WaveDivider color="pearl" />
      <Footer />
      <CheckoutModal
        product={product}
        open={checkout}
        initialStep={checkoutStep}
        isReturnFromGateway={isReturnFromGateway}
        onClose={() => {
          closeCheckout();
          setCheckoutStep(1);
          setIsReturnFromGateway(false);
          if (window.location.search.includes('payment=success') || window.location.search.includes('return_gateway=1')) {
            history.replaceState(null, '', window.location.pathname);
          }
        }}
        onTrackOrder={(orderId) => openTracking(orderId)}
        onOpenProfile={openProfile}
      />
      <OrderTrackingModal
        open={trackingOpen}
        onClose={closeTracking}
        initialOrderId={trackOrderId}
      />
      {/* مدال احراز هویت خریداران */}
      <AuthModal
        open={authOpen}
        initialMode={authMode}
        onClose={closeAuth}
        onSuccess={(u) => {
          setCurrentUser(u);
          if (pendingCheckoutAfterAuth) {
            setPendingCheckoutAfterAuth(false);
            setCheckout(true);
          } else {
            setProfileOpen(true);
          }
        }}
      />
      {/* داشبورد و پروفایل مشتری (مشاهده لینک فعال‌سازی رسمی گوگل) */}
      {currentUser && (
        <UserProfileModal
          open={profileOpen}
          user={currentUser}
          onClose={closeProfile}
          onBuy={handleBuy}
        />
      )}
      {/* ویجت شناور پشتیبانی و چت آنلاین */}
      <SupportChatWidget />
      {/* پنل مدیریت پیشرفته ادمین */}
      <AdminPanel open={adminOpen} onClose={closeAdmin} />
    </>
  );
}
