import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Download,
  RefreshCw,
} from 'lucide-react';
import { InputsPanel } from './components/InputsPanel';
import { OverviewView } from './components/OverviewView';
import { TasksView } from './components/TasksView';
import { TimelineView } from './components/TimelineView';
import {
  addCalendarDays,
  formatDisplayDate,
  getLocalTodayDateString,
} from './lib/dates';
import { buildPlanMarkdown } from './lib/markdown';
import {
  parsePositiveWholeNumber,
  validateGeneratedPlan,
  validatePlanInputs,
  type InputValidationErrors,
} from './lib/planValidation';
import { scheduleProjectPlan } from './lib/scheduler';
import { loadWorkspaceState, saveWorkspaceState } from './lib/storage';
import type { PlanInputs, ProjectPlanData, TaskItem } from './types/plan';

const EXAMPLE_GOAL =
  'Pilot an online appointment booking service for a university student support team. Students should be able to select an available slot, receive confirmation and cancel if needed. Run the pilot with one department.';

type ActiveView = 'overview' | 'tasks' | 'timeline';

function slugifyTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'project-plan';
}

export default function App() {
  const saved = useMemo(() => loadWorkspaceState(), []);
  const defaultToday = useMemo(() => getLocalTodayDateString(), []);

  const [goal, setGoal] = useState<string>(saved?.inputs.goal ?? '');
  const [startDate, setStartDate] = useState<string>(saved?.inputs.startDate ?? defaultToday);
  const [deadlineDate, setDeadlineDate] = useState<string>(saved?.inputs.deadlineDate ?? '');
  const [teamSizeRaw, setTeamSizeRaw] = useState<string>(
    saved ? String(saved.inputs.teamSize) : '2',
  );
  const [context, setContext] = useState<string>(saved?.inputs.context ?? '');
  const [contextExpanded, setContextExpanded] = useState<boolean>(
    saved?.contextExpanded ?? false,
  );

  const [plan, setPlan] = useState<ProjectPlanData | null>(saved?.plan ?? null);
  const [hasEdits, setHasEdits] = useState<boolean>(saved?.hasEdits ?? false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(
    saved?.selectedTaskId ?? null,
  );
  const [activeView, setActiveView] = useState<ActiveView>(saved?.activeView ?? 'overview');

  const [inputErrors, setInputErrors] = useState<InputValidationErrors>({});
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [showReplaceConfirm, setShowReplaceConfirm] = useState<boolean>(false);
  const [copiedMarkdown, setCopiedMarkdown] = useState<boolean>(false);

  const parsedTeamSize = parsePositiveWholeNumber(teamSizeRaw);

  const currentInputs: PlanInputs = useMemo(
    () => ({
      goal,
      startDate,
      deadlineDate,
      teamSize: parsedTeamSize ?? 0,
      context,
    }),
    [goal, startDate, deadlineDate, parsedTeamSize, context],
  );

  const schedule = useMemo(() => {
    if (!plan) return null;
    return scheduleProjectPlan(plan, {
      startDate,
      deadlineDate,
      teamSize: parsedTeamSize ?? 0,
    });
  }, [plan, startDate, deadlineDate, parsedTeamSize]);

  useEffect(() => {
    saveWorkspaceState({
      version: 1,
      inputs: {
        goal,
        startDate,
        deadlineDate,
        teamSize: parsedTeamSize ?? 2,
        context,
      },
      plan,
      hasEdits,
      selectedTaskId,
      activeView,
      contextExpanded,
    });
  }, [
    goal,
    startDate,
    deadlineDate,
    parsedTeamSize,
    context,
    plan,
    hasEdits,
    selectedTaskId,
    activeView,
    contextExpanded,
  ]);

  useEffect(() => {
    if (!showReplaceConfirm) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowReplaceConfirm(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showReplaceConfirm]);

  const executeGeneration = async () => {
    const check = validatePlanInputs({
      goal,
      startDate,
      deadlineDate,
      teamSize: teamSizeRaw,
    });

    if (!check.valid || !check.parsedTeamSize) {
      setInputErrors(check.errors);
      return;
    }

    setInputErrors({});
    setAiError(null);
    setShowReplaceConfirm(false);
    setIsGenerating(true);

    try {
      const response = await fetch('/api/generate-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: goal.trim(),
          startDate,
          deadlineDate,
          teamSize: check.parsedTeamSize,
          context: context.trim(),
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        plan?: unknown;
        error?: string;
        details?: InputValidationErrors;
      } | null;

      if (!response.ok) {
        if (payload?.details) {
          setInputErrors(payload.details);
        }
        throw new Error(
          payload?.error || `Request failed with status ${response.status}.`,
        );
      }

      const validated = validateGeneratedPlan(payload?.plan);
      if (!validated.ok) {
        throw new Error(validated.error);
      }

      setPlan(validated.plan);
      setHasEdits(false);
      setSelectedTaskId(validated.plan.tasks[0]?.id ?? null);
      setActiveView('overview');
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Unable to generate project plan right now.';
      setAiError(message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateClick = () => {
    if (isGenerating) return;
    const check = validatePlanInputs({
      goal,
      startDate,
      deadlineDate,
      teamSize: teamSizeRaw,
    });

    if (!check.valid) {
      setInputErrors(check.errors);
      return;
    }

    setInputErrors({});
    if (plan && hasEdits) {
      setShowReplaceConfirm(true);
      return;
    }

    void executeGeneration();
  };

  const handleTryExample = () => {
    const today = getLocalTodayDateString();
    setGoal(EXAMPLE_GOAL);
    setTeamSizeRaw('3');
    setStartDate(today);
    setDeadlineDate(addCalendarDays(today, 28));
    setInputErrors({});
    setAiError(null);
  };

  const handleUpdateTask = (taskId: string, updater: (task: TaskItem) => TaskItem) => {
    setPlan((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        tasks: prev.tasks.map((t) => (t.id === taskId ? updater(t) : t)),
      };
    });
    setHasEdits(true);
  };

  const handleCopyMarkdown = async () => {
    if (!plan || !schedule) return;
    const md = buildPlanMarkdown(currentInputs, plan, schedule);
    try {
      await navigator.clipboard.writeText(md);
    } catch {
      const el = document.createElement('textarea');
      el.value = md;
      el.setAttribute('readonly', '');
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopiedMarkdown(true);
    window.setTimeout(() => setCopiedMarkdown(false), 2000);
  };

  const handleDownloadMarkdown = () => {
    if (!plan || !schedule) return;
    const md = buildPlanMarkdown(currentInputs, plan, schedule);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${slugifyTitle(plan.title)}.md`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
            Project Plan Builder
          </h1>

          <nav aria-label="Plan views" className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(['overview', 'tasks', 'timeline'] as const).map((view) => {
              const label =
                view === 'overview' ? 'Overview' : view === 'tasks' ? 'Tasks' : 'Timeline';
              const active = activeView === view;
              return (
                <button
                  key={view}
                  type="button"
                  onClick={() => setActiveView(view)}
                  disabled={!plan}
                  aria-current={active && plan ? 'page' : undefined}
                  className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-40 disabled:cursor-not-allowed ${
                    active
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopyMarkdown}
              disabled={!plan || !schedule}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {copiedMarkdown ? (
                <>
                  <Check className="w-4 h-4 text-emerald-600" aria-hidden="true" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-slate-500" aria-hidden="true" />
                  <span>Copy Markdown</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleDownloadMarkdown}
              disabled={!plan || !schedule}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4 text-slate-500" aria-hidden="true" />
              <span>Download .md</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)] gap-6 items-start">
          <InputsPanel
            goal={goal}
            startDate={startDate}
            deadlineDate={deadlineDate}
            teamSizeRaw={teamSizeRaw}
            context={context}
            contextExpanded={contextExpanded}
            errors={inputErrors}
            isGenerating={isGenerating}
            hasExistingPlan={Boolean(plan)}
            hasEdits={hasEdits}
            onGoalChange={(val) => {
              setGoal(val);
              if (inputErrors.goal) setInputErrors((e) => ({ ...e, goal: undefined }));
            }}
            onStartDateChange={(val) => {
              setStartDate(val);
              if (inputErrors.startDate || inputErrors.deadlineDate) {
                setInputErrors((e) => ({ ...e, startDate: undefined, deadlineDate: undefined }));
              }
            }}
            onDeadlineDateChange={(val) => {
              setDeadlineDate(val);
              if (inputErrors.deadlineDate) {
                setInputErrors((e) => ({ ...e, deadlineDate: undefined }));
              }
            }}
            onTeamSizeChange={(val) => {
              setTeamSizeRaw(val);
              if (inputErrors.teamSize) setInputErrors((e) => ({ ...e, teamSize: undefined }));
            }}
            onContextChange={setContext}
            onToggleContext={() => setContextExpanded((prev) => !prev)}
            onGenerateClick={handleGenerateClick}
            onTryExample={handleTryExample}
          />

          <div className="space-y-5 min-w-0">
            {/* AI Generation Error Banner (kept strictly separate from schedule/deadline status) */}
            {aiError && (
              <div
                role="alert"
                className="bg-red-50 border border-red-200 rounded-lg p-4 flex flex-wrap items-start justify-between gap-3"
              >
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-5 h-5 text-red-700 shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <h2 className="text-sm font-semibold text-red-900">
                      Plan generation failed
                    </h2>
                    <p className="text-sm text-red-800 mt-0.5">{aiError}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => void executeGeneration()}
                    disabled={isGenerating}
                    className="inline-flex items-center gap-1.5 rounded-md bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 disabled:opacity-50"
                  >
                    <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Retry</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAiError(null)}
                    className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-800 hover:bg-red-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            {/* Schedule Error Banner (e.g. dependency cycle or invalid date/team size while editing) */}
            {plan && schedule && !schedule.ok && (
              <div
                role="alert"
                className="bg-amber-50 border border-amber-300 rounded-lg p-4 flex flex-wrap items-start justify-between gap-3"
              >
                <div className="flex items-start gap-2.5">
                  <AlertTriangle
                    className="w-5 h-5 text-amber-800 shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <div>
                    <h2 className="text-sm font-semibold text-amber-950">
                      {schedule.code === 'CYCLE'
                        ? 'Schedule blocked by dependency cycle'
                        : 'Schedule could not be computed'}
                    </h2>
                    <p className="text-sm text-amber-900 mt-0.5">{schedule.message}</p>
                  </div>
                </div>
                {activeView !== 'tasks' && schedule.code === 'CYCLE' && (
                  <button
                    type="button"
                    onClick={() => setActiveView('tasks')}
                    className="rounded-md bg-amber-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 shrink-0"
                  >
                    Fix in Tasks
                  </button>
                )}
              </div>
            )}

            {/* Deadline Status Banner (only when schedule is valid) */}
            {plan && schedule && schedule.ok && (
              <div
                className={`rounded-lg border p-4 ${
                  schedule.meetsDeadline
                    ? 'bg-emerald-50/70 border-emerald-200'
                    : 'bg-red-50/70 border-red-200'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5">
                    {schedule.meetsDeadline ? (
                      <CheckCircle2
                        className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                    ) : (
                      <AlertTriangle
                        className="w-5 h-5 text-red-700 shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                    )}
                    <div className="space-y-1">
                      <div
                        className={`text-sm font-semibold ${
                          schedule.meetsDeadline ? 'text-emerald-950' : 'text-red-950'
                        }`}
                      >
                        {schedule.meetsDeadline ? (
                          <span>
                            On track — projected finish is{' '}
                            <span className="font-mono tabular-nums">
                              {formatDisplayDate(schedule.projectFinishDate)}
                            </span>{' '}
                            ({schedule.workingDaysBuffer} working day
                            {schedule.workingDaysBuffer === 1 ? '' : 's'} ahead of deadline)
                          </span>
                        ) : (
                          <span>
                            Misses requested deadline by {schedule.workingDaysLate} working day
                            {schedule.workingDaysLate === 1 ? '' : 's'} — projected finish is{' '}
                            <span className="font-mono tabular-nums">
                              {formatDisplayDate(schedule.projectFinishDate)}
                            </span>
                          </span>
                        )}
                      </div>
                      <p
                        className={`text-xs ${
                          schedule.meetsDeadline ? 'text-emerald-800' : 'text-red-800'
                        }`}
                      >
                        Projected schedule under current assumptions (Mon–Fri, full team
                        availability, no holidays, no specialist constraints).
                      </p>
                      {!schedule.meetsDeadline && schedule.decisionToExplore && (
                        <p className="text-sm text-red-900 pt-1">
                          <span className="font-semibold">Decision to explore:</span>{' '}
                          {schedule.decisionToExplore}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Main Content */}
            {!plan ? (
              isGenerating ? (
                <section
                  aria-busy="true"
                  className="bg-white border border-slate-200 rounded-lg p-6 space-y-4"
                >
                  <div className="h-6 w-2/5 bg-slate-200 rounded animate-pulse" />
                  <div className="h-4 w-4/5 bg-slate-100 rounded animate-pulse" />
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 pt-3">
                    {[1, 2, 3, 4].map((n) => (
                      <div key={n} className="h-20 bg-slate-100 rounded border border-slate-200 animate-pulse" />
                    ))}
                  </div>
                  <div className="h-44 bg-slate-50 rounded border border-slate-200 animate-pulse" />
                </section>
              ) : (
                <section className="bg-white border border-slate-200 rounded-lg p-6 sm:p-8 space-y-4">
                  <h2 className="text-lg font-semibold text-slate-900">
                    Ready to build a working schedule
                  </h2>
                  <p className="text-sm text-slate-600 max-w-2xl leading-relaxed">
                    Enter your project goal, target deadline, and team size on the left, then
                    select <span className="font-medium text-slate-900">Generate project plan</span>.
                    You can also select{' '}
                    <span className="font-medium text-slate-900">Try an example</span> to load a
                    university student support booking pilot.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-100 text-xs text-slate-600">
                    <div>
                      <div className="font-semibold text-slate-800 mb-1">1. Structured breakdown</div>
                      <p>Generates deliverables, milestones, tasks, assumptions, and external checks.</p>
                    </div>
                    <div>
                      <div className="font-semibold text-slate-800 mb-1">2. Deterministic schedule</div>
                      <p>Computes working-day start and finish dates locally without AI guesswork.</p>
                    </div>
                    <div>
                      <div className="font-semibold text-slate-800 mb-1">3. Live scenario edits</div>
                      <p>Adjust team size, dates, estimates, or prerequisites and export Markdown.</p>
                    </div>
                  </div>
                </section>
              )
            ) : schedule ? (
              <>
                {activeView === 'overview' && (
                  <OverviewView inputs={currentInputs} plan={plan} schedule={schedule} />
                )}
                {activeView === 'tasks' && (
                  <TasksView
                    plan={plan}
                    schedule={schedule}
                    selectedTaskId={selectedTaskId}
                    onSelectTask={setSelectedTaskId}
                    onUpdateTask={handleUpdateTask}
                  />
                )}
                {activeView === 'timeline' && (
                  <TimelineView
                    schedule={schedule}
                    onOpenTasks={() => setActiveView('tasks')}
                  />
                )}
              </>
            ) : null}
          </div>
        </div>
      </main>

      {showReplaceConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="replace-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
        >
          <div className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-6 shadow-lg space-y-4">
            <h2 id="replace-dialog-title" className="text-base font-semibold text-slate-900">
              Replace your edited plan?
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              You have made local edits to the current plan. Generating a replacement plan will
              overwrite those task and dependency edits while keeping your input fields.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowReplaceConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void executeGeneration()}
                className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
              >
                Replace plan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
