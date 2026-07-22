'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { SurveyWithSections, SectionWithQuestions, QuestionWithOptions, BranchRule, QuestionType } from '@/lib/types';
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

interface RespondentMeta {
  completionMode: 'solo' | 'team';
  companyCode: string | null;
  sectionScope: string[] | null;
  isGroupStarter: boolean;
}

// The employer survey's many topic sub-sections (Retention, Training,
// Quality, Automation, etc.) are clubbed into three respondent-facing
// buckets — People, Processes, Technology — plus a catch-all for anything
// that doesn't belong to one of those three (e.g. the open-ended section).
// Anyone picking sections to complete (team setup, or mid-survey handoff)
// sees just these buckets rather than every individual sub-heading.
type SectionGroupKey = 'people' | 'processes' | 'technology' | 'general';

const SECTION_GROUP_META: Record<SectionGroupKey, { label: string; hint: string }> = {
  people: { label: 'People', hint: 'Typically HR or Head of Operations' },
  processes: { label: 'Processes', hint: 'Typically an Operational / Business Excellence lead' },
  technology: { label: 'Technology', hint: 'Typically the CEO or CTO' },
  general: { label: 'General', hint: 'Open to anyone on the team' },
};

// Section codes follow the pattern B* (people), C* (processes), D* (technology).
// Anything else (e.g. E, the open-ended section) falls into "general".
function sectionGroupKey(code: string): SectionGroupKey {
  if (code.startsWith('B')) return 'people';
  if (code.startsWith('C')) return 'processes';
  if (code.startsWith('D')) return 'technology';
  return 'general';
}

interface SectionGroup<S> {
  key: SectionGroupKey;
  label: string;
  hint: string;
  codes: string[];
  sections: S[];
}

// Buckets a flat list of sections (excluding the firm-profile section A)
// into the People/Processes/Technology groups, in a stable order.
function groupSections<S extends { code: string }>(sections: S[]): SectionGroup<S>[] {
  const order: SectionGroupKey[] = ['people', 'processes', 'technology', 'general'];
  return order
    .map((key) => {
      const groupSectionsList = sections.filter((s) => sectionGroupKey(s.code) === key);
      return {
        key,
        label: SECTION_GROUP_META[key].label,
        hint: SECTION_GROUP_META[key].hint,
        codes: groupSectionsList.map((s) => s.code),
        sections: groupSectionsList,
      };
    })
    .filter((g) => g.sections.length > 0);
}

