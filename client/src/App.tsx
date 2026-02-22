import { useEffect, useMemo, useState } from 'react';
import { authApi } from './api';
import { clearStoredAuthToken, getStoredAuthToken, getTelegramBotUsername } from './auth';
import { PracticeWorkspace } from './components/PracticeWorkspace';
import { TelegramAuthControl } from './components/TelegramAuthControl';
import type { AuthUser } from './types';
import { difficultyLabel, tagCategoryClass } from './utils/cardPresentation';

type Theme = 'light' | 'dark';
type PracticeView = 'browse' | 'study';
type AppRoute = { page: 'landing' } | { page: 'practice'; view: PracticeView };

type DemoCard = {
  question: string;
  answer: string;
  snippet: string;
  topic: string;
  tags: string[];
  difficulty: 'easy' | 'medium' | 'hard';
};

const themeStorageKey = 'unityprep-theme';

const demoCards: DemoCard[] = [
  {
    topic: 'Жизненный цикл',
    difficulty: 'easy',
    tags: ['C#', 'Architecture'],
    question: 'В чем разница между Start() и Awake() в Unity?',
    answer:
      'Awake вызывается при загрузке объекта и подходит для ранней инициализации. Start вызывается перед первым Update, когда компонент уже активен.',
    snippet: 'void Awake() { CacheComponents(); }\\nvoid Start() { InitializeGameplay(); }'
  },
  {
    topic: 'Физика',
    difficulty: 'medium',
    tags: ['Physics', 'Rendering'],
    question: 'Почему для физики лучше использовать FixedUpdate()?',
    answer:
      'FixedUpdate работает с фиксированным шагом времени. Это дает стабильный расчет сил и столкновений независимо от FPS.',
    snippet: 'void FixedUpdate() {\\n  rb.AddForce(move * speed, ForceMode.Acceleration);\\n}'
  },
  {
    topic: 'Производительность',
    difficulty: 'hard',
    tags: ['Architecture', 'ECS'],
    question: 'Зачем кэшировать GetComponent() в Unity?',
    answer:
      'Повторные вызовы GetComponent в Update стоят дорого. Кэширование ссылки снижает нагрузку на CPU в горячих местах.',
    snippet: 'private Rigidbody rb;\\nvoid Awake() => rb = GetComponent<Rigidbody>();'
  }
];

const features = [
  {
    title: 'Подборка по C#',
    text: 'Целевые вопросы по C#, архитектуре и паттернам, которые реально спрашивают на Unity-интервью.'
  },
  {
    title: 'Специфика Unity',
    text: 'Практика по жизненному циклу, физике, рендеру, UI и оптимизации прямо в формате Unity-задач.'
  },
  {
    title: 'Отслеживание прогресса',
    text: 'Отмечай сложные темы, повторяй по тегам и тренируй слабые места перед каждым собеседованием.'
  }
];

