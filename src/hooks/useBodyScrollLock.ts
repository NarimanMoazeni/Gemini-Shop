import { useEffect } from 'react';

/**
 * هوک جامع و استاندارد جهت قفل کردن اسکرول صفحه هنگام باز بودن هر مدال یا پنل
 * همراه با تصحیح عرض اسکرول‌بار مرورگر جهت جلوگیری از پرش افقی لایه (Layout Shift)
 */
export function useBodyScrollLock(isLocked: boolean) {
  useEffect(() => {
    if (!isLocked) return;

    const scrollY = window.scrollY;
    const isMobile = window.innerWidth <= 900;
    const originalBodyOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;
    const originalBodyOverscroll = document.body.style.overscrollBehavior;
    const originalHtmlOverscroll = document.documentElement.style.overscrollBehavior;
    const originalBodyPosition = document.body.style.position;
    const originalBodyTop = document.body.style.top;
    const originalBodyWidth = document.body.style.width;
    const originalPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overscrollBehavior = 'none';
    document.body.style.overscrollBehavior = 'none';

    if (isMobile) {
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
    }

    if (scrollbarWidth > 0 && !isMobile) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      document.documentElement.style.overflow = originalHtmlOverflow;
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overscrollBehavior = originalHtmlOverscroll;
      document.body.style.overscrollBehavior = originalBodyOverscroll;
      document.body.style.paddingRight = originalPaddingRight;

      if (isMobile) {
        document.body.style.position = originalBodyPosition;
        document.body.style.top = originalBodyTop;
        document.body.style.width = originalBodyWidth;
        window.scrollTo(0, scrollY);
      }
    };
  }, [isLocked]);
}
