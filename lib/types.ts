export type SurveyType = 'employer' | 'employee';
export type SurveyStatus = 'active' | 'inactive' | 'archived';
export type SurveyLanguage = 'en' | 'gu' | 'hi';

export type QuestionType =
  | 'short_text'
  | 'long_text'
  | 'paragraph'
  | 'number'
  | 'email'
  | 'phone'
  | 'date'
  | 'dropdown'
  | 'radio'
  | 'checkbox'
  | 'likert_5'
  | 'likert_7'
  | 'matrix'
  | 'matrix_multiple'
  | 'multiple_matrix'
  | 'ranking'
  | 'slider'
  | 'yes_no'
  | 'file_upload';

export interface Survey {
  id: string;
  code: string;
  title: string;
  description: string;
  type: SurveyType;
  status: SurveyStatus;
  version: number;
  language: SurveyLanguage;
  estimated_time_minutes: number;
  created_at: string;
  updated_at: string;
}

export interface Section {
  id: string;
  survey_id: string;
  code: string;
  title: string;
  description: string;
  display_order: number;
}

export interface Question {
  id: string;
  section_id: string;
  code: string;
  text: string;
  description: string;
  type: QuestionType;
  required: boolean;
  validation: Record<string, unknown> | null;
  comments_enabled: boolean;
  display_order: number;
}

export interface Option {
  id: string;
  question_id: string;
  code: string;
  label: string;
  value: string;
  display_order: number;
}

export interface MatrixRow {
  id: string;
  question_id: string;
  label: string;
  display_order: number;
}

export interface MatrixColumn {
  id: string;
  question_id: string;
  label: string;
  value: string;
  display_order: number;
}

export interface BranchRule {
  id: string;
  survey_id: string;
  source_question_id: string;
  condition: Record<string, unknown>;
  action: 'show' | 'hide' | 'skip_to_section';
  target_question_id: string | null;
  target_section_id: string | null;
  display_order: number;
}

export interface QuestionWithOptions extends Question {
  options: Option[];
  matrix_rows?: MatrixRow[];
  matrix_columns?: MatrixColumn[];
}

export interface SectionWithQuestions extends Section {
  questions: QuestionWithOptions[];
}

export interface SurveyWithSections extends Survey {
  sections: SectionWithQuestions[];
  branch_rules?: BranchRule[];
}

export type RespondentStatus = 'started' | 'draft' | 'completed';

export type CompletionMode = 'solo' | 'team';

export interface Respondent {
  id: string;
  response_id: string;
  survey_id: string;
  email: string | null;
  status: RespondentStatus;
  started_at: string;
  completed_at: string | null;
  last_updated: string;
  current_section_index: number;
  current_question_index: number;
  browser: string | null;
  device: string | null;
  ip_address: string | null;
  created_at: string;
  company_name: string | null;
  job_title: string | null;
  completion_mode: CompletionMode;
  company_code: string | null;
  section_scope: string[] | null;
  is_group_starter: boolean;
}

export interface ResponseAnswer {
  id: string;
  respondent_id: string;
  question_id: string;
  question_code: string;
  value: unknown;
  comment: string | null;
  updated_at: string;
}
