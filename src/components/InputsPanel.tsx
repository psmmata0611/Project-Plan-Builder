import { Calendar, ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import { formatDisplayDate, isValidCalendarDate, resolveEffectiveStart } from '../lib/dates';
import type { InputValidationErrors } from '../lib/planValidation';

interface InputsPanelProps {
  goal: string;
  startDate: string;
  deadlineDate: string;
  teamSizeRaw: string;
  context: string;
  contextExpanded: boolean;
  errors: InputValidationErrors;
  isGenerating: boolean;
  hasExistingPlan: boolean;
  hasEdits: boolean;
  onGoalChange: (value: string) => void;
  onStartDateChange: (value: string) => void;
  onDeadlineDateChange: (value: string) => void;
  onTeamSizeChange: (value: string) => void;
  onContextChange: (value: string) => void;
  onToggleContext: () => void;
  onGenerateClick: () => void;
  onTryExample: () => void;
}

export function InputsPanel({
  goal,
  startDate,
  deadlineDate,
  teamSizeRaw,
  context,
  contextExpanded,
  errors,
  isGenerating,
  hasExistingPlan,
  hasEdits,
  onGoalChange,
  onStartDateChange,
  onDeadlineDateChange,
  onTeamSizeChange,
  onContextChange,
  onToggleContext,
  onGenerateClick,
  onTryExample,
}: InputsPanelProps) {
  const startResolution = isValidCalendarDate(startDate)
    ? resolveEffectiveStart(startDate)
    : null;

  return (
    <aside className="bg-white border border-slate-200 rounded-lg p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-base font-semibold text-slate-900">Plan Parameters</h2>
        <button
          type="button"
          onClick={onTryExample}
          disabled={isGenerating}
          className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:opacity-50"
        >
          Try an example
        </button>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onGenerateClick();
        }}
        noValidate
        className="space-y-4"
      >
        <div>
          <label htmlFor="project-goal" className="block text-sm font-medium text-slate-800 mb-1.5">
            Project goal
          </label>
          <textarea
            id="project-goal"
            rows={4}
            value={goal}
            onChange={(e) => onGoalChange(e.target.value)}
            placeholder="Describe what the team needs to deliver and any key constraints..."
            aria-invalid={Boolean(errors.goal)}
            aria-describedby={errors.goal ? 'project-goal-error' : undefined}
            className={`w-full rounded-md border px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
              errors.goal ? 'border-red-500 bg-red-50/40' : 'border-slate-300 bg-white'
            }`}
          />
          {errors.goal && (
            <p id="project-goal-error" role="alert" className="mt-1 text-xs font-medium text-red-700">
              {errors.goal}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-3">
          <div>
            <label htmlFor="deadline-date" className="block text-sm font-medium text-slate-800 mb-1.5">
              Deadline
            </label>
            <input
              id="deadline-date"
              type="date"
              value={deadlineDate}
              onChange={(e) => onDeadlineDateChange(e.target.value)}
              aria-invalid={Boolean(errors.deadlineDate)}
              aria-describedby={errors.deadlineDate ? 'deadline-date-error' : undefined}
              className={`w-full min-h-[42px] rounded-md border px-3 py-2 text-sm font-mono tabular-nums text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                errors.deadlineDate ? 'border-red-500 bg-red-50/40' : 'border-slate-300 bg-white'
              }`}
            />
            {errors.deadlineDate && (
              <p
                id="deadline-date-error"
                role="alert"
                className="mt-1 text-xs font-medium text-red-700"
              >
                {errors.deadlineDate}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="team-size" className="block text-sm font-medium text-slate-800 mb-1.5">
              Team size
            </label>
            <input
              id="team-size"
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              value={teamSizeRaw}
              onChange={(e) => onTeamSizeChange(e.target.value)}
              aria-invalid={Boolean(errors.teamSize)}
              aria-describedby={errors.teamSize ? 'team-size-error' : undefined}
              className={`w-full min-h-[42px] rounded-md border px-3 py-2 text-sm font-mono tabular-nums text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                errors.teamSize ? 'border-red-500 bg-red-50/40' : 'border-slate-300 bg-white'
              }`}
            />
            {errors.teamSize && (
              <p id="team-size-error" role="alert" className="mt-1 text-xs font-medium text-red-700">
                {errors.teamSize}
              </p>
            )}
          </div>
        </div>

        <div className="border-t border-slate-200 pt-3">
          <button
            type="button"
            onClick={onToggleContext}
            aria-expanded={contextExpanded}
            aria-controls="optional-context-section"
            className="flex items-center gap-1.5 text-sm font-medium text-slate-700 hover:text-slate-900 py-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            {contextExpanded ? (
              <ChevronDown className="w-4 h-4 text-slate-500" aria-hidden="true" />
            ) : (
              <ChevronRight className="w-4 h-4 text-slate-500" aria-hidden="true" />
            )}
            <span>Add context</span>
          </button>

          {contextExpanded && (
            <div id="optional-context-section" className="mt-3 space-y-3">
              <div>
                <label htmlFor="start-date" className="block text-sm font-medium text-slate-800 mb-1.5">
                  Start date
                </label>
                <input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => onStartDateChange(e.target.value)}
                  aria-invalid={Boolean(errors.startDate)}
                  aria-describedby={errors.startDate ? 'start-date-error' : 'effective-start-note'}
                  className={`w-full min-h-[42px] rounded-md border px-3 py-2 text-sm font-mono tabular-nums text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                    errors.startDate ? 'border-red-500 bg-red-50/40' : 'border-slate-300 bg-white'
                  }`}
                />
                {errors.startDate && (
                  <p id="start-date-error" role="alert" className="mt-1 text-xs font-medium text-red-700">
                    {errors.startDate}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="project-context" className="block text-sm font-medium text-slate-800 mb-1.5">
                  Deliverables, constraints or external approvals
                </label>
                <textarea
                  id="project-context"
                  rows={3}
                  value={context}
                  onChange={(e) => onContextChange(e.target.value)}
                  placeholder="Optional: specific deliverables, sign-offs required, supplier lead times..."
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                />
              </div>
            </div>
          )}

          {startResolution && (
            <div
              id="effective-start-note"
              className={`mt-2.5 flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${
                startResolution.rolledOverFromWeekend
                  ? 'border-blue-200 bg-blue-50 text-blue-900'
                  : 'border-slate-200 bg-slate-50 text-slate-700'
              }`}
            >
              <Calendar className="w-3.5 h-3.5 mt-0.5 shrink-0 text-blue-600" aria-hidden="true" />
              <div>
                <span className="font-medium">Effective start:</span>{' '}
                <span className="font-mono tabular-nums">
                  {formatDisplayDate(startResolution.effectiveStart)}
                </span>
                {startResolution.rolledOverFromWeekend && (
                  <span> (next weekday after weekend start date)</span>
                )}
              </div>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={isGenerating}
          className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <Sparkles className="w-4 h-4" aria-hidden="true" />
          <span>
            {isGenerating
              ? 'Generating project plan...'
              : hasExistingPlan
                ? 'Generate replacement plan'
                : 'Generate project plan'}
          </span>
        </button>

        {hasExistingPlan && hasEdits && (
          <p className="text-xs text-slate-600">
            Local task edits active. Generating a new plan will ask for confirmation first.
          </p>
        )}

        <p className="text-xs text-slate-500 leading-relaxed pt-1 border-t border-slate-100">
          Schedule rules: Mon–Fri working days, full team availability, no public holidays, no specialist role constraints. Changing dates or team size recalculates locally.
        </p>
      </form>
    </aside>
  );
}
