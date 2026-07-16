import Link from 'next/link';
import { getActiveSurveys } from '@/lib/repository';
import type { Survey } from '@/lib/types';
import { Building2, Users, Clock, ArrowRight, BarChart3 } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function Home() {
  let surveys: Survey[] = [];
  let error: string | null = null;

  try {
    surveys = await getActiveSurveys();
  } catch {
    error = 'Unable to load surveys. Please try again later.';
  }

  const employerSurvey = surveys.find((s) => s.type === 'employer');
  const workerSurvey = surveys.find((s) => s.type === 'worker');

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-sky-500 to-sky-700 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-slate-900">Gujarat Manufacturing Barometer</h1>
              <p className="text-xs text-slate-500">Statewide Survey Initiative</p>
            </div>
          </div>
          <Link
            href="/admin"
            className="text-sm text-slate-600 hover:text-slate-900 transition-colors"
          >
            Admin
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-16">
        <div className="text-center mb-16 animate-fade-in">
          <h2 className="text-4xl md:text-5xl font-bold text-slate-900 tracking-tight mb-4">
            Gujarat State Manufacturing Barometer
          </h2>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            A comprehensive assessment of Gujarat's manufacturing ecosystem — capturing insights from
            both employers and workers to shape the future of industry.
          </p>
        </div>

        {error ? (
          <div className="text-center text-red-600 py-12">{error}</div>
        ) : (
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {employerSurvey && (
              <SurveyCard
                survey={employerSurvey}
                icon={<Building2 className="w-7 h-7 text-white" />}
                gradient="from-sky-500 to-sky-700"
                description="Share your firm's experience across workforce, processes, technology, and cluster dynamics."
              />
            )}
            {workerSurvey && (
              <SurveyCard
                survey={workerSurvey}
                icon={<Users className="w-7 h-7 text-white" />}
                gradient="from-emerald-500 to-emerald-700"
                description="Tell us about your work experience — pay, safety, career growth, and technology at your workplace."
              />
            )}
          </div>
        )}

        <div className="mt-20 text-center">
          <p className="text-sm text-slate-500">
            Already started? <Link href="/survey/resume" className="text-sky-600 hover:underline">Resume your survey</Link>
          </p>
        </div>
      </main>

      <footer className="border-t border-slate-200 mt-12">
        <div className="max-w-6xl mx-auto px-6 py-8 text-center text-sm text-slate-500">
          Gujarat State Manufacturing Barometer &middot; All responses are confidential
        </div>
      </footer>
    </div>
  );
}

function SurveyCard({
  survey,
  icon,
  gradient,
  description,
}: {
  survey: Survey;
  icon: React.ReactNode;
  gradient: string;
  description: string;
}) {
  return (
    <Link
      href={`/survey/${survey.id}`}
      className="group block bg-white rounded-2xl border border-slate-200 overflow-hidden hover:shadow-xl hover:border-slate-300 transition-all duration-300 animate-slide-up"
    >
      <div className={`h-2 bg-gradient-to-r ${gradient}`} />
      <div className="p-8">
        <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center mb-6`}>
          {icon}
        </div>
        <h3 className="text-2xl font-bold text-slate-900 mb-2">{survey.title}</h3>
        <p className="text-slate-600 mb-6">{description}</p>
        <div className="flex items-center gap-4 text-sm text-slate-500 mb-6">
          <span className="flex items-center gap-1.5">
            <Clock className="w-4 h-4" />
            {survey.estimated_time_minutes} min
          </span>
        </div>
        <div className="flex items-center text-sky-600 font-medium group-hover:gap-2 transition-all">
          Start Survey
          <ArrowRight className="w-4 h-4 ml-1 group-hover:ml-2 transition-all" />
        </div>
      </div>
    </Link>
  );
}
