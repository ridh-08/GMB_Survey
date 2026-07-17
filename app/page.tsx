import Link from 'next/link';
import Image from 'next/image';
import { getActiveSurveys } from '@/lib/repository';
import type { Survey } from '@/lib/types';
import { Building2, Users, ArrowRight, BarChart3 } from 'lucide-react';
import CIILogo from '@/components/images/CII_Logo.png';
import IMELogo from '@/components/images/IME_Logo.webp';

export const dynamic = 'force-dynamic';

// Brand Colours
const MAROON = '#7A1F3D';
const BLUE = '#005DAA';

function LogoLeft() {
  return (
    <div className="flex items-center justify-center">
      <Image
        src={CIILogo}
        alt="CII Logo"
        width={110}
        height={42}
        className="object-contain"
        priority
      />
    </div>
  );
}

function LogoRight() {
  return (
    <div className="flex items-center justify-center">
      <Image
        src={IMELogo}
        alt="IME Logo"
        width={110}
        height={42}
        className="object-contain"
        priority
      />
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
    <div
      className="min-h-screen font-garamond"
      style={{
        background:
          'linear-gradient(to bottom, #faf7f8 0%, #f8fbff 100%)',
      }}
    >
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">

          <div className="flex items-center gap-4">

            <div
              className="w-12 h-12 rounded-lg flex items-center justify-center shadow"
              style={{
                background:
                  'linear-gradient(135deg,#7A1F3D,#005DAA)',
              }}
            >
              <BarChart3 className="w-6 h-6 text-white" />
            </div>

            <div>
              <h1
                className="font-bold text-lg"
                style={{ color: MAROON }}
              >
                Gujarat Manufacturing Barometer
              </h1>

              <p className="text-sm text-slate-500">
                Statewide Survey Initiative
              </p>
            </div>

          </div>

          <div className="flex items-center gap-8">

            <LogoLeft />
            <LogoRight />

            <Link
              href="/admin"
              className="font-medium transition-colors"
              style={{ color: BLUE }}
            >
              Admin
            </Link>

          </div>

        </div>
      </header>

      {/* Hero */}

      <main className="max-w-6xl mx-auto px-6 py-20">

        <div className="text-center mb-16">

          <div
            className="inline-block px-5 py-1 rounded-full text-sm font-semibold mb-6"
            style={{
              background: '#F3E8EC',
              color: MAROON,
            }}
          >
            Ahmedabad University × Confederation of Indian Industry
          </div>

          <h2
            className="text-5xl font-bold mb-6 leading-tight"
            style={{ color: MAROON }}
          >
            Gujarat State
            <br />
            Manufacturing Barometer
          </h2>

          <p className="text-lg text-slate-600 max-w-3xl mx-auto leading-8">
            A comprehensive assessment of Gujarat's manufacturing ecosystem,
            capturing insights from employers and workers to understand
            productivity, workforce, technology adoption, competitiveness,
            and the future of manufacturing.
          </p>

        </div>

        {error ? (
          <div className="text-center text-red-600 py-16">
            {error}
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">

            {employerSurvey && (
              <SurveyCard
                survey={employerSurvey}
                icon={<Building2 className="w-7 h-7 text-white" />}
                description="Share your firm's experience across workforce, productivity, technology adoption, supply chains, exports and manufacturing competitiveness."
              />
            )}

            {workerSurvey && (
              <SurveyCard
                survey={workerSurvey}
                icon={<Users className="w-7 h-7 text-white" />}
                description="Tell us about wages, working conditions, safety, skill development, career growth and technology at your workplace."
              />
            )}

          </div>
        )}

        <div className="mt-16 text-center">

          <Link
            href="/survey/resume"
            className="inline-flex items-center gap-2 px-8 py-3 rounded-md border-2 font-semibold transition-all duration-300 hover:text-white"
            style={{
              borderColor: MAROON,
              color: MAROON,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = MAROON;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            Resume Existing Survey

            <ArrowRight className="w-4 h-4" />

          </Link>

        </div>

      </main>

      <footer className="border-t border-slate-200 mt-12 bg-white">

        <div className="max-w-6xl mx-auto px-6 py-8 text-center">

          <p className="font-semibold" style={{ color: MAROON }}>
            Gujarat State Manufacturing Barometer
          </p>

          <p className="text-sm text-slate-500 mt-2">
            All responses are confidential and will only be used for research
            purposes.
          </p>

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
      className="group block bg-white rounded-xl overflow-hidden border border-slate-200 hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
    >
      <div
        className="h-2"
        style={{
          background:
            'linear-gradient(90deg,#7A1F3D,#005DAA)',
        }}
      />

      <div className="p-8">

        <div
          className="w-14 h-14 rounded-xl flex items-center justify-center mb-6 shadow"
          style={{
            background:
              'linear-gradient(135deg,#7A1F3D,#005DAA)',
          }}
        >
          {icon}
        </div>

        <h3 className="text-2xl font-bold text-slate-900 mb-3">
          {survey.title}
        </h3>

        <p className="text-slate-600 leading-7 mb-8">
          {description}
        </p>

        <div
          className="flex items-center font-semibold transition-all group-hover:translate-x-1"
          style={{ color: BLUE }}
        >
          Start Survey

          <ArrowRight className="ml-2 w-4 h-4" />

        </div>

      </div>
    </Link>
  );
}