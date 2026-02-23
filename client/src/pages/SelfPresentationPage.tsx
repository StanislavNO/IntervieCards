import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { selfPresentationApi } from '../api';
import type { AuthUser } from '../types';
import {
  blockMeta,
  buildChatGptPrompt,
  buildPreviewText,
  createEmptyJob,
  createInitialBuilderData,
  createJobBlocks,
  evaluateQuality,
  hasBlockType,
  loadBuilderData,
  nextDuration,
  saveBuilderData,
  withOrderedBlocks
} from '../self-presentation/logic';
import { LIBRARY_BLOCKS, WATER_WORDS } from '../self-presentation/templates';
import type { JobStory, SelfPresentationBuilderData, StoryBlock, StoryBlockType } from '../self-presentation/types';

type Props = {
  authUser: AuthUser | null;
};

type MobileTab = 'library' | 'builder' | 'preview';
type BlockSignal = 'neutral' | 'good' | 'warning';
type BlockDiagnostics = {
  signal: BlockSignal;
  tags: string[];
};

function sortBlocks(blocks: StoryBlock[]): StoryBlock[] {
  return [...blocks].sort((left, right) => left.order - right.order);
}

function storyBlockTitle(type: StoryBlockType): string {
  return blockMeta(type)?.title ?? type;
}

function blockDescription(block: StoryBlock, jobsById: Record<string, JobStory>): string {
  if (!block.jobId) {
    return blockMeta(block.type)?.description ?? '';
  }

  const job = jobsById[block.jobId];
  if (!job) {
    return 'Работа удалена';
  }

  const company = job.company.trim() || 'Новая компания';
  const project = job.project.trim() || 'новый проект';
  return `${company} · ${project}`;
}

function arrayMove<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  const copy = [...items];
  const [moved] = copy.splice(fromIndex, 1);
  copy.splice(toIndex, 0, moved);
  return copy;
}

function normalizeLines(values: string[]): string[] {
  return values.map((item) => item.trim()).filter((item) => item.length > 0);
}

function findWaterWords(text: string): string[] {
  const escaped = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return WATER_WORDS.filter((word) => {
    const pattern = escaped(word.trim().toLowerCase()).replace(/\s+/g, '\\s+');
    const regex = new RegExp(`(^|[^\\p{L}\\p{N}])${pattern}(?=$|[^\\p{L}\\p{N}])`, 'iu');
    return regex.test(text.toLowerCase());
  });
}

function collectBlockText(block: StoryBlock, builder: SelfPresentationBuilderData, jobsById: Record<string, JobStory>): string {
  const job = block.jobId ? jobsById[block.jobId] : null;

  if (block.type === 'greeting') {
    return [builder.profile.name, builder.profile.yearsOfExperience].join(' ');
  }
  if (block.type === 'reasonForSearch') {
    return builder.profile.reasonForSearch;
  }
  if (block.type === 'targetRoleOutro') {
    return builder.profile.targetRoleOutro;
  }
  if (!job) {
    return '';
  }
  if (block.type === 'workExperience') {
    return [job.company, job.project, job.genrePlatform, job.mechanicsSummary].join(' ');
  }
  if (block.type === 'responsibilities') {
    return normalizeLines(job.responsibilities).join(' ');
  }
  return normalizeLines(job.achievements).join(' ');
}

function isBlockFilled(block: StoryBlock, builder: SelfPresentationBuilderData, jobsById: Record<string, JobStory>): boolean {
  const job = block.jobId ? jobsById[block.jobId] : null;

  if (block.type === 'greeting') {
    return builder.profile.name.trim().length > 1 && builder.profile.yearsOfExperience.trim().length > 0;
  }
  if (block.type === 'reasonForSearch') {
    return builder.profile.reasonForSearch.trim().length >= 12;
  }
  if (block.type === 'targetRoleOutro') {
    return builder.profile.targetRoleOutro.trim().length >= 12;
  }
  if (!job) {
    return false;
  }
  if (block.type === 'workExperience') {
    return (
      job.company.trim().length > 1 &&
      job.project.trim().length > 1 &&
      job.genrePlatform.trim().length > 1 &&
      job.mechanicsSummary.trim().length >= 12
    );
  }
  if (block.type === 'responsibilities') {
    return normalizeLines(job.responsibilities).length >= 1;
  }
  return normalizeLines(job.achievements).length >= 1;
}

