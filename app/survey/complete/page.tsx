import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';

export default function CompletePage({
  searchParams,
}: {
  searchParams: { code?: string };
}) {
  const companyCode = searchParams?.code;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center max-w-md px-6">
        <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="w-10 h-10 text-emerald-600" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-3">Thank You!</h1>
        <p className="text-slate-600 mb-8">
          Your response has been recorded. We appreciate your time and input — it will help
          shape the future of manufacturing in Gujarat.
        </p>

        {companyCode && (
          <div className="mb-8 border border-amber-200 bg-amber-50 px-4 py-4 text-left">
            <p className="text-sm text-amber-900 mb-2">
              You started your company's response. Share this code with the colleagues completing the other
              sections so their answers link to yours:
            </p>
            <p className="font-mono text-lg font-semibold text-amber-900 text-center tracking-wider">
              {companyCode}
            </p>
          </div>
        )}

        <Link
          href="/"
          className="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-sky-600 text-white font-medium hover:bg-sky-700 transition-colors"
        >
          Return to Home
        </Link>
      </div>
    </div>
  );
}
