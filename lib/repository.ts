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

export async function createRespondent(surveyId: string, email?: string): Promise<Respondent> {
  const responseId = `RSP-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const { data, error } = await supabaseServer
    .from('respondents')
    .insert({
      response_id: responseId,
      survey_id: surveyId,
      email: email || null,
      status: 'started',
    })
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

// Fetches answers for many respondents in a single round-trip instead of one
// query per respondent. Supabase/PostgREST caps a single response at 1000 rows,
// so this pages through in batches of `pageSize` respondent IDs at a time and
// stitches the results together into a Map keyed by respondent_id.
export async function getAnswersForRespondents(
  respondentIds: string[],
  pageSize = 200
): Promise<Map<string, ResponseAnswer[]>> {
  const byRespondent = new Map<string, ResponseAnswer[]>();
  if (respondentIds.length === 0) return byRespondent;

  for (let i = 0; i < respondentIds.length; i += pageSize) {
    const chunk = respondentIds.slice(i, i + pageSize);
    const { data, error } = await supabaseServer
      .from('response_answers')
      .select('*')
      .in('respondent_id', chunk);
    if (error) throw error;
    (data as ResponseAnswer[]).forEach((answer) => {
      const list = byRespondent.get(answer.respondent_id) || [];
      list.push(answer);
      byRespondent.set(answer.respondent_id, list);
    });
  }

  return byRespondent;
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

export interface PaginatedRespondents {
  respondents: Respondent[];
  total: number;
}

// `page` is 1-indexed. Pass no page/pageSize to get the old "fetch everything"
// behavior (still used internally by the response sheet export, which needs
// every row anyway). The admin dashboard table now passes page/pageSize so it
// only pulls one page of rows per request instead of the entire table.
export async function getAllRespondents(
  surveyId?: string,
  page?: number,
  pageSize?: number
): Promise<PaginatedRespondents> {
  let query = supabaseServer
    .from('respondents')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });
  if (surveyId) query = query.eq('survey_id', surveyId);
  if (page && pageSize) {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);
  }
  const { data, error, count } = await query;
  if (error) throw error;
  return { respondents: data as Respondent[], total: count ?? (data as Respondent[]).length };
}

export async function getRespondentWithAnswers(responseId: string) {
  const respondent = await getRespondentByResponseId(responseId);
  if (!respondent) return null;
  const answers = await getAnswers(respondent.id);
  return { respondent, answers };
}

export async function getAdminResponseSheet(surveyId?: string) {
  const selectedSurvey = surveyId ? await getSurveyById(surveyId) : null;
  const surveys = selectedSurvey ? [selectedSurvey] : await getActiveSurveys();
  const { respondents } = await getAllRespondents(surveyId);

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
  const answersByRespondent = await getAnswersForRespondents(respondents.map((r) => r.id));
  const answerEntries = respondents.map((respondent) => ({
    respondent,
    answers: answersByRespondent.get(respondent.id) || [],
  }));

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