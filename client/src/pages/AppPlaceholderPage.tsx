import { Link } from 'react-router-dom';

type Props = {
  title: string;
  description: string;
};

export function AppPlaceholderPage({ title, description }: Props) {
  return (
    <section className="surface-panel p-8">
      <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">В разработке</p>
      <h1 className="mt-2 text-3xl font-semibold text-slate-900 dark:text-slate-100">{title}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300">{description}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link to="/app" className="rounded-xl border border-slate-300 bg-white/75 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-brand-400 hover:text-brand-600 dark:border-slate-600 dark:bg-[#252b3a]/80 dark:text-slate-200">
          На главную
        </Link>
        <Link to="/app/training" className="cta-button px-4 py-2 text-sm">
          Открыть тренировку
        </Link>
      </div>
    </section>
  );
}
