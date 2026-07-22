import 'server-only';

import { supabaseServer } from './supabase-server';
import type {
  Survey,
  SurveyWithSections,
  Section,
  SectionWithQuestions,
  Question,
  Option,
  MatrixRow,
  MatrixColumn,
  BranchRule,
  Respondent,
  CompletionMode,
  ResponseAnswer,
  QuestionWithOptions,
} from './types';

export interface ResponseSheetColumn {
  key: string;
  label: string;
  survey_id: string;
  survey_title: string;
  question_id: string;
  question_code: string;
}

export interface ResponseSheetRow {
  response_id: string;
  survey_id: string;
  survey_title: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  last_updated: string;
  values: Record<string, string>;
}

export async function getActiveSurveys(): Promise<Survey[]> {
  const { data, error } = await supabaseServer
    .from('surveys')
    .select('*')
    .eq('status', 'active')
    .order('created_at');
  if (error) throw error;
  return data as Survey[];
}

export async function getSurveyByCode(code: string): Promise<Survey | null> {
  const { data, error } = await supabaseServer
    .from('surveys')
    .select('*')
    .eq('code', code)
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw error;
  return data as Survey | null;
}

export async function getSurveyById(id: string): Promise<Survey | null> {
  const { data, error } = await supabaseServer
    .from('surveys')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as Survey | null;
}

export async function getFullSurvey(surveyId: string): Promise<SurveyWithSections | null> {
  const survey = await getSurveyById(surveyId);
  if (!survey) return null;

  const { data: branchRules, error: branchError } = await supabaseServer
    .from('branch_rules')
    .select('*')
    .eq('survey_id', surveyId)
    .order('display_order');
  if (branchError) throw branchError;

  const { data: sections, error: secError } = await supabaseServer
    .from('sections')
    .select('*')
    .eq('survey_id', surveyId)
    .order('display_order');
  if (secError) throw secError;

  const sectionsWithQuestions = await Promise.all(
    (sections as Section[]).map(async (section) => {
      const { data: questions, error: qError } = await supabaseServer
        .from('questions')
        .select('*')
        .eq('section_id', section.id)
        .order('display_order');
      if (qError) throw qError;

      const questionsWithOptions = await Promise.all(
        (questions as Question[]).map(async (q) => {
          const [optsResult, rowsResult, colsResult] = await Promise.all([
            supabaseServer.from('options').select('*').eq('question_id', q.id).order('display_order'),
            supabaseServer.from('matrix_rows').select('*').eq('question_id', q.id).order('display_order'),
            supabaseServer.from('matrix_columns').select('*').eq('question_id', q.id).order('display_order'),
          ]);

          return {
            ...q,
            options: (optsResult.data || []) as Option[],
            matrix_rows: (rowsResult.data || []) as MatrixRow[],
            matrix_columns: (colsResult.data || []) as MatrixColumn[],
          };
        })
      );

      return { ...section, questions: questionsWithOptions };
    })
  );

  return { ...survey, sections: sectionsWithQuestions, branch_rules: branchRules as BranchRule[] };
}

export interface CreateRespondentInput {
  email?: string;
  companyName: string | null;
  jobTitle: string | null;
  completionMode: CompletionMode;
  companyCode?: string | null; // provided only when joining an existing team response
  sectionScope?: string[] | null; // section codes this respondent is answering (team mode only)
}

export interface CompanyGroupStatus {
  companyCode: string;
  companyName: string | null;
  respondentCount: number;
  coveredSections: string[]; // union of every joined respondent's section_scope, plus 'A' if a starter exists
  hasStarter: boolean;
}

function generateCompanyCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I, easier to read aloud/type
  let code = '';
  for (let i = 0; i < 4; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return `GMB-${code}`;
}

export async function generateUniqueCompanyCode(surveyId: string): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = generateCompanyCode();
    const { data, error } = await supabaseServer
      .from('respondents')
      .select('id')
      .eq('survey_id', surveyId)
      .eq('company_code', code)
      .limit(1);
    if (error) throw error;
    if (!data || data.length === 0) return code;
  }
  throw new Error('Could not generate a unique company code, please try again.');
}