function detectInitialTheme(): Theme {
  const stored = localStorage.getItem(themeStorageKey);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function parseRouteFromLocation(): AppRoute {
  const params = new URLSearchParams(window.location.search);
  const page = params.get('page');
  const view = params.get('view');

  if (page === 'practice') {
    return { page: 'practice', view: view === 'browse' ? 'browse' : 'study' };
  }

  return { page: 'landing' };
}

function writeRoute(route: AppRoute, replace = false): void {
  const url = new URL(window.location.href);

  if (route.page === 'practice') {
    url.searchParams.set('page', 'practice');
    url.searchParams.set('view', route.view);
  } else {
    url.searchParams.delete('page');
    url.searchParams.delete('view');
  }

  const method = replace ? 'replaceState' : 'pushState';
  window.history[method]({}, '', `${url.pathname}${url.search}${url.hash}`);
}

export default function App() {
  const initialRoute = parseRouteFromLocation();
  const authEnabled = Boolean(getTelegramBotUsername());
  const [theme, setTheme] = useState<Theme>(detectInitialTheme);
  const [isRevealed, setIsRevealed] = useState(false);
  const [cardIndex, setCardIndex] = useState(0);
  const [isPracticeOpen, setIsPracticeOpen] = useState(initialRoute.page === 'practice');
  const [practiceInitialView, setPracticeInitialView] = useState<PracticeView>(
    initialRoute.page === 'practice' ? initialRoute.view : 'study'
  );
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

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
    const handlePopState = () => {
      const route = parseRouteFromLocation();
      if (route.page === 'practice') {
        setPracticeInitialView(route.view);
        setIsPracticeOpen(true);
        return;
      }

      setIsPracticeOpen(false);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const card = useMemo(() => demoCards[cardIndex], [cardIndex]);

  function toggleTheme() {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }

  function showNextCard() {
    setIsRevealed(false);
    setCardIndex((prev) => (prev + 1) % demoCards.length);
  }

  function openPractice(view: PracticeView) {
    setHeaderMenuOpen(false);
    setPracticeInitialView(view);
    setIsPracticeOpen(true);
    writeRoute({ page: 'practice', view });
  }

  function closePractice() {
    setIsPracticeOpen(false);
    writeRoute({ page: 'landing' });
  }

  function handlePracticeViewChange(view: PracticeView) {
    setPracticeInitialView(view);
    writeRoute({ page: 'practice', view }, true);
  }

  if (isPracticeOpen) {
    return (
      <PracticeWorkspace
        initialView={practiceInitialView}
        theme={theme}
        onToggleTheme={toggleTheme}
        onBack={closePractice}
        onViewModeChange={handlePracticeViewChange}
        authUser={authUser}
        authLoading={authLoading}
        authEnabled={authEnabled}
        onAuthChange={setAuthUser}
      />
    );
  }

  return (
    <div className="relative isolate overflow-x-hidden">
      <div className="pointer-events-none fixed inset-0 z-0 bg-grid" />
      <div className="pointer-events-none fixed inset-0 z-0 bg-mesh" />
      <div className="pointer-events-none fixed inset-0 z-0 bg-particles" />
      <div className="pointer-events-none fixed inset-x-0 top-[-240px] z-0 h-[560px] bg-[radial-gradient(circle_at_top,_rgba(47,123,255,0.22),_transparent_62%)] dark:bg-[radial-gradient(circle_at_top,_rgba(138,109,255,0.25),_transparent_62%)]" />

      <div className="relative z-10 mx-auto min-h-screen max-w-6xl px-6 pb-20 pt-6 lg:px-10">
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
                <button type="button" onClick={() => openPractice('browse')} className="header-nav-link">
                  Банк вопросов
                </button>
                <button type="button" onClick={() => openPractice('study')} className="header-nav-link">
                  Тренировка
                </button>
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
                onClick={toggleTheme}
                aria-label="Переключить тему"
                className="header-theme-toggle"
              >
                {theme === 'light' ? '☀' : '☾'}
              </button>

              {authEnabled && (
                <TelegramAuthControl
                  user={authUser}
                  loading={authLoading}
                  onUserChange={setAuthUser}
                  className="shrink-0"
                />
              )}

              <button
                type="button"
                onClick={() => setHeaderMenuOpen((prev) => !prev)}
                className="header-mobile-toggle"
                aria-expanded={headerMenuOpen}
              >
                Меню
              </button>
            </div>
          </div>

          {headerMenuOpen && (
            <div className="header-mobile-panel">
              <button type="button" onClick={() => openPractice('browse')} className="header-nav-link text-left">
                Банк вопросов
              </button>
              <button type="button" onClick={() => openPractice('study')} className="header-nav-link text-left">
                Тренировка
              </button>
              <a href="#demo" onClick={() => setHeaderMenuOpen(false)} className="header-nav-link">
                Демо
              </a>
              <a href="#features" onClick={() => setHeaderMenuOpen(false)} className="header-nav-link">
                Возможности
              </a>
            </div>
          )}
        </nav>

        <section id="demo" className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <p className="mb-3 inline-flex rounded-full border border-brand-300/60 bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand-600 dark:border-brand-500/40 dark:bg-brand-500/10 dark:text-brand-300">
              Платформа подготовки к интервью
            </p>
            <h1 className="text-balance text-4xl font-black leading-tight text-slate-900 dark:text-slate-100 md:text-6xl">
              Пройди Unity-интервью уверенно.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600 dark:text-slate-300 md:text-lg">
              Интерактивные карточки для Unity-разработчиков: C#, движок, оптимизация, архитектура и вопросы,
              которые чаще всего задают на собеседованиях.
            </p>

            <div className="mt-8 flex flex-wrap gap-3" id="start">
              <button
                type="button"
                onClick={() => openPractice('study')}
                className="cta-button px-5 py-3 text-sm"
              >
                Начать тренировку
              </button>
              <button
                type="button"
                onClick={() => openPractice('browse')}
                className="rounded-xl border border-slate-300 bg-white/75 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-brand-400 hover:text-brand-600 dark:border-slate-600 dark:bg-[#222838]/85 dark:text-slate-200 dark:hover:border-brand-400 dark:hover:text-brand-300"
              >
                Открыть банк вопросов
              </button>
            </div>
          </div>

          <div className="mx-auto w-full max-w-lg">
            <div className="mb-3 flex items-center justify-between text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <span>Демо-карточка</span>
              <span className="rounded-full border border-slate-300 px-2 py-1 text-[10px] text-slate-600 dark:border-slate-600 dark:text-slate-300">
                {card.topic}
              </span>
            </div>

            <div className="relative h-[370px] w-full [perspective:1400px]">
              <div
                className={`relative h-full w-full transition-transform duration-700 [transform-style:preserve-3d] ${
                  isRevealed ? '[transform:rotateY(180deg)]' : ''
                }`}
              >
                <article
                  className="flip-face absolute inset-0 flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-soft [transform:translateZ(0.1px)] dark:border-slate-700 dark:bg-[#1e2433]"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span className="difficulty-badge" data-difficulty={card.difficulty}>
                      {difficultyLabel(card.difficulty)}
                    </span>
                    <span className="rounded-full border border-slate-300 px-2 py-1 text-[10px] text-slate-600 dark:border-slate-600 dark:text-slate-300">
                      {card.topic}
                    </span>
                  </div>
                  <div className="mb-3 flex flex-wrap gap-2">
                    {card.tags.map((tag) => (
                      <span key={tag} className={`tag-chip ${tagCategoryClass(tag)}`}>
                        {tag}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Вопрос</p>
                  <h2 className="mt-4 text-2xl font-semibold leading-tight text-slate-900 dark:text-slate-100">{card.question}</h2>
                  <div className="mt-auto">
                    <button
                      type="button"
                      onClick={() => setIsRevealed(true)}
                      className="w-full rounded-xl bg-gradient-to-r from-brand-500 to-accent-500 px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900"
                    >
                      Показать ответ
                    </button>
                  </div>
                </article>

                <article
                  className="flip-face absolute inset-0 flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-soft [transform:rotateY(180deg)_translateZ(0.1px)] dark:border-slate-700 dark:bg-[#1e2433]"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Ответ</p>
                  <p className="mt-4 max-w-[68ch] text-sm leading-7 text-slate-700 dark:text-slate-200">{card.answer}</p>
                  <pre className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-slate-900/95 p-3 font-mono text-xs text-blue-100 dark:border-slate-600">
                    <code>{card.snippet}</code>
                  </pre>
                  <div className="mt-auto grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setIsRevealed(false)}
                      className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-brand-400 hover:text-brand-600 dark:border-slate-600 dark:bg-[#242a3a] dark:text-slate-200"
                    >
                      Назад
                    </button>
                    <button
                      type="button"
                      onClick={showNextCard}
                      className="rounded-xl bg-gradient-to-r from-brand-500 to-accent-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900"
                    >
                      Следующий вопрос
                    </button>
                  </div>
                </article>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="mt-24">
          <div className="mb-10 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-500">Почему UnityPrep</p>
            <h3 className="mt-3 text-3xl font-bold text-slate-900 dark:text-slate-100 md:text-4xl">
              Подготовка к интервью с фокусом на движок
            </h3>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {features.map((feature) => (
              <article
                key={feature.title}
                className="surface-panel p-6 transition hover:-translate-y-1"
              >
                <h4 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{feature.title}</h4>
                <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{feature.text}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
