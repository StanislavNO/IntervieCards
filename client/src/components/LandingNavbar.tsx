import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { TelegramAuthControl } from './TelegramAuthControl';
import type { AuthUser } from '../types';

type Props = {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  authEnabled: boolean;
  authUser: AuthUser | null;
  authLoading: boolean;
  onAuthChange: (user: AuthUser | null) => void;
};

export function LandingNavbar({ theme, onToggleTheme, authEnabled, authUser, authLoading, onAuthChange }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const continueLabel = authUser ? 'Продолжить' : 'В приложение';

  return (
    <nav className="saas-header mb-14">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="inline-flex items-center gap-3 text-left">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-brand-500 to-accent-500 text-sm font-bold text-white">
              U
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-semibold tracking-wide text-slate-900 dark:text-slate-100">UnityPrep Cards</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Подготовка к интервью Unity</p>
            </div>
          </button>

          <div className="hidden items-center gap-1 lg:flex">
            <a href="#demo" className="header-nav-link">
              Демо
            </a>
            <a href="#features" className="header-nav-link">
              Возможности
            </a>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            role="switch"
            aria-checked={theme === 'dark'}
            onClick={onToggleTheme}
            aria-label="Переключить тему"
            className="header-theme-toggle"
          >
            {theme === 'light' ? '☀' : '☾'}
          </button>

          <Link to="/app" className="cta-button px-4 py-2 text-xs font-semibold">
            {continueLabel}
          </Link>

          {authEnabled && (
            <TelegramAuthControl
              user={authUser}
              loading={authLoading}
              onUserChange={onAuthChange}
              hideDefaultMenuItems
              menuItems={[
                { label: 'Главная', onSelect: () => navigate('/app') },
                { label: 'Тренировка', onSelect: () => navigate('/app/training') },
                { label: 'Банк вопросов', onSelect: () => navigate('/app/bank') },
                { label: 'Выйти', onSelect: () => undefined, danger: true, kind: 'logout' }
              ]}
              className="shrink-0"
            />
          )}

          <button type="button" onClick={() => setMobileOpen((prev) => !prev)} className="header-mobile-toggle lg:hidden" aria-expanded={mobileOpen}>
            Меню
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="header-mobile-panel lg:hidden">
          <a href="#demo" onClick={() => setMobileOpen(false)} className="header-nav-link">
            Демо
          </a>
          <a href="#features" onClick={() => setMobileOpen(false)} className="header-nav-link">
            Возможности
          </a>
          <Link to="/app" onClick={() => setMobileOpen(false)} className="header-nav-link">
            {continueLabel}
          </Link>
        </div>
      )}
    </nav>
  );
}
