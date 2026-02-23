import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { authApi } from './api';
import { clearStoredAuthToken, getStoredAuthToken, getTelegramBotUsername } from './auth';
import { AppNavbar } from './components/AppNavbar';
import { consumePostLoginRedirect, ProtectedRoute } from './components/ProtectedRoute';
import { AppDashboardPage } from './pages/AppDashboardPage';
import { AppPlaceholderPage } from './pages/AppPlaceholderPage';
import { BankPage } from './pages/BankPage';
import { LandingPage } from './pages/LandingPage';
import { TrainingPage } from './pages/TrainingPage';
import type { AuthUser } from './types';

type Theme = 'light' | 'dark';

const themeStorageKey = 'unityprep-theme';
const lastRouteStorageKey = 'unityprep-last-app-route';
const lastActivityStorageKey = 'unityprep-last-activity-at';

function detectInitialTheme(): Theme {
  const stored = localStorage.getItem(themeStorageKey);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}

function AppShell() {
  const authEnabled = Boolean(getTelegramBotUsername());
  const [theme, setTheme] = useState<Theme>(detectInitialTheme);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.dataset.theme = theme;
    localStorage.setItem(themeStorageKey, theme);
  }, [theme]);

  useEffect(() => {
    if (!authEnabled) {
      setAuthLoading(false);
      setAuthUser(null);
      return;
    }

    const token = getStoredAuthToken();
    if (!token) {
      setAuthLoading(false);
      return;
    }

    let cancelled = false;
    void authApi
      .me()
      .then(({ user }) => {
        if (!cancelled) {
          setAuthUser(user);
        }
      })
      .catch(() => {
        clearStoredAuthToken();
        if (!cancelled) {
          setAuthUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setAuthLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authEnabled]);

  useEffect(() => {
    if (!authUser) {
      return;
    }

    const redirectTo = consumePostLoginRedirect();
    if (redirectTo && redirectTo.startsWith('/app')) {
      navigate(redirectTo, { replace: true });
    }
  }, [authUser, navigate]);

  useEffect(() => {
    if (!location.pathname.startsWith('/app')) {
      return;
    }
    const fullPath = `${location.pathname}${location.search}${location.hash}`;
    localStorage.setItem(lastRouteStorageKey, fullPath);
    localStorage.setItem(lastActivityStorageKey, new Date().toISOString());
  }, [location.hash, location.pathname, location.search]);

  const handleAuthChange = useCallback((user: AuthUser | null) => {
    setAuthUser(user);
  }, []);

  const appLayoutProps = useMemo(
    () => ({
      theme,
      onToggleTheme: () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark')),
      authEnabled,
      authUser,
      authLoading,
      onAuthChange: handleAuthChange
    }),
    [authEnabled, authLoading, authUser, handleAuthChange, theme]
  );

  return (
    <Routes>
      <Route path="/" element={<LandingPage {...appLayoutProps} />} />

      <Route element={<ProtectedRoute authEnabled={authEnabled} authLoading={authLoading} user={authUser} />}>
        <Route element={<AppLayout {...appLayoutProps} />}>
          <Route path="/app" element={authUser ? <AppDashboardPage user={authUser} /> : null} />
          <Route path="/app/training" element={<TrainingPage {...appLayoutProps} />} />
          <Route path="/app/bank" element={<BankPage {...appLayoutProps} />} />
          <Route
            path="/app/interview"
            element={
              <AppPlaceholderPage
                title="Пробное интервью"
                description="Здесь будет полноценный режим имитации собеседования: сценарии, тайминг и аналитика ответов."
              />
            }
          />
          <Route
            path="/app/self-presentation"
            element={
              <AppPlaceholderPage
                title="Самопрезентация"
                description="Здесь будет конструктор самопрезентации с адаптацией под вакансии Unity Developer."
              />
            }
          />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

type AppLayoutProps = {
  theme: Theme;
  onToggleTheme: () => void;
  authEnabled: boolean;
  authUser: AuthUser | null;
  authLoading: boolean;
  onAuthChange: (user: AuthUser | null) => void;
};

function AppLayout({ theme, onToggleTheme, authEnabled, authUser, authLoading, onAuthChange }: AppLayoutProps) {
  return (
    <div className="relative isolate min-h-screen overflow-x-hidden">
      <div className="pointer-events-none fixed inset-0 z-0 bg-grid" />
      <div className="pointer-events-none fixed inset-0 z-0 bg-mesh" />
      <div className="pointer-events-none fixed inset-0 z-0 bg-particles" />
      <div className="pointer-events-none fixed inset-x-0 top-[-260px] z-0 h-[520px] bg-[radial-gradient(circle_at_top,_rgba(47,123,255,0.22),_transparent_62%)] dark:bg-[radial-gradient(circle_at_top,_rgba(138,109,255,0.25),_transparent_62%)]" />

      <div className="relative z-10 mx-auto max-w-7xl px-6 pb-10 pt-6 lg:px-10">
        <AppNavbar
          theme={theme}
          onToggleTheme={onToggleTheme}
          authEnabled={authEnabled}
          authUser={authUser}
          authLoading={authLoading}
          onAuthChange={onAuthChange}
        />
        <SubscriptionGate>
          <Outlet />
        </SubscriptionGate>
      </div>
    </div>
  );
}

function SubscriptionGate({ children }: { children: ReactNode }) {
  // Extension point: paywall/subscription gating can be added here later.
  return <>{children}</>;
}
