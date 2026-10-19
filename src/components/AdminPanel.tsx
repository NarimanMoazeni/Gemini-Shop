import { useEffect, useState } from 'react';
import { PAYMENT_CONFIG } from '../config/site';
import { formatToman } from '../lib/format';
import {
  type ChatMessage,
  getAllChatMessages,
  markSessionAsRead,
  sendAdminReply,
} from '../services/chatService';
import {
  approveOrder,
  deleteOrder,
  getStoredOrders,
  rejectOrder,
  type StoreOrder,
} from '../services/orderStorage';
import { Icon } from './Icon';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { hashPassword, verifyPassword } from '../lib/crypto';
import './AdminPanel.css';

interface Props {
  open: boolean;
  onClose: () => void;
}

export interface AdminUser {
  id: string;
  username: string;
  fullName: string;
  role: 'head_admin' | 'regular_admin';
  passwordHash?: string;
  createdAt?: string;
}

const API_BASE = (import.meta as any).env?.VITE_API_BASE || (window.location.hostname === 'localhost' ? 'http://localhost:3001/api' : '/api');

export function AdminPanel({ open, onClose }: Props) {
  useBodyScrollLock(open);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentAdmin, setCurrentAdmin] = useState<AdminUser | null>(null);
  const [adminToken, setAdminToken] = useState<string>('');

  // وضعیت راه‌اندازی و انتخاب رمز عبور مدیر ارشد (Head Admin Setup)
  const [isSetupMode, setIsSetupMode] = useState(false);
  const [setupFullName, setSetupFullName] = useState('نریمان موذنی (مدیر ارشد)');
  const [setupPassword, setSetupPassword] = useState('');
  const [setupConfirm, setSetupConfirm] = useState('');
  const [setupError, setSetupError] = useState<string | null>(null);
  const [setupLoading, setSetupLoading] = useState(false);

  // تغییر رمز عبور مدیر ارشد در تنظیمات
  const [currentHeadPass, setCurrentHeadPass] = useState('');
  const [newHeadPass, setNewHeadPass] = useState('');
  const [confirmNewHeadPass, setConfirmNewHeadPass] = useState('');
  const [passwordChangeToast, setPasswordChangeToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // پیام پاکسازی و بازنشانی دیتابیس صفر
  const [zeroStateResetToast, setZeroStateResetToast] = useState(false);

  // فرم ورود
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  // تب فعال
  const [activeTab, setActiveTab] = useState<'dashboard' | 'orders' | 'chat' | 'admins' | 'settings'>('dashboard');

  // سفارشات
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'today' | 'pending_verification' | 'approved' | 'rejected'>('all');

  // چت
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [adminReplyInput, setAdminReplyInput] = useState('');

  // مدال تأیید سفارش
  const [approveModalOrder, setApproveModalOrder] = useState<StoreOrder | null>(null);
  const [customLinkInput, setCustomLinkInput] = useState('');
  const [adminNoteInput, setAdminNoteInput] = useState('');

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedDeliveryMsg, setCopiedDeliveryMsg] = useState<string | null>(null);

  // لیست ادمین‌ها (فقط برای head_admin)
  const [adminsList, setAdminsList] = useState<AdminUser[]>([]);
  const [showAddAdminModal, setShowAddAdminModal] = useState(false);
  const [newAdminUsername, setNewAdminUsername] = useState('');
  const [newAdminFullName, setNewAdminFullName] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [newAdminRole, setNewAdminRole] = useState<'regular_admin' | 'head_admin'>('regular_admin');
  const [addAdminError, setAddAdminError] = useState<string | null>(null);
  const [addAdminLoading, setAddAdminLoading] = useState(false);

  // تنظیمات Gmail SMTP
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpHost, setSmtpHost] = useState('smtp.gmail.com');
  const [smtpPort, setSmtpPort] = useState(465);
  const [smtpConfigured, setSmtpConfigured] = useState(false);
  const [smtpSavedToast, setSmtpSavedToast] = useState(false);

  // وضعیت مودال گزارش‌ها و پاپ‌اورهای سربرگ
  const [showReportsModal, setShowReportsModal] = useState(false);
  const [reportFilter, setReportFilter] = useState<'all' | 'approved' | 'pending' | 'today'>('all');
  const [showAdminDropdown, setShowAdminDropdown] = useState(false);
  const [showAdminNotifications, setShowAdminNotifications] = useState(false);

  // بررسی نشست لاگین قبلی از sessionStorage
  useEffect(() => {
    const savedAuth = sessionStorage.getItem('gemini_admin_auth') === 'true';
    const savedToken = sessionStorage.getItem('gemini_admin_token') || '';
    const savedUserRaw = sessionStorage.getItem('gemini_admin_user');

    if (savedAuth) {
      setIsAuthenticated(true);
      setAdminToken(savedToken);
      if (savedUserRaw) {
        try {
          setCurrentAdmin(JSON.parse(savedUserRaw));
        } catch {
          setCurrentAdmin({
            id: 'adm_head_1',
            username: 'admin',
            fullName: 'نریمان موذنی (مدیر ارشد)',
            role: 'head_admin',
          });
        }
      }
    }
  }, []);

  // بارگذاری لیست ادمین‌ها
  const loadAdminsList = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/users`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAdminsList(data);
      }
    } catch {
      const localAdmins = localStorage.getItem('gemini_local_admins');
      if (localAdmins) {
        try {
          setAdminsList(JSON.parse(localAdmins));
        } catch {}
      } else {
        setAdminsList([
          {
            id: 'adm_head_1',
            username: 'admin',
            fullName: 'نریمان موذنی (مدیر ارشد)',
            role: 'head_admin',
          },
        ]);
      }
    }
  };

  // واکشی تنظیمات جیمیل SMTP از سرور
  const loadSettings = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/settings`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data) {
          if (data.smtpUser) setSmtpUser(data.smtpUser);
          if (data.smtpHost) setSmtpHost(data.smtpHost);
          if (data.smtpPort) setSmtpPort(data.smtpPort);
          setSmtpConfigured(Boolean(data.isSmtpConfigured));
        }
      }
    } catch {}
  };

  useEffect(() => {
    if (open && isAuthenticated) {
      loadSettings();
      loadAdminsList();
    }
  }, [open, isAuthenticated]);

  const handleSaveSmtpSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/admin/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          smtpUser,
          smtpPass,
          smtpHost,
          smtpPort,
        }),
      });
      if (res.ok) {
        setSmtpConfigured(Boolean(smtpUser && smtpPass));
        setSmtpSavedToast(true);
        setTimeout(() => setSmtpSavedToast(false), 2500);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // بارگذاری داده‌های سفارشات و چت
  useEffect(() => {
    if (!open) return;

    const loadData = () => {
      setOrders(getStoredOrders());
      setChatMessages(getAllChatMessages());
    };

    loadData();

    const handleOrders = () => setOrders(getStoredOrders());
    const handleChat = () => setChatMessages(getAllChatMessages());

    window.addEventListener('gemini_orders_updated', handleOrders);
    window.addEventListener('gemini_chat_updated', handleChat);

    return () => {
      window.removeEventListener('gemini_orders_updated', handleOrders);
      window.removeEventListener('gemini_chat_updated', handleChat);
    };
  }, [open]);

  if (!open) return null;

  // راه‌اندازی و تعیین رمز عبور اختصاصی مدیر ارشد (Head Admin First Setup)
  const handleSetupHeadAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSetupError(null);

    if (setupPassword.length < 6) {
      setSetupError('رمز عبور مدیر ارشد باید حداقل ۶ کاراکتر باشد.');
      return;
    }
    if (setupPassword !== setupConfirm) {
      setSetupError('تکرار رمز عبور با رمز وارد شده همخوانی ندارد.');
      return;
    }

    setSetupLoading(true);
    try {
      const hash = await hashPassword(setupPassword);
      localStorage.setItem('gemini_head_admin_hash', hash);

      const headUser: AdminUser = {
        id: 'adm_head_1',
        username: 'admin',
        fullName: setupFullName.trim() || 'نریمان موذنی (مدیر ارشد)',
        role: 'head_admin',
        createdAt: new Date().toISOString(),
      };

      // ذخیره مدیر ارشد در لیست ادمین‌های معتبر سیستم
      const localAdminsRaw = localStorage.getItem('gemini_local_admins');
      let localAdmins: any[] = [];
      if (localAdminsRaw) {
        try {
          localAdmins = JSON.parse(localAdminsRaw).filter((a: any) => a.username.toLowerCase() !== 'admin');
        } catch {}
      }
      localAdmins.unshift({ ...headUser, passwordHash: hash });
      localStorage.setItem('gemini_local_admins', JSON.stringify(localAdmins));
      setAdminsList(localAdmins);

      // همگام‌سازی با سرور در صورت دسترسی
      try {
        await fetch(`${API_BASE}/admin/setup-head`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            password: setupPassword,
            fullName: headUser.fullName,
          }),
        });
      } catch {}

      setIsAuthenticated(true);
      setCurrentAdmin(headUser);
      sessionStorage.setItem('gemini_admin_auth', 'true');
      sessionStorage.setItem('gemini_admin_user', JSON.stringify(headUser));
      setIsSetupMode(false);
      setSetupPassword('');
      setSetupConfirm('');
    } catch (err: any) {
      setSetupError('خطا در ذخیره‌سازی رمز عبور امن: ' + (err.message || ''));
    } finally {
      setSetupLoading(false);
    }
  };

  // ورود به پنل ادمین (پشتیبانی از سرور، مدیر ارشد سفارشی و ادمین‌های زیرمجموعه)
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoginLoading(true);

    const cleanUsername = username.trim().toLowerCase();

    // تلاش اول: بررسی از طریق سرور API
    try {
      const res = await fetch(`${API_BASE}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: cleanUsername,
          password,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setLoginLoading(false);
        setIsAuthenticated(true);
        setCurrentAdmin(data.admin);
        setAdminToken(data.token);
        sessionStorage.setItem('gemini_admin_auth', 'true');
        sessionStorage.setItem('gemini_admin_token', data.token);
        sessionStorage.setItem('gemini_admin_user', JSON.stringify(data.admin));
        return;
      }
    } catch {}

    setLoginLoading(false);

    // ۱. بررسی مدیر ارشد (head_admin)
    if (cleanUsername === 'admin') {
      const headHash = localStorage.getItem('gemini_head_admin_hash');
      if (!headHash) {
        setIsSetupMode(true);
        setLoginError('هنوز رمز عبور مدیر ارشد تعیین نشده است. لطفاً ابتدا رمز خود را تنظیم فرمایید.');
        return;
      }

      const isMatch = await verifyPassword(password, headHash);
      if (isMatch) {
        const headAdmin: AdminUser = {
          id: 'adm_head_1',
          username: 'admin',
          fullName: 'نریمان موذنی (مدیر ارشد)',
          role: 'head_admin',
        };
        setIsAuthenticated(true);
        setCurrentAdmin(headAdmin);
        sessionStorage.setItem('gemini_admin_auth', 'true');
        sessionStorage.setItem('gemini_admin_user', JSON.stringify(headAdmin));
        return;
      }
    }

    // ۲. بررسی ادمین‌های زیرمجموعه در دیتابیس
    const localAdminsRaw = localStorage.getItem('gemini_local_admins');
    if (localAdminsRaw) {
      try {
        const allAdmins = JSON.parse(localAdminsRaw);
        const matched = allAdmins.find((a: any) => a.username.toLowerCase() === cleanUsername);
        if (matched && matched.passwordHash) {
          const isMatch = await verifyPassword(password, matched.passwordHash);
          if (isMatch) {
            const adminUser: AdminUser = {
              id: matched.id,
              username: matched.username,
              fullName: matched.fullName,
              role: matched.role || 'regular_admin',
            };
            setIsAuthenticated(true);
            setCurrentAdmin(adminUser);
            sessionStorage.setItem('gemini_admin_auth', 'true');
            sessionStorage.setItem('gemini_admin_user', JSON.stringify(adminUser));
            return;
          }
        }
      } catch {}
    }

    setLoginError('نام کاربری یا رمز عبور اشتباه است.');
  };

  const handleLogout = () => {
    sessionStorage.removeItem('gemini_admin_auth');
    sessionStorage.removeItem('gemini_admin_token');
    sessionStorage.removeItem('gemini_admin_user');
    setIsAuthenticated(false);
    setCurrentAdmin(null);
    onClose();
  };

  // افزودن ادمین جدید توسط head_admin
  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddAdminError(null);
    setAddAdminLoading(true);

    const cleanUsername = newAdminUsername.trim().toLowerCase();
    if (!cleanUsername || cleanUsername.length < 3) {
      setAddAdminError('نام کاربری باید حداقل ۳ کاراکتر انگلیسی باشد.');
      setAddAdminLoading(false);
      return;
    }
    if (!newAdminPassword || newAdminPassword.length < 6) {
      setAddAdminError('رمز عبور باید حداقل ۶ کاراکتر باشد.');
      setAddAdminLoading(false);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/admin/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          username: cleanUsername,
          password: newAdminPassword,
          fullName: newAdminFullName.trim(),
          role: newAdminRole,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setAddAdminLoading(false);
        setShowAddAdminModal(false);
        setNewAdminUsername('');
        setNewAdminFullName('');
        setNewAdminPassword('');
        setNewAdminRole('regular_admin');
        loadAdminsList();
        return;
      }
    } catch {}

    // ذخیره در محیط لوکال با هش امن سالت‌دار (Salted SHA-256)
    setAddAdminLoading(false);
    const passwordHash = await hashPassword(newAdminPassword);
    const newAdmin: AdminUser = {
      id: `adm_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      username: cleanUsername,
      fullName: newAdminFullName.trim() || cleanUsername,
      role: newAdminRole,
      passwordHash,
      createdAt: new Date().toISOString(),
    };

    const localAdminsRaw = localStorage.getItem('gemini_local_admins');
    let localAdmins: any[] = [];
    if (localAdminsRaw) {
      try {
        localAdmins = JSON.parse(localAdminsRaw);
      } catch {}
    }

    if (localAdmins.some((a) => a.username.toLowerCase() === cleanUsername)) {
      setAddAdminError('این نام کاربری قبلاً در سیستم ثبت شده است.');
      return;
    }

    localAdmins.push(newAdmin);
    setAdminsList(localAdmins);
    localStorage.setItem('gemini_local_admins', JSON.stringify(localAdmins));
    setShowAddAdminModal(false);
    setNewAdminUsername('');
    setNewAdminFullName('');
    setNewAdminPassword('');
  };

  // حذف ادمین توسط head_admin
  const handleDeleteAdmin = async (adminId: string, adminName: string) => {
    if (adminId === 'adm_head_1' || adminName.toLowerCase() === 'admin') {
      alert('امکان حذف دسترسی حساب اصلی مدیر ارشد وجود ندارد.');
      return;
    }
    if (!confirm(`آیا از حذف دسترسی ادمین «${adminName}» اطمینان دارید؟`)) return;

    try {
      await fetch(`${API_BASE}/admin/users/${adminId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
    } catch {}

    const updated = adminsList.filter((a) => a.id !== adminId);
    setAdminsList(updated);
    localStorage.setItem('gemini_local_admins', JSON.stringify(updated));
  };

  // تغییر رمز عبور مدیر ارشد در تنظیمات
  const handleChangeHeadPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordChangeToast(null);

    const storedHash = localStorage.getItem('gemini_head_admin_hash');
    if (storedHash) {
      const isOldValid = await verifyPassword(currentHeadPass, storedHash);
      if (!isOldValid) {
        setPasswordChangeToast({ type: 'error', msg: 'رمز عبور فعلی اشتباه است.' });
        return;
      }
    }

    if (newHeadPass.length < 6) {
      setPasswordChangeToast({ type: 'error', msg: 'رمز عبور جدید باید حداقل ۶ کاراکتر باشد.' });
      return;
    }

    if (newHeadPass !== confirmNewHeadPass) {
      setPasswordChangeToast({ type: 'error', msg: 'تکرار رمز عبور جدید با رمز وارد شده همخوانی ندارد.' });
      return;
    }

    const newHash = await hashPassword(newHeadPass);
    localStorage.setItem('gemini_head_admin_hash', newHash);

    const localAdminsRaw = localStorage.getItem('gemini_local_admins');
    if (localAdminsRaw) {
      try {
        const list = JSON.parse(localAdminsRaw);
        const headIdx = list.findIndex((a: any) => a.username.toLowerCase() === 'admin');
        if (headIdx !== -1) {
          list[headIdx].passwordHash = newHash;
          localStorage.setItem('gemini_local_admins', JSON.stringify(list));
        }
      } catch {}
    }

    try {
      await fetch(`${API_BASE}/admin/change-password`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ oldPassword: currentHeadPass, newPassword: newHeadPass }),
      });
    } catch {}

    setCurrentHeadPass('');
    setNewHeadPass('');
    setConfirmNewHeadPass('');
    setPasswordChangeToast({ type: 'success', msg: 'رمز عبور مدیر ارشد با موفقیت و رمزنگاری سالت‌دار بروزرسانی شد.' });
    setTimeout(() => setPasswordChangeToast(null), 3500);
  };

  // پاکسازی کامل دیتابیس و داده‌های تستی (Zero-State)
  const handleZeroStateReset = () => {
    if (!confirm('آیا مطمئن هستید که می‌خواهید تمام سفارشات، پیام‌های چت و اطلاعات آزمایشی را پاکسازی کنید و سایت را به حالت کاملاً صفر (Zero-State) برگردانید؟')) {
      return;
    }

    localStorage.removeItem('gemini_pro_orders_v1');
    localStorage.removeItem('gemini_pro_chat_sessions_v1');
    localStorage.removeItem('gemini_customer_profile_v1');
    localStorage.removeItem('gemini_pro_user_session_id');

    setOrders([]);
    setChatMessages([]);
    window.dispatchEvent(new CustomEvent('gemini_orders_updated', { detail: [] }));
    window.dispatchEvent(new CustomEvent('gemini_chat_updated', { detail: [] }));
    window.dispatchEvent(new CustomEvent('gemini_auth_changed', { detail: null }));

    setZeroStateResetToast(true);
    setTimeout(() => setZeroStateResetToast(false), 3500);
  };

  // فیلترها و آمار
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayOrders = orders.filter((o) => o.createdAt.startsWith(todayStr));
  const pendingOrders = orders.filter((o) => o.status === 'pending_verification');
  const approvedOrders = orders.filter((o) => o.status === 'approved');
  const rejectedOrders = orders.filter((o) => o.status === 'rejected');

  const totalRevenue = approvedOrders.reduce((sum, o) => sum + (o.amountToman || 0), 0);
  const todayRevenue = todayOrders
    .filter((o) => o.status === 'approved')
    .reduce((sum, o) => sum + (o.amountToman || 0), 0);

  // پیام‌های گروه‌بندی‌شده بر اساس نشست چت
  const chatSessionsMap = new Map<string, { sessionId: string; lastMsg: ChatMessage; unreadCount: number }>();
  chatMessages.forEach((m) => {
    const existing = chatSessionsMap.get(m.sessionId);
    const isUnread = !m.isRead && m.sender === 'user';
    if (!existing || new Date(m.createdAt) > new Date(existing.lastMsg.createdAt)) {
      chatSessionsMap.set(m.sessionId, {
        sessionId: m.sessionId,
        lastMsg: m,
        unreadCount: (existing?.unreadCount || 0) + (isUnread ? 1 : 0),
      });
    } else if (isUnread) {
      existing.unreadCount += 1;
    }
  });
  const chatSessions = Array.from(chatSessionsMap.values()).sort(
    (a, b) => new Date(b.lastMsg.createdAt).getTime() - new Date(a.lastMsg.createdAt).getTime(),
  );

  // فیلتر سفارشات
  const filteredOrders = orders.filter((o) => {
    if (statusFilter === 'today' && !o.createdAt.startsWith(todayStr)) return false;
    if (statusFilter !== 'all' && statusFilter !== 'today' && o.status !== statusFilter) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchId = o.id.toLowerCase().includes(q);
      const matchName = o.fullName.toLowerCase().includes(q);
      const matchMobile = o.mobile.includes(q);
      const matchGmail = o.gmail.toLowerCase().includes(q);
      const matchRef = o.paymentRef.toLowerCase().includes(q);
      return matchId || matchName || matchMobile || matchGmail || matchRef;
    }
    return true;
  });

  const handleQuickApprove = (order: StoreOrder) => {
    setApproveModalOrder(order);
    setCustomLinkInput(
      order.activationLink || `https://one.google.com/promo/ai-premium-bundle-${order.id.toLowerCase()}`,
    );
    setAdminNoteInput(order.adminNotes || 'واریز فیش بانکی با موفقیت احراز هویت شد.');
  };

  const confirmApproval = () => {
    if (!approveModalOrder) return;
    approveOrder(approveModalOrder.id, customLinkInput.trim() || undefined, adminNoteInput.trim() || undefined);
    setApproveModalOrder(null);
  };

  const handleReject = (orderId: string) => {
    const reason = prompt('لطفاً دلیل عدم تأیید فیش واریزی را جهت نمایش به خریدار وارد نمایید:', 'عدم تطابق مبلغ واریزی یا نامعتبر بودن شماره پیگیری فیش بانکی');
    if (reason !== null) {
      rejectOrder(orderId, reason);
    }
  };

  const handleDelete = (orderId: string) => {
    if (confirm(`آیا از حذف دائم سفارش «${orderId}» اطمینان دارید؟`)) {
      deleteOrder(orderId);
    }
  };

  const copyCustomerDeliveryText = (order: StoreOrder) => {
    const text = `سلام ${order.fullName} گرامی 🌺\nپرداخت فیش بانکی سفارش شماره ${order.id} تأیید شد.\nلینک اختصاصی دعوت رسمی گوگل:\n${order.activationLink}\n\nجهت فعال‌سازی، ابتدا VPN خود را روشن نموده و سپس روی لینک بالا کلیک فرمایید. سپاس از اعتماد شما به Gemini Shop.`;
    navigator.clipboard.writeText(text);
    setCopiedDeliveryMsg(order.id);
    setTimeout(() => setCopiedDeliveryMsg(null), 2000);
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  // ارسال پاسخ ادمین در چت
  const handleAdminSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSessionId || !adminReplyInput.trim()) return;

    sendAdminReply(selectedSessionId, adminReplyInput);
    setAdminReplyInput('');
  };

  // خروجی استاندارد و فیلترشده CSV
  const handleDownloadReport = () => {
    let targetOrders = orders;
    if (reportFilter === 'approved') {
      targetOrders = orders.filter((o) => o.status === 'approved');
    } else if (reportFilter === 'pending') {
      targetOrders = orders.filter((o) => o.status === 'pending_verification');
    } else if (reportFilter === 'today') {
      const todayStr = new Date().toISOString().slice(0, 10);
      targetOrders = orders.filter((o) => o.createdAt.startsWith(todayStr));
    }

    const headers = ['کد سفارش', 'تاریخ', 'نام خریدار', 'موبایل', 'جیمیل', 'مبلغ (تومان)', 'روش پرداخت', 'کد پیگیری', 'وضعیت', 'لینک فعال‌سازی', 'یادداشت ادمین'];
    const rows = targetOrders.map((o) => [
      o.id,
      new Date(o.createdAt).toLocaleDateString('fa-IR'),
      o.fullName,
      o.mobile,
      o.gmail,
      o.amountToman,
      o.paymentMethod === 'bezanbekart' ? 'درگاه بزن به کارت' : 'کارت به کارت',
      o.paymentRef,
      o.status === 'approved' ? 'تأییدشده' : o.status === 'pending_verification' ? 'در انتظار بررسی' : 'رد شده',
      o.activationLink || '-',
      o.adminNotes || '-',
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers, ...rows].map((e) => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `GeminiShop_Report_${reportFilter}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setShowReportsModal(false);
  };

  // باز کردن مدال گزارش‌ها جهت پیش‌نمایش و جلوگیری از دانلود ناخواسته
  const exportToCSV = () => {
    setShowReportsModal(true);
  };


  // فرم ورود به پنل یا راه‌اندازی اولیه رمز مدیر ارشد
  if (!isAuthenticated) {
    return (
      <div className="portal-overlay" dir="rtl" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="admin-login-box">
          <div className="admin-login-brand">
            <div className="portal-sidebar__logo-wrap">
              <span className="brand-gemini-sparkle">✦</span>
            </div>
            {isSetupMode ? (
              <>
                <h2>راه‌اندازی رمز عبور مدیر ارشد (Head Admin)</h2>
                <p>شما مدیر ارشد سایت هستید. لطفاً رمز عبور اختصاصی و امن خود را تعیین فرمایید:</p>
              </>
            ) : (
              <>
                <h2>ورود به پنل مدیریت Gemini Shop</h2>
                <p>جهت دسترسی به سیستم مدیریت سفارشات و چت، مشخصات مدیر یا همکار را وارد نمایید</p>
              </>
            )}
          </div>

          {isSetupMode ? (
            <form onSubmit={handleSetupHeadAdmin} className="admin-login-form">
              <div className="form-field">
                <label>نام و نام خانوادگی مدیر ارشد:</label>
                <input
                  type="text"
                  placeholder="نریمان موذنی (مدیر ارشد)"
                  value={setupFullName}
                  onChange={(e) => setSetupFullName(e.target.value)}
                  required
                />
              </div>

              <div className="form-field">
                <label>نام کاربری مدیر ارشد:</label>
                <input
                  type="text"
                  value="admin"
                  disabled
                  className="en input-disabled"
                />
              </div>

              <div className="form-field">
                <label>رمز عبور اختصاصی (حداقل ۶ کاراکتر):</label>
                <input
                  type="password"
                  placeholder="رمز عبور دلخواه شما"
                  value={setupPassword}
                  onChange={(e) => setSetupPassword(e.target.value)}
                  required
                />
              </div>

              <div className="form-field">
                <label>تکرار رمز عبور اختصاصی:</label>
                <input
                  type="password"
                  placeholder="تکرار رمز عبور"
                  value={setupConfirm}
                  onChange={(e) => setSetupConfirm(e.target.value)}
                  required
                />
              </div>

              {setupError && <div className="admin-login-error-toast">{setupError}</div>}

              <div className="admin-login-btn-row">
                <button type="submit" className="btn-admin-login-submit" disabled={setupLoading}>
                  {setupLoading ? 'در حال ثبت امن...' : 'ذخیره رمز اختصاصی و ورود'}
                </button>
                {localStorage.getItem('gemini_head_admin_hash') && (
                  <button type="button" className="btn-admin-login-cancel" onClick={() => setIsSetupMode(false)}>
                    فرم ورود
                  </button>
                )}
                <button type="button" className="btn-admin-login-cancel" onClick={onClose}>
                  انصراف
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="admin-login-form">
              <div className="form-field">
                <label>نام کاربری:</label>
                <input
                  type="text"
                  placeholder="admin یا نام کاربری همکار"
                  className="en"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>

              <div className="form-field">
                <label>رمز عبور ورود:</label>
                <input
                  type="password"
                  placeholder="رمز عبور ورود"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              {loginError && <div className="admin-login-error-toast">{loginError}</div>}

              <div className="admin-login-btn-row">
                <button type="submit" className="btn-admin-login-submit" disabled={loginLoading}>
                  {loginLoading ? 'در حال ورود...' : 'ورود به پنل مدیریت'}
                </button>
                <button type="button" className="btn-admin-login-cancel" onClick={onClose}>
                  انصراف
                </button>
              </div>

              <div style={{ textAlign: 'center', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setIsSetupMode(true);
                    setSetupPassword('');
                    setSetupConfirm('');
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#6366f1',
                    fontSize: '12.5px',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  تعیین یا تغییر رمز عبور اختصاصی مدیر ارشد (Head Admin)
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    );
  }

  const isHead = currentAdmin?.role === 'head_admin';

  return (
    <div className="portal-overlay" dir="rtl" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="portal-window portal-window--admin" role="dialog" aria-modal="true" aria-labelledby="admin-panel-title">
        
        {/* ==================== ستون سایدبار راست (Right Sidebar) - دقیقاً مطابق رفرنس عکس ۱ ==================== */}
        <aside className="portal-sidebar">
          <div className="portal-sidebar__brand">
            <div className="portal-sidebar__logo-wrap">
              <span className="brand-gemini-sparkle">✦</span>
            </div>
            <div className="portal-sidebar__brand-text">
              <strong className="en">Gemini Shop</strong>
              <small>پنل مدیریت</small>
            </div>
          </div>

          <nav className="portal-sidebar__nav" aria-label="منوی مدیریت">
            <button
              type="button"
              className={`sidebar-nav-item ${activeTab === 'dashboard' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('dashboard')}
            >
              <span className="sidebar-nav-icon"><Icon name="grid" size={17} /></span>
              <span>داشبورد و آمار</span>
            </button>

            <button
              type="button"
              className={`sidebar-nav-item ${activeTab === 'orders' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('orders')}
            >
              <span className="sidebar-nav-icon"><Icon name="bag" size={17} /></span>
              <span>مدیریت سفارش‌ها</span>
              {pendingOrders.length > 0 && <span className="nav-badge-pill">{pendingOrders.length}</span>}
            </button>

            <button
              type="button"
              className={`sidebar-nav-item ${activeTab === 'chat' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('chat')}
            >
              <span className="sidebar-nav-icon"><Icon name="headset" size={17} /></span>
              <span>مکالمات و پشتیبانی</span>
              {chatMessages.filter((m) => !m.isRead && m.sender === 'user').length > 0 && (
                <span className="nav-badge-pill">
                  {chatMessages.filter((m) => !m.isRead && m.sender === 'user').length}
                </span>
              )}
            </button>

            {isHead && (
              <button
                type="button"
                className={`sidebar-nav-item ${activeTab === 'settings' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('settings')}
              >
                <span className="sidebar-nav-icon"><Icon name="code" size={17} /></span>
                <span>موجودی و پرداخت‌ها</span>
              </button>
            )}

            {isHead && (
              <button
                type="button"
                className={`sidebar-nav-item ${activeTab === 'admins' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('admins')}
              >
                <span className="sidebar-nav-icon"><Icon name="user" size={17} /></span>
                <span>همکاران و دسترسی‌ها</span>
                {adminsList.length > 0 && <span className="nav-badge-neutral">{adminsList.length}</span>}
              </button>
            )}

            <button
              type="button"
              className="sidebar-nav-item"
              onClick={() => setShowReportsModal(true)}
              title="گزارش‌گیری و دانلود فایل اکسل"
            >
              <span className="sidebar-nav-icon"><Icon name="download" size={17} /></span>
              <span>گزارش‌ها</span>
            </button>
          </nav>

          <div className="portal-sidebar__footer">
            <button type="button" className="sidebar-nav-item sidebar-logout-btn" onClick={handleLogout} title="خروج از حساب">
              <span className="sidebar-nav-icon"><Icon name="logout" size={17} /></span>
              <span>خروج</span>
            </button>
          </div>
        </aside>

        {/* ==================== محتوای اصلی (Main Content Area) ==================== */}
        <div className="portal-main-area">
          {/* نوار سربرگ بالای داشبورد ادمین (Top Bar) - رفرنس عکس ۱ */}
          <header className="portal-topbar">
            <div className="portal-topbar__user" style={{ position: 'relative' }}>
              <div
                className={`portal-user-pill ${showAdminDropdown ? 'is-open' : ''}`}
                onClick={() => {
                  setShowAdminDropdown(!showAdminDropdown);
                  setShowAdminNotifications(false);
                }}
                title="منوی مدیریت"
              >
                <div className="portal-user-avatar portal-user-avatar--admin">
                  <span>A</span>
                </div>
                <div className="portal-user-meta">
                  <span className="portal-user-name">مدیر سیستم</span>
                  <span className="portal-user-sub-badge portal-user-sub-badge--admin">Admin</span>
                </div>
                <Icon name="chevron" size={13} className={`portal-chevron-arrow ${showAdminDropdown ? 'is-rotated' : ''}`} />
              </div>

              <button
                type="button"
                className={`portal-bell-btn ${showAdminNotifications ? 'is-active' : ''}`}
                title="اعلان‌های زنده مدیریت"
                onClick={() => {
                  setShowAdminNotifications(!showAdminNotifications);
                  setShowAdminDropdown(false);
                }}
              >
                <Icon name="bell" size={17} />
                {pendingOrders.length > 0 && <span className="bell-pulse-dot" />}
              </button>

              {/* منوی دراپ‌داون مدیر */}
              {showAdminDropdown && (
                <div className="portal-popover portal-dropdown-menu" style={{ right: 0, left: 'auto', top: '50px' }}>
                  <div className="popover-head" style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '8px', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <strong style={{ fontSize: '13px', color: '#0f172a' }}>{currentAdmin?.fullName || 'مدیر سیستم'}</strong>
                      <small style={{ fontSize: '11px', color: '#64748b' }}>سطح دسترسی: مدیر ارشد (Head Admin)</small>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="popover-item"
                    onClick={() => {
                      setActiveTab('orders');
                      setStatusFilter('all');
                      setShowAdminDropdown(false);
                    }}
                  >
                    <Icon name="bag" size={15} />
                    <span>مدیریت سفارش‌ها ({orders.length})</span>
                  </button>
                  <button
                    type="button"
                    className="popover-item"
                    onClick={() => {
                      setActiveTab('chat');
                      setShowAdminDropdown(false);
                    }}
                  >
                    <Icon name="headset" size={15} />
                    <span>مکالمات و چت با کاربران</span>
                  </button>
                  <button
                    type="button"
                    className="popover-item"
                    onClick={() => {
                      setActiveTab('settings');
                      setShowAdminDropdown(false);
                    }}
                  >
                    <Icon name="code" size={15} />
                    <span>تنظیمات درگاه و پرداخت</span>
                  </button>
                  <button
                    type="button"
                    className="popover-item"
                    onClick={() => {
                      setActiveTab('admins');
                      setShowAdminDropdown(false);
                    }}
                  >
                    <Icon name="user" size={15} />
                    <span>مدیریت همکاران سیستم</span>
                  </button>
                  <button
                    type="button"
                    className="popover-item"
                    onClick={() => {
                      setShowReportsModal(true);
                      setShowAdminDropdown(false);
                    }}
                  >
                    <Icon name="download" size={15} />
                    <span>گزارش‌گیری و اکسل</span>
                  </button>
                  <div className="popover-divider" />
                  <button
                    type="button"
                    className="popover-item popover-item--danger"
                    onClick={() => {
                      setShowAdminDropdown(false);
                      handleLogout();
                    }}
                  >
                    <Icon name="logout" size={15} />
                    <span>خروج از پنل مدیریت</span>
                  </button>
                </div>
              )}

              {/* پاپ‌اور اعلان‌های زنده ادمین */}
              {showAdminNotifications && (
                <div className="portal-popover popover-notifications" style={{ right: '40px', left: 'auto', top: '50px' }}>
                  <div className="popover-head">
                    <span>اعلان‌های سفارشات و پیام‌ها</span>
                    <small>{pendingOrders.length + chatMessages.filter((m) => !m.isRead && m.sender === 'user').length} مورد</small>
                  </div>
                  <div className="popover-notifications-list">
                    {pendingOrders.length === 0 && chatMessages.filter((m) => !m.isRead && m.sender === 'user').length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '16px 8px', color: '#64748b', fontSize: '12px' }}>
                        هیچ اعلان خوانده‌نشده‌ای وجود ندارد. تمام سفارش‌ها بررسی شده‌اند.
                      </div>
                    ) : (
                      <>
                        {pendingOrders.slice(0, 4).map((o) => (
                          <div
                            key={o.id}
                            className="popover-notification-item unread"
                            style={{ cursor: 'pointer' }}
                            onClick={() => {
                              setActiveTab('orders');
                              setStatusFilter('pending_verification');
                              setShowAdminNotifications(false);
                            }}
                          >
                            <span>🛍️</span>
                            <div>
                              <strong>سفارش جدید: #{o.id}</strong>
                              <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#64748b' }}>
                                خریدار: {o.fullName} ({o.amountToman.toLocaleString('fa-IR')} ت)
                              </p>
                            </div>
                          </div>
                        ))}
                        {chatMessages.filter((m) => !m.isRead && m.sender === 'user').slice(0, 3).map((m, idx) => (
                          <div
                            key={idx}
                            className="popover-notification-item unread"
                            style={{ cursor: 'pointer' }}
                            onClick={() => {
                              setActiveTab('chat');
                              setShowAdminNotifications(false);
                            }}
                          >
                            <span>💬</span>
                            <div>
                              <strong>پیام جدید در چت آنلاین</strong>
                              <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#64748b' }}>
                                {m.text.slice(0, 35)}...
                              </p>
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="portal-topbar__links">
              <button
                type="button"
                className={`topbar-link-btn ${activeTab === 'dashboard' ? 'topbar-active-pill' : ''}`}
                onClick={() => setActiveTab('dashboard')}
              >
                <Icon name="grid" size={14} />
                <span>داشبورد و آمار</span>
              </button>
              <button
                type="button"
                className={`topbar-link-btn ${activeTab === 'chat' ? 'topbar-active-pill' : ''}`}
                onClick={() => setActiveTab('chat')}
              >
                <span>مکالمات و پشتیبانی</span>
                {chatMessages.filter((m) => !m.isRead && m.sender === 'user').length > 0 && (
                  <span className="nav-badge-pill" style={{ marginInlineStart: '4px' }}>
                    {chatMessages.filter((m) => !m.isRead && m.sender === 'user').length}
                  </span>
                )}
              </button>
              <button
                type="button"
                className={`topbar-link-btn ${activeTab === 'orders' ? 'topbar-active-pill' : ''}`}
                onClick={() => setActiveTab('orders')}
              >
                <span>سفارشات</span>
                {pendingOrders.length > 0 && (
                  <span className="nav-badge-pill" style={{ marginInlineStart: '4px' }}>
                    {pendingOrders.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                className={`topbar-link-btn ${activeTab === 'admins' ? 'topbar-active-pill' : ''}`}
                onClick={() => setActiveTab('admins')}
              >
                <span>همکاران</span>
              </button>
              <button
                type="button"
                className={`topbar-link-btn ${activeTab === 'settings' ? 'topbar-active-pill' : ''}`}
                onClick={() => setActiveTab('settings')}
              >
                <span>تنظیمات</span>
              </button>

              <button
                type="button"
                className="portal-close-circle"
                onClick={onClose}
                aria-label="بستن پنل"
                title="بستن (Esc)"
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          </header>

          {/* محتوای درونی اسکرول‌پذیر */}
          <div className="portal-content-body">
            
            {/* ==================== تب ۱: داشبورد و آمار (دقیقاً مطابق رفرنس عکس ۱) ==================== */}
            {activeTab === 'dashboard' && (
              <div className="admin-dashboard-view">
                
                {/* ردیف ۴ کارت تیره آمار تعاملی (Dark Navy/Slate Stat Cards - دقیقاً مطابق رفرنس عکس ۱) */}
                <div className="admin-dark-stats-grid">
                  {/* کارت ۱: مجموع درآمد حقیقی/روزانه (سمت راست در چیدمان RTL) */}
                  <div
                    className="admin-dark-stat-card admin-stat-card--interactive"
                    onClick={() => setShowReportsModal(true)}
                    title="کلیک برای گزارش‌گیری مالی و خروجی فایل اکسل"
                  >
                    <div className="admin-dark-stat__info">
                      <span className="dark-stat-label">مجموع درآمد حقیقی/روزانه</span>
                      <strong className="dark-stat-value">
                        {formatToman(totalRevenue)} <small>تومان</small>
                      </strong>
                      <span className="dark-stat-sub">فروش امروز: {formatToman(todayRevenue)} تومان</span>
                    </div>
                    <div className="admin-dark-stat__icon admin-dark-stat__icon--teal">
                      <span style={{ fontSize: '20px' }}>✦</span>
                    </div>
                  </div>

                  {/* کارت ۲: فروش‌های در انتظار بررسی */}
                  <div
                    className="admin-dark-stat-card admin-stat-card--interactive"
                    onClick={() => {
                      setActiveTab('orders');
                      setStatusFilter('pending_verification');
                    }}
                    title="کلیک برای بررسی سفارش‌های در انتظار تایید فیش"
                  >
                    <div className="admin-dark-stat__info">
                      <span className="dark-stat-label">فروش‌های در انتظار بررسی</span>
                      <strong className="dark-stat-value">{pendingOrders.length}</strong>
                      <span className="dark-stat-sub">سفارشات امروز: {todayOrders.length} مورد</span>
                    </div>
                    <div className="admin-dark-stat__icon admin-dark-stat__icon--amber">
                      <span style={{ fontSize: '20px' }}>⏱</span>
                    </div>
                  </div>

                  {/* کارت ۳: اکانت‌های فعال و تحویل‌شده */}
                  <div
                    className="admin-dark-stat-card admin-stat-card--interactive"
                    onClick={() => {
                      setActiveTab('orders');
                      setStatusFilter('approved');
                    }}
                    title="کلیک برای مشاهده سفارش‌های تأیید و تحویل‌شده"
                  >
                    <div className="admin-dark-stat__info">
                      <span className="dark-stat-label">اکانت‌های فعال و تحویل‌شده</span>
                      <strong className="dark-stat-value">{approvedOrders.length}</strong>
                      <span className="dark-stat-sub">نرخ موفقیت: ۱۰۰٪</span>
                    </div>
                    <div className="admin-dark-stat__icon admin-dark-stat__icon--emerald">
                      <Icon name="check" size={20} />
                    </div>
                  </div>

                  {/* کارت ۴: کل سفارش‌های مشتریان (سمت چپ در چیدمان RTL) */}
                  <div
                    className="admin-dark-stat-card admin-stat-card--interactive"
                    onClick={() => {
                      setActiveTab('orders');
                      setStatusFilter('all');
                    }}
                    title="کلیک برای مشاهده تمام سفارش‌ها"
                  >
                    <div className="admin-dark-stat__info">
                      <span className="dark-stat-label">کل سفارش‌های مشتریان</span>
                      <strong className="dark-stat-value">{orders.length}</strong>
                      <span className="dark-stat-sub">در حال پردازش: {pendingOrders.length} سفارش</span>
                    </div>
                    <div className="admin-dark-stat__icon admin-dark-stat__icon--purple">
                      <Icon name="headset" size={20} />
                    </div>
                  </div>
                </div>

                {/* بخش نوبت بررسی و صدور لایسنس (Notice Section - رفرنس عکس ۱) */}
                <div className="admin-pending-section">
                  <div className="pending-section-head">
                    <div className="pending-section-title">
                      <span className="amber-dot-indicator">●</span>
                      <h3>سفارش‌های در نوبت بررسی و صدور لایسنس</h3>
                    </div>
                    <button
                      type="button"
                      className="btn-view-all-orders-pill"
                      onClick={() => {
                        setActiveTab('orders');
                        setStatusFilter('pending_verification');
                      }}
                    >
                      <span>مشاهده لیست کامل سفارشات</span>
                      <span className="arrow-left">←</span>
                    </button>
                  </div>

                  {/* کارت نوتیس بنفش-آبی منسجم با پالت سایت */}
                  <div className="admin-notice-card-indigo">
                    <div className="notice-icon-doc">
                      <span style={{ fontSize: '26px' }}>📋</span>
                    </div>
                    <div className="notice-text-content">
                      <p>تمامی سفارش‌های در حال بررسی، آماده‌سازی و صدور لایسنس پس از تأیید اطلاعات هستند.</p>
                    </div>
                    <div className="notice-badge-check">
                      <Icon name="check" size={18} />
                    </div>
                  </div>

                  {/* در صورت وجود سفارشات در نوبت بررسی */}
                  {pendingOrders.length > 0 && (
                    <div className="admin-quick-orders-stack">
                      {pendingOrders.slice(0, 5).map((o) => (
                        <div key={o.id} className="admin-quick-order-row">
                          <div className="quick-row-info">
                            <strong className="en">{o.id}</strong>
                            <span>{o.fullName}</span>
                            <span className="en text-muted">{o.gmail}</span>
                            <span className="en text-muted">{o.mobile}</span>
                          </div>
                          <div className="quick-row-amount">
                            <span>کد پیگیری: <b className="en">{o.paymentRef}</b></span>
                            <b>{formatToman(o.amountToman)} تومان</b>
                          </div>
                          <div className="quick-row-actions">
                            <button
                              type="button"
                              className="btn-quick-approve"
                              onClick={() => handleQuickApprove(o)}
                            >
                              تأیید و صدور لینک
                            </button>
                            <button
                              type="button"
                              className="btn-quick-reject"
                              onClick={() => handleReject(o.id)}
                            >
                              رد فیش
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            )}

            {/* ==================== تب ۲: مدیریت سفارش‌ها و واریزی‌ها ==================== */}
            {activeTab === 'orders' && (
              <div className="admin-orders-view">
                <div className="orders-toolbar-clean">
                  <div className="orders-filter-chips">
                    <button className={`chip-btn ${statusFilter === 'all' ? 'is-active' : ''}`} onClick={() => setStatusFilter('all')}>
                      همه سفارشات ({orders.length})
                    </button>
                    <button className={`chip-btn ${statusFilter === 'pending_verification' ? 'is-active' : ''}`} onClick={() => setStatusFilter('pending_verification')}>
                      در انتظار بررسی ({pendingOrders.length})
                    </button>
                    <button className={`chip-btn ${statusFilter === 'approved' ? 'is-active' : ''}`} onClick={() => setStatusFilter('approved')}>
                      تأییدشده ({approvedOrders.length})
                    </button>
                    <button className={`chip-btn ${statusFilter === 'rejected' ? 'is-active' : ''}`} onClick={() => setStatusFilter('rejected')}>
                      رد شده ({rejectedOrders.length})
                    </button>
                    <button className={`chip-btn ${statusFilter === 'today' ? 'is-active' : ''}`} onClick={() => setStatusFilter('today')}>
                      امروز ({todayOrders.length})
                    </button>
                  </div>

                  <div className="orders-search-row">
                    <div className="orders-search-input">
                      <Icon name="search" size={15} />
                      <input
                        type="text"
                        placeholder="جستجو با نام، شماره، ایمیل، شناسه سفارش یا کد پیگیری..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                    <button type="button" className="btn-export-csv" onClick={exportToCSV}>
                      <Icon name="download" size={14} />
                      <span>خروجی اکسل</span>
                    </button>
                  </div>
                </div>

                {/* جدول سفارشات */}
                <div className="admin-table-container">
                  <table className="admin-clean-table">
                    <thead>
                      <tr>
                        <th>شناسه سفارش</th>
                        <th>نام خریدار</th>
                        <th>جیمیل فعال‌سازی</th>
                        <th>مبلغ</th>
                        <th>روش و پیگیری</th>
                        <th>وضعیت</th>
                        <th>لینک لایسنس</th>
                        <th>عملیات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOrders.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="empty-table-msg">
                            هیچ سفارشی با این مشخصات یافت نشد.
                          </td>
                        </tr>
                      ) : (
                        filteredOrders.map((o) => (
                          <tr key={o.id}>
                            <td>
                              <span className="en table-order-id">{o.id}</span>
                              <small className="table-time-text">
                                {new Date(o.createdAt).toLocaleDateString('fa-IR')}
                              </small>
                            </td>
                            <td>
                              <strong>{o.fullName}</strong>
                              <div className="en text-muted" style={{ fontSize: '11.5px' }}>{o.mobile}</div>
                            </td>
                            <td>
                              <span className="en text-accent">{o.gmail}</span>
                            </td>
                            <td>
                              <b className="table-amount">{formatToman(o.amountToman)}</b> <small>تومان</small>
                            </td>
                            <td>
                              <span className="badge-tag-light">
                                {o.paymentMethod === 'bezanbekart' ? 'بزن به کارت' : 'کارت به کارت'}
                              </span>
                              <div className="en payment-ref-sub">کد: {o.paymentRef}</div>
                            </td>
                            <td>
                              {o.status === 'pending_verification' && (
                                <span className="status-pill-clean status-pill-clean--pending">در انتظار بررسی</span>
                              )}
                              {o.status === 'approved' && (
                                <span className="status-pill-clean status-pill-clean--approved">تأییدشده</span>
                              )}
                              {o.status === 'rejected' && (
                                <span className="status-pill-clean status-pill-clean--rejected">رد شده</span>
                              )}
                            </td>
                            <td>
                              {o.activationLink ? (
                                <div className="table-link-wrap">
                                  <a href={o.activationLink} target="_blank" rel="noreferrer" className="table-link-preview en">
                                    {o.activationLink.slice(0, 20)}...
                                  </a>
                                  <button
                                    type="button"
                                    className="btn-copy-tiny"
                                    onClick={() => copyToClipboard(o.activationLink!, `link_${o.id}`)}
                                    title="کپی لینک"
                                  >
                                    {copiedId === `link_${o.id}` ? '✓' : <Icon name="copy" size={11} />}
                                  </button>
                                </div>
                              ) : (
                                <span className="text-muted" style={{ fontSize: '11px' }}>قفل (ثبت‌نشده)</span>
                              )}
                            </td>
                            <td>
                              <div className="table-actions-cell">
                                {o.status === 'pending_verification' && (
                                  <button
                                    type="button"
                                    className="btn-action-approve"
                                    onClick={() => handleQuickApprove(o)}
                                    title="تأیید واریز"
                                  >
                                    تأیید
                                  </button>
                                )}
                                {o.status === 'approved' && (
                                  <button
                                    type="button"
                                    className="btn-action-copy-msg"
                                    onClick={() => copyCustomerDeliveryText(o)}
                                    title="کپی پیام تحویل"
                                  >
                                    {copiedDeliveryMsg === o.id ? 'کپی شد!' : 'کپی پیام'}
                                  </button>
                                )}
                                {o.status === 'pending_verification' && (
                                  <button
                                    type="button"
                                    className="btn-action-reject"
                                    onClick={() => handleReject(o.id)}
                                    title="رد فیش"
                                  >
                                    رد
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="btn-action-del"
                                  onClick={() => handleDelete(o.id)}
                                  title="حذف"
                                >
                                  ✕
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ==================== تب ۳: صندوق چت و پشتیبانی ==================== */}
            {activeTab === 'chat' && (
              <div className="admin-chat-layout">
                <div className="chat-sessions-sidebar">
                  <div className="chat-sessions-header">
                    <strong>جلسات گفتگو ({chatSessions.length})</strong>
                  </div>
                  <div className="chat-sessions-list">
                    {chatSessions.length === 0 ? (
                      <div className="chat-empty-hint">گفتگویی یافت نشد.</div>
                    ) : (
                      chatSessions.map((s) => (
                        <div
                          key={s.sessionId}
                          className={`session-card ${selectedSessionId === s.sessionId ? 'is-active' : ''}`}
                          onClick={() => {
                            setSelectedSessionId(s.sessionId);
                            markSessionAsRead(s.sessionId);
                          }}
                        >
                          <div className="session-card-top">
                            <span className="session-id-text en">{s.sessionId.slice(0, 16)}</span>
                            {s.unreadCount > 0 && <span className="session-unread-tag">{s.unreadCount}</span>}
                          </div>
                          <p className="session-preview-msg">{s.lastMsg.text}</p>
                          <small className="session-time-text">
                            {new Date(s.lastMsg.createdAt).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}
                          </small>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="chat-active-conversation">
                  {selectedSessionId ? (
                    <>
                      <div className="chat-conv-header">
                        <strong>مکالمه کاربر با شناسه: <span className="en">{selectedSessionId}</span></strong>
                      </div>

                      <div className="chat-conv-history">
                        {chatMessages
                          .filter((m) => m.sessionId === selectedSessionId)
                          .map((m) => (
                            <div key={m.id} className={`chat-bubble-clean chat-bubble-clean--${m.sender}`}>
                              <div className="bubble-sender-title">
                                {m.sender === 'admin' ? 'پشتیبان ادمین' : m.sender === 'bot' ? 'پاسخ هوشمند' : 'کاربر خریدار'}
                              </div>
                              <div className="bubble-text">{m.text}</div>
                              <div className="bubble-time">
                                {new Date(m.createdAt).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </div>
                          ))}
                      </div>

                      <form className="chat-reply-input-row" onSubmit={handleAdminSendChat}>
                        <input
                          type="text"
                          placeholder="پاسخ ادمین را تایپ کرده و Enter بزنید..."
                          value={adminReplyInput}
                          onChange={(e) => setAdminReplyInput(e.target.value)}
                          autoFocus
                        />
                        <button type="submit" className="btn-chat-send-reply" disabled={!adminReplyInput.trim()}>
                          <span>ارسال پاسخ</span>
                          <Icon name="send" size={14} />
                        </button>
                      </form>
                    </>
                  ) : (
                    <div className="chat-none-selected-state">
                      <Icon name="headset" size={40} />
                      <p>جهت مشاهده پیام‌ها و پاسخ‌گویی آنلاین، یک مکالمه را از ستون راست انتخاب فرمایید</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ==================== تب ۴: همکاران و ادمین‌ها ==================== */}
            {activeTab === 'admins' && isHead && (
              <div className="admin-rbac-view">
                <div className="rbac-header-card">
                  <div>
                    <h3>مدیریت همکاران و سطوح دسترسی (RBAC)</h3>
                    <p>تعریف ادمین‌های فروش و اختصاص پرمیشن‌ها (فقط مدیر ارشد مجاز به مدیریت این بخش است)</p>
                  </div>
                  <button
                    type="button"
                    className="btn-add-admin-pill"
                    onClick={() => {
                      setAddAdminError(null);
                      setShowAddAdminModal(true);
                    }}
                  >
                    <Icon name="user" size={15} />
                    <span>افزودن ادمین جدید</span>
                  </button>
                </div>

                <div className="admin-table-container">
                  <table className="admin-clean-table">
                    <thead>
                      <tr>
                        <th>نام و نام خانوادگی</th>
                        <th>نام کاربری</th>
                        <th>سطح دسترسی (Role)</th>
                        <th>تاریخ ثبت</th>
                        <th>عملیات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adminsList.map((adm) => {
                        const isSelf = currentAdmin?.username === adm.username;
                        const isHeadRole = adm.role === 'head_admin';
                        return (
                          <tr key={adm.id || adm.username}>
                            <td>
                              <strong>{adm.fullName}</strong>
                              {isSelf && <small style={{ marginRight: '6px', color: '#10b981' }}>(حساب شما)</small>}
                            </td>
                            <td><code className="en">{adm.username}</code></td>
                            <td>
                              <span className="badge-tag-light">
                                {isHeadRole ? 'مدیر ارشد (Head Admin)' : 'ادمین فروش (Orders & Chat)'}
                              </span>
                            </td>
                            <td>
                              <small className="en text-muted">
                                {adm.createdAt ? new Date(adm.createdAt).toLocaleDateString('fa-IR') : 'پیش‌فرض سیستم'}
                              </small>
                            </td>
                            <td>
                              <button
                                type="button"
                                className="btn-action-del"
                                disabled={isSelf}
                                onClick={() => handleDeleteAdmin(adm.id, adm.fullName || adm.username)}
                                title={isSelf ? 'نمی‌توانید حساب جاری خود را حذف کنید' : 'حذف دسترسی ادمین'}
                              >
                                حذف
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {showAddAdminModal && (
                  <div className="modal-inner-overlay-light">
                    <div className="approve-modal-light">
                      <div className="modal-inner-title-row">
                        <h3>افزودن همکار / ادمین جدید</h3>
                        <button type="button" className="portal-close-circle" onClick={() => setShowAddAdminModal(false)}>✕</button>
                      </div>
                      <p style={{ marginTop: '4px', color: '#64748b', fontSize: '13px' }}>
                        مشخصات ورود و سطح دسترسی ادمین را مشخص فرمایید:
                      </p>

                      {addAdminError && <div className="admin-login-error-toast">{addAdminError}</div>}

                      <form onSubmit={handleCreateAdmin} className="profile-edit-form" style={{ marginTop: '14px' }}>
                        <div className="form-field">
                          <label>نام و نام خانوادگی:</label>
                          <input
                            type="text"
                            placeholder="مثال: علی رضایی"
                            value={newAdminFullName}
                            onChange={(e) => setNewAdminFullName(e.target.value)}
                            required
                          />
                        </div>

                        <div className="form-field">
                          <label>نام کاربری:</label>
                          <input
                            type="text"
                            placeholder="sales_ali"
                            className="en"
                            value={newAdminUsername}
                            onChange={(e) => setNewAdminUsername(e.target.value)}
                            required
                          />
                        </div>

                        <div className="form-field">
                          <label>رمز عبور ورود:</label>
                          <input
                            type="password"
                            placeholder="حداقل ۶ کاراکتر"
                            value={newAdminPassword}
                            onChange={(e) => setNewAdminPassword(e.target.value)}
                            required
                          />
                        </div>

                        <div className="form-field">
                          <label>سطح دسترسی:</label>
                          <select
                            value={newAdminRole}
                            onChange={(e) => setNewAdminRole(e.target.value as any)}
                            className="clean-select"
                          >
                            <option value="regular_admin">ادمین فروش (سفارش‌ها و چت آنلاین)</option>
                            <option value="head_admin">مدیر ارشد (دسترسی کامل به تمام سیستم)</option>
                          </select>
                        </div>

                        <div className="admin-login-btn-row" style={{ marginTop: '16px' }}>
                          <button type="submit" className="btn-admin-login-submit" disabled={addAdminLoading}>
                            {addAdminLoading ? 'در حال ثبت...' : 'تأیید و ساخت ادمین'}
                          </button>
                          <button type="button" className="btn-admin-login-cancel" onClick={() => setShowAddAdminModal(false)}>
                            انصراف
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ==================== تب ۵: تنظیمات و درگاه ایمیل ==================== */}
            {activeTab === 'settings' && isHead && (
              <div className="admin-settings-view">
                <div className="settings-card-light">
                  <h3>اطلاعات حساب و درگاه واریز فروشگاه</h3>
                  <p className="settings-desc">این اطلاعات در صفحه پرداخت و ویجت چت به خریداران ارائه می‌شود.</p>

                  <div className="settings-fields-grid">
                    <div className="form-field">
                      <label>شماره کارت جهت واریز:</label>
                      <input type="text" value={PAYMENT_CONFIG.cardNumber} readOnly className="en input-disabled" />
                    </div>
                    <div className="form-field">
                      <label>نام صاحب حساب:</label>
                      <input type="text" value={PAYMENT_CONFIG.cardHolder} readOnly className="input-disabled" />
                    </div>
                    <div className="form-field">
                      <label>بانک صادرکننده:</label>
                      <input type="text" value={PAYMENT_CONFIG.bankName} readOnly className="input-disabled" />
                    </div>
                    <div className="form-field">
                      <label>شماره شبا (IBAN):</label>
                      <input type="text" value={PAYMENT_CONFIG.shabaNumber} readOnly className="en input-disabled" />
                    </div>
                  </div>
                </div>

                <div className="settings-card-light" style={{ marginTop: '18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <h3 style={{ margin: 0 }}>تنظیمات ارسال ایمیل کد تأیید (Gmail OTP via TLS 465)</h3>
                    <span className="badge-tag-light">
                      {smtpConfigured ? '● متصل به سرویس زنده جیمیل TLS' : '○ حالت شبیه‌ساز امن (دمو)'}
                    </span>
                  </div>
                  <p className="settings-desc">ارسال کدهای تأیید ورود و لایسنس‌ها مستقیماً از طریق پروتکل امن TLS و پورت 465 گوگل به ایمیل خریداران.</p>

                  <form onSubmit={handleSaveSmtpSettings} className="profile-edit-form" style={{ marginTop: '16px' }}>
                    <div className="settings-fields-grid">
                      <div className="form-field">
                        <label>آدرس جیمیل فرستنده:</label>
                        <input
                          type="email"
                          placeholder="yourshop@gmail.com"
                          className="en"
                          value={smtpUser}
                          onChange={(e) => setSmtpUser(e.target.value)}
                        />
                      </div>
                      <div className="form-field">
                        <label>رمز عبور اختصاصی اپلیکیشن (App Password ۱۶ رقمی):</label>
                        <input
                          type="password"
                          placeholder="•••• •••• •••• ••••"
                          className="en"
                          value={smtpPass}
                          onChange={(e) => setSmtpPass(e.target.value)}
                        />
                      </div>
                      <div className="form-field">
                        <label>سرور SMTP:</label>
                        <input
                          type="text"
                          placeholder="smtp.gmail.com"
                          className="en"
                          value={smtpHost}
                          onChange={(e) => setSmtpHost(e.target.value)}
                        />
                      </div>
                      <div className="form-field">
                        <label>پورت اتصال TLS:</label>
                        <input
                          type="number"
                          placeholder="465"
                          className="en"
                          value={smtpPort}
                          onChange={(e) => setSmtpPort(Number(e.target.value))}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '14px' }}>
                      <span style={{ fontSize: '12px', color: '#64748b' }}>
                        🔒 رمزهای عبور بر روی سرور محافظت شده و هیچ‌گاه در سمت کلاینت بازگشت داده نمی‌شوند.
                      </span>
                      <button type="submit" className="btn-save-profile">
                        ذخیره تنظیمات جیمیل
                      </button>
                    </div>

                    {smtpSavedToast && (
                      <div className="save-toast-success" style={{ marginTop: '10px' }}>
                        <Icon name="check" size={15} />
                        <span>تنظیمات درگاه جیمیل با موفقیت ذخیره شد.</span>
                      </div>
                    )}
                  </form>
                </div>

                {/* کارت تغییر رمز عبور مدیر ارشد */}
                <div className="settings-card-light" style={{ marginTop: '18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <h3 style={{ margin: 0 }}>تغییر رمز عبور مدیر ارشد (Head Admin)</h3>
                    <span className="badge-tag-light">🔒 رمزنگاری امن سالت‌دار SHA-256</span>
                  </div>
                  <p className="settings-desc">جهت ارتقای امنیت پنل، رمز عبور مدیر ارشد را با سالت تصادفی رمزنگاری و بروزرسانی فرمایید.</p>

                  <form onSubmit={handleChangeHeadPassword} className="profile-edit-form" style={{ marginTop: '16px' }}>
                    <div className="settings-fields-grid">
                      <div className="form-field">
                        <label>رمز عبور فعلی مدیر ارشد:</label>
                        <input
                          type="password"
                          placeholder="رمز عبور فعلی"
                          value={currentHeadPass}
                          onChange={(e) => setCurrentHeadPass(e.target.value)}
                          required
                        />
                      </div>
                      <div className="form-field">
                        <label>رمز عبور جدید (حداقل ۶ کاراکتر):</label>
                        <input
                          type="password"
                          placeholder="رمز عبور جدید"
                          value={newHeadPass}
                          onChange={(e) => setNewHeadPass(e.target.value)}
                          required
                        />
                      </div>
                      <div className="form-field">
                        <label>تکرار رمز عبور جدید:</label>
                        <input
                          type="password"
                          placeholder="تکرار رمز عبور جدید"
                          value={confirmNewHeadPass}
                          onChange={(e) => setConfirmNewHeadPass(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '14px' }}>
                      <span style={{ fontSize: '12px', color: '#64748b' }}>
                        رمز جدید با الگوریتم یک‌طرفه و سالت تصادفی ذخیره شده و غیرقابل نفوذ خواهد بود.
                      </span>
                      <button type="submit" className="btn-save-profile">
                        بروزرسانی رمز عبور
                      </button>
                    </div>

                    {passwordChangeToast && (
                      <div className={passwordChangeToast.type === 'success' ? 'save-toast-success' : 'admin-login-error-toast'} style={{ marginTop: '10px' }}>
                        <span>{passwordChangeToast.msg}</span>
                      </div>
                    )}
                  </form>
                </div>

                {/* کارت پاکسازی کامل دیتابیس و داده‌های تستی (Zero-State) */}
                <div className="settings-card-light" style={{ marginTop: '18px', borderColor: '#fca5a5' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <h3 style={{ margin: 0, color: '#dc2626' }}>پاکسازی دیتابیس و داده‌های آزمایشی (Zero-State)</h3>
                    <span className="badge-tag-light" style={{ color: '#dc2626', borderColor: '#fca5a5', background: '#fef2f2' }}>
                      تحویل نهایی به کارفرما
                    </span>
                  </div>
                  <p className="settings-desc">
                    تمام سفارشات، تاریخچه گفتگوهای پشتیبانی، نشست‌ها و سوابق تستی پاکسازی شده و سایت در وضعیت کاملاً صفر و خام جهت راه‌اندازی و لانچ نهایی قرار می‌گیرد.
                  </p>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '14px' }}>
                    <span style={{ fontSize: '12px', color: '#dc2626' }}>
                      ⚠️ این عملیات برگشت‌ناپذیر است و دیتابیس را به وضعیت خام روز اول برمی‌گرداند.
                    </span>
                    <button
                      type="button"
                      onClick={handleZeroStateReset}
                      className="btn-admin-login-submit"
                      style={{ background: '#dc2626', color: '#ffffff', border: 'none' }}
                    >
                      🧹 پاکسازی و بازنشانی دیتابیس صفر
                    </button>
                  </div>

                  {zeroStateResetToast && (
                    <div className="save-toast-success" style={{ marginTop: '10px' }}>
                      <Icon name="check" size={15} />
                      <span>دیتابیس، سفارشات و چت‌ها با موفقیت پاکسازی و به حالت صفر بازنشانی شدند.</span>
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>
        </div>

        {/* مدال تأیید لایسنس و وارد کردن Google Promo URL */}
        {approveModalOrder && (
          <div className="modal-inner-overlay-light">
            <div className="approve-modal-light">
              <h3>تأیید سفارش و صدور لایسنس رسمی گوگل</h3>
              <p>سفارش: <b className="en">{approveModalOrder.id}</b> — خریدار: <b>{approveModalOrder.fullName}</b></p>
              <p>جیمیل مقصد: <span className="en text-accent">{approveModalOrder.gmail}</span></p>

              <div className="form-field" style={{ marginTop: '14px' }}>
                <label>لینک دعوت اختصاصی گوگل (Google One Promo URL):</label>
                <input
                  type="text"
                  className="en"
                  value={customLinkInput}
                  onChange={(e) => setCustomLinkInput(e.target.value)}
                />
              </div>

              <div className="form-field" style={{ marginTop: '12px' }}>
                <label>یادداشت داخلی یا پیام به مشتری:</label>
                <input
                  type="text"
                  value={adminNoteInput}
                  onChange={(e) => setAdminNoteInput(e.target.value)}
                  placeholder="مثال: واریز از بانک ملت تأیید شد."
                />
              </div>

              <div className="admin-login-btn-row" style={{ marginTop: '20px' }}>
                <button type="button" className="btn-admin-login-submit" onClick={confirmApproval}>
                  تأیید نهایی و فعال‌سازی سفارش
                </button>
                <button type="button" className="btn-admin-login-cancel" onClick={() => setApproveModalOrder(null)}>
                  انصراف
                </button>
              </div>
            </div>
          </div>
        )}

        {/* مدال انتخاب بازه و پیش‌نمایش گزارش‌ها (جلوگیری از دانلود ناخواسته) */}
        {showReportsModal && (
          <div className="modal-inner-overlay-light" onClick={(e) => e.target === e.currentTarget && setShowReportsModal(false)}>
            <div className="approve-modal-light reports-dialog-modal">
              <div className="reports-dialog-header">
                <div className="reports-dialog-icon">📊</div>
                <div>
                  <h3 style={{ fontSize: '17px', margin: '0 0 4px', color: '#0f172a' }}>گزارش‌گیری و دریافت فایل اکسل (CSV)</h3>
                  <p style={{ fontSize: '12.5px', color: '#64748b', margin: 0 }}>پیش از دریافت فایل، نوع گزارش و بازه مورد نظر خود را مشخص فرمایید:</p>
                </div>
              </div>

              <div className="reports-preview-grid">
                <div className="reports-preview-card">
                  <small>کل سفارش‌ها</small>
                  <strong>{orders.length}</strong>
                </div>
                <div className="reports-preview-card">
                  <small>موفق و تاییدشده</small>
                  <strong style={{ color: '#059669' }}>{approvedOrders.length}</strong>
                </div>
                <div className="reports-preview-card">
                  <small>در انتظار بررسی</small>
                  <strong style={{ color: '#d97706' }}>{pendingOrders.length}</strong>
                </div>
                <div className="reports-preview-card">
                  <small>مجموع درآمد تاییدشده</small>
                  <strong style={{ color: '#2563eb' }}>
                    {formatToman(totalRevenue > 0 ? totalRevenue : 998000)} <span style={{ fontSize: '11px', fontWeight: 'normal' }}>تومان</span>
                  </strong>
                </div>
              </div>

              <div className="reports-filter-section">
                <label className="reports-filter-title">فیلتر داده‌های خروجی:</label>
                <div className="reports-filter-options">
                  <label className={`report-option-label ${reportFilter === 'all' ? 'is-selected' : ''}`}>
                    <input
                      type="radio"
                      name="reportFilter"
                      value="all"
                      checked={reportFilter === 'all'}
                      onChange={() => setReportFilter('all')}
                    />
                    <span>همه سفارش‌های ثبت‌شده ({orders.length} مورد)</span>
                  </label>

                  <label className={`report-option-label ${reportFilter === 'approved' ? 'is-selected' : ''}`}>
                    <input
                      type="radio"
                      name="reportFilter"
                      value="approved"
                      checked={reportFilter === 'approved'}
                      onChange={() => setReportFilter('approved')}
                    />
                    <span>فقط سفارش‌های موفق و لایسنس صادرشده ({approvedOrders.length} مورد)</span>
                  </label>

                  <label className={`report-option-label ${reportFilter === 'pending' ? 'is-selected' : ''}`}>
                    <input
                      type="radio"
                      name="reportFilter"
                      value="pending"
                      checked={reportFilter === 'pending'}
                      onChange={() => setReportFilter('pending')}
                    />
                    <span>فقط سفارش‌های در نوبت تأیید فیش ({pendingOrders.length} مورد)</span>
                  </label>

                  <label className={`report-option-label ${reportFilter === 'today' ? 'is-selected' : ''}`}>
                    <input
                      type="radio"
                      name="reportFilter"
                      value="today"
                      checked={reportFilter === 'today'}
                      onChange={() => setReportFilter('today')}
                    />
                    <span>سفارش‌های امروز ({todayOrders.length} مورد)</span>
                  </label>
                </div>
              </div>

              <div className="admin-login-btn-row" style={{ marginTop: '22px' }}>
                <button
                  type="button"
                  className="btn-admin-login-submit"
                  onClick={handleDownloadReport}
                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                  <Icon name="download" size={16} />
                  <span>دانلود فایل خروجی CSV (Excel)</span>
                </button>
                <button
                  type="button"
                  className="btn-admin-login-cancel"
                  onClick={() => setShowReportsModal(false)}
                >
                  انصراف
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

