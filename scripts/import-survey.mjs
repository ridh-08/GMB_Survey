import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

const ROOT = process.cwd();
const SOURCE_FILE = path.join(ROOT, 'Survey.txt');

const surveyDefinitions = [
  {
    key: 'employer',
    code: 'gmb-employer-2026',
    title: 'Gujarat Manufacturing Barometer - Employer Survey',
    description: 'Survey for manufacturing employers in Gujarat',
    type: 'employer',
  },
  {
    key: 'worker',
    code: 'gmb-worker-2026',
    title: 'Gujarat Manufacturing Barometer - Worker Survey',
    description: 'Survey for manufacturing workers in Gujarat',
    type: 'worker',
  },
];

async function loadDotEnvIfPresent() {
  const envPath = path.join(ROOT, '.env');
  try {
    const contents = await fs.readFile(envPath, 'utf8');
    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const equalsIndex = trimmed.indexOf('=');
      const key = trimmed.slice(0, equalsIndex).trim();
      let value = trimmed.slice(equalsIndex + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // Ignore if no .env exists; the environment may already provide the keys.
  }
}

const specialMatrices = {
  'employer:A11': {
    type: 'ranking',
    options: [
      'Work Force Availability',
      'Work Force Retention',
      'Work Force Training',
      'Work Force Development (Future Opportunities)',
      'Managerial Practices',
      'Performance Measurement and Tracking',
      'Quality Management',
      'Worker Safety',
      'Process Innovation',
      'Cluster embeddedness',
      'Physical automation',
      'Digitalisation (Software-driven)',
      'Value Extraction from Technology',
      'Barriers to Adoption (Technology)',
    ],
  },
  'employer:B1.2': {
    type: 'matrix',
    rows: [
      'Unskilled / general labour',
      'Semi-skilled (machine operators, technicians)',
      'Skilled trades (electricians, welders, fitters)',
      'Supervisory / junior management',
      'Engineering / technical graduates',
      'Managerial Talent',
    ],
    columns: ['Extremely difficult', 'Difficult', 'Neutral', 'Easy', 'Extremely easy', 'N/A'],
  },
  'employer:B3.5': {
    type: 'matrix',
    rows: [
      'ITI / polytechnic graduate',
      'Engineering graduate (B.E./B.Tech)',
      'Non-technical graduate',
      'No formal qualification',
    ],
    columns: ['Less than 1 week', '1-4 weeks', '1-3 months', '3-6 months', 'More than 6 months', 'We don\'t hire this type'],
  },
  'employer:B3.6': {
    type: 'matrix',
    rows: [
      'Local ITIs / polytechnics',
      'Engineering colleges',
      'Private training institutes',
      'Placement agencies',
    ],
    columns: ['Very Dissatisfied', 'Dissatisfied', 'Neutral', 'Satisfied', 'Very Satisfied', "Don't Use"],
  },
  'employer:C6.3': {
    type: 'matrix',
    rows: ['Road connectivity', 'Power supply reliability', 'Water and waste management', 'Logistics and warehousing', 'Common testing / certification facilities'],
    columns: ['Very Poor', 'Poor', 'Adequate', 'Good', 'Excellent', 'Not Applicable'],
  },
  'employer:D3.2': {
    type: 'matrix',
    rows: [
      'High upfront capital cost',
      'Difficulty accessing financing for technology',
      'Availability of sources of funds',
      'Lack of skilled staff to operate new technology',
      'Lack of vendors / service providers locally',
      'Uncertainty about ROI',
      'Production disruption during implementation',
      'Regulatory or compliance uncertainty',
      'Technology changes too fast to commit',
      'Senior management not convinced of need',
    ],
    columns: ['Not a barrier', 'Minor', 'Moderate', 'Significant', 'Severe', 'N/A'],
  },
};

// Additional questions to append after specific codes per survey type.
// Each entry defines a full question shape mirroring what the parser produces,
// so we can inject new content without rewriting the survey source file.
const additionalQuestions = {
  employer: [
    {
      insertAfter: 'D4.4',
      code: 'D4.5',
      text: 'Does your firm currently use or plan to use AI, machine learning, or predictive analytics in any production or supply chain function?',
      type: 'radio',
      required: true,
      options: [
        'Yes, currently deployed',
        'Yes, planned within 2 years',
        'Under exploration / awareness only',
        'No plans / not relevant',
      ],
    },
    {
      insertAfter: 'D4.4',
      code: 'D4.6',
      text: 'How aware is your firm of emerging technologies (autonomous systems, digital twins, real-time supply chain visibility)?',
      type: 'likert_5',
      required: true,
      scale: {
        min: 1,
        max: 5,
        leftLabel: 'Not aware',
        rightLabel: 'Very aware, monitoring closely',
        labels: {
          1: 'Not aware',
          2: 'Slightly aware',
          3: 'Moderately aware',
          4: 'Aware',
          5: 'Very aware, monitoring closely',
        },
      },
    },
  ],
};

// Regex-based text hints — order matters, but detectQuestionType() also enforces
// a strict priority hierarchy.
const questionTypeHints = [
  { match: /open-ended/i, type: 'paragraph' },
  { match: /rank the following/i, type: 'ranking' },
  { match: /select all that apply/i, type: 'checkbox' },
  { match: /select up to/i, type: 'checkbox' },
  { match: /select top/i, type: 'checkbox' },
  { match: /^likert:/i, type: 'likert_5' },
];

const surveyPrefixRegex = /^(EMPLOYER SURVEY|WORKER SURVEY)$/i;
const sectionHeaderRegex = /^Section\s+([A-Z]):\s*(.+)$/;
const headingRegex = /^([A-Z]\d+[A-Z]?(?:\.\d+)*(?:\.)?)\s+(.*)$/;
const bulletRegex = /^●\s*(.+)$/;
const numberedRowRegex = /^(\d+)\s+(.+)$/;

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function looksLikeSectionHeading(code, text) {
  if (!code || !text) return false;
  if (text.includes('?')) return false;
  if (/^\(foundational/i.test(text)) return false;
  if (/^(What|How|Do|Does|Is|Are|Have|Has|Which|Where|When|Who|Would|Can|Could|If|To what extent|How much|How many|Overall|In the past|What is|What would|What are|How would|How do|Do you|Has your|Would you)\b/i.test(text.trim())) {
    return false;
  }
  const titleLike = /^[A-Z][A-Za-z0-9/,&()\-\s]+$/.test(text.trim());
  return titleLike && /^(Section|[A-Z]\d+[A-Z]?(?:\.\d+)*)/.test(code);
}

// Parse checkbox selection limits like "Select Top 2", "select top 3",
// "Select up to 2". Returns the integer or null.
function parseMaxSelections(text) {
  if (!text) return null;
  const topMatch = text.match(/select\s+top\s+(\d+)/i);
  if (topMatch) return Number(topMatch[1]);
  const upToMatch = text.match(/select\s+up\s+to\s+(\d+)/i);
  if (upToMatch) return Number(upToMatch[1]);
  return null;
}

// Parse a Likert scale line to extract endpoint labels.
// Handles "Likert: 1 (Left) — 2 — 3 — 4 — 5 (Right)" and the same
// pattern without the "Likert:" prefix. Returns { min, max, leftLabel, rightLabel }
// or null if it doesn't match.
function parseLikertScale(line) {
  if (!line) return null;
  const cleaned = line.replace(/^likert:\s*/i, '').trim();
  // Match each annotated point directly, e.g. "1 (Extremely difficult)" or
  // "5 (Extremely easy)". Deliberately not splitting the whole line on dash
  // characters first — an anchor label can legitimately contain its own dash
  // (e.g. "Very negative — seen as low-status, last resort"), which would
  // otherwise get shredded before the label could be captured.
  const matches = [...cleaned.matchAll(/(\d+)\s*\(([^)]+)\)/g)];
  if (matches.length === 0) return null;
  const first = matches[0];
  const last = matches[matches.length - 1];
  return {
    min: Number(first[1]),
    max: Number(last[1]),
    leftLabel: first[2].trim() || null,
    rightLabel: matches.length > 1 ? last[2].trim() || null : null,
  };
}

// Priority-ordered question type detection:
// ranking -> matrix -> likert -> checkbox -> yes/no -> radio -> paragraph -> short text.
// Never auto-converts to dropdown; dropdowns must be requested explicitly.
function detectQuestionType(question) {
  const combined = `${question.code} ${question.text}`;
  const trailing = question.trailingText || '';

  // 1. Ranking
  if (/rank the following/i.test(combined)) return 'ranking';

  // 2. Matrix — handled via specialMatrices in pushQuestion(); nothing to detect here.

  // 3. Likert
  if (/^likert:/im.test(trailing) || /^likert:/im.test(combined)) return 'likert_5';
  if (parseLikertScale(trailing)) return 'likert_5';

  // 4. Checkbox
  if (/select all that apply|select up to|select top/i.test(combined)) return 'checkbox';

  // 5. Yes/No
  if (question.options.length === 2 && question.options.every((opt) => /^(yes|no)/i.test(opt.label.trim()))) {
    return 'yes_no';
  }

  // 6. Radio (never auto-promote to dropdown)
  if (question.options.length > 0) {
    return 'radio';
  }

  // 7. Paragraph
  if (/open-ended|please specify|_{3,}|\bwrite\b/i.test(combined)) return 'paragraph';

  // 8. Short text
  return 'short_text';
}

function normalizeQuestionCode(code) {
  return code.replace(/\.$/, '');
}

function createEmptySection(code, title, order) {
  return {
    code,
    title,
    description: '',
    display_order: order,
    questions: [],
  };
}

function createEmptyQuestion(code, text, order) {
  return {
    code,
    text,
    description: '',
    // Default required=true; only future surveys marking a question optional
    // should override this.
    required: true,
    comments_enabled: false,
    display_order: order,
    options: [],
    trailingText: '',
  };
}

function addOption(question, label) {
  const value = label === 'Other: ___' || label === 'Other: _______' ? 'other' : slugify(label);
  question.options.push({ label, value, code: slugify(label) });
}

// Merge fields into a question's validation object without clobbering existing keys.
function setValidation(question, extra) {
  question.validation = { ...(question.validation || {}), ...extra };
}

function pushQuestion(section, question, surveyKey) {
  const normalizedCode = normalizeQuestionCode(question.code);
  const special = specialMatrices[`${surveyKey}:${normalizedCode}`];

  if (special?.type === 'ranking') {
    question.type = 'ranking';
    question.options = special.options.map((label) => ({ label, value: slugify(label), code: slugify(label) }));
  } else if (special?.type === 'matrix') {
    // Default matrix is single-selection per row. matrix_multiple is only used
    // when the spec explicitly demands multi-select semantics.
    question.type = 'matrix';
    question.selectionMode = 'single';
    question.matrix_rows = special.rows.map((label, index) => ({ label, display_order: index + 1 }));
    question.matrix_columns = special.columns.map((label, index) => ({ label, value: slugify(label), display_order: index + 1 }));
  } else if (question.type === 'likert_5' || question.type === 'likert_7') {
    // Type was already set while parsing the scale line; leave it alone.
  } else {
    question.type = detectQuestionType(question);
  }

  // Override with paragraph when the question body clearly expects free text.
  if (/(Open-ended|please specify|______|_____|\bwrite\b)/i.test(question.text) && question.options.length === 0) {
    question.type = 'paragraph';
  }

  // Force checkbox when text explicitly requests multi-select.
  if (/Select all that apply|Select up to|Select top/i.test(question.text) && question.options.length > 0) {
    question.type = 'checkbox';
  }

  // ---- Validation metadata ----

  // Checkbox limits (Select top N / Select up to N)
  if (question.type === 'checkbox') {
    const max = parseMaxSelections(question.text) || parseMaxSelections(question.trailingText);
    if (max) setValidation(question, { maxSelections: max });
  }

  // Ranking metadata for the frontend to enforce
  if (question.type === 'ranking') {
    setValidation(question, { allowSingleTie: true, skipRanks: true });
  }

  // Likert: preserve actual endpoint labels
  if (question.type === 'likert_5' || question.type === 'likert_7') {
    const scale = parseLikertScale(question.trailingText) || parseLikertScale(question.description);
    if (scale) {
      question.scale = {
        min: scale.min,
        max: scale.max,
        leftLabel: scale.leftLabel || undefined,
        rightLabel: scale.rightLabel || undefined,
      };
    }
  }

  section.questions.push(question);
}

function parseSurveyBlock(rawText, surveyMeta) {
  const lines = rawText.split(/\r?\n/).map((line) => line.trimEnd());
  const sections = [];
  let currentSection = null;
  let currentQuestion = null;
  let sectionOrder = 0;
  let questionOrder = 0;

  const flushQuestion = () => {
    if (!currentQuestion || !currentSection) return;
    currentQuestion.type = currentQuestion.type || 'short_text';
    pushQuestion(currentSection, currentQuestion, surveyMeta.key);
    currentQuestion = null;
  };

  const nextNonEmptyLine = (fromIndex) => {
    for (let j = fromIndex + 1; j < lines.length; j++) {
      const t = lines[j].trim();
      if (t) return t;
    }
    return '';
  };

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const rawLine = lines[lineIndex];
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    if (surveyPrefixRegex.test(line)) {
      continue;
    }

    const sectionMatch = line.match(sectionHeaderRegex);
    if (sectionMatch) {
      flushQuestion();
      sectionOrder += 1;
      const sectionCode = sectionMatch[1];
      const sectionTitle = sectionMatch[2].trim();
      currentSection = createEmptySection(sectionCode, sectionTitle, sectionOrder);
      sections.push(currentSection);
      questionOrder = 0;
      continue;
    }

    const headingMatch = line.match(headingRegex);
    // A line like "B1. Workforce Availability" is a real subsection heading —
    // it's always followed by a separate numbered question line (e.g. "B1.1 ...").
    // A line like "A7. Gender" LOOKS the same (short, title-case, no "?") but is
    // actually the question itself, immediately followed by its own bullet
    // options. Distinguish the two by peeking at the next line: if it's a
    // bullet option, this is a question, not a section wrapper.
    const nextLineIsBullet = bulletRegex.test(nextNonEmptyLine(lineIndex));
    if (headingMatch && looksLikeSectionHeading(headingMatch[1], headingMatch[2]) && !nextLineIsBullet) {
      flushQuestion();
      sectionOrder += 1;
      currentSection = createEmptySection(headingMatch[1].replace(/\.$/, ''), headingMatch[2].trim(), sectionOrder);
      sections.push(currentSection);
      questionOrder = 0;
      continue;
    }

    const questionMatch = line.match(headingRegex);
    if (questionMatch) {
      const code = normalizeQuestionCode(questionMatch[1]);
      const text = questionMatch[2].trim();
      const looksLikeQuestion = text.includes('?') || /Likert:/i.test(text) || /Open-ended/i.test(text) || /\(Foundational/i.test(text) || /Select all/i.test(text) || /Select up to/i.test(text) || /Select top/i.test(text) || /Rank the following/i.test(text) || nextLineIsBullet;
      if (looksLikeQuestion) {
        flushQuestion();
        questionOrder += 1;
        currentQuestion = createEmptyQuestion(code, text.replace(/^\(Foundational[^)]*\)\s*/i, '').trim(), questionOrder);
        currentQuestion.trailingText = text;
        continue;
      }
    }

    if (currentQuestion) {
      if (/^(Likert:\s*)?1\s*\(.*—/i.test(line)) {
        currentQuestion.trailingText = line;
        currentQuestion.type = 'likert_5';
        continue;
      }

      const bulletMatch = line.match(bulletRegex);
      if (bulletMatch) {
        addOption(currentQuestion, bulletMatch[1].trim());
        continue;
      }

      if (/^Role type\s+/.test(line) || /^New hire type\s+/.test(line) || /^Source\s+/.test(line) || /^Infrastructure type\s+/.test(line) || /^Barrier\s+/.test(line)) {
        currentQuestion.trailingText = line;
        continue;
      }

      if (numberedRowRegex.test(line) && normalizeQuestionCode(currentQuestion.code) === 'A11') {
        const [, , label] = line.match(numberedRowRegex);
        addOption(currentQuestion, label.trim());
        continue;
      }

      if (/^_{5,}$/.test(line.trim())) {
        continue;
      }

      if (!currentQuestion.description && line.length < 160 && !/[?]$/.test(line) && !/^●/.test(line)) {
        currentQuestion.description = line;
      }
    }
  }

  flushQuestion();

  const nonEmptySections = sections.filter((s) => s.questions.length > 0);
  nonEmptySections.forEach((s, i) => {
    s.display_order = i + 1;
  });

  // Insert additional questions (e.g. D4.5, D4.6) after their anchor codes.
  const extras = additionalQuestions[surveyMeta.key] || [];
  for (const extra of extras) {
    injectAdditionalQuestion(nonEmptySections, extra);
  }

  return nonEmptySections;
}

// Insert a manually-defined question directly after `insertAfter` in whichever
// section contains that anchor. Renumbers display_order for that section.
function injectAdditionalQuestion(sections, extra) {
  for (const section of sections) {
    const idx = section.questions.findIndex((q) => normalizeQuestionCode(q.code) === extra.insertAfter);
    if (idx === -1) continue;

    const q = {
      code: extra.code,
      text: extra.text,
      description: extra.description || '',
      required: extra.required !== false,
      comments_enabled: false,
      display_order: 0,
      options: (extra.options || []).map((label) => ({ label, value: slugify(label), code: slugify(label) })),
      type: extra.type,
    };
    if (extra.scale) q.scale = extra.scale;
    if (extra.validation) q.validation = extra.validation;
    if (extra.selectionMode) q.selectionMode = extra.selectionMode;

    section.questions.splice(idx + 1, 0, q);
    section.questions.forEach((qq, i) => {
      qq.display_order = i + 1;
    });
    return;
  }
}

async function upsertSurveyWithSections(client, surveyMeta, sections) {
  const { data: surveyData, error: surveyError } = await client
    .from('surveys')
    .upsert(
      {
        code: surveyMeta.code,
        title: surveyMeta.title,
        description: surveyMeta.description,
        type: surveyMeta.type,
        status: 'active',
        version: 1,
        language: 'en',
        estimated_time_minutes: surveyMeta.key === 'employer' ? 20 : 18,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'code' }
    )
    .select('id')
    .single();

  if (surveyError) throw surveyError;

  const surveyId = surveyData.id;

  await deleteExistingSurveyData(client, surveyId);

  for (const section of sections) {
    const { data: insertedSection, error: sectionError } = await client
      .from('sections')
      .insert({
        survey_id: surveyId,
        code: section.code,
        title: section.title,
        description: section.description || '',
        display_order: section.display_order,
      })
      .select('id')
      .single();

    if (sectionError) throw sectionError;

    const sectionId = insertedSection.id;

    for (const question of section.questions) {
      // Fold scale + selectionMode into validation so richer metadata reaches
      // the frontend without requiring a schema migration.
      const validation = { ...(question.validation || {}) };
      if (question.scale) validation.scale = question.scale;
      if (question.selectionMode) validation.selectionMode = question.selectionMode;

      const questionPayload = {
        section_id: sectionId,
        code: question.code,
        text: question.text,
        description: question.description || '',
        type: question.type,
        required: question.required !== false,
        validation: Object.keys(validation).length ? validation : null,
        comments_enabled: question.comments_enabled || false,
        display_order: question.display_order,
      };

      const { data: insertedQuestion, error: questionError } = await client
        .from('questions')
        .insert(questionPayload)
        .select('id')
        .single();

      if (questionError) throw questionError;

      const questionId = insertedQuestion.id;

      if (question.options?.length) {
        const optionRows = question.options.map((option, index) => ({
          question_id: questionId,
          code: option.code,
          label: option.label,
          value: option.value,
          display_order: index + 1,
        }));
        const { error: optionError } = await client.from('options').insert(optionRows);
        if (optionError) throw optionError;
      }

      if (question.matrix_rows?.length) {
        const rowRows = question.matrix_rows.map((row, index) => ({
          question_id: questionId,
          label: row.label,
          display_order: row.display_order ?? index + 1,
        }));
        const { error: rowError } = await client.from('matrix_rows').insert(rowRows);
        if (rowError) throw rowError;
      }

      if (question.matrix_columns?.length) {
        const columnRows = question.matrix_columns.map((column, index) => ({
          question_id: questionId,
          label: column.label,
          value: column.value,
          display_order: column.display_order ?? index + 1,
        }));
        const { error: columnError } = await client.from('matrix_columns').insert(columnRows);
        if (columnError) throw columnError;
      }
    }
  }

  return surveyId;
}

async function deleteExistingSurveyData(client, surveyId) {
  const { data: sections, error: sectionsError } = await client
    .from('sections')
    .select('id')
    .eq('survey_id', surveyId);
  if (sectionsError) throw sectionsError;

  const sectionIds = (sections || []).map((row) => row.id);
  const questionIds = [];

  if (sectionIds.length) {
    const { data: questions, error: questionsError } = await client
      .from('questions')
      .select('id')
      .in('section_id', sectionIds);
    if (questionsError) throw questionsError;
    questionIds.push(...(questions || []).map((row) => row.id));
  }

  const { data: respondents, error: respondentsError } = await client
    .from('respondents')
    .select('id')
    .eq('survey_id', surveyId);
  if (respondentsError) throw respondentsError;

  const respondentIds = (respondents || []).map((row) => row.id);

  if (respondentIds.length) {
    const { error } = await client.from('response_answers').delete().in('respondent_id', respondentIds);
    if (error) throw error;
  }

  if (questionIds.length) {
    for (const tableName of ['options', 'matrix_rows', 'matrix_columns']) {
      const { error } = await client.from(tableName).delete().in('question_id', questionIds);
      if (error) throw error;
    }

    const { error: questionsDeleteError } = await client.from('questions').delete().in('id', questionIds);
    if (questionsDeleteError) throw questionsDeleteError;
  }

  if (sectionIds.length) {
    const { error: branchRulesError } = await client.from('branch_rules').delete().in('source_question_id', questionIds);
    if (branchRulesError) throw branchRulesError;

    const { error: sectionsDeleteError } = await client.from('sections').delete().in('id', sectionIds);
    if (sectionsDeleteError) throw sectionsDeleteError;
  }

  if (respondentIds.length) {
    const { error: respondentsDeleteError } = await client.from('respondents').delete().in('id', respondentIds);
    if (respondentsDeleteError) throw respondentsDeleteError;
  }
}

async function main() {
  await loadDotEnvIfPresent();

  const source = await fs.readFile(SOURCE_FILE, 'utf8');
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  }

  const client = createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const employerStart = source.indexOf('EMPLOYER SURVEY');
  const workerStart = source.indexOf('WORKER SURVEY');

  const employerText = source.slice(employerStart, workerStart).trim();
  const workerText = source.slice(workerStart).trim();

  const parsed = [
    { meta: surveyDefinitions[0], text: employerText },
    { meta: surveyDefinitions[1], text: workerText },
  ];

  for (const item of parsed) {
    const sections = parseSurveyBlock(item.text, item.meta);
    const surveyId = await upsertSurveyWithSections(client, item.meta, sections);
    console.log(`Seeded ${item.meta.title} -> ${surveyId}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
