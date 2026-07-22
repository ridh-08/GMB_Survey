-- Lets a single company's response be split across teammates (e.g. HR fills
-- the People section, Operations fills Processes, CTO fills Technology)
-- instead of forcing one person to answer the whole survey. Respondents that
-- belong to the same firm share a company_code; each tracks which section
-- codes it is responsible for.

alter table respondents
  add column if not exists company_name text,
  add column if not exists job_title text,
  add column if not exists completion_mode text not null default 'solo'
    check (completion_mode in ('solo', 'team')),
  add column if not exists company_code text,
  add column if not exists section_scope text[],
  add column if not exists is_group_starter boolean not null default true;

-- Fast lookup of every respondent sharing a company code within a survey.
create index if not exists idx_respondents_survey_company_code
  on respondents (survey_id, company_code)
  where company_code is not null;

comment on column respondents.company_code is
  'Shared code linking multiple respondents from the same firm together (team completion mode only).';
comment on column respondents.section_scope is
  'Section codes (e.g. {B,C}) this respondent is answering. Null/empty means "all sections" (solo mode, or a team starter covering everything).';
comment on column respondents.is_group_starter is
  'True for the respondent who generated the company_code (and is therefore the one who answers Section A, the firm profile).';
