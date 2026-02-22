import { useEffect, useMemo, useState } from 'react';
import { PracticeWorkspace } from './components/PracticeWorkspace';

type Theme = 'light' | 'dark';
type PracticeView = 'browse' | 'study';

type DemoCard = {
  question: string;
  answer: string;
  snippet: string;
  topic: string;
};

const themeStorageKey = 'unityprep-theme';

const demoCards: DemoCard[] = [
  {
    topic: 'Жизненный цикл',
    question: 'В чем разница между Start() и Awake() в Unity?',
    answer:
      'Awake вызывается при загрузке объекта и подходит для ранней инициализации. Start вызывается перед первым Update, когда компонент уже активен.',
    snippet: 'void Awake() { CacheComponents(); }\\nvoid Start() { InitializeGameplay(); }'
  },
  {
    topic: 'Физика',
    question: 'Почему для физики лучше использовать FixedUpdate()?',
    answer:
      'FixedUpdate работает с фиксированным шагом времени. Это дает стабильный расчет сил и столкновений независимо от FPS.',
    snippet: 'void FixedUpdate() {\\n  rb.AddForce(move * speed, ForceMode.Acceleration);\\n}'
  },
  {
    topic: 'Производительность',
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

export default function App() {
  const [theme, setTheme] = useState<Theme>(detectInitialTheme);
  const [isRevealed, setIsRevealed] = useState(false);
  const [cardIndex, setCardIndex] = useState(0);
  const [isPracticeOpen, setIsPracticeOpen] = useState(false);
  const [practiceInitialView, setPracticeInitialView] = useState<PracticeView>('study');

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.dataset.theme = theme;
    localStorage.setItem(themeStorageKey, theme);
  }, [theme]);

  const card = useMemo(() => demoCards[cardIndex], [cardIndex]);

  function toggleTheme() {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }

  function showNextCard() {
    setIsRevealed(false);
    setCardIndex((prev) => (prev + 1) % demoCards.length);
  }

  function openPractice(view: PracticeView) {
    setPracticeInitialView(view);
    setIsPracticeOpen(true);
  }

  if (isPracticeOpen) {
    return (
      <PracticeWorkspace
        initialView={practiceInitialView}
        theme={theme}
        onToggleTheme={toggleTheme}
        onBack={() => setIsPracticeOpen(false)}
      />
    );
  }

  return (
    <div className="relative overflow-hidden bg-zinc-100 dark:bg-[#161922]">
      <div className="pointer-events-none absolute inset-0 bg-grid" />
      <div className="pointer-events-none absolute inset-x-0 top-[-240px] h-[560px] bg-[radial-gradient(circle_at_top,_rgba(47,123,255,0.22),_transparent_62%)] dark:bg-[radial-gradient(circle_at_top,_rgba(138,109,255,0.25),_transparent_62%)]" />

      <div className="relative mx-auto min-h-screen max-w-6xl px-6 pb-20 pt-6 lg:px-10">
        <nav className="mb-14 flex items-center justify-between rounded-2xl border border-slate-200/70 bg-white/70 px-5 py-3 shadow-soft backdrop-blur dark:border-slate-700/60 dark:bg-[#1d212d]/80">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-accent-500 text-lg font-bold text-white">
              U
            </div>
            <div>
              <p className="text-sm font-semibold tracking-wide text-slate-900 dark:text-slate-100">UnityPrep Cards</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Подготовка к интервью для Unity-разработчиков</p>
            </div>
          </div>

          <div className="hidden items-center gap-8 text-sm font-medium text-slate-600 dark:text-slate-300 md:flex">
            <a href="#demo" className="transition hover:text-brand-500">
              Демо
            </a>
            <a href="#features" className="transition hover:text-brand-500">
              Возможности
            </a>
            <a href="#start" className="transition hover:text-brand-500">
              Старт
            </a>
          </div>

          <div className="inline-flex shrink-0 items-center gap-3 rounded-full border border-slate-300/80 bg-white px-3 py-1.5 shadow-sm dark:border-slate-600 dark:bg-[#242a39]">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Тема</span>
            <button
              type="button"
              role="switch"
              aria-checked={theme === 'dark'}
              onClick={toggleTheme}
              aria-label="Переключить тему"
              className="relative h-7 w-14 rounded-full bg-slate-300 transition dark:bg-brand-500/60"
            >
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-700">L</span>
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-100">D</span>
              <span
                className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-300 ${
                  theme === 'dark' ? 'translate-x-7' : 'translate-x-0.5'
                } left-0.5`}
              />
            </button>
          </div>
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
                className="rounded-xl bg-gradient-to-r from-brand-500 to-accent-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-500/30 transition hover:brightness-110"
              >
                Начать тренировку
              </button>
              <button
                type="button"
                onClick={() => openPractice('browse')}
                className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-brand-400 hover:text-brand-600 dark:border-slate-600 dark:bg-[#222838] dark:text-slate-200 dark:hover:border-brand-400 dark:hover:text-brand-300"
              >
                Открыть наборы вопросов
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
                <article className="absolute inset-0 flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-soft [backface-visibility:hidden] dark:border-slate-700 dark:bg-[#1e2433]">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Вопрос</p>
                  <h2 className="mt-4 text-2xl font-semibold leading-tight text-slate-900 dark:text-slate-100">{card.question}</h2>
                  <div className="mt-auto">
                    <button
                      type="button"
                      onClick={() => setIsRevealed(true)}
                      className="w-full rounded-xl bg-gradient-to-r from-brand-500 to-accent-500 px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110"
                    >
                      Показать ответ
                    </button>
                  </div>
                </article>

                <article className="absolute inset-0 flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-soft [backface-visibility:hidden] [transform:rotateY(180deg)] dark:border-slate-700 dark:bg-[#1e2433]">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Ответ</p>
                  <p className="mt-4 text-sm leading-relaxed text-slate-700 dark:text-slate-200">{card.answer}</p>
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
                      className="rounded-xl bg-gradient-to-r from-brand-500 to-accent-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
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
                className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-soft transition hover:-translate-y-1 hover:border-brand-300 dark:border-slate-700 dark:bg-[#1d2231]"
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
