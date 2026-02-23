import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { AuthUser } from '../types';

export const postLoginRedirectStorageKey = 'unityprep-post-login-redirect';

type Props = {
  authEnabled: boolean;
  authLoading: boolean;
  user: AuthUser | null;
};

function rememberRedirect(path: string) {
  sessionStorage.setItem(postLoginRedirectStorageKey, path);
}

export function consumePostLoginRedirect(): string | null {
  const value = sessionStorage.getItem(postLoginRedirectStorageKey);
  if (!value) {
    return null;
  }
  sessionStorage.removeItem(postLoginRedirectStorageKey);
  return value;
}

export function ProtectedRoute({ authEnabled, authLoading, user }: Props) {
  const location = useLocation();

  if (authLoading) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-6xl items-center justify-center px-6 text-sm text-slate-500 dark:text-slate-400">
        Проверка сессии...
      </div>
    );
  }

  // Dev fallback: if Telegram auth is not configured, keep app area reachable.
  if (!authEnabled) {
    return <Outlet />;
  }

  if (!user) {
    rememberRedirect(`${location.pathname}${location.search}${location.hash}`);
    return <Navigate to="/" replace state={{ authRequired: true }} />;
  }

  return <Outlet />;
}
