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

interface SurveyClientProps {
  surveyId: string;
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
        const storedResponseId = localStorage.getItem(`survey_${surveyId}_response_id`);
        const response = await fetch(
          storedResponseId
            ? `/api/surveys/${surveyId}?responseId=${encodeURIComponent(storedResponseId)}`
            : `/api/surveys/${surveyId}`,
          { credentials: 'include' }
        );

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
        localStorage.setItem(`survey_${surveyId}_response_id`, created.respondent.response_id);
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
    [respondentId]
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

  const validateSection = (): boolean => {
    if (!survey) return false;
    const section = survey.sections[currentSection];
    if (!section) return true;
    const errors: Record<string, string> = {};
    getVisibleQuestions(section.questions, answers, survey.branch_rules || []).forEach((q) => {
      if (q.required) {
        const val = answers[q.id];
        if (val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0)) {
          errors[q.id] = 'This question is required.';
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
      localStorage.removeItem(`survey_${surveyId}_response_id`);
      router.push('/survey/complete');
    } catch (err) {
      console.error('Failed to submit survey:', err);
      setError('Failed to submit survey. Please try again.');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-sky-600 mx-auto mb-4" />
          <p className="text-slate-500">Loading survey...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
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
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-3">
            <Link href="/" className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700">
              <ArrowLeft className="w-4 h-4" />
              Home
            </Link>
            <div className="flex items-center gap-3 text-sm">
              {saving && (
                <span className="flex items-center gap-1.5 text-slate-400">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Saving...
                </span>
              )}
              {responseId && (
                <span className="font-mono text-xs text-slate-400" title="Your response ID for resuming">
                  {responseId}
                </span>
              )}
            </div>
          </div>
          <h1 className="text-lg font-bold text-slate-900">{survey.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
            <span>{survey.estimated_time_minutes} minute estimate</span>
            {lastSavedAt && <span>Last saved {new Date(lastSavedAt).toLocaleString()}</span>}
          </div>
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
              <span>Section {currentSection + 1} of {survey.sections.length}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        {section && (
          <div className="animate-fade-in">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-slate-900 mb-2">{section.title}</h2>
              {section.description && (
                <p className="text-slate-600">{section.description}</p>
              )}
            </div>
            <div className="space-y-8">
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

        <div className="flex items-center justify-between mt-12 pt-6 border-t">
          <Button
            variant="outline"
            onClick={handlePrevious}
            disabled={currentSection === 0}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Previous
          </Button>
          {currentSection < survey.sections.length - 1 ? (
            <Button onClick={handleNext}>
              Next
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Submit Survey
            </Button>
          )}
        </div>
      </main>
    </div>
  );
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
  return (
    <div>
      <div className="mb-3">
        <Label className="text-base font-medium text-slate-900">
          {index + 1}. {question.text}
          {question.required && <span className="text-red-500 ml-1">*</span>}
        </Label>
        {question.description && (
          <p className="text-sm text-slate-500 mt-1">{question.description}</p>
        )}
      </div>
      <QuestionInput question={question} value={value} onChange={onChange} />
      {question.comments_enabled && (
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
          />
        </div>
      )}
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
    </div>
  );
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
  switch (normalizeQuestionType(question.type)) {
    case 'short_text':
      return (
        <Input
          value={(value as string) || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Your answer..."
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
        />
      );
    case 'number':
      return (
        <Input
          type="number"
          value={(value as string | number) || ''}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          placeholder="0"
        />
      );
    case 'email':
      return (
        <Input
          type="email"
          value={(value as string) || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="name@example.com"
        />
      );
    case 'phone':
      return (
        <Input
          type="tel"
          value={(value as string) || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="+91 XXXXX XXXXX"
        />
      );
    case 'date':
      return (
        <Input
          type="date"
          value={(value as string) || ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'dropdown':
      return (
        <select
          value={(value as string) || ''}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          <option value="">Select...</option>
          {question.options.map((opt) => (
            <option key={opt.id} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      );
    case 'radio':
    case 'yes_no':
      return (
        <RadioGroup
          value={(value as string) || ''}
          onValueChange={onChange}
        >
          <div className="space-y-2">
            {question.options.map((opt) => (
              <div key={opt.id} className="flex items-center space-x-3 p-2 rounded-lg hover:bg-slate-50 transition-colors">
                <RadioGroupItem value={opt.value} id={`${question.id}-${opt.id}`} />
                <Label htmlFor={`${question.id}-${opt.id}`} className="font-normal cursor-pointer">
                  {opt.label}
                </Label>
              </div>
            ))}
          </div>
        </RadioGroup>
      );
    case 'checkbox': {
      const selected = (value as string[]) || [];
      return (
        <div className="space-y-2">
          {question.options.map((opt) => (
            <div key={opt.id} className="flex items-center space-x-3 p-2 rounded-lg hover:bg-slate-50 transition-colors">
              <Checkbox
                id={`${question.id}-${opt.id}`}
                checked={selected.includes(opt.value)}
                onCheckedChange={(checked) => {
                  if (checked) {
                    onChange([...selected, opt.value]);
                  } else {
                    onChange(selected.filter((v) => v !== opt.value));
                  }
                }}
              />
              <Label htmlFor={`${question.id}-${opt.id}`} className="font-normal cursor-pointer">
                {opt.label}
              </Label>
            </div>
          ))}
        </div>
      );
    }
    case 'likert_5':
    case 'likert_7': {
      const scale = question.type === 'likert_5' ? 5 : 7;
      const labels = scale === 5
        ? ['Strongly Disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly Agree']
        : ['Very Strongly Disagree', 'Strongly Disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly Agree', 'Very Strongly Agree'];
      return (
        <RadioGroup
          value={(value as string) || ''}
          onValueChange={onChange}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {labels.map((label, i) => (
              <div key={i} className="flex items-center space-x-3 p-2 rounded-lg hover:bg-slate-50 transition-colors">
                <RadioGroupItem value={String(i + 1)} id={`${question.id}-${i}`} />
                <Label htmlFor={`${question.id}-${i}`} className="font-normal cursor-pointer text-sm">
                  {i + 1}. {label}
                </Label>
              </div>
            ))}
          </div>
        </RadioGroup>
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
            className="w-full accent-sky-600"
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
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left p-2"></th>
                {cols.map((col) => (
                  <th key={col.id} className="text-center p-2 font-medium text-slate-600 text-xs">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="p-2 text-slate-700">{row.label}</td>
                  {cols.map((col) => (
                    <td key={col.id} className="text-center p-2">
                      <input
                        type="radio"
                        name={`${question.id}-${row.id}`}
                        value={col.value}
                        checked={matrixValue[row.id] === col.value}
                        onChange={() => onChange({ ...matrixValue, [row.id]: col.value })}
                        className="accent-sky-600"
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
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left p-2"></th>
                {cols.map((col) => (
                  <th key={col.id} className="text-center p-2 font-medium text-slate-600 text-xs">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const selected = matrixValue[row.id] || [];
                return (
                  <tr key={row.id} className="border-t">
                    <td className="p-2 text-slate-700">{row.label}</td>
                    {cols.map((col) => (
                      <td key={col.id} className="text-center p-2">
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
      const ranked = (value as string[]) || [];
      return (
        <div className="space-y-2">
          {question.options.map((opt) => {
            const rank = ranked.indexOf(opt.value);
            return (
              <div key={opt.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors">
                <select
                  value={rank === -1 ? '' : String(rank + 1)}
                  onChange={(e) => {
                    const newRank = e.target.value === '' ? -1 : parseInt(e.target.value) - 1;
                    let newRanked = ranked.filter((v) => v !== opt.value);
                    if (newRank >= 0) {
                      newRanked = [...newRanked];
                      newRanked.splice(newRank, 0, opt.value);
                    }
                    onChange(newRanked);
                  }}
                  className="w-16 rounded-md border border-slate-200 px-2 py-1 text-sm"
                >
                  <option value="">—</option>
                  {question.options.map((_, i) => (
                    <option key={i} value={String(i + 1)}>{i + 1}</option>
                  ))}
                </select>
                <span className="text-sm text-slate-700">{opt.label}</span>
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
          />
          {Array.isArray(value) && value.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
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
