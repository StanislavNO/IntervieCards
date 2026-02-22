import { useEffect, useRef, useState } from 'react';
import { authApi } from '../api';
import { clearStoredAuthToken, getTelegramBotUsername, setStoredAuthToken } from '../auth';
import type { AuthUser, TelegramAuthPayload } from '../types';

type Props = {
  user: AuthUser | null;
  loading?: boolean;
  onUserChange: (user: AuthUser | null) => void;
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

export function TelegramAuthControl({ user, loading = false, onUserChange }: Props) {
  const widgetContainerRef = useRef<HTMLDivElement | null>(null);
  const callbackNameRef = useRef(`unityprepTelegramAuth_${Math.random().toString(36).slice(2)}`);
  const [authInProgress, setAuthInProgress] = useState(false);
  const [widgetVersion, setWidgetVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const botUsername = getTelegramBotUsername();

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
    script.setAttribute('data-radius', '10');
    script.setAttribute('data-request-access', 'write');
    script.setAttribute('data-lang', 'ru');
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
  }

  if (loading) {
    return (
      <div className="telegram-auth-inline rounded-xl border border-slate-300 bg-white/70 px-3 py-2 text-xs text-slate-500 dark:border-slate-600 dark:bg-[#252b3a]/80 dark:text-slate-300">
        Проверка сессии...
      </div>
    );
  }

  if (user) {
    return (
      <div className="telegram-auth-inline flex items-center gap-2 rounded-xl border border-slate-300 bg-white/75 px-2 py-1.5 dark:border-slate-600 dark:bg-[#252b3a]/80">
        <div className="flex items-center gap-2 px-1">
          {user.photoUrl ? (
            <img src={user.photoUrl} alt="Avatar" className="h-8 w-8 rounded-full border border-slate-300/80 object-cover dark:border-slate-500/80" />
          ) : (
            <div className="grid h-8 w-8 place-items-center rounded-full bg-brand-500/15 text-xs font-bold text-brand-700 dark:bg-brand-400/20 dark:text-brand-200">
              {user.firstName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <span className="max-w-[140px] truncate text-xs font-semibold text-slate-700 dark:text-slate-200">{displayName(user)}</span>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="rounded-lg border border-slate-300 bg-white/80 px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:border-brand-400 hover:text-brand-600 dark:border-slate-600 dark:bg-[#1f2534] dark:text-slate-200"
        >
          Выйти
        </button>
      </div>
    );
  }

  if (!botUsername) {
    return (
      <div className="telegram-auth-inline rounded-xl border border-amber-300 bg-amber-50/90 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-300">
        Вход через Telegram не настроен.
      </div>
    );
  }

  return (
    <div className="telegram-auth-inline" title={error ?? undefined}>
      <div key={widgetVersion} className="telegram-auth-widget-slot" ref={widgetContainerRef} />
      {authInProgress && (
        <span className="ml-2 text-[11px] text-slate-500 dark:text-slate-400" aria-live="polite">
          Вход...
        </span>
      )}
    </div>
  );
}
