'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';

export default function ResumePage() {
  const router = useRouter();
  const [responseId, setResponseId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleResume = async () => {
    if (!responseId.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/respondents/${encodeURIComponent(responseId.trim())}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        setError('No survey found with that ID.');
        setLoading(false);
        return;
      }
      const payload = await response.json();
      const respondent = payload.respondent;
      if (respondent.status === 'completed') {
        setError('This survey has already been completed.');
        setLoading(false);
        return;
      }
      localStorage.setItem(`survey_${respondent.survey_id}_response_id`, respondent.response_id);
      router.push(`/survey/${respondent.survey_id}`);
    } catch {
      setError('Failed to find survey. Please check your ID.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
      <Card className="p-8 max-w-md w-full">
        <Link href="/" className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 mb-6">
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Resume Your Survey</h1>
        <p className="text-slate-600 mb-6">Enter your response ID to continue where you left off.</p>
        <div className="space-y-4">
          <div>
            <Label htmlFor="responseId">Response ID</Label>
            <Input
              id="responseId"
              value={responseId}
              onChange={(e) => setResponseId(e.target.value)}
              placeholder="RSP-XXXXXX-XXXXXX"
              className="font-mono"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button onClick={handleResume} disabled={loading || !responseId.trim()} className="w-full">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Resume Survey'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
