'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNotifications, NotificationType, Notification } from '@/context/NotificationContext';
import {
  Home,
  Calendar,
  BookOpen,
  Newspaper,
  Users,
  MessageCircle,
  Bot,
  Bell,
  X,
  Heart,
  UserPlus,
  CalendarClock,
  AlertCircle,
  Briefcase,
  Menu,
  LogOut
} from 'lucide-react';

export default function Navbar() {
  const { isAuthenticated, logout } = useAuth();
  const { notifications, unreadCount, markAsRead, clearAll, handleJoinRequest } = useNotifications();
  const router = useRouter();
  const pathname = usePathname();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setShowMobileMenu(false);
  }, [pathname]);

  useEffect(() => {
    if (!showNotifications) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };

    const timer = window.setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 0);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [showNotifications]);

  if (pathname === '/login' || pathname === '/signup') {
    return null;
  }

  const appLinks = [
    { href: '/home', label: 'Home', icon: Home },
    { href: '/events', label: 'Events', icon: Calendar },
    { href: '/notebook', label: 'Notebook', icon: BookOpen },
    { href: '/feed', label: 'Feed', icon: Newspaper },
    { href: '/groups', label: 'Groups', icon: Users },
    { href: '/chat', label: 'Chat', icon: MessageCircle },
    { href: '/assistant', label: 'Assistant', icon: Bot },
    { href: '/opportunities', label: 'Opportunities', icon: Briefcase },
  ];

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const isActive = (href: string): boolean => {
    return pathname === href || pathname.startsWith(href + '/');
  };

  const getNotificationIcon = (type: NotificationType) => {
    switch (type) {
      case 'chat': return MessageCircle;
      case 'feed': return Heart;
      case 'group': return Users;
      case 'group_join_request': return UserPlus;
      case 'event': return CalendarClock;
      case 'system': return AlertCircle;
      default: return Bell;
    }
  };

  const parseMetadata = (notif: Notification) => {
    if (!notif.metadata) return null;
    try {
      return JSON.parse(notif.metadata);
    } catch {
      return null;
    }
  };

  const handleJoinRequestAction = async (notif: Notification, action: 'approve' | 'reject', e: React.MouseEvent) => {
    e.stopPropagation();
    const meta = parseMetadata(notif);
    if (meta?.joinRequestId) {
      await handleJoinRequest(meta.joinRequestId, action);
      markAsRead(notif.id);
    }
  };

  const formatTimeAgo = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const handleNotificationClick = (notif: Notification) => {
    markAsRead(notif.id);
    if (notif.link) {
      router.push(notif.link);
      setShowNotifications(false);
    }
  };

  return (
    <nav className="nav-glass sticky top-0 z-50 overflow-visible">
      <div className="w-full max-w-[1560px] min-[1920px]:max-w-[1720px] mx-auto px-4 sm:px-6 flex justify-between items-center h-16 gap-4">
        {/* Wordmark — serif logotype */}
        <Link
          href="/"
          className="flex items-center gap-2 shrink-0 group"
        >
          <span
            className="font-medium tracking-tight text-[var(--color-navy)] group-hover:text-[var(--color-blue-primary)] transition-colors duration-300"
            style={{
              fontFamily: 'var(--font-fraunces), serif',
              fontSize: '1.45rem',
              letterSpacing: '-0.035em',
              fontVariationSettings: "'opsz' 144, 'SOFT' 50, 'WONK' 1",
            }}
          >
            Med<span className="italic font-normal">zae</span>
          </span>
          <span className="hidden xl:inline-block h-1 w-1 rounded-full bg-[var(--color-navy)]/30" aria-hidden />
          <span
            className="hidden xl:inline-block text-[10px] uppercase tracking-[0.22em] text-[var(--color-text-muted)] font-semibold"
            aria-hidden
          >
            est. 2026
          </span>
        </Link>

        <div className="flex items-center gap-1 min-w-0 flex-1 justify-end">
          {isAuthenticated ? (
            <>
              <div className="hidden md:flex gap-0.5 items-center overflow-x-auto scrollbar-hide min-w-0 mr-2">
                {appLinks.map(link => {
                  const Icon = link.icon;
                  const active = isActive(link.href);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[0.8125rem] transition-smooth whitespace-nowrap shrink-0 ${
                        active
                          ? 'text-[var(--color-navy)] font-semibold'
                          : 'text-[var(--color-text-muted)] hover:text-[var(--color-navy)]'
                      }`}
                    >
                      <Icon className={`w-[14px] h-[14px] ${active ? 'opacity-100' : 'opacity-70'}`} />
                      <span className="hidden lg:inline">{link.label}</span>
                      {active && (
                        <span
                          className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-1 h-1 rounded-full bg-[var(--color-navy)]"
                          aria-hidden
                        />
                      )}
                    </Link>
                  );
                })}
              </div>

              {/* Hairline divider */}
              <div className="hidden md:block w-px h-5 bg-[var(--color-border-rule)] mx-1" aria-hidden />

              <div className="relative shrink-0" ref={notifRef}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowNotifications((open) => !open);
                  }}
                  className="relative p-2 hover:bg-[var(--color-accent-soft)] rounded-md transition-smooth text-[var(--color-text-muted)] hover:text-[var(--color-navy)]"
                  aria-label="Notifications"
                  aria-expanded={showNotifications}
                  aria-haspopup="true"
                >
                  <Bell className="w-[18px] h-[18px]" strokeWidth={1.75} />
                  {unreadCount > 0 && (
                    <span
                      className="absolute -top-0.5 -right-0.5 bg-[var(--color-navy)] text-white text-[10px] font-bold rounded-full min-w-[1rem] h-4 px-1 flex items-center justify-center"
                      style={{ boxShadow: '0 0 0 2px var(--color-bg-paper, #FAFBFD)' }}
                    >
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>

                {showNotifications && (
                  <div
                    className="absolute right-0 top-full mt-3 w-[26rem] max-w-[calc(100vw-2rem)] bg-[var(--color-surface-white)] rounded-xl overflow-hidden z-[200] border border-[var(--color-border-hairline)]"
                    style={{ boxShadow: 'var(--shadow-modal)' }}
                    role="dialog"
                    aria-label="Notifications"
                  >
                    <div className="px-5 py-4 border-b border-[var(--color-border-hairline)] flex justify-between items-center">
                      <div>
                        <p className="label !mb-0">Inbox</p>
                        <h3
                          className="text-[var(--color-navy)] mt-0.5"
                          style={{
                            fontFamily: 'var(--font-fraunces), serif',
                            fontSize: '1.0625rem',
                            fontWeight: 500,
                            letterSpacing: '-0.02em',
                          }}
                        >
                          Notifications
                        </h3>
                      </div>
                      {unreadCount > 0 && (
                        <span className="text-[10px] font-semibold text-[var(--color-blue-primary)] bg-[var(--color-accent-soft)] px-2 py-1 rounded-full uppercase tracking-wider">
                          {unreadCount} new
                        </span>
                      )}
                    </div>

                    <div className="max-h-[28rem] overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="p-12 text-center">
                          <Bell className="w-10 h-10 mx-auto mb-3 text-[var(--color-border-mid)]" strokeWidth={1.25} />
                          <p className="text-sm text-[var(--color-text-muted)]">No notifications yet</p>
                        </div>
                      ) : (
                        notifications.map(notif => {
                          const NotifIcon = getNotificationIcon(notif.type);
                          const isJoinRequest = notif.type === 'group_join_request';
                          return (
                            <button
                              key={notif.id}
                              onClick={() => handleNotificationClick(notif)}
                              className={`w-full text-left px-5 py-4 border-b border-[var(--color-border-hairline)] hover:bg-[var(--color-accent-soft)]/50 transition-colors ${
                                !notif.isRead ? 'bg-[var(--color-accent-soft)]/30' : ''
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <div className="w-8 h-8 rounded-md bg-[var(--color-accent-soft)] flex items-center justify-center flex-shrink-0">
                                  <NotifIcon className="w-4 h-4 text-[var(--color-blue-primary)]" strokeWidth={1.75} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between gap-2 mb-1">
                                    <h4 className="font-semibold text-[var(--color-navy)] text-sm leading-snug">
                                      {notif.title}
                                    </h4>
                                    {!notif.isRead && (
                                      <div className="w-1.5 h-1.5 bg-[var(--color-blue-primary)] rounded-full flex-shrink-0 mt-1.5" />
                                    )}
                                  </div>
                                  <p className="text-[0.8125rem] text-[var(--color-text-body)] mb-1.5 leading-relaxed">
                                    {notif.message}
                                  </p>
                                  {isJoinRequest && !notif.isRead && (
                                    <div className="flex gap-2 mt-2 mb-1">
                                      <button
                                        onClick={(e) => handleJoinRequestAction(notif, 'approve', e)}
                                        className="btn-primary text-[11px] !py-1 !px-2.5"
                                      >
                                        Approve
                                      </button>
                                      <button
                                        onClick={(e) => handleJoinRequestAction(notif, 'reject', e)}
                                        className="px-2.5 py-1 bg-red-50 text-red-600 text-[11px] rounded-md font-semibold hover:bg-red-100 border border-red-100 transition-colors"
                                      >
                                        Reject
                                      </button>
                                    </div>
                                  )}
                                  <span className="text-[11px] text-[var(--color-text-soft)] uppercase tracking-wider font-medium">
                                    {formatTimeAgo(notif.createdAt)}
                                  </span>
                                </div>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>

                    {notifications.length > 0 && (
                      <div className="px-5 py-3 border-t border-[var(--color-border-hairline)] text-center bg-[var(--color-surface-elevated)]">
                        <button
                          type="button"
                          onClick={async () => {
                            await clearAll();
                            setShowNotifications(false);
                          }}
                          className="text-[0.8125rem] text-[var(--color-blue-primary)] hover:text-[var(--color-navy)] font-semibold transition-smooth"
                        >
                          Mark all as read →
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleLogout}
                className="hidden md:inline-flex btn-primary !py-2 !px-4 text-[0.8125rem] shrink-0"
              >
                Logout
              </button>

              <button
                type="button"
                onClick={() => setShowMobileMenu((open) => !open)}
                className="md:hidden p-2 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-navy)] hover:bg-[var(--color-accent-soft)] transition-smooth shrink-0"
                aria-label={showMobileMenu ? 'Close menu' : 'Open menu'}
                aria-expanded={showMobileMenu}
                aria-controls="mobile-menu"
              >
                {showMobileMenu ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="btn-ghost text-sm whitespace-nowrap"
              >
                Log In
              </Link>
              <Link
                href="/signup"
                className="btn-primary !py-2 !px-5 text-sm whitespace-nowrap"
              >
                Sign Up
              </Link>
            </>
          )}
        </div>
      </div>

      {isAuthenticated && showMobileMenu && (
        <div
          id="mobile-menu"
          className="md:hidden border-t border-[var(--color-border-hairline)] bg-[var(--color-surface-white)]"
          style={{ boxShadow: 'var(--shadow-card)' }}
        >
          <nav className="px-4 py-3 space-y-0.5">
            {appLinks.map((link) => {
              const Icon = link.icon;
              const active = isActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setShowMobileMenu(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-smooth ${
                    active
                      ? 'bg-[var(--color-accent-soft)] text-[var(--color-navy)] font-semibold'
                      : 'text-[var(--color-text-body)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-navy)]'
                  }`}
                >
                  <Icon className="w-[18px] h-[18px]" strokeWidth={1.75} />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="px-4 py-3 border-t border-[var(--color-border-hairline)]">
            <button
              type="button"
              onClick={() => {
                setShowMobileMenu(false);
                handleLogout();
              }}
              className="btn-primary w-full inline-flex items-center justify-center gap-2 !py-2.5 text-sm"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
