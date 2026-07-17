import Link from 'next/link';
import Image from 'next/image';
import { getActiveSurveys } from '@/lib/repository';
import type { Survey } from '@/lib/types';
import { Building2, Users, ArrowRight, BarChart3 } from 'lucide-react';
import CIILogo from '@/components/images/CII_Logo.png';
import IMELogo from '@/components/images/IME_Logo.webp';

export const dynamic = 'force-dynamic';

function LogoLeft() {
  return (
    <div className="h-10 w-24 flex items-center justify-center">
      <Image src={CIILogo} alt="CII Logo" className="object-contain" />
    </div>
  );
}

function LogoRight() {
  return (
    <div className="h-10 w-24 flex items-center justify-center">
      <Image src={IMELogo} alt="IME Logo" className="object-contain" />
    </div>
  );
}

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
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white font-garamond">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-sm bg-gradient-to-br from-sky-500 to-sky-700 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-slate-900">Gujarat Manufacturing Barometer</h1>
              <p className="text-xs text-slate-500">Statewide Survey Initiative</p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <LogoLeft />
            <LogoRight />
            <Link
              href="/admin"
              className="text-sm text-slate-600 hover:text-slate-900 transition-colors border-l border-slate-200 pl-6"
            >
              Admin
            </Link>
          </div>
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
          <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {employerSurvey && (
              <SurveyCard
                survey={employerSurvey}
                icon={<Building2 className="w-6 h-6 text-white" />}
                description="Share your firm's experience across workforce, processes, technology, and cluster dynamics."
              />
            )}
            {workerSurvey && (
              <SurveyCard
                survey={workerSurvey}
                icon={<Users className="w-6 h-6 text-white" />}
                description="Tell us about your work experience — pay, safety, career growth, and technology at your workplace."
              />
            )}
          </div>
        )}

        <div className="mt-16 text-center">
          <Link
            href="/survey/resume"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-sm border border-slate-300 bg-white text-base font-medium text-slate-800 hover:border-sky-600 hover:text-sky-700 transition-colors"
          >
            Already started? Resume your survey
            <ArrowRight className="w-4 h-4" />
          </Link>
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
  description,
}: {
  survey: Survey;
  icon: React.ReactNode;
  description: string;
}) {
  return (
    <Link
      href={`/survey/${survey.id}`}
      className="group block bg-white rounded-sm border border-slate-200 overflow-hidden hover:shadow-md hover:border-slate-400 transition-all duration-300 animate-slide-up"
    >
      <div className="h-1.5 bg-slate-900" />
      <div className="p-6">
        <div className="w-12 h-12 rounded-sm bg-slate-900 flex items-center justify-center mb-5">
          {icon}
        </div>
        <h3 className="text-xl font-bold text-slate-900 mb-2">{survey.title}</h3>
        <p className="text-sm text-slate-600 mb-6">{description}</p>
        <div className="flex items-center text-sky-700 font-medium text-sm group-hover:gap-2 transition-all">
          Start Survey
          <ArrowRight className="w-4 h-4 ml-1 group-hover:ml-2 transition-all" />
        </div>
      </div>
    </Link>
  );
}