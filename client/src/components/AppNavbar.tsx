import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
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

const navItems = [
  { to: '/app', label: 'Главная' },
  { to: '/app/training', label: 'Тренировка' },
  { to: '/app/bank', label: 'Банк вопросов' },
  { to: '/app/interview', label: 'Интервью' },
  { to: '/app/self-presentation', label: 'Самопрезентация' }
];

export function AppNavbar({ theme, onToggleTheme, authEnabled, authUser, authLoading, onAuthChange }: Props) {
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="saas-header mb-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={() => navigate('/app')} className="inline-flex items-center gap-3 rounded-xl px-1 py-1 text-left transition hover:opacity-90">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-brand-500 to-accent-500 text-sm font-bold text-white">
              U
            </span>
            <span className="hidden sm:block">
              <span className="block text-sm font-semibold tracking-wide text-slate-900 dark:text-slate-100">UnityPrep Cards</span>
              <span className="block text-[11px] text-slate-500 dark:text-slate-400">Раздел приложения</span>
            </span>
          </button>

          <nav className="hidden items-center gap-1 lg:flex">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/app'}
                className={({ isActive }) => `header-nav-link ${isActive ? 'header-nav-link-active' : ''}`}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
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
          {authEnabled && (
            <TelegramAuthControl
              user={authUser}
              loading={authLoading}
              onUserChange={onAuthChange}
              hideDefaultMenuItems
              menuItems={[
                { label: 'Главная', onSelect: () => navigate('/app') },
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
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/app'}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) => `header-nav-link ${isActive ? 'header-nav-link-active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      )}
    </header>
  );
}