function getBlockDiagnostics(block: StoryBlock, builder: SelfPresentationBuilderData, jobsById: Record<string, JobStory>): BlockDiagnostics {
  const sourceText = collectBlockText(block, builder, jobsById);
  const waterWords = findWaterWords(sourceText);
  const filled = isBlockFilled(block, builder, jobsById);

  if (waterWords.length > 0) {
    const shown = waterWords.slice(0, 2).join(', ');
    const suffix = waterWords.length > 2 ? '…' : '';
    return {
      signal: 'warning',
      tags: [`Слова-паразиты: ${shown}${suffix}`]
    };
  }

  if (filled) {
    return {
      signal: 'good',
      tags: ['Заполнен']
    };
  }

  return {
    signal: 'neutral',
    tags: []
  };
}

export function SelfPresentationPage({ authUser }: Props) {
  const [builder, setBuilder] = useState<SelfPresentationBuilderData>(() => loadBuilderData(authUser));
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>('builder');
  const [draggingBlockId, setDraggingBlockId] = useState<string | null>(null);
  const [dragOverBlockId, setDragOverBlockId] = useState<string | null>(null);

  const [promptOpen, setPromptOpen] = useState(false);
  const [promptText, setPromptText] = useState('');
  const [proModalOpen, setProModalOpen] = useState(false);
  const [proStatus, setProStatus] = useState<string | null>(null);
  const [proLoading, setProLoading] = useState(false);

  useEffect(() => {
    if (!selectedBlockId && builder.storyBlocks.length > 0) {
      setSelectedBlockId(sortBlocks(builder.storyBlocks)[0]?.id ?? null);
    }
  }, [builder.storyBlocks, selectedBlockId]);

  useEffect(() => {
    saveBuilderData(builder);
  }, [builder]);

  useEffect(() => {
    if (!authUser) {
      return;
    }

    setBuilder((prev) => {
      if (prev.profile.name.trim().length > 0) {
        return prev;
      }
      const fallback = createInitialBuilderData(authUser);
      return {
        ...prev,
        profile: {
          ...prev.profile,
          name: fallback.profile.name
        },
        updatedAt: new Date().toISOString()
      };
    });
  }, [authUser]);

  const orderedBlocks = useMemo(() => sortBlocks(builder.storyBlocks), [builder.storyBlocks]);
  const jobsById = useMemo(() => Object.fromEntries(builder.jobs.map((job) => [job.id, job])), [builder.jobs]);
  const selectedBlock = useMemo(() => orderedBlocks.find((block) => block.id === selectedBlockId) ?? null, [orderedBlocks, selectedBlockId]);
  const previewText = useMemo(() => buildPreviewText(builder), [builder]);
  const quality = useMemo(() => evaluateQuality(builder, previewText), [builder, previewText]);
  const blockDiagnosticsById = useMemo(() => {
    const entries = orderedBlocks.map((block) => [block.id, getBlockDiagnostics(block, builder, jobsById)] as const);
    return Object.fromEntries(entries) as Record<string, BlockDiagnostics>;
  }, [orderedBlocks, builder, jobsById]);

  function commit(nextData: SelfPresentationBuilderData) {
    setBuilder({
      ...nextData,
      storyBlocks: withOrderedBlocks(nextData.storyBlocks),
      updatedAt: new Date().toISOString()
    });
  }

  function updateProfile(field: keyof SelfPresentationBuilderData['profile'], value: string) {
    commit({
      ...builder,
      profile: {
        ...builder.profile,
        [field]: value
      }
    });
  }

  function updateJob(jobId: string, patch: Partial<JobStory>) {
    commit({
      ...builder,
      jobs: builder.jobs.map((job) => (job.id === jobId ? { ...job, ...patch } : job))
    });
  }

  function updateJobList(jobId: string, field: 'responsibilities' | 'achievements', value: string[]) {
    updateJob(jobId, { [field]: value } as Pick<JobStory, 'responsibilities' | 'achievements'>);
  }

  function addJob() {
    const newJob = createEmptyJob();
    const newBlocks = createJobBlocks(newJob.id);

    const sorted = sortBlocks(builder.storyBlocks);
    const closingIndex = sorted.findIndex((block) => block.type === 'reasonForSearch');
    const insertionIndex = closingIndex === -1 ? sorted.length : closingIndex;

    const nextBlocks = [...sorted.slice(0, insertionIndex), ...newBlocks, ...sorted.slice(insertionIndex)];

    commit({
      ...builder,
      jobs: [newJob, ...builder.jobs],
      storyBlocks: nextBlocks
    });

    setSelectedBlockId(newBlocks[0]?.id ?? null);
    setMobileTab('builder');
  }

  function removeJob(jobId: string) {
    const nextJobs = builder.jobs.filter((job) => job.id !== jobId);
    const nextBlocks = builder.storyBlocks.filter((block) => block.jobId !== jobId);

    if (nextJobs.length === 0) {
      const fallbackJob = createEmptyJob();
      const fallbackBlocks = createJobBlocks(fallbackJob.id);
      commit({
        ...builder,
        jobs: [fallbackJob],
        storyBlocks: [...nextBlocks, ...fallbackBlocks]
      });
      setSelectedBlockId(fallbackBlocks[0]?.id ?? null);
      return;
    }

    commit({
      ...builder,
      jobs: nextJobs,
      storyBlocks: nextBlocks
    });

    if (selectedBlock?.jobId === jobId) {
      const first = sortBlocks(nextBlocks)[0];
      setSelectedBlockId(first?.id ?? null);
    }
  }

  function addBlock(type: StoryBlockType) {
    const meta = blockMeta(type);
    if (!meta) {
      return;
    }

    if (!meta.repeatable && hasBlockType(builder, type)) {
      return;
    }

    let jobId: string | undefined;

    if (meta.jobScoped) {
      if (builder.jobs.length === 0) {
        addJob();
        return;
      }
      jobId = builder.jobs[0]?.id;
    }

    const newBlock: StoryBlock = {
      id: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `block-${Date.now()}`,
      type,
      enabled: true,
      order: 0,
      jobId
    };

    const sorted = sortBlocks(builder.storyBlocks);
    const insertionIndex = meta.jobScoped
      ? sorted.findIndex((block) => block.type === 'reasonForSearch')
      : sorted.findIndex((block) => block.type === 'targetRoleOutro');

    const safeInsertionIndex = insertionIndex === -1 ? sorted.length : insertionIndex;
    const nextBlocks = [...sorted.slice(0, safeInsertionIndex), newBlock, ...sorted.slice(safeInsertionIndex)];

    commit({
      ...builder,
      storyBlocks: nextBlocks
    });

    setSelectedBlockId(newBlock.id);
    setMobileTab('builder');
  }

  function removeBlock(blockId: string) {
    const block = builder.storyBlocks.find((entry) => entry.id === blockId);
    if (!block) {
      return;
    }

    const meta = blockMeta(block.type);
    if (meta?.required) {
      return;
    }

    const next = builder.storyBlocks.filter((entry) => entry.id !== blockId);
    commit({
      ...builder,
      storyBlocks: next
    });

    if (selectedBlockId === blockId) {
      setSelectedBlockId(sortBlocks(next)[0]?.id ?? null);
    }
  }

  function toggleBlock(blockId: string) {
    const target = builder.storyBlocks.find((entry) => entry.id === blockId);
    if (!target) {
      return;
    }

    const meta = blockMeta(target.type);
    if (meta?.required) {
      return;
    }

    commit({
      ...builder,
      storyBlocks: builder.storyBlocks.map((entry) => (entry.id === blockId ? { ...entry, enabled: !entry.enabled } : entry))
    });
  }

  function handleDragStart(blockId: string) {
    setDraggingBlockId(blockId);
    setDragOverBlockId(blockId);
  }

  function handleDrop(blockId: string) {
    if (!draggingBlockId || draggingBlockId === blockId) {
      setDraggingBlockId(null);
      setDragOverBlockId(null);
      return;
    }

    const sorted = sortBlocks(builder.storyBlocks);
    const fromIndex = sorted.findIndex((entry) => entry.id === draggingBlockId);
    const toIndex = sorted.findIndex((entry) => entry.id === blockId);

    if (fromIndex < 0 || toIndex < 0) {
      setDraggingBlockId(null);
      setDragOverBlockId(null);
      return;
    }

    const moved = arrayMove(sorted, fromIndex, toIndex);
    commit({
      ...builder,
      storyBlocks: moved
    });

    setDraggingBlockId(null);
    setDragOverBlockId(null);
  }

  function resetBuilder() {
    const fresh = createInitialBuilderData(authUser);
    commit(fresh);
    setSelectedBlockId(sortBlocks(fresh.storyBlocks)[0]?.id ?? null);
  }

  async function copyFinalText() {
    const text = previewText.trim();
    if (!text) {
      return;
    }
    await navigator.clipboard.writeText(text);
  }

  async function openPromptModal() {
    const generatedPrompt = buildChatGptPrompt(builder, previewText);
    setPromptText(generatedPrompt);
    setPromptOpen(true);
  }

  async function requestProGeneration() {
    try {
      setProLoading(true);
      setProStatus(null);
      const response = await selfPresentationApi.generate({
        data: builder,
        settings: builder.settings
      });

      if (response?.text) {
        setProStatus('Сервис вернул результат. Финальная генерация скоро будет доступна в UI.');
        return;
      }

      if (response?.upgradeRequired) {
        setProStatus(response.message ?? 'Для генерации нужен Pro/Telegram Stars.');
        return;
      }

      setProStatus('Генерация пока не подключена. Оставили API-хук для будущего релиза.');
    } catch (error) {
      setProStatus((error as Error).message || 'Не удалось выполнить запрос к AI API.');
    } finally {
      setProLoading(false);
    }
  }

  function durationTone(): 'ok' | 'warn' | 'alert' {
    const diff = Math.abs(quality.estimatedSeconds - builder.settings.duration);
    if (diff <= 8) return 'ok';
    if (diff <= 22) return 'warn';
    return 'alert';
  }

  const tone = durationTone();

  return (
    <div className="grid gap-4 lg:gap-6">
      <section className="surface-panel p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Конструктор самопрезентации</p>
            <h1 className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">Конструктор самопрезентации</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Собери историю из блоков, проверь качество и подготовь готовый prompt для ChatGPT.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={addJob} className="rounded-lg border border-brand-300/70 bg-white/80 px-3 py-2 text-xs font-semibold text-brand-700 transition hover:border-brand-400 hover:text-brand-800 dark:border-brand-500/60 dark:bg-[#20273a] dark:text-brand-300">
              + Добавить работу
            </button>
            <button type="button" onClick={resetBuilder} className="rounded-lg border border-slate-300/80 bg-white/80 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-400 dark:border-slate-600 dark:bg-[#20273a] dark:text-slate-200">
              Сбросить
            </button>
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:hidden">
        <div className="surface-panel flex items-center gap-2 p-2">
          <TabButton label="Библиотека" active={mobileTab === 'library'} onClick={() => setMobileTab('library')} />
          <TabButton label="Конструктор" active={mobileTab === 'builder'} onClick={() => setMobileTab('builder')} />
          <TabButton label="Превью" active={mobileTab === 'preview'} onClick={() => setMobileTab('preview')} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)_330px] lg:gap-5">
        <section className={`${mobileTab === 'library' ? 'block' : 'hidden'} surface-panel p-4 lg:block`}>
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-600 dark:text-slate-300">Библиотека блоков</h2>
          <ul className="mt-3 grid gap-2">
            {LIBRARY_BLOCKS.map((item) => {
              const exists = hasBlockType(builder, item.type);
              const disabled = !item.repeatable && exists;
              return (
                <li key={item.type} className="rounded-xl border border-slate-200/80 bg-white/70 p-3 dark:border-slate-700 dark:bg-[#1f2536]/80">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{item.title}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">{item.description}</p>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${item.required ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200'}`}>
                      {item.required ? 'Обяз.' : 'Опц.'}
                    </span>
                  </div>

                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => addBlock(item.type)}
                    className="mt-3 w-full rounded-lg border border-brand-300/70 bg-white/85 px-3 py-2 text-xs font-semibold text-brand-700 transition hover:border-brand-400 hover:text-brand-800 disabled:cursor-not-allowed disabled:opacity-50 dark:border-brand-500/60 dark:bg-[#232b40] dark:text-brand-300"
                  >
                    {disabled ? 'Уже добавлен' : 'Добавить'}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className={`${mobileTab === 'builder' ? 'block' : 'hidden'} surface-panel p-4 lg:block`}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-600 dark:text-slate-300">Сборка истории</h2>
            <span className="text-xs text-slate-500 dark:text-slate-400">Перетаскивание</span>
          </div>

          <div className="mt-3 grid gap-4">
            <div className="rounded-xl border border-slate-200/80 bg-white/70 p-3 dark:border-slate-700 dark:bg-[#1f2536]/80">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Редактор блока</p>
              {selectedBlock ? (
                <BlockEditor
                  block={selectedBlock}
                  jobs={builder.jobs}
                  profile={builder.profile}
                  onUpdateProfile={updateProfile}
                  onUpdateJob={updateJob}
                  onUpdateJobList={updateJobList}
                  onRemoveJob={removeJob}
                />
              ) : (
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Выберите блок слева для редактирования.</p>
              )}
            </div>

            <div className="grid gap-2">
              {orderedBlocks.map((block) => {
                const meta = blockMeta(block.type);
                const active = selectedBlockId === block.id;
                const dragging = draggingBlockId === block.id;
                const dragTarget = dragOverBlockId === block.id && draggingBlockId !== block.id;
                const diagnostics = blockDiagnosticsById[block.id];
                const isWarning = diagnostics?.signal === 'warning';
                const isGood = diagnostics?.signal === 'good';

                return (
                  <article
                    key={block.id}
                    draggable
                    onClick={() => setSelectedBlockId(block.id)}
                    onDragStart={() => handleDragStart(block.id)}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setDragOverBlockId(block.id);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      handleDrop(block.id);
                    }}
                    onDragEnd={() => {
                      setDraggingBlockId(null);
                      setDragOverBlockId(null);
                    }}
                    className={`story-block-card ${active ? 'story-block-card-active' : ''} ${isWarning ? 'story-block-card-warning' : ''} ${isGood ? 'story-block-card-good' : ''} ${dragging ? 'story-block-card-dragging' : ''} ${dragTarget ? 'story-block-card-over' : ''}`}
                  >
                    <div className="w-full text-left">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{storyBlockTitle(block.type)}</p>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {diagnostics?.tags.map((tag) => (
                            <span
                              key={`${block.id}-${tag}`}
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                diagnostics.signal === 'warning'
                                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/25 dark:text-rose-200'
                                  : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/25 dark:text-emerald-200'
                              }`}
                            >
                              {tag}
                            </span>
                          ))}
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${block.enabled ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/25 dark:text-blue-200' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>
                            {block.enabled ? 'ВКЛ' : 'ВЫКЛ'}
                          </span>
                        </div>
                      </div>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{blockDescription(block, jobsById)}</p>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={Boolean(meta?.required)}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedBlockId(block.id);
                          toggleBlock(block.id);
                        }}
                        className="rounded-md border border-slate-300/70 bg-white/80 px-2 py-1 text-[11px] font-semibold text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:bg-[#232b40] dark:text-slate-200"
                      >
                        {block.enabled ? 'Выключить' : 'Включить'}
                      </button>
                      <button
                        type="button"
                        disabled={Boolean(meta?.required)}
                        onClick={(event) => {
                          event.stopPropagation();
                          removeBlock(block.id);
                        }}
                        className="rounded-md border border-rose-300/70 bg-white/80 px-2 py-1 text-[11px] font-semibold text-rose-700 transition hover:border-rose-400 disabled:cursor-not-allowed disabled:opacity-40 dark:border-rose-500/60 dark:bg-[#232b40] dark:text-rose-300"
                      >
                        Удалить
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className={`${mobileTab === 'preview' ? 'block' : 'hidden'} surface-panel p-4 lg:block`}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-600 dark:text-slate-300">Предпросмотр</h2>
            <button
              type="button"
              onClick={() => commit({ ...builder, settings: { ...builder.settings, duration: nextDuration(builder.settings.duration) } })}
              className="rounded-md border border-slate-300/70 bg-white/80 px-2 py-1 text-[11px] font-semibold text-slate-700 transition hover:border-slate-400 dark:border-slate-600 dark:bg-[#232b40] dark:text-slate-200"
            >
              {builder.settings.duration}с
            </button>
          </div>

          <div className="mt-3 flex gap-2">
            {[60, 90, 120].map((duration) => (
              <button
                key={duration}
                type="button"
                onClick={() => commit({ ...builder, settings: { ...builder.settings, duration: duration as 60 | 90 | 120 } })}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  builder.settings.duration === duration
                    ? 'bg-gradient-to-r from-brand-500 to-accent-500 text-white shadow-[0_10px_22px_-14px_rgba(47,123,255,0.8)]'
                    : 'border border-slate-300/80 bg-white/80 text-slate-700 dark:border-slate-600 dark:bg-[#232b40] dark:text-slate-200'
                }`}
              >
                {duration} сек
              </button>
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-slate-200/80 bg-white/70 p-3 dark:border-slate-700 dark:bg-[#1f2536]/80">
            <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
              <span>Слов: {quality.wordCount}</span>
              <span
                className={
                  tone === 'ok'
                    ? 'text-emerald-600 dark:text-emerald-300'
                    : tone === 'warn'
                      ? 'text-amber-600 dark:text-amber-300'
                      : 'text-rose-600 dark:text-rose-300'
                }
              >
                ~ {quality.estimatedSeconds} сек
              </span>
            </div>
            <textarea
              value={previewText}
              readOnly
              className="mt-2 min-h-[220px] w-full rounded-lg border border-slate-300/80 bg-white/90 p-3 text-sm leading-6 text-slate-800 dark:border-slate-600 dark:bg-[#131b2c] dark:text-slate-100"
            />
            <button type="button" onClick={() => void copyFinalText()} className="mt-2 w-full rounded-lg border border-brand-300/70 bg-white/85 px-3 py-2 text-xs font-semibold text-brand-700 transition hover:border-brand-400 hover:text-brand-800 dark:border-brand-500/60 dark:bg-[#232b40] dark:text-brand-300">
              Копировать финальный текст
            </button>
          </div>

          <div className="mt-4 rounded-xl border border-slate-200/80 bg-white/70 p-3 dark:border-slate-700 dark:bg-[#1f2536]/80">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Оценка качества</p>
              <span className="rounded-full bg-brand-500/15 px-2 py-1 text-xs font-semibold text-brand-700 dark:text-brand-300">{quality.score}/100</span>
            </div>
            <ul className="mt-3 grid gap-1.5">
              {quality.checks.map((check) => (
                <li key={check.label} className="text-xs text-slate-600 dark:text-slate-300">
                  <span className={check.passed ? 'text-emerald-600 dark:text-emerald-300' : 'text-rose-600 dark:text-rose-300'}>{check.passed ? '●' : '○'}</span>{' '}
                  {check.label}
                </li>
              ))}
            </ul>
            <ul className="mt-3 grid gap-1.5 border-t border-slate-200/80 pt-3 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">
              {quality.recommendations.map((item) => (
                <li key={item}>• {item}</li>
              ))}
            </ul>
          </div>

          <div className="mt-4 grid gap-2">
            <button type="button" onClick={() => void openPromptModal()} className="cta-button px-4 py-2.5 text-sm">
              Сгенерировать промпт для ChatGPT
            </button>
            <button
              type="button"
              onClick={() => {
                setProStatus(null);
                setProModalOpen(true);
              }}
              className="rounded-xl border border-slate-300/80 bg-white/85 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-brand-400 hover:text-brand-700 dark:border-slate-600 dark:bg-[#232b40] dark:text-slate-100"
            >
              Сгенерировать с AI (Pro/Stars)
            </button>
          </div>
        </section>
      </div>

      {promptOpen && (
        <ModalShell title="Готовый Prompt для ChatGPT" onClose={() => setPromptOpen(false)}>
          <textarea
            value={promptText}
            readOnly
            className="min-h-[320px] w-full rounded-lg border border-slate-300/80 bg-white/90 p-3 font-mono text-xs leading-6 text-slate-800 dark:border-slate-600 dark:bg-[#131b2c] dark:text-slate-100"
          />
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(promptText)}
              className="cta-button px-4 py-2 text-xs"
            >
              Копировать
            </button>
          </div>
        </ModalShell>
      )}

      {proModalOpen && (
        <ModalShell title="AI генерация (Pro/Stars)" onClose={() => setProModalOpen(false)}>
          <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
            Этот режим будет доступен по подписке Pro или через Telegram Stars. Сейчас мы уже подключили API-хук и проверку ответа,
            но платежный слой еще не включен.
          </p>
          {proStatus && (
            <p className="mt-3 rounded-lg border border-brand-300/60 bg-brand-50/80 px-3 py-2 text-xs text-brand-700 dark:border-brand-500/50 dark:bg-brand-500/10 dark:text-brand-200">
              {proStatus}
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => void requestProGeneration()}
              disabled={proLoading}
              className="cta-button px-4 py-2 text-xs"
            >
              {proLoading ? 'Запрос...' : 'Проверить API'}
            </button>
          </div>
        </ModalShell>
      )}
    </div>
  );
}

type BlockEditorProps = {
  block: StoryBlock;
  profile: SelfPresentationBuilderData['profile'];
  jobs: JobStory[];
  onUpdateProfile: (field: keyof SelfPresentationBuilderData['profile'], value: string) => void;
  onUpdateJob: (jobId: string, patch: Partial<JobStory>) => void;
  onUpdateJobList: (jobId: string, field: 'responsibilities' | 'achievements', value: string[]) => void;
  onRemoveJob: (jobId: string) => void;
};

function BlockEditor({ block, profile, jobs, onUpdateProfile, onUpdateJob, onUpdateJobList, onRemoveJob }: BlockEditorProps) {
  if (block.type === 'greeting') {
    return (
      <div className="mt-3 grid gap-2">
        <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
          Имя
          <input
            value={profile.name}
            onChange={(event) => onUpdateProfile('name', event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300/80 bg-white/90 px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-[#131b2c] dark:text-slate-100"
            placeholder="Станислав Нур"
          />
        </label>
        <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
          Опыт (лет)
          <input
            value={profile.yearsOfExperience}
            onChange={(event) => onUpdateProfile('yearsOfExperience', event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300/80 bg-white/90 px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-[#131b2c] dark:text-slate-100"
            placeholder="3"
          />
        </label>
        <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
          Целевой уровень
          <select
            value={profile.targetLevel}
            onChange={(event) => onUpdateProfile('targetLevel', event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300/80 bg-white/90 px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-[#131b2c] dark:text-slate-100"
          >
            <option value="Junior">Junior</option>
            <option value="Middle">Middle</option>
            <option value="Senior">Senior</option>
          </select>
        </label>
      </div>
    );
  }

  if (block.type === 'reasonForSearch') {
    return (
      <label className="mt-3 block text-xs font-semibold text-slate-600 dark:text-slate-300">
        Почему вы ищете работу сейчас
        <textarea
          value={profile.reasonForSearch}
          onChange={(event) => onUpdateProfile('reasonForSearch', event.target.value)}
          className="mt-1 min-h-[96px] w-full rounded-lg border border-slate-300/80 bg-white/90 px-3 py-2 text-sm leading-6 text-slate-800 dark:border-slate-600 dark:bg-[#131b2c] dark:text-slate-100"
          placeholder="Хочу задачи с большим техническим масштабом и более сложной игровой логикой"
        />
      </label>
    );
  }

  if (block.type === 'targetRoleOutro') {
    return (
      <label className="mt-3 block text-xs font-semibold text-slate-600 dark:text-slate-300">
        Какие задачи интересны
        <textarea
          value={profile.targetRoleOutro}
          onChange={(event) => onUpdateProfile('targetRoleOutro', event.target.value)}
          className="mt-1 min-h-[96px] w-full rounded-lg border border-slate-300/80 bg-white/90 px-3 py-2 text-sm leading-6 text-slate-800 dark:border-slate-600 dark:bg-[#131b2c] dark:text-slate-100"
          placeholder="по gameplay, архитектуре и оптимизации mobile/PC проектов"
        />
      </label>
    );
  }

  const job = jobs.find((entry) => entry.id === block.jobId) ?? jobs[0];

  if (!job) {
    return <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Добавьте работу, чтобы редактировать этот блок.</p>;
  }

  if (block.type === 'workExperience') {
    return (
      <div className="mt-3 grid gap-2">
        <div className="flex items-center justify-between gap-2 rounded-lg border border-rose-300/60 bg-rose-50/60 px-3 py-2 text-[11px] text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
          <span>Блок привязан к месту работы. Удаление работы уберет связанные блоки.</span>
          <button type="button" onClick={() => onRemoveJob(job.id)} className="rounded-md border border-rose-400/60 px-2 py-1 font-semibold">
            Удалить работу
          </button>
        </div>

        <Field label="Компания" value={job.company} onChange={(value) => onUpdateJob(job.id, { company: value })} placeholder="Studio Name" />
        <Field label="Проект" value={job.project} onChange={(value) => onUpdateJob(job.id, { project: value })} placeholder="Project X" />
        <Field
          label="Жанр / Платформа"
          value={job.genrePlatform}
          onChange={(value) => onUpdateJob(job.id, { genrePlatform: value })}
          placeholder="Action RPG, Mobile iOS/Android"
        />
        <Field
          label="Кратко про механику"
          value={job.mechanicsSummary}
          onChange={(value) => onUpdateJob(job.id, { mechanicsSummary: value })}
          placeholder="игрок прокачивает героя, проходит миссии и собирает лут"
          multiline
        />
      </div>
    );
  }

  if (block.type === 'responsibilities') {
    return (
      <ListEditor
        title="Обязанности"
        hint="Добавьте 2-4 пункта: архитектура, gameplay, инструменты, релизный цикл"
        values={job.responsibilities}
        onChange={(value) => onUpdateJobList(job.id, 'responsibilities', value)}
      />
    );
  }

  return (
    <ListEditor
      title="Достижения"
      hint="Добавьте метрики: %, ms, retention, crash-free sessions"
      values={job.achievements}
      onChange={(value) => onUpdateJobList(job.id, 'achievements', value)}
    />
  );
}

function Field({
  label,
  value,
  placeholder,
  onChange,
  multiline = false
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}) {
  return (
    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
      {label}
      {multiline ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="mt-1 min-h-[88px] w-full resize-y rounded-lg border border-slate-300/80 bg-white/90 px-3 py-2 text-sm leading-6 text-slate-800 dark:border-slate-600 dark:bg-[#131b2c] dark:text-slate-100"
          placeholder={placeholder}
        />
      ) : (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300/80 bg-white/90 px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-[#131b2c] dark:text-slate-100"
          placeholder={placeholder}
        />
      )}
    </label>
  );
}

function ListEditor({ title, hint, values, onChange }: { title: string; hint: string; values: string[]; onChange: (value: string[]) => void }) {
  function updateItem(index: number, next: string) {
    onChange(values.map((item, itemIndex) => (itemIndex === index ? next : item)));
  }

  function addItem() {
    onChange([...values, '']);
  }

  function removeItem(index: number) {
    const next = values.filter((_, itemIndex) => itemIndex !== index);
    onChange(next.length > 0 ? next : ['']);
  }

  return (
    <div className="mt-3 grid gap-2">
      <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">{title}</p>
      <p className="text-[11px] leading-5 text-slate-500 dark:text-slate-400">{hint}</p>
      {values.map((value, index) => (
        <div key={`${title}-${index}`} className="flex gap-2">
          <input
            value={value}
            onChange={(event) => updateItem(index, event.target.value)}
            className="w-full rounded-lg border border-slate-300/80 bg-white/90 px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-[#131b2c] dark:text-slate-100"
            placeholder={title === 'Достижения' ? 'Ускорил загрузку уровня на 28%' : 'Отвечал за gameplay-логику и ECS-системы'}
          />
          <button
            type="button"
            onClick={() => removeItem(index)}
            className="rounded-lg border border-rose-300/70 px-2 py-1 text-xs font-semibold text-rose-700 dark:border-rose-500/60 dark:text-rose-300"
          >
            −
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addItem}
        className="mt-1 rounded-lg border border-brand-300/70 bg-white/80 px-3 py-2 text-xs font-semibold text-brand-700 transition hover:border-brand-400 dark:border-brand-500/60 dark:bg-[#232b40] dark:text-brand-300"
      >
        + Добавить пункт
      </button>
    </div>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition ${
        active
          ? 'bg-gradient-to-r from-brand-500 to-accent-500 text-white shadow-[0_10px_22px_-14px_rgba(47,123,255,0.85)]'
          : 'border border-slate-300/80 bg-white/80 text-slate-700 dark:border-slate-600 dark:bg-[#232b40] dark:text-slate-200'
      }`}
    >
      {label}
    </button>
  );
}

function ModalShell({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/55 p-4" onClick={onClose}>
      <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-700 dark:bg-[#1b2232]" onClick={(event) => event.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-md border border-slate-300 px-2 py-1 text-xs dark:border-slate-600">
            Закрыть
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