export async function getCompanyGroupStatus(
  surveyId: string,
  companyCode: string
): Promise<CompanyGroupStatus | null> {
  const { data, error } = await supabaseServer
    .from('respondents')
    .select('company_name, section_scope, is_group_starter')
    .eq('survey_id', surveyId)
    .eq('company_code', companyCode);
  if (error) throw error;
  if (!data || data.length === 0) return null;

  const coveredSections = new Set<string>();
  let hasStarter = false;
  let companyName: string | null = null;
  for (const row of data as Array<{ company_name: string | null; section_scope: string[] | null; is_group_starter: boolean }>) {
    if (row.is_group_starter) {
      hasStarter = true;
      coveredSections.add('A');
    }
    (row.section_scope || []).forEach((code) => coveredSections.add(code));
    if (row.company_name && !companyName) companyName = row.company_name;
  }

  return {
    companyCode,
    companyName,
    respondentCount: data.length,
    coveredSections: Array.from(coveredSections),
    hasStarter,
  };
}

export async function createRespondent(surveyId: string, input: CreateRespondentInput): Promise<Respondent> {
  const responseId = `RSP-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  let companyCode: string | null = null;
  let isGroupStarter = true;

  if (input.completionMode === 'team') {
    if (input.companyCode) {
      const group = await getCompanyGroupStatus(surveyId, input.companyCode);
      if (!group) throw new Error('That company code was not found for this survey.');
      companyCode = input.companyCode;
      isGroupStarter = false;
    } else {
      companyCode = await generateUniqueCompanyCode(surveyId);
      isGroupStarter = true;
    }
  }

  const { data, error } = await supabaseServer
    .from('respondents')
    .insert({
      response_id: responseId,
      survey_id: surveyId,
      email: input.email || null,
      status: 'started',
      company_name: input.companyName,
      job_title: input.jobTitle,
      completion_mode: input.completionMode,
      company_code: companyCode,
      section_scope: input.completionMode === 'team' ? input.sectionScope || [] : null,
      is_group_starter: isGroupStarter,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Respondent;
}

// Lets a respondent who started solo switch to team mode mid-survey (e.g.
// they didn't realize how much the survey covered until partway through).
// They keep whatever they've already answered, become the group starter,
// and pick which of the remaining sections they still want to own — the
// rest become available for colleagues to claim via the generated code.
export async function switchRespondentToTeamMode(
  respondentId: string,
  surveyId: string,
  sectionScope: string[]
): Promise<Respondent> {
  const companyCode = await generateUniqueCompanyCode(surveyId);
  const { data, error } = await supabaseServer
    .from('respondents')
    .update({
      completion_mode: 'team',
      company_code: companyCode,
      section_scope: sectionScope,
      is_group_starter: true,
    })
    .eq('id', respondentId)
    .select()
    .single();
  if (error) throw error;
  return data as Respondent;
}

export async function getRespondentByResponseId(responseId: string): Promise<Respondent | null> {
  const { data, error } = await supabaseServer
    .from('respondents')
    .select('*')
    .eq('response_id', responseId)
    .maybeSingle();
  if (error) throw error;
  return data as Respondent | null;
}

export async function upsertAnswer(
  respondentId: string,
  questionId: string,
  questionCode: string,
  value: unknown,
  comment?: string
): Promise<void> {
  const { error } = await supabaseServer.from('response_answers').upsert(
    {
      respondent_id: respondentId,
      question_id: questionId,
      question_code: questionCode,
      value: value as never,
      comment: comment || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'respondent_id,question_id' }
  );
  if (error) throw error;
}

export async function getAnswers(respondentId: string): Promise<ResponseAnswer[]> {
  const { data, error } = await supabaseServer
    .from('response_answers')
    .select('*')
    .eq('respondent_id', respondentId);
  if (error) throw error;
  return data as ResponseAnswer[];
}

export async function updateRespondentProgress(
  respondentId: string,
  sectionIndex: number,
  questionIndex: number
): Promise<void> {
  const { error } = await supabaseServer
    .from('respondents')
    .update({
      current_section_index: sectionIndex,
      current_question_index: questionIndex,
      last_updated: new Date().toISOString(),
    })
    .eq('id', respondentId);
  if (error) throw error;
}

export async function completeSurvey(respondentId: string): Promise<void> {
  const { error } = await supabaseServer
    .from('respondents')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      last_updated: new Date().toISOString(),
    })
    .eq('id', respondentId);
  if (error) throw error;
}

export interface CompanyGroupSummary {
  companyCode: string;
  companyName: string | null;
  respondents: Respondent[];
  coveredSections: string[];
  hasStarter: boolean;
}

export async function getCompanyGroups(surveyId: string): Promise<CompanyGroupSummary[]> {
  const respondents = await getAllRespondents(surveyId);
  const groups = new Map<string, CompanyGroupSummary>();

  respondents
    .filter((r) => r.completion_mode === 'team' && r.company_code)
    .forEach((r) => {
      const code = r.company_code as string;
      const existing = groups.get(code) || {
        companyCode: code,
        companyName: null,
        respondents: [],
        coveredSections: [],
        hasStarter: false,
      };
      existing.respondents.push(r);
      if (!existing.companyName && r.company_name) existing.companyName = r.company_name;
      if (r.is_group_starter) {
        existing.hasStarter = true;
        if (!existing.coveredSections.includes('A')) existing.coveredSections.push('A');
      }
      (r.section_scope || []).forEach((code) => {
        if (!existing.coveredSections.includes(code)) existing.coveredSections.push(code);
      });
      groups.set(code, existing);
    });

  return Array.from(groups.values());
}

export async function getAllRespondents(surveyId?: string): Promise<Respondent[]> {
  let query = supabaseServer.from('respondents').select('*').order('created_at', { ascending: false });
  if (surveyId) query = query.eq('survey_id', surveyId);
  const { data, error } = await query;
  if (error) throw error;
  return data as Respondent[];
}

export async function getRespondentWithAnswers(responseId: string) {
  const respondent = await getRespondentByResponseId(responseId);
  if (!respondent) return null;
  const answers = await getAnswers(respondent.id);
  return { respondent, answers };
}

export interface MergedCompanyColumn {
  key: string;
  label: string;
  question_id: string;
  question_code: string;
  section_code: string;
}

export interface MergedCompanyRow {
  company_code: string;
  company_name: string | null;
  respondent_count: number;
  covered_sections: string[];
  missing_sections: string[];
  complete: boolean;
  contributors: Array<{ response_id: string; job_title: string | null; sections: string[]; status: string }>;
  values: Record<string, string>;
  conflicts: string[]; // human-readable notes when >1 respondent answered the same question
}

const ALL_SECTION_CODES = ['A', 'B', 'C', 'D', 'E'];

export async function getMergedCompanySheet(
  surveyId: string
): Promise<{ columns: MergedCompanyColumn[]; rows: MergedCompanyRow[] }> {
  const fullSurvey = await getFullSurvey(surveyId);
  if (!fullSurvey) return { columns: [], rows: [] };

  const questionSection = new Map<string, { code: string; question: Question }>();
  fullSurvey.sections.forEach((section) => {
    section.questions.forEach((question) => {
      questionSection.set(question.id, { code: section.code, question });
    });
  });

  const columns: MergedCompanyColumn[] = Array.from(questionSection.values()).map(({ code, question }) => ({
    key: question.code,
    label: `${question.code} ${question.text}`.trim(),
    question_id: question.id,
    question_code: question.code,
    section_code: code,
  }));

  const respondents = (await getAllRespondents(surveyId)).filter(
    (r) => r.completion_mode === 'team' && r.company_code
  );

  const byCode = new Map<string, Respondent[]>();
  respondents.forEach((r) => {
    const code = r.company_code as string;
    const list = byCode.get(code) || [];
    list.push(r);
    byCode.set(code, list);
  });

  const rows: MergedCompanyRow[] = await Promise.all(
    Array.from(byCode.entries()).map(async ([companyCode, group]) => {
      const coveredSections = new Set<string>();
      let companyName: string | null = null;
      group.forEach((r) => {
        if (r.is_group_starter) coveredSections.add('A');
        (r.section_scope || []).forEach((s) => coveredSections.add(s));
        if (!companyName && r.company_name) companyName = r.company_name;
      });

      const values: Record<string, string> = {};
      const owningRespondentFor: Record<string, string> = {}; // questionCode -> response_id that supplied it
      const conflicts: string[] = [];

      // Answer every question from whichever respondent actually owns that
      // question's section, so each cell in the merged row is unambiguous.
      for (const r of group) {
        const ownedSections = new Set<string>(r.section_scope || []);
        if (r.is_group_starter) ownedSections.add('A');
        const answers = await getAnswers(r.id);
        answers.forEach((answer) => {
          const meta = questionSection.get(answer.question_id);
          if (!meta || !ownedSections.has(meta.code)) return; // ignore answers outside their assigned scope
          const formatted = formatAnswerForSheet(answer.value, answer.comment);
          if (values[meta.question.code] !== undefined && values[meta.question.code] !== formatted) {
            conflicts.push(
              `${meta.question.code}: differing answers from multiple respondents (kept the first one recorded)`
            );
            return;
          }
          values[meta.question.code] = formatted;
          owningRespondentFor[meta.question.code] = r.response_id;
        });
      }

      return {
        company_code: companyCode,
        company_name: companyName,
        respondent_count: group.length,
        covered_sections: ALL_SECTION_CODES.filter((s) => coveredSections.has(s)),
        missing_sections: ALL_SECTION_CODES.filter((s) => !coveredSections.has(s)),
        complete: ALL_SECTION_CODES.every((s) => coveredSections.has(s)),
        contributors: group.map((r) => ({
          response_id: r.response_id,
          job_title: r.job_title,
          sections: r.is_group_starter ? ['A', ...(r.section_scope || [])] : r.section_scope || [],
          status: r.status,
        })),
        values,
        conflicts,
      };
    })
  );

  return { columns, rows };
}

export async function getAdminResponseSheet(surveyId?: string) {
  const selectedSurvey = surveyId ? await getSurveyById(surveyId) : null;
  const surveys = selectedSurvey ? [selectedSurvey] : await getActiveSurveys();
  const respondents = await getAllRespondents(surveyId);

  const fullSurveys = await Promise.all(
    surveys.map(async (survey) => ({
      survey,
      full: await getFullSurvey(survey.id),
    }))
  );

  const surveyMap = new Map(
    fullSurveys
      .filter((entry): entry is { survey: Survey; full: SurveyWithSections } => Boolean(entry.full))
      .map((entry) => [entry.survey.id, entry.full] as const)
  );

  const surveyMetaMap = new Map(surveys.map((survey) => [survey.id, survey] as const));
  const columnMap = new Map<string, ResponseSheetColumn>();

  for (const [surveyIdKey, fullSurvey] of Array.from(surveyMap.entries())) {
    const surveyMeta = surveyMetaMap.get(surveyIdKey);
    if (!surveyMeta) continue;

    fullSurvey.sections.forEach((section: SectionWithQuestions) => {
      section.questions.forEach((question: QuestionWithOptions) => {
        const key = `${surveyMeta.code}__${question.code}`;
        if (!columnMap.has(key)) {
          columnMap.set(key, {
            key,
            label: `${question.code} ${question.text}`.trim(),
            survey_id: surveyMeta.id,
            survey_title: surveyMeta.title,
            question_id: question.id,
            question_code: question.code,
          });
        }
      });
    });
  }

  const columns = Array.from(columnMap.values());
  const answerEntries = await Promise.all(
    respondents.map(async (respondent) => ({
      respondent,
      answers: await getAnswers(respondent.id),
    }))
  );

  const rows: ResponseSheetRow[] = answerEntries.map(({ respondent, answers }) => {
    const surveyMeta = surveyMetaMap.get(respondent.survey_id);
    const fullSurvey = surveyMap.get(respondent.survey_id);
    const valueMap: Record<string, string> = {};

    const questionLookup = new Map<string, Question>();
    fullSurvey?.sections.forEach((section) => {
      section.questions.forEach((question) => {
        questionLookup.set(question.id, question);
      });
    });

    answers.forEach((answer) => {
      const question = questionLookup.get(answer.question_id);
      const columnKey = surveyMeta && question ? `${surveyMeta.code}__${question.code}` : null;
      if (!columnKey) return;
      valueMap[columnKey] = formatAnswerForSheet(answer.value, answer.comment);
    });

    return {
      response_id: respondent.response_id,
      survey_id: respondent.survey_id,
      survey_title: surveyMeta?.title || respondent.survey_id,
      status: respondent.status,
      started_at: respondent.started_at,
      completed_at: respondent.completed_at,
      last_updated: respondent.last_updated,
      values: valueMap,
    };
  });

  return { columns, rows };
}

function formatAnswerForSheet(value: unknown, comment?: string | null): string {
  const formatted = formatAnswerValue(value);
  if (!comment) return formatted;
  return `${formatted} | Comment: ${comment}`;
}

function formatAnswerValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map((item) => formatAnswerValue(item)).join(', ');
  return JSON.stringify(value, null, 2);
}
