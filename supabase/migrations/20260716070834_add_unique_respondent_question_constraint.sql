CREATE UNIQUE INDEX IF NOT EXISTS idx_response_answers_respondent_question_unique
  ON public.response_answers (respondent_id, question_id);
