'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Download, Users, CheckCircle2, Clock, FileText, Loader2 } from 'lucide-react';
import Link from 'next/link';
import type { Respondent, Survey } from '@/lib/types';

export default function AdminDashboard() {
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [respondents, setRespondents] = useState<Respondent[]>([]);
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [sheetBySurveyId, setSheetBySurveyId] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, any> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedSurveyId, setSelectedSurveyId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const sessionResponse = await fetch('/api/admin/session', { credentials: 'include' });
        if (!sessionResponse.ok) {
          router.push('/admin');
          return;
        }

        const dashboardResponse = await fetch('/api/admin/dashboard', { credentials: 'include' });
        if (!dashboardResponse.ok) {
          router.push('/admin');
          return;
        }

        const payload = await dashboardResponse.json();
        setRespondents(payload.respondents || []);
        setSurveys(payload.surveys || []);
        setSheetBySurveyId(payload.sheet || {});
        setSelectedSurveyId((payload.surveys || [])[0]?.id || null);
        setAuthed(true);
      } catch (err) {
        console.error(err);
        router.push('/admin');
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const surveyMap = useMemo(() => {
    const m: Record<string, string> = {};
    surveys.forEach((s: Survey) => (m[s.id] = s.title));
    return m;
  }, [surveys]);

  const stats = useMemo(() => {
    const total = respondents.length;
    const completed = respondents.filter((r: Respondent) => r.status === 'completed').length;
    const inProgress = respondents.filter((r: Respondent) => r.status === 'started' || r.status === 'draft').length;
    return { total, completed, inProgress };
  }, [respondents]);

  const companyGroups = useMemo(() => {
    const groups = new Map<
      string,
      { companyCode: string; companyName: string | null; respondents: Respondent[]; coveredSections: string[] }
    >();
    respondents
      .filter((r) => r.completion_mode === 'team' && r.company_code)
      .forEach((r) => {
        const code = r.company_code as string;
        const g = groups.get(code) || { companyCode: code, companyName: null, respondents: [], coveredSections: [] };
        g.respondents.push(r);
        if (!g.companyName && r.company_name) g.companyName = r.company_name;
        if (r.is_group_starter && !g.coveredSections.includes('A')) g.coveredSections.push('A');
        (r.section_scope || []).forEach((s) => {
          if (!g.coveredSections.includes(s)) g.coveredSections.push(s);
        });
        groups.set(code, g);
      });
    return Array.from(groups.values());
  }, [respondents]);

  const viewDetail = async (id: string) => {
    setSelectedId(id);
    setDetailLoading(true);
    try {
      const response = await fetch(`/api/admin/respondents/${id}`, { credentials: 'include' });
      if (!response.ok) {
        setDetail(null);
        return;
      }
      const d = await response.json();
      setDetail(d);
    } catch (err) {
      console.error(err);
    } finally {
      setDetailLoading(false);
    }
  };

  const exportCSV = () => {
    if (respondents.length === 0) return;
    const headers = ['Response ID', 'Survey', 'Status', 'Started At', 'Completed At', 'Last Updated'];
    const rows = respondents.map((r: Respondent) => [
      r.response_id,
      surveyMap[r.survey_id] || r.survey_id,
      r.status,
      r.started_at || '',
      r.completed_at || '',
      r.last_updated || '',
    ]);
    const csv = [headers, ...rows]
      .map((row: string[]) => row.map((c: string) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'survey_responses.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportJSON = () => {
    if (respondents.length === 0) return;
    const payload = respondents.map((r: Respondent) => ({
      response_id: r.response_id,
      survey: surveyMap[r.survey_id] || r.survey_id,
      survey_id: r.survey_id,
      status: r.status,
      started_at: r.started_at,
      completed_at: r.completed_at,
      last_updated: r.last_updated,
    }));
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'survey_responses.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const [mergedExporting, setMergedExporting] = useState(false);

  const exportMergedCompanyCSV = async () => {
    if (!selectedSurveyId) return;
    setMergedExporting(true);
    try {
      const res = await fetch(`/api/admin/company-groups?surveyId=${selectedSurveyId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load merged company data');
      const data: { columns: Array<{ key: string; label: string }>; rows: any[] } = await res.json();
      if (!data.rows.length) return;

      const headers = [
        'Company Code',
        'Company Name',
        'Respondents',
        'Covered Sections',
        'Missing Sections',
        'Complete?',
        'Conflicts',
        ...data.columns.map((c) => c.label),
      ];
      const rows = data.rows.map((row) => [
        row.company_code,
        row.company_name || '',
        row.contributors.map((c: any) => `${c.job_title || 'Unknown role'} (${c.sections.join('/')})`).join('; '),
        row.covered_sections.join(', '),
        row.missing_sections.join(', '),
        row.complete ? 'Yes' : 'No',
        row.conflicts.join(' | '),
        ...data.columns.map((c) => row.values?.[c.key] || ''),
      ]);
      const csv = [headers, ...rows]
        .map((r: string[]) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
        .join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'company_groups_merged.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    } finally {
      setMergedExporting(false);
    }
  };

  const activeSheet = selectedSurveyId ? sheetBySurveyId[selectedSurveyId] : null;

  const exportSheetCSV = () => {
    if (!activeSheet || !activeSheet.rows?.length) return;
    const headers = [
      'Response ID',
      'Survey',
      'Status',
      'Started At',
      'Completed At',
      'Last Updated',
      ...(activeSheet.columns || []).map((column: any) => column.label),
    ];
    const rows = activeSheet.rows.map((row: any) => [
      row.response_id,
      row.survey_title,
      row.status,
      row.started_at,
      row.completed_at || '',
      row.last_updated,
      ...(activeSheet.columns || []).map((column: any) => row.values?.[column.key] || ''),
    ]);
    const csv = [headers, ...rows]
      .map((row: string[]) => row.map((c: string) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'survey_sheet.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!authed) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700">
              <ArrowLeft className="w-4 h-4" />
              Home
            </Link>
            <span className="text-slate-300">/</span>
            <h1 className="text-lg font-semibold text-slate-900">Admin Dashboard</h1>
          </div>
          <Button
            variant="outline"
            onClick={async () => {
              await fetch('/api/admin/session', { method: 'DELETE', credentials: 'include' });
              router.push('/admin');
            }}
          >
            Sign Out
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Total Responses</p>
                <p className="text-3xl font-bold text-slate-900 mt-1">{stats.total}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-sky-50 flex items-center justify-center">
                <Users className="w-6 h-6 text-sky-600" />
              </div>
            </div>
          </Card>
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Completed</p>
                <p className="text-3xl font-bold text-slate-900 mt-1">{stats.completed}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-emerald-600" />
              </div>
            </div>
          </Card>
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">In Progress</p>
                <p className="text-3xl font-bold text-slate-900 mt-1">{stats.inProgress}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center">
                <Clock className="w-6 h-6 text-amber-600" />
              </div>
            </div>
          </Card>
        </div>

        {companyGroups.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Company Groups (team responses)</h2>
              <Button variant="outline" onClick={exportMergedCompanyCSV} disabled={mergedExporting}>
                {mergedExporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                Export merged (one row per company)
              </Button>
            </div>
            <Card className="overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                  <tr>
                    <th className="text-left px-4 py-3">Code</th>
                    <th className="text-left px-4 py-3">Company</th>
                    <th className="text-left px-4 py-3">Respondents</th>
                    <th className="text-left px-4 py-3">Sections Covered</th>
                    <th className="text-left px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {companyGroups.map((g) => {
                    const complete = ['A', 'B', 'C', 'D', 'E'].every((s) => g.coveredSections.includes(s));
                    return (
                      <tr key={g.companyCode} className="border-t border-slate-100">
                        <td className="px-4 py-3 font-mono">{g.companyCode}</td>
                        <td className="px-4 py-3">{g.companyName || '—'}</td>
                        <td className="px-4 py-3">{g.respondents.length}</td>
                        <td className="px-4 py-3">{g.coveredSections.sort().join(', ') || '—'}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 text-xs rounded-full ${
                              complete ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                            }`}
                          >
                            {complete ? 'All sections covered' : 'Awaiting sections'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          </div>
        )}

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">All Responses</h2>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={exportCSV} disabled={respondents.length === 0}>
              <Download className="w-4 h-4 mr-2" />
              CSV
            </Button>
            <Button variant="outline" onClick={exportJSON} disabled={respondents.length === 0}>
              <FileText className="w-4 h-4 mr-2" />
              JSON
            </Button>
          </div>
        </div>

        <Card className="overflow-hidden">
          {loading ? (
            <div className="p-12 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : respondents.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <FileText className="w-10 h-10 mx-auto mb-3 text-slate-300" />
              No responses yet.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Response ID</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Survey</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Started</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Progress</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {respondents.map((r) => (
                  <tr
                    key={r.response_id}
                    onClick={() => viewDetail(r.response_id)}
                    className="cursor-pointer hover:bg-slate-50"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">{r.response_id}</td>
                    <td className="px-4 py-3 text-slate-700">{surveyMap[r.survey_id] || r.survey_id}</td>
                    <td className="px-4 py-3">
                      <Badge variant={r.status === 'completed' ? 'default' : 'secondary'}>
                        {r.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {r.started_at ? new Date(r.started_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{r.last_updated ? new Date(r.last_updated).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <div className="mt-10 flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Response Sheet</h2>
            <p className="text-sm text-slate-500">Spreadsheet-style rows and columns, similar to Google Forms.</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
              value={selectedSurveyId || ''}
              onChange={(e) => setSelectedSurveyId(e.target.value || null)}
            >
              <option value="">Select a survey</option>
              {surveys.map((survey) => (
                <option key={survey.id} value={survey.id}>
                  {survey.title}
                </option>
              ))}
            </select>
            <Button variant="outline" onClick={exportSheetCSV} disabled={!activeSheet?.rows?.length}>
              <Download className="w-4 h-4 mr-2" />
              Export Sheet CSV
            </Button>
          </div>
        </div>

        <Card className="overflow-hidden">
          {!selectedSurveyId ? (
            <div className="p-12 text-center text-slate-500">Choose a survey to view the response sheet.</div>
          ) : !activeSheet?.rows?.length ? (
            <div className="p-12 text-center text-slate-500">No submitted responses yet for this survey.</div>
          ) : (
            <div className="overflow-auto max-h-[75vh]">
              <table className="w-full text-sm border-separate border-spacing-0">
                <thead className="sticky top-0 z-10 bg-slate-50">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-slate-600 whitespace-nowrap border-b">Response ID</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600 whitespace-nowrap border-b">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600 whitespace-nowrap border-b">Started</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600 whitespace-nowrap border-b">Completed</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600 whitespace-nowrap border-b">Last Updated</th>
                    {(activeSheet.columns || []).map((column: any) => (
                      <th key={column.key} className="text-left px-4 py-3 font-medium text-slate-600 min-w-[220px] border-b align-top">
                        <div className="whitespace-normal">
                          <div className="text-[11px] uppercase tracking-wide text-slate-400">{column.survey_title}</div>
                          <div>{column.label}</div>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(activeSheet.rows || []).map((row: any) => (
                    <tr key={row.response_id} className="hover:bg-slate-50 align-top">
                      <td className="px-4 py-3 font-mono text-xs text-slate-700 whitespace-nowrap">{row.response_id}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{row.status}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-500">{row.started_at ? new Date(row.started_at).toLocaleString() : '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-500">{row.completed_at ? new Date(row.completed_at).toLocaleString() : '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-500">{row.last_updated ? new Date(row.last_updated).toLocaleString() : '—'}</td>
                      {(activeSheet.columns || []).map((column: any) => (
                        <td key={column.key} className="px-4 py-3 text-slate-700 min-w-[220px] whitespace-normal">
                          {row.values?.[column.key] || '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {selectedId && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-6 z-50" onClick={() => setSelectedId(null)}>
            <Card className="p-6 max-w-2xl w-full max-h-[80vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-900">Response Details</h3>
                <Button variant="ghost" onClick={() => setSelectedId(null)}>Close</Button>
              </div>
              {detailLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
              ) : detail ? (
                <div className="space-y-3">
                  <div className="text-sm text-slate-500 mb-2">
                    <p><strong>Response ID:</strong> {detail.respondent.response_id}</p>
                    <p><strong>Status:</strong> {detail.respondent.status}</p>
                    <p><strong>Last Updated:</strong> {detail.respondent.last_updated ? new Date(detail.respondent.last_updated).toLocaleString() : '—'}</p>
                  </div>
                  <h4 className="font-medium text-slate-700 pt-2">Answers</h4>
                  {detail.answers.length === 0 ? (
                    <p className="text-sm text-slate-400">No answers recorded yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {detail.answers.map((a: any, i: number) => (
                        <div key={i} className="text-sm border-b pb-2">
                          <p className="font-medium text-slate-700">{a.question_code || a.question_id}</p>
                          <p className="text-slate-600 mt-1">{formatAnswerValue(a.value ?? a.answer_value ?? a.answer_data)}</p>
                          {a.comment && <p className="text-slate-500 mt-1 italic">Comment: {a.comment}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-400">Failed to load details.</p>
              )}
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}

function formatAnswerValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map((item) => formatAnswerValue(item)).join(', ');
  return JSON.stringify(value, null, 2);
}
