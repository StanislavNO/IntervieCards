import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LandingNavbar } from '../components/LandingNavbar';
import type { AuthUser } from '../types';
import { difficultyLabel, tagCategoryClass } from '../utils/cardPresentation';

type Theme = 'light' | 'dark';

type DemoCard = {
  question: string;
  answer: string;
  snippet: string;
  topic: string;
  tags: string[];
  difficulty: 'easy' | 'medium' | 'hard';
};

type Props = {
  theme: Theme;
  onToggleTheme: () => void;
  authEnabled: boolean;
  authUser: AuthUser | null;
  authLoading: boolean;
  onAuthChange: (user: AuthUser | null) => void;
};

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

export function LandingPage({ theme, onToggleTheme, authEnabled, authUser, authLoading, onAuthChange }: Props) {
  const [isRevealed, setIsRevealed] = useState(false);
  const [cardIndex, setCardIndex] = useState(0);
  const location = useLocation();
  const card = useMemo(() => demoCards[cardIndex], [cardIndex]);
  const authRequired = Boolean((location.state as { authRequired?: boolean } | null)?.authRequired);

  function showNextCard() {
    setIsRevealed(false);
    setCardIndex((prev) => (prev + 1) % demoCards.length);
  }

  return (
    <div className="relative isolate overflow-x-hidden">
      <div className="pointer-events-none fixed inset-0 z-0 bg-grid" />
      <div className="pointer-events-none fixed inset-0 z-0 bg-mesh" />
      <div className="pointer-events-none fixed inset-0 z-0 bg-particles" />
      <div className="pointer-events-none fixed inset-x-0 top-[-240px] z-0 h-[560px] bg-[radial-gradient(circle_at_top,_rgba(47,123,255,0.22),_transparent_62%)] dark:bg-[radial-gradient(circle_at_top,_rgba(138,109,255,0.25),_transparent_62%)]" />

      <div className="relative z-10 mx-auto min-h-screen max-w-6xl px-6 pb-20 pt-6 lg:px-10">
        <LandingNavbar
          theme={theme}
          onToggleTheme={onToggleTheme}
          authEnabled={authEnabled}
          authUser={authUser}
          authLoading={authLoading}
          onAuthChange={onAuthChange}
        />

        {authRequired && authEnabled && !authUser && (
          <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50/80 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
            Для перехода в приложение выполните вход через Telegram.
          </div>
        )}

        <section id="demo" className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <p className="mb-3 inline-flex rounded-full border border-brand-300/60 bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand-600 dark:border-brand-500/40 dark:bg-brand-500/10 dark:text-brand-300">
              Платформа подготовки к интервью
            </p>
            <h1 className="text-balance text-4xl font-black leading-tight text-slate-900 dark:text-slate-100 md:text-6xl">
              Пройди Unity-интервью уверенно.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600 dark:text-slate-300 md:text-lg">
              Интерактивные карточки для Unity-разработчиков: C#, движок, оптимизация, архитектура и вопросы, которые чаще всего задают на собеседованиях.
            </p>

            <div className="mt-8 flex flex-wrap gap-3" id="start">
              <Link to="/app/training" className="cta-button px-5 py-3 text-sm">
                Начать тренировку
              </Link>
              <Link
                to="/app/bank"
                className="rounded-xl border border-slate-300 bg-white/75 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-brand-400 hover:text-brand-600 dark:border-slate-600 dark:bg-[#222838]/85 dark:text-slate-200 dark:hover:border-brand-400 dark:hover:text-brand-300"
              >
                Открыть банк вопросов
              </Link>
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
                <article className="flip-face absolute inset-0 flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-soft [transform:translateZ(0.1px)] dark:border-slate-700 dark:bg-[#1e2433]">
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

                <article className="flip-face absolute inset-0 flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-soft [transform:rotateY(180deg)_translateZ(0.1px)] dark:border-slate-700 dark:bg-[#1e2433]">
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
            <h3 className="mt-3 text-3xl font-bold text-slate-900 dark:text-slate-100 md:text-4xl">Подготовка к интервью с фокусом на движок</h3>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {features.map((feature) => (
              <article key={feature.title} className="surface-panel p-6 transition hover:-translate-y-1">
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
