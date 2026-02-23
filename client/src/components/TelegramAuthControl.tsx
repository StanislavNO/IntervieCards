import { useEffect, useRef, useState } from 'react';
import { authApi } from '../api';
import { clearStoredAuthToken, getTelegramBotUsername, setStoredAuthToken } from '../auth';
import type { AuthUser, TelegramAuthPayload } from '../types';

type Props = {
  user: AuthUser | null;
  loading?: boolean;
  onUserChange: (user: AuthUser | null) => void;
  onProfile?: () => void;
  menuItems?: Array<{
    label: string;
    onSelect: () => void;
    danger?: boolean;
    kind?: 'action' | 'logout';
  }>;
  hideDefaultMenuItems?: boolean;
  className?: string;
};

function isTelegramPayload(value: unknown): value is TelegramAuthPayload {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<TelegramAuthPayload>;
  return (
    typeof candidate.id !== 'undefined' &&
    typeof candidate.first_name === 'string' &&
    typeof candidate.auth_date !== 'undefined' &&
    typeof candidate.hash === 'string'
  );
}

function displayName(user: AuthUser): string {
  if (user.username) {
    return `@${user.username}`;
  }
  return [user.firstName, user.lastName].filter(Boolean).join(' ');
}

export function TelegramAuthControl({
  user,
  loading = false,
  onUserChange,
  onProfile,
  menuItems,
  hideDefaultMenuItems = false,
  className
}: Props) {
  const widgetContainerRef = useRef<HTMLDivElement | null>(null);
  const callbackNameRef = useRef(`unityprepTelegramAuth_${Math.random().toString(36).slice(2)}`);
  const menuRootRef = useRef<HTMLDivElement | null>(null);
  const [authInProgress, setAuthInProgress] = useState(false);
  const [widgetVersion, setWidgetVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const botUsername = getTelegramBotUsername();

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRootRef.current) {
        return;
      }
      if (!menuRootRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (loading || user || !botUsername || !widgetContainerRef.current) {
      return;
    }

    const callbackName = callbackNameRef.current;
    const callbackHost = window as unknown as Record<string, unknown>;

    callbackHost[callbackName] = async (rawUser: unknown) => {
      if (!isTelegramPayload(rawUser)) {
        setError('Некорректный ответ Telegram.');
        return;
      }

      try {
        setAuthInProgress(true);
        setError(null);
        const session = await authApi.loginWithTelegram(rawUser);
        setStoredAuthToken(session.token);
        onUserChange(session.user);
      } catch (authError) {
        clearStoredAuthToken();
        setError((authError as Error).message || 'Не удалось выполнить вход через Telegram.');
      } finally {
        setAuthInProgress(false);
      }
    };

    const container = widgetContainerRef.current;
    container.innerHTML = '';

    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.setAttribute('data-telegram-login', botUsername);
    script.setAttribute('data-size', 'medium');
    script.setAttribute('data-userpic', 'false');
    script.setAttribute('data-radius', '8');
    script.setAttribute('data-request-access', 'write');
    script.setAttribute('data-lang', 'en');
    script.setAttribute('data-onauth', `${callbackName}(user)`);

    container.appendChild(script);

    return () => {
      container.innerHTML = '';
      delete callbackHost[callbackName];
    };
  }, [botUsername, loading, onUserChange, user, widgetVersion]);

  async function handleLogout() {
    try {
      await authApi.logout();
    } catch {
      // no-op: logout is stateless on backend
    }

    clearStoredAuthToken();
    onUserChange(null);
    setWidgetVersion((prev) => prev + 1);
    setError(null);
    setMenuOpen(false);
  }

  function handleProfileClick() {
    if (!user) {
      return;
    }

    if (user.username) {
      window.open(`https://t.me/${user.username}`, '_blank', 'noopener,noreferrer');
    }
  }

  function runProfileAction(onProfile?: () => void) {
    setMenuOpen(false);
    if (onProfile) {
      onProfile();
      return;
    }
    handleProfileClick();
  }

  function runCustomAction(action: () => void, kind: 'action' | 'logout' = 'action') {
    if (kind === 'logout') {
      void handleLogout();
      return;
    }

    setMenuOpen(false);
    action();
  }

  if (loading) {
    return (
      <div className={`telegram-auth-inline auth-loading-state ${className ?? ''}`}>
        Проверка сессии...
      </div>
    );
  }

  if (user) {
    return (
      <div className={`telegram-auth-inline ${className ?? ''}`}>
        <div ref={menuRootRef} className="auth-menu-root">
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-expanded={menuOpen}
            className="auth-user-trigger"
          >
            {user.photoUrl ? (
              <img src={user.photoUrl} alt="Avatar" className="h-8 w-8 rounded-full border border-slate-300/80 object-cover dark:border-slate-500/80" />
            ) : (
              <div className="grid h-8 w-8 place-items-center rounded-full bg-brand-500/15 text-xs font-bold text-brand-700 dark:bg-brand-400/20 dark:text-brand-200">
                {user.firstName.slice(0, 1).toUpperCase()}
              </div>
            )}
            <span className="max-w-[140px] truncate text-xs font-semibold text-slate-700 dark:text-slate-100">{displayName(user)}</span>
            <span className={`text-[10px] text-slate-500 transition ${menuOpen ? 'rotate-180' : ''}`} aria-hidden>
              ▼
            </span>
          </button>

          {menuOpen && (
            <div className="auth-menu-panel" role="menu" aria-label="User menu">
              {menuItems?.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  className={`auth-menu-item ${item.danger ? 'auth-menu-item-danger' : ''}`}
                  onClick={() => runCustomAction(item.onSelect, item.kind)}
                >
                  {item.label}
                </button>
              ))}
              {!hideDefaultMenuItems && (
                <>
                  <button type="button" className="auth-menu-item" onClick={() => runProfileAction(onProfile)}>
                    Профиль
                  </button>
                  <button type="button" className="auth-menu-item auth-menu-item-danger" onClick={handleLogout}>
                    Выйти
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!botUsername) {
    return (
      <div className={`telegram-auth-inline auth-missing-state ${className ?? ''}`}>
        Вход через Telegram не настроен.
      </div>
    );
  }

  return (
    <div className={`telegram-auth-inline ${className ?? ''}`} title={error ?? undefined}>
      <div key={widgetVersion} className="telegram-auth-widget-slot auth-telegram-widget-shell" ref={widgetContainerRef} />
      {authInProgress && (
        <span className="ml-2 text-[11px] text-slate-500 dark:text-slate-400" aria-live="polite">
          Вход...
        </span>
      )}
    </div>
  );
}