// A team starter always covers Section A (the firm profile) since it's
// company-level identifying info that only needs to be given once. Everyone
// else only sees the section(s) they picked.
function filterSectionsForRespondent<S extends { code: string }>(sections: S[], meta: RespondentMeta | null): S[] {
  if (!meta || meta.completionMode !== 'team') return sections;
  const scope = new Set(meta.sectionScope || []);
  if (meta.isGroupStarter) scope.add('A');
  return sections.filter((s) => scope.has(s.code));
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
  const [respondentMeta, setRespondentMeta] = useState<RespondentMeta | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [showSwitchModal, setShowSwitchModal] = useState(false);
  const [switchSelectedSections, setSwitchSelectedSections] = useState<string[]>([]);
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [pendingTeamCode, setPendingTeamCode] = useState<string | null>(null);
  const [pendingRespondentMeta, setPendingRespondentMeta] = useState<RespondentMeta | null>(null);
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
            setRespondentMeta({
              completionMode: respondent.completion_mode || 'solo',
              companyCode: respondent.company_code || null,
              sectionScope: respondent.section_scope || null,
              isGroupStarter: respondent.is_group_starter !== false,
            });
            setCurrentSection(respondent.current_section_index || 0);
            const { answerMap, commentMap } = hydrateAnswers(payload.answers || []);
            setAnswers(answerMap);
            setComments(commentMap);
            setLastSavedAt(respondent.last_updated || null);
          }
        }
        // If there's no resumable respondent, we deliberately don't create
        // one yet — the team-setup screen (company name, solo/team, which
        // section(s)) collects that first and creates the respondent itself.
        setLoading(false);
      } catch (err) {
        console.error('Failed to load survey:', err);
        setError('Failed to load survey. Please try again later.');
        setLoading(false);
      }
    })();
  }, [surveyId]);

  const handleSetupComplete = (respondent: {
    id: string;
    response_id: string;
    completion_mode: 'solo' | 'team';
    company_code: string | null;
    section_scope: string[] | null;
    is_group_starter: boolean;
  }) => {
    setRespondentId(respondent.id);
    setResponseId(respondent.response_id);
    setRespondentMeta({
      completionMode: respondent.completion_mode,
      companyCode: respondent.company_code,
      sectionScope: respondent.section_scope,
      isGroupStarter: respondent.is_group_starter,
    });
  };

  const handleSwitchToTeam = async () => {
    if (!responseId) return;
    const alreadyStartedCodes = visibleSections
      .filter((s) => s.code !== 'A' && s.questions.some((q) => answers[q.id] !== undefined))
      .map((s) => s.code);
    const finalScope = Array.from(new Set([...switchSelectedSections, ...alreadyStartedCodes]));
    setSwitching(true);
    setSwitchError(null);
    try {
      const res = await fetch(`/api/surveys/${survey?.id}/respondents/${responseId}/switch-to-team`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ sectionScope: finalScope }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) throw new Error(data?.error || 'Failed to switch to team mode. Please try again.');
      setPendingRespondentMeta({
        completionMode: 'team',
        companyCode: data.respondent.company_code,
        sectionScope: data.respondent.section_scope,
        isGroupStarter: true,
      });
      setPendingTeamCode(data.respondent.company_code);
    } catch (err) {
      setSwitchError(err instanceof Error ? err.message : 'Failed to switch to team mode.');
    } finally {
      setSwitching(false);
    }
  };

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
  const visibleSections = survey ? filterSectionsForRespondent(survey.sections, respondentMeta) : [];

  const validateSection = (): boolean => {
    if (!survey) return false;
    const section = visibleSections[currentSection];
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

      // Employee survey B2.4 ("away from family") is only required when the
      // preceding B2.3 commute-time answer is over 1 hour each way.
      if (survey.type === 'employee' && q.code === 'B2.4') {
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
    const next = getNextSectionIndex(currentSection, visibleSections, survey.branch_rules || [], answers);
    if (next < visibleSections.length) {
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
      const showCode = respondentMeta?.completionMode === 'team' && respondentMeta.isGroupStarter && respondentMeta.companyCode;
      router.push(showCode ? `/survey/complete?code=${encodeURIComponent(respondentMeta!.companyCode!)}` : '/survey/complete');
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

  if (!respondentId) {
    return <CompanySetup survey={survey} onComplete={handleSetupComplete} />;
  }

  const section = visibleSections[currentSection];
  const progress = visibleSections.length > 0 ? ((currentSection + 1) / visibleSections.length) * 100 : 0;
  const visibleQuestions = section ? getVisibleQuestions(section.questions, answers, survey.branch_rules || []) : [];

  return (
    <div className="min-h-screen bg-slate-50 font-garamond text-[17px] leading-relaxed text-slate-900">
      {showSwitchModal && (
        <div className="fixed inset-0 z-30 bg-slate-900/40 overflow-y-auto px-6 py-8">
          <div className="min-h-full flex items-start justify-center">
            <Card className="max-w-lg w-full p-8 my-auto max-h-[85vh] flex flex-col">
              <h2 className="text-lg font-semibold text-slate-900 mb-1">Split this survey with your team</h2>
              <p className="text-sm text-slate-600 mb-4">
                You'll keep whatever you've already answered. Pick which of the remaining areas you
                still want to complete yourself — the rest will be released under a company code you can
                share with colleagues.
              </p>
              <div className="space-y-2 mb-4 overflow-y-auto pr-1">
                {groupSections(visibleSections.filter((s) => s.code !== 'A')).map((g) => {
                  const alreadyStarted = g.sections.some((s) =>
                    s.questions.some((q) => answers[q.id] !== undefined)
                  );
                  return (
                    <div
                      key={g.key}
                      className={`flex items-start gap-3 p-3 border ${alreadyStarted ? 'border-slate-100 bg-slate-50' : 'border-slate-200'}`}
                    >
                      <Checkbox
                        id={`switch-grp-${g.key}`}
                        disabled={alreadyStarted}
                        checked={g.codes.every((c) => switchSelectedSections.includes(c))}
                        onCheckedChange={() =>
                          setSwitchSelectedSections((prev) => {
                            const hasAll = g.codes.every((c) => prev.includes(c));
                            return hasAll
                              ? prev.filter((c) => !g.codes.includes(c))
                              : Array.from(new Set([...prev, ...g.codes]));
                          })
                        }
                      />
                      <div>
                        <Label htmlFor={`switch-grp-${g.key}`} className={`font-medium ${alreadyStarted ? 'text-slate-400' : 'cursor-pointer'}`}>
                          {g.label}
                        </Label>
                        <p className={`text-xs mt-0.5 ${alreadyStarted ? 'text-slate-400' : 'text-slate-500'}`}>
                          {alreadyStarted ? 'Already started by you — stays yours.' : g.hint}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
              {switchError && <p className="text-sm text-red-600 mb-3">{switchError}</p>}
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1 font-garamond" onClick={() => setShowSwitchModal(false)}>
                  Cancel
                </Button>
                <Button
                  className="flex-1 font-garamond"
                  disabled={switching}
                  onClick={handleSwitchToTeam}
                >
                  {switching ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Generate company code
                </Button>
              </div>
            </Card>
          </div>
        </div>
      )}

      {pendingTeamCode && (
        <div className="fixed inset-0 z-40 bg-slate-900/60 overflow-y-auto px-6 py-8">
          <div className="min-h-full flex items-center justify-center">
            <Card className="max-w-md w-full p-8 text-center">
              <h2 className="text-lg font-semibold text-slate-900 mb-2">Your company code</h2>
              <p className="text-sm text-slate-600 mb-4">
                Share this code with your colleagues so they can join and complete the remaining
                sections. You'll also see it at the top of the page while you finish yours.
              </p>
              <div className="font-mono text-3xl font-bold tracking-widest bg-amber-950 text-amber-50 py-4 mb-4">
                {pendingTeamCode}
              </div>
              <Button
                className="w-full font-garamond"
                onClick={() => {
                  if (pendingRespondentMeta) setRespondentMeta(pendingRespondentMeta);
                  setPendingTeamCode(null);
                  setPendingRespondentMeta(null);
                  setShowSwitchModal(false);
                  setCurrentSection(0);
                }}
              >
                Continue to the survey
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Card>
          </div>
        </div>
      )}

      {respondentMeta?.completionMode === 'team' && respondentMeta.companyCode && (
        <div className="sticky top-0 z-20 bg-amber-500 text-amber-950 shadow-md">
          <div className="max-w-3xl mx-auto px-6 py-3 flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-medium">
              Team response &middot; you're completing{' '}
              <strong>{visibleSections.map((s) => s.title).join(', ')}</strong>
            </span>
            <span className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide">Company code:</span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(respondentMeta.companyCode || '');
                  setCodeCopied(true);
                  window.setTimeout(() => setCodeCopied(false), 2000);
                }}
                className="font-mono font-bold text-lg tracking-widest bg-amber-950 text-amber-50 px-4 py-1.5 hover:bg-amber-900 transition-colors"
                title="Copy code to share with colleagues"
              >
                {codeCopied ? 'Copied!' : respondentMeta.companyCode}
              </button>
            </span>
          </div>
        </div>
      )}

      <header className="bg-white sticky top-0 z-10 shadow-sm" style={respondentMeta?.completionMode === 'team' ? { top: '2.5rem' } : undefined}>
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
                {survey.type === 'employer' && respondentMeta?.completionMode === 'solo' && (
                  <button
                    type="button"
                    onClick={() => {
                      setSwitchSelectedSections([]);
                      setSwitchError(null);
                      setShowSwitchModal(true);
                    }}
                    className="underline hover:text-slate-800"
                  >
                    Split this survey with your team instead
                  </button>
                )}
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
              <span>Section {currentSection + 1} of {visibleSections.length}</span>
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
          {currentSection < visibleSections.length - 1 ? (
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
  sections: SectionWithQuestions[],
  branchRules: BranchRule[],
  answers: Record<string, unknown>
) {
  const currentSection = sections[currentSectionIndex];
  const currentQuestionIds = new Set(currentSection.questions.map((question) => question.id));
  const matchedSkipRule = (branchRules || []).find((rule) => {
    if (rule.action !== 'skip_to_section' || !rule.target_section_id) return false;
    if (!currentQuestionIds.has(rule.source_question_id)) return false;
    return matchesBranchCondition(answers[rule.source_question_id], rule.condition);
  });

  if (matchedSkipRule) {
    const targetIndex = sections.findIndex((section) => section.id === matchedSkipRule.target_section_id);
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
// --- Team / company setup wizard -------------------------------------------
// Shown before a brand-new respondent is created. Collects who's answering
// and, for employer surveys, whether they're the sole respondent or one of a
// team splitting the survey by section (People / Processes / Technology),
// linked together by a shared company code.

type SetupStep = 'welcome' | 'details' | 'mode' | 'team_choice' | 'join_code' | 'pick_sections' | 'code_reveal';

interface CompanySetupRespondent {
  id: string;
  response_id: string;
  completion_mode: 'solo' | 'team';
  company_code: string | null;
  section_scope: string[] | null;
  is_group_starter: boolean;
}

function CompanySetup({
  survey,
  onComplete,
}: {
  survey: SurveyWithSections;
  onComplete: (respondent: CompanySetupRespondent) => void;
}) {
  const allowTeamMode = survey.type === 'employer';
  const pickableSections = survey.sections.filter((s) => s.code !== 'A');

  const [step, setStep] = useState<SetupStep>('welcome');
  const [companyName, setCompanyName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [email, setEmail] = useState('');
  const [mode, setMode] = useState<'solo' | 'team'>('solo');
  const [joinCode, setJoinCode] = useState('');
  const [joinLookup, setJoinLookup] = useState<{ loading: boolean; error: string | null; companyName: string | null; covered: string[] } | null>(null);
  const [selectedSections, setSelectedSections] = useState<string[]>([]);
  const [isStarter, setIsStarter] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [readyRespondent, setReadyRespondent] = useState<CompanySetupRespondent | null>(null);

  const goToModeOrSubmit = () => {
    if (allowTeamMode && (!companyName.trim() || !jobTitle.trim())) return;
    if (!email.trim()) return;
    if (allowTeamMode) {
      setStep('mode');
    } else {
      void submit('solo', null, null, true);
    }
  };

  const chooseMode = (chosen: 'solo' | 'team') => {
    setMode(chosen);
    if (chosen === 'solo') {
      void submit('solo', null, null, true);
    } else {
      setStep('team_choice');
    }
  };

  const startNewTeamResponse = () => {
    setIsStarter(true);
    setSelectedSections([]);
    setStep('pick_sections');
  };

  const lookupCode = async () => {
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    setJoinLookup({ loading: true, error: null, companyName: null, covered: [] });
    try {
      const res = await fetch(`/api/surveys/${survey.id}/company-code/${encodeURIComponent(code)}`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok || !data.valid) {
        setJoinLookup({ loading: false, error: 'No response found for that code on this survey.', companyName: null, covered: [] });
        return;
      }
      setJoinLookup({ loading: false, error: null, companyName: data.companyName, covered: data.coveredSections || [] });
      setIsStarter(false);
      setSelectedSections([]);
      setStep('pick_sections');
    } catch {
      setJoinLookup({ loading: false, error: 'Something went wrong looking up that code. Please try again.', companyName: null, covered: [] });
    }
  };

  const submit = async (
    finalMode: 'solo' | 'team',
    companyCode: string | null,
    sectionScope: string[] | null,
    starter: boolean
  ) => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/surveys/${survey.id}/respondents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          mode: finalMode,
          companyName: companyName.trim(),
          jobTitle: jobTitle.trim(),
          email: email.trim(),
          companyCode: companyCode || undefined,
          sectionScope: sectionScope || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to start the survey.');
      }
      const respondent: CompanySetupRespondent = { ...data.respondent, is_group_starter: starter };
      if (finalMode === 'team' && starter && respondent.company_code) {
        // New company code just minted — show it prominently before moving on.
        setReadyRespondent(respondent);
        setStep('code_reveal');
        setSubmitting(false);
      } else {
        onComplete(respondent);
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to start the survey.');
      setSubmitting(false);
    }
  };

  const submitTeamSections = () => {
    if (selectedSections.length === 0) return;
    void submit('team', isStarter ? null : joinCode.trim().toUpperCase(), selectedSections, isStarter);
  };

  const wrap = (children: React.ReactNode) => (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 font-garamond px-6 py-12">
      <Card className="p-8 max-w-lg w-full">
        <h1 className="text-xl font-semibold text-slate-900 mb-1">{survey.title}</h1>
        <p className="text-sm text-slate-500 mb-6">
          {step === 'welcome' ? 'Before you begin.' : 'Before you begin, a couple of quick questions.'}
        </p>
        {children}
        {submitError && <p className="text-sm text-red-600 mt-4">{submitError}</p>}
      </Card>
    </div>
  );

  if (step === 'welcome') {
    return wrap(
      <div className="space-y-4">
        <p className="text-sm text-slate-500 -mt-2">
          Estimated time: {survey.estimated_time_minutes} minutes
        </p>
        <p className="text-sm text-slate-700">
          Thank you for taking part — your insights genuinely help shape Gujarat's manufacturing
          policy and support.
        </p>
        <ul className="space-y-3 text-sm text-slate-700">
          <li className="flex gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>
              Confidentiality is maintained throughout. Responses are shared only with Ahmedabad
              University and the Confederation of Indian Industry, Gujarat, and no sensitive or
              identifying information will be leaked — your answers are held in strict confidence.
            </span>
          </li>
          <li className="flex gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>
              There's no need to finish in one sitting — your progress is saved automatically and
              you can resume anytime.
            </span>
          </li>
          <li className="flex gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>
              A copy of the final report will be sent to you once the survey and analysis are
              complete.
            </span>
          </li>
        </ul>
        <Button onClick={() => setStep('details')} className="w-full font-garamond mt-2">
          Begin Survey
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    );
  }

  if (step === 'details') {
    return wrap(
      <div className="space-y-4">
        {allowTeamMode && (
          <>
            <div>
              <Label htmlFor="company-name">Company name</Label>
              <Input id="company-name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="mt-1 rounded-none" placeholder="e.g. Acme Manufacturing Pvt Ltd" />
            </div>
            <div>
              <Label htmlFor="job-title">Your job title</Label>
              <Input id="job-title" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} className="mt-1 rounded-none" placeholder="e.g. HR Manager" />
            </div>
          </>
        )}
        <div>
          <Label htmlFor="respondent-email">Email ID</Label>
          <Input id="respondent-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 rounded-none" placeholder="you@company.com" />
        </div>
        <Button
          onClick={goToModeOrSubmit}
          disabled={(allowTeamMode && (!companyName.trim() || !jobTitle.trim())) || !email.trim() || submitting}
          className="w-full font-garamond mt-2"
        >
          Continue
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    );
  }

  if (step === 'mode') {
    return wrap(
      <div className="space-y-3">
        <p className="text-sm text-slate-600 mb-2">
          Is this survey being completed by one person, or split across a few colleagues (e.g. HR for People,
          Operations for Processes, CTO for Technology)?
        </p>
        <button
          type="button"
          onClick={() => chooseMode('solo')}
          className="w-full text-left border border-slate-200 p-4 hover:border-sky-600 transition-colors"
        >
          <div className="font-medium text-slate-900">I'll complete the whole survey myself</div>
          <div className="text-sm text-slate-500">One person, start to finish.</div>
        </button>
        <button
          type="button"
          onClick={() => chooseMode('team')}
          className="w-full text-left border border-slate-200 p-4 hover:border-sky-600 transition-colors"
        >
          <div className="font-medium text-slate-900">We're splitting it across our team</div>
          <div className="text-sm text-slate-500">Different colleagues answer different sections.</div>
        </button>
      </div>
    );
  }

  if (step === 'team_choice') {
    return wrap(
      <div className="space-y-3">
        <button
          type="button"
          onClick={startNewTeamResponse}
          className="w-full text-left border border-slate-200 p-4 hover:border-sky-600 transition-colors"
        >
          <div className="font-medium text-slate-900">Start our company's response</div>
          <div className="text-sm text-slate-500">
            You'll fill the firm profile plus whichever section(s) are yours, then get a code to share with colleagues.
          </div>
        </button>
        <button
          type="button"
          onClick={() => setStep('join_code')}
          className="w-full text-left border border-slate-200 p-4 hover:border-sky-600 transition-colors"
        >
          <div className="font-medium text-slate-900">Join a colleague's response</div>
          <div className="text-sm text-slate-500">Enter the company code they shared with you.</div>
        </button>
      </div>
    );
  }

  if (step === 'join_code') {
    return wrap(
      <div className="space-y-4">
        <div>
          <Label htmlFor="join-code">Company code</Label>
          <Input
            id="join-code"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            className="mt-1 rounded-none font-mono"
            placeholder="GMB-XXXX"
          />
          {joinLookup?.error && <p className="text-sm text-red-600 mt-2">{joinLookup.error}</p>}
        </div>
        <Button onClick={lookupCode} disabled={!joinCode.trim() || joinLookup?.loading} className="w-full font-garamond">
          {joinLookup?.loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Find this response
        </Button>
      </div>
    );
  }

  if (step === 'code_reveal' && readyRespondent) {
    return wrap(
      <div className="space-y-4 text-center">
        <p className="text-sm text-slate-600">
          Share this code with your colleagues so they can join and complete the remaining sections.
          You'll also see it at the top of the page while you finish yours.
        </p>
        <div className="font-mono text-3xl font-bold tracking-widest bg-amber-950 text-amber-50 py-4">
          {readyRespondent.company_code}
        </div>
        <Button className="w-full font-garamond" onClick={() => onComplete(readyRespondent)}>
          Continue to the survey
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    );
  }

  // pick_sections
  const alreadyCovered = joinLookup?.covered || [];
  const groups = groupSections(pickableSections).filter(
    (g) => !g.codes.every((c) => alreadyCovered.includes(c)) || !alreadyCovered.length
  ).map((g) => ({ ...g, codes: g.codes.filter((c) => !alreadyCovered.includes(c)) }))
    .filter((g) => g.codes.length > 0);

  return wrap(
    <div className="space-y-4">
      {!isStarter && joinLookup?.companyName && (
        <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 p-3">
          Joining the response for <strong>{joinLookup.companyName}</strong>.
        </p>
      )}
      <p className="text-sm text-slate-600">
        Which area{isStarter ? ' — besides the firm profile, which is yours as the starter —' : ''} are you
        completing?
      </p>
      {groups.length === 0 ? (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 p-3">
          Every area has already been claimed for this company code. Please check with your colleagues.
        </p>
      ) : (
        <div className="space-y-2">
          {groups.map((g) => {
            const checked = g.codes.every((c) => selectedSections.includes(c));
            return (
              <div key={g.key} className="flex items-start gap-3 p-3 border border-slate-200">
                <Checkbox
                  id={`sec-${g.key}`}
                  checked={checked}
                  onCheckedChange={() => {
                    setSelectedSections((prev) => {
                      const hasAll = g.codes.every((c) => prev.includes(c));
                      return hasAll
                        ? prev.filter((c) => !g.codes.includes(c))
                        : Array.from(new Set([...prev, ...g.codes]));
                    });
                  }}
                />
                <div>
                  <Label htmlFor={`sec-${g.key}`} className="font-medium cursor-pointer">{g.label}</Label>
                  <p className="text-xs text-slate-500 mt-0.5">{g.hint}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <Button
        onClick={submitTeamSections}
        disabled={selectedSections.length === 0 || submitting}
        className="w-full font-garamond"
      >
        {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
        Start answering
        <ArrowRight className="w-4 h-4 ml-2" />
      </Button>
    </div>
  );
}