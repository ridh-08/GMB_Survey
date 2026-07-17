'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { SurveyWithSections, QuestionWithOptions, BranchRule, QuestionType } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowLeft, ArrowRight, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import Image from "next/image";
import CIILogo from "@/components/images/CII_Logo.png";
import IMELogo from "@/components/images/IME_Logo.webp";

/**
 * Font: this component uses EB Garamond throughout via the `font-garamond`
 * utility class. Load it once in your root layout (app/layout.tsx):
 *
 *   import { EB_Garamond } from 'next/font/google';
 *   const garamond = EB_Garamond({ subsets: ['latin'], variable: '--font-garamond' });
 *   <html className={garamond.variable}>
 *
 * And in tailwind.config.js add:
 *   theme: { extend: { fontFamily: { garamond: ['var(--font-garamond)', 'Garamond', 'serif'] } } }
 */

interface SurveyClientProps {
  surveyId: string;
}

// Free-text question types are always optional, regardless of the required
// flag stored on the question — an open-ended box shouldn't block navigation.
const FREE_TEXT_TYPES = new Set(['short_text', 'long_text', 'paragraph', 'number', 'email', 'phone', 'date']);

// Logo slots – swap these with real <Image /> imports when the assets are ready.
function LogoLeft() {
  return (
    <div className="h-10 w-24 flex items-center justify-center">
      <Image
        src={CIILogo}
        alt="CII Logo"
        className="object-contain"
      />
    </div>
  );
}

function LogoRight() {
  return (
    <div className="h-10 w-24 flex items-center justify-center">
      <Image
        src={IMELogo}
        alt="IME Logo"
        className="object-contain"
      />
    </div>
  );
}

