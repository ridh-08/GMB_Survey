-- Required for the import script to UPSERT sections and questions instead of
-- deleting and recreating them on every content re-import. Recreating rows
-- previously cascade-deleted respondents (via respondents.survey_id) and
-- response_answers (via response_answers.question_id) on every re-import —
-- this migration is part of the fix that makes content re-imports safe to
-- run against a live database with real submitted responses.

alter table sections
  add constraint sections_survey_id_code_key unique (survey_id, code);

alter table questions
  add constraint questions_section_id_code_key unique (section_id, code);