export default function SurveyClient({ surveyId }: SurveyClientProps) {
  const router = useRouter();
  const [survey, setSurvey] = useState<SurveyWithSections | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [respondentId, setRespondentId] = useState<string | null>(null);
  const [responseId, setResponseId] = useState<string | null>(null);
  const [currentSection, setCurrentSection] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    (async () => {
      try {
        // The server identifies a returning respondent via an httpOnly
        // resume cookie (set when the respondent record was created) —
        // nothing to read or pass from the client.
        const response = await fetch(`/api/surveys/${surveyId}`, { credentials: 'include' });

        if (!response.ok) {
          setError('Survey not found.');
          setLoading(false);
          return;
        }
        const payload = await response.json();
        setSurvey(payload.survey as SurveyWithSections);

        if (payload.respondent) {
          const respondent = payload.respondent;
          if (respondent.status !== 'completed') {
            setRespondentId(respondent.id);
            setResponseId(respondent.response_id);
            setCurrentSection(respondent.current_section_index || 0);
            const { answerMap, commentMap } = hydrateAnswers(payload.answers || []);
            setAnswers(answerMap);
            setComments(commentMap);
            setLastSavedAt(respondent.last_updated || null);
            setLoading(false);
            return;
          }
        }

        const createResponse = await fetch(`/api/surveys/${surveyId}/respondents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({}),
        });
        if (!createResponse.ok) {
          throw new Error('Failed to create respondent');
        }
        const created = await createResponse.json();
        setRespondentId(created.respondent.id);
        setResponseId(created.respondent.response_id);
        setLoading(false);
      } catch (err) {
        console.error('Failed to load survey:', err);
        setError('Failed to load survey. Please try again later.');
        setLoading(false);
      }
    })();
  }, [surveyId]);

  const debouncedSave = useCallback(
    (questionId: string, questionCode: string, value: unknown, comment: string = '') => {
      if (!respondentId) return;
      if (saveTimers.current[questionId]) clearTimeout(saveTimers.current[questionId]);
      saveTimers.current[questionId] = setTimeout(async () => {
        setSaving(true);
        try {
          const saveResponse = await fetch(`/api/respondents/${responseId}/answers`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ questionId, questionCode, value, comment }),
          });
          if (!saveResponse.ok) {
            throw new Error('Failed to save answer');
          }
          setLastSavedAt(new Date().toISOString());
        } catch (err) {
          console.error('Failed to save answer:', err);
        } finally {
          setSaving(false);
        }
      }, 800);
    },
    [respondentId, responseId]
  );

  const handleAnswerChange = (questionId: string, questionCode: string, value: unknown) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    setValidationErrors((prev) => {
      const next = { ...prev };
      delete next[questionId];
      return next;
    });
    debouncedSave(questionId, questionCode, value, comments[questionId] || '');
  };

  const handleCommentChange = (questionId: string, questionCode: string, comment: string) => {
    setComments((prev) => ({ ...prev, [questionId]: comment }));
    debouncedSave(questionId, questionCode, answers[questionId], comment);
  };

  // Validates required-ness AND per-question rules (checkbox maxSelections,
  // matrix all-rows-answered, ranking all-ranked, etc.).
  const validateSection = (): boolean => {
    if (!survey) return false;
    const section = survey.sections[currentSection];
    if (!section) return true;
    const errors: Record<string, string> = {};
    getVisibleQuestions(section.questions, answers, survey.branch_rules || []).forEach((q) => {
      const val = answers[q.id];
      const isEmpty =
        val === undefined ||
        val === null ||
        val === '' ||
        (Array.isArray(val) && val.length === 0) ||
        (typeof val === 'object' && !Array.isArray(val) && Object.keys(val as object).length === 0);

      // Worker survey B2.4 ("away from family") is only required when the
      // preceding B2.3 commute-time answer is over 1 hour each way.
      if (survey.type === 'worker' && q.code === 'B2.4') {
        const commuteQ = section.questions.find((qq) => qq.code === 'B2.3');
        const commuteVal = commuteQ ? answers[commuteQ.id] : undefined;
        const commuteOpt = commuteQ?.options.find((o) => o.value === commuteVal);
        const longCommute = commuteOpt ? /1–2 hours|more than 2 hours/i.test(commuteOpt.label) : false;
        if (longCommute && isEmpty) {
          errors[q.id] = 'Please answer this question — your commute is over 1 hour.';
        }
        return;
      }

      const isFreeText = FREE_TEXT_TYPES.has(normalizeQuestionType(q.type));

      if (q.required && isEmpty && !isFreeText) {
        errors[q.id] = 'This question is required.';
        return;
      }

      // Checkbox maxSelections limit ("Select top 2 / Select up to 3").
      const maxSel = (q.validation as { maxSelections?: number } | undefined)?.maxSelections;
      if (normalizeQuestionType(q.type) === 'checkbox' && maxSel && Array.isArray(val) && val.length > maxSel) {
        errors[q.id] = `Please select at most ${maxSel} option${maxSel === 1 ? '' : 's'}.`;
      }

      // Matrix: every row must have an answer when required.
      if (normalizeQuestionType(q.type) === 'matrix' && q.required && !isEmpty) {
        const rows = q.matrix_rows || [];
        const mv = (val as Record<string, unknown>) || {};
        if (rows.some((r) => !mv[r.id])) {
          errors[q.id] = 'Please answer every row.';
        }
      }

      // Ranking: every option must get a rank when required.
      if (normalizeQuestionType(q.type) === 'ranking' && q.required && !isEmpty) {
        const rm = (val as Record<string, number>) || {};
        if (q.options.some((o) => rm[o.value] === undefined)) {
          errors[q.id] = 'Please rank every item.';
        }
      }
    });
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleNext = async () => {
    if (!survey || !respondentId) return;
    if (!validateSection()) return;
    const next = getNextSectionIndex(currentSection, survey, answers);
    if (next < survey.sections.length) {
      setCurrentSection(next);
      await fetch(`/api/respondents/${responseId}/progress`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ sectionIndex: next, questionIndex: 0 }),
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handlePrevious = () => {
    if (currentSection > 0) {
      setCurrentSection(currentSection - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleSubmit = async () => {
    if (!survey || !respondentId) return;
    if (!validateSection()) return;
    setSubmitting(true);
    try {
      await fetch(`/api/respondents/${responseId}/complete`, {
        method: 'POST',
        credentials: 'include',
      });
      router.push('/survey/complete');
    } catch (err) {
      console.error('Failed to submit survey:', err);
      setError('Failed to submit survey. Please try again.');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 font-garamond">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-sky-700 mx-auto mb-4" />
          <p className="text-slate-500">Loading survey...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6 font-garamond">
        <Card className="p-8 max-w-md w-full text-center">
          <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-4" />
          <p className="text-slate-700 mb-4">{error}</p>
          <Link href="/">
            <Button variant="outline">Back to Home</Button>
          </Link>
        </Card>
      </div>
    );
  }

  if (!survey) return null;

  const section = survey.sections[currentSection];
  const progress = survey.sections.length > 0 ? ((currentSection + 1) / survey.sections.length) * 100 : 0;
  const visibleQuestions = section ? getVisibleQuestions(section.questions, answers, survey.branch_rules || []) : [];

  return (
    <div className="min-h-screen bg-slate-50 font-garamond text-[17px] leading-relaxed text-slate-900">
      <header className="bg-white sticky top-0 z-10 shadow-sm">
        <div className="max-w-3xl mx-auto px-6 pt-5 pb-4">
          {/* Logo band */}
          <div className="flex items-center justify-between mb-5">
            <LogoLeft />
            <div className="flex items-center gap-4 text-sm">
              <Link href="/" className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800">
                <ArrowLeft className="w-4 h-4" />
                Home
              </Link>
            </div>
            <LogoRight />
          </div>

          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{survey.title}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                <span>{survey.estimated_time_minutes} minute estimate</span>
                {lastSavedAt && <span>Last saved {new Date(lastSavedAt).toLocaleString()}</span>}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1 text-xs">
              {saving && (
                <span className="flex items-center gap-1.5 text-slate-400">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Saving...
                </span>
              )}
              {responseId && (
                <span className="font-mono text-slate-400" title="Your response ID for resuming">
                  {responseId}
                </span>
              )}
            </div>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
              <span>Section {currentSection + 1} of {survey.sections.length}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        {section && (
          <div className="animate-fade-in">
            <div className="mb-10">
              <h2 className="text-3xl font-semibold text-slate-900 mb-2">{section.title}</h2>
              {section.description && (
                <p className="text-slate-600 text-lg">{section.description}</p>
              )}
            </div>
            <div className="space-y-12">
              {visibleQuestions.map((q, idx) => (
                <QuestionRenderer
                  key={q.id}
                  question={q}
                  index={idx}
                  value={answers[q.id]}
                  onChange={(val) => handleAnswerChange(q.id, q.code, val)}
                  commentValue={comments[q.id] || ''}
                  onCommentChange={(comment) => handleCommentChange(q.id, q.code, comment)}
                  error={validationErrors[q.id]}
                />
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mt-16 pt-6">
          <Button
            variant="outline"
            onClick={handlePrevious}
            disabled={currentSection === 0}
            className="font-garamond"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Previous
          </Button>
          {currentSection < survey.sections.length - 1 ? (
            <Button onClick={handleNext} className="font-garamond">
              Next
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={submitting} className="font-garamond">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Submit Survey
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}

function optionNeedsSpecify(opt: { label: string }): boolean {
  return /specify|_{3,}/i.test(opt.label);
}

function hasOtherSelected(question: QuestionWithOptions, value: unknown): boolean {
  const selectedValues = Array.isArray(value) ? value : [value];
  return question.options?.some((opt) => selectedValues.includes(opt.value) && optionNeedsSpecify(opt)) ?? false;
}

function QuestionRenderer({
  question,
  index,
  value,
  onChange,
  commentValue,
  onCommentChange,
  error,
}: {
  question: QuestionWithOptions;
  index: number;
  value: unknown;
  onChange: (val: unknown) => void;
  commentValue: string;
  onCommentChange: (val: string) => void;
  error?: string;
}) {
  const showOtherInput = hasOtherSelected(question, value);
  const maxSel = (question.validation as { maxSelections?: number } | undefined)?.maxSelections;

  return (
    <div id={`question-${question.id}`}>
      <div className="mb-4">
        <Label className="text-lg font-medium text-slate-900 leading-snug">
          {index + 1}. {question.text}
          {question.required && !FREE_TEXT_TYPES.has(normalizeQuestionType(question.type)) && <span className="text-red-600 ml-1">*</span>}
        </Label>
        {question.description && (
          <p className="text-base text-slate-500 mt-1">{question.description}</p>
        )}
        {normalizeQuestionType(question.type) === 'checkbox' && maxSel && (
          <p className="text-sm text-slate-500 mt-1 italic">Select up to {maxSel}.</p>
        )}
      </div>
      <QuestionInput question={question} value={value} onChange={onChange} />
      {showOtherInput && (
        <div className="mt-3 space-y-2">
          <Label htmlFor={`${question.id}-other`} className="text-sm text-slate-600">
            Please specify
          </Label>
          <Input
            id={`${question.id}-other`}
            value={commentValue}
            onChange={(e) => onCommentChange(e.target.value)}
            placeholder="Your answer..."
            className="font-garamond"
          />
        </div>
      )}
      {question.comments_enabled && !showOtherInput && (
        <div className="mt-3 space-y-2">
          <Label htmlFor={`${question.id}-comment`} className="text-sm text-slate-600">
            Additional comment
          </Label>
          <Textarea
            id={`${question.id}-comment`}
            value={commentValue}
            onChange={(e) => onCommentChange(e.target.value)}
            placeholder="Optional comment"
            rows={2}
            className="font-garamond"
          />
        </div>
      )}
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
    </div>
  );
}

/** Build stacked Likert option labels from question.scale (from importer). */
function getLikertScale(question: QuestionWithOptions): {
  min: number;
  max: number;
  leftLabel?: string;
  rightLabel?: string;
} {
  // The backend folds this into validation.scale rather than a top-level
  // column, to avoid a schema migration — read it from there.
  const scale = (question.validation as { scale?: { min?: number; max?: number; leftLabel?: string; rightLabel?: string } } | null)?.scale;
  return {
    min: scale?.min ?? 1,
    max: (scale?.min ?? 1) + 4,
    leftLabel: scale?.leftLabel,
    rightLabel: scale?.rightLabel,
  };
}

function QuestionInput({
  question,
  value,
  onChange,
}: {
  question: QuestionWithOptions;
  value: unknown;
  onChange: (val: unknown) => void;
}) {
  const type = normalizeQuestionType(question.type);

  switch (type) {
    case 'short_text':
      return (
        <Input
          value={(value as string) || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Your answer..."
          className="font-garamond"
        />
      );
    case 'long_text':
    case 'paragraph':
      return (
        <Textarea
          value={(value as string) || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Your answer..."
          rows={4}
          className="font-garamond"
        />
      );
    case 'number':
      return (
        <Input
          type="number"
          value={(value as string | number) || ''}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          placeholder="0"
          className="font-garamond"
        />
      );
    case 'email':
      return (
        <Input
          type="email"
          value={(value as string) || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="name@example.com"
          className="font-garamond"
        />
      );
    case 'phone':
      return (
        <Input
          type="tel"
          value={(value as string) || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="+91 XXXXX XXXXX"
          className="font-garamond"
        />
      );
    case 'date':
      return (
        <Input
          type="date"
          value={(value as string) || ''}
          onChange={(e) => onChange(e.target.value)}
          className="font-garamond"
        />
      );

    // Dropdowns are intentionally rendered as radios (no <select>).
    case 'dropdown':
    case 'radio':
    case 'yes_no':
      return (
        <RadioGroup value={(value as string) || ''} onValueChange={onChange}>
          <div className="space-y-2.5">
            {question.options.map((opt) => (
              <div key={opt.id} className="flex items-start gap-3 py-1.5">
                <RadioGroupItem value={opt.value} id={`${question.id}-${opt.id}`} className="mt-1" />
                <Label htmlFor={`${question.id}-${opt.id}`} className="font-normal cursor-pointer text-base leading-snug">
                  {opt.label}
                </Label>
              </div>
            ))}
          </div>
        </RadioGroup>
      );

    case 'likert_5':
    case 'likert_7': {
      const { min, max, leftLabel, rightLabel } = getLikertScale(question);
      const points: number[] = [];
      for (let i = min; i <= max; i++) points.push(i);
      return (
        <RadioGroup value={(value as string) || ''} onValueChange={onChange}>
          <div className="w-full overflow-x-auto rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-5">
            <div className="flex items-start justify-between gap-1 min-w-[320px]">
              {points.map((i) => (
                <label
                  key={i}
                  htmlFor={`${question.id}-${i}`}
                  className="flex flex-1 flex-col items-center gap-2.5 cursor-pointer select-none"
                >
                  <span className="text-base font-semibold text-slate-800">{i}</span>
                  <RadioGroupItem value={String(i)} id={`${question.id}-${i}`} className="h-5 w-5" />
                </label>
              ))}
            </div>
            {(leftLabel || rightLabel) && (
              <div className="flex items-start justify-between gap-4 mt-4 pt-3 border-t border-slate-200 text-sm font-medium text-slate-600">
                <span className="max-w-[45%] text-left">{leftLabel || ''}</span>
                <span className="max-w-[45%] text-right">{rightLabel || ''}</span>
              </div>
            )}
          </div>
        </RadioGroup>
      );
    }

    case 'checkbox': {
      const selected = (value as string[]) || [];
      const maxSel = (question.validation as { maxSelections?: number } | undefined)?.maxSelections;
      return (
        <div className="space-y-2.5">
          {question.options.map((opt) => {
            const isChecked = selected.includes(opt.value);
            const atLimit = !!maxSel && selected.length >= maxSel && !isChecked;
            return (
              <div key={opt.id} className={`flex items-start gap-3 py-1.5 ${atLimit ? 'opacity-50' : ''}`}>
                <Checkbox
                  id={`${question.id}-${opt.id}`}
                  checked={isChecked}
                  disabled={atLimit}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      if (atLimit) return;
                      onChange([...selected, opt.value]);
                    } else {
                      onChange(selected.filter((v) => v !== opt.value));
                    }
                  }}
                  className="mt-1"
                />
                <Label htmlFor={`${question.id}-${opt.id}`} className="font-normal cursor-pointer text-base leading-snug">
                  {opt.label}
                </Label>
              </div>
            );
          })}
        </div>
      );
    }

    case 'slider': {
      const numValue = typeof value === 'number' ? value : 0;
      return (
        <div className="space-y-3">
          <input
            type="range"
            min={0}
            max={10}
            value={numValue}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-full accent-sky-700"
          />
          <div className="flex items-center justify-between text-sm text-slate-500">
            <span>0</span>
            <span className="font-medium text-slate-900">{numValue}</span>
            <span>10</span>
          </div>
        </div>
      );
    }

    case 'matrix': {
      const matrixValue = (value as Record<string, string>) || {};
      const cols = question.matrix_columns || [];
      const rows = question.matrix_rows || [];
      return (
        <div className="overflow-x-auto rounded-md bg-white p-3">
          <table className="w-full text-base">
            <thead>
              <tr>
                <th className="text-left p-3"></th>
                {cols.map((col) => (
                  <th key={col.id} className="text-center p-3 font-medium text-slate-600 text-sm">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="p-3 text-slate-800">{row.label}</td>
                  {cols.map((col) => (
                    <td key={col.id} className="text-center p-3">
                      <input
                        type="radio"
                        name={`${question.id}-${row.id}`}
                        value={col.value}
                        checked={matrixValue[row.id] === col.value}
                        onChange={() => onChange({ ...matrixValue, [row.id]: col.value })}
                        className="accent-sky-700 w-4 h-4"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    case 'matrix_multiple': {
      const matrixValue = (value as Record<string, string[]>) || {};
      const cols = question.matrix_columns || [];
      const rows = question.matrix_rows || [];
      return (
        <div className="overflow-x-auto rounded-md bg-white p-3">
          <table className="w-full text-base">
            <thead>
              <tr>
                <th className="text-left p-3"></th>
                {cols.map((col) => (
                  <th key={col.id} className="text-center p-3 font-medium text-slate-600 text-sm">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const selected = matrixValue[row.id] || [];
                return (
                  <tr key={row.id}>
                    <td className="p-3 text-slate-800">{row.label}</td>
                    {cols.map((col) => (
                      <td key={col.id} className="text-center p-3">
                        <Checkbox
                          checked={selected.includes(col.value)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              onChange({ ...matrixValue, [row.id]: [...selected, col.value] });
                            } else {
                              onChange({ ...matrixValue, [row.id]: selected.filter((v) => v !== col.value) });
                            }
                          }}
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    }

    case 'ranking': {
      const rankMap = (value as Record<string, number>) || {};
      const allowTie = !!(question.validation as { allowSingleTie?: boolean } | undefined)?.allowSingleTie;
      const total = question.options.length;

      // How many options currently hold each rank value.
      const rankCounts: Record<number, number> = {};
      Object.values(rankMap).forEach((r) => {
        rankCounts[r] = (rankCounts[r] || 0) + 1;
      });

      // A rank is "skipped" (unselectable) if the rank immediately before it
      // already has a completed tie pair — e.g. two items at rank 2 means
      // rank 3 is skipped and the next item must be rank 4.
      const isRankSkipped = (rank: number) => allowTie && (rankCounts[rank - 1] || 0) >= 2;

      return (
        <div className="space-y-2">
          <p className="text-sm text-slate-500 italic mb-2">
            Click a rank number for each item
            {allowTie ? ' (in rare cases, exactly two items may share the same rank).' : '.'}
          </p>
          {question.options.map((opt) => {
            const currentRank = rankMap[opt.value];
            return (
              <div key={opt.id} className="flex items-center gap-4 py-2">
                <div className="flex-1 text-base text-slate-800">{opt.label}</div>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from({ length: total }, (_, i) => i + 1).map((rank) => {
                    const isActive = currentRank === rank;
                    const skipped = !isActive && isRankSkipped(rank);
                    const countAtRank = rankCounts[rank] || 0;
                    const full = !isActive && (allowTie ? countAtRank >= 2 : countAtRank >= 1);
                    const disabled = skipped || full;
                    return (
                      <button
                        key={rank}
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          if (disabled) return;
                          const next = { ...rankMap };
                          if (isActive) {
                            delete next[opt.value];
                          } else {
                            if (!allowTie) {
                              const conflictKey = Object.keys(next).find(
                                (k) => k !== opt.value && next[k] === rank
                              );
                              if (conflictKey) {
                                if (currentRank === undefined) delete next[conflictKey];
                                else next[conflictKey] = currentRank;
                              }
                            }
                            next[opt.value] = rank;
                          }
                          onChange(next);
                        }}
                        className={
                          'w-8 h-8 rounded-full text-sm font-medium transition-colors ' +
                          (isActive
                            ? 'bg-sky-700 text-white'
                            : disabled
                            ? 'bg-slate-50 text-slate-300 cursor-not-allowed'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200')
                        }
                        aria-label={`Rank ${rank} for ${opt.label}`}
                      >
                        {rank}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    case 'file_upload':
      return (
        <div className="space-y-3">
          <Input
            type="file"
            multiple
            onChange={(e) => {
              const files = Array.from(e.target.files || []).map((file) => ({
                name: file.name,
                size: file.size,
                type: file.type,
                lastModified: file.lastModified,
              }));
              onChange(files);
            }}
            className="font-garamond"
          />
          {Array.isArray(value) && value.length > 0 && (
            <div className="rounded-lg bg-slate-100 p-3 text-sm text-slate-600">
              <p className="font-medium text-slate-700 mb-2">Selected files</p>
              <ul className="space-y-1">
                {value.map((file) => (
                  <li key={(file as { name: string }).name}>{(file as { name: string }).name}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      );
    default:
      return <p className="text-sm text-slate-400">Unsupported question type: {question.type}</p>;
  }
}

function normalizeQuestionType(type: QuestionType): QuestionType {
  if (type === 'multiple_matrix') return 'matrix_multiple';
  return type;
}

function getVisibleQuestions(
  questions: QuestionWithOptions[],
  answers: Record<string, unknown>,
  branchRules: BranchRule[]
) {
  const hiddenQuestionIds = new Set<string>();

  branchRules.forEach((rule) => {
    if (!rule.target_question_id) return;
    const sourceAnswer = answers[rule.source_question_id];
    if (!matchesBranchCondition(sourceAnswer, rule.condition)) return;

    if (rule.action === 'hide') {
      hiddenQuestionIds.add(rule.target_question_id);
    }
  });

  return questions.filter((question) => !hiddenQuestionIds.has(question.id));
}

function getNextSectionIndex(
  currentSectionIndex: number,
  survey: SurveyWithSections,
  answers: Record<string, unknown>
) {
  const currentSection = survey.sections[currentSectionIndex];
  const currentQuestionIds = new Set(currentSection.questions.map((question) => question.id));
  const matchedSkipRule = (survey.branch_rules || []).find((rule) => {
    if (rule.action !== 'skip_to_section' || !rule.target_section_id) return false;
    if (!currentQuestionIds.has(rule.source_question_id)) return false;
    return matchesBranchCondition(answers[rule.source_question_id], rule.condition);
  });

  if (matchedSkipRule) {
    const targetIndex = survey.sections.findIndex((section) => section.id === matchedSkipRule.target_section_id);
    if (targetIndex > currentSectionIndex) {
      return targetIndex;
    }
  }

  return currentSectionIndex + 1;
}

function matchesBranchCondition(answer: unknown, condition: Record<string, unknown> | null): boolean {
  if (!condition || Object.keys(condition).length === 0) return true;

  const operator = String(condition.operator || condition.op || 'equals');
  const expected = condition.value ?? condition.values ?? condition.answer;

  if (operator === 'exists') {
    return answer !== undefined && answer !== null && answer !== '' && !(Array.isArray(answer) && answer.length === 0);
  }

  if (operator === 'not_exists') {
    return !matchesBranchCondition(answer, { operator: 'exists' });
  }

  if (operator === 'contains') {
    if (Array.isArray(answer)) return answer.includes(expected as never);
    return String(answer ?? '').includes(String(expected ?? ''));
  }

  if (operator === 'in') {
    const expectedValues = Array.isArray(expected) ? expected : [expected];
    return expectedValues.some((value) => String(value) === String(answer));
  }

  if (operator === 'not_equals') {
    return String(answer ?? '') !== String(expected ?? '');
  }

  return String(answer ?? '') === String(expected ?? '');
}

function hydrateAnswers(existingAnswers: Array<{ question_id: string; value: unknown; comment: string | null }>): {
  answerMap: Record<string, unknown>;
  commentMap: Record<string, string>;
} {
  const answerMap: Record<string, unknown> = {};
  const commentMap: Record<string, string> = {};

  existingAnswers.forEach((a) => {
    try {
      answerMap[a.question_id] = typeof a.value === 'string' ? JSON.parse(a.value) : a.value;
    } catch {
      answerMap[a.question_id] = a.value;
    }
    if (a.comment) {
      commentMap[a.question_id] = a.comment;
    }
  });

  return { answerMap, commentMap };
}