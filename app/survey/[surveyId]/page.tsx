import SurveyClient from './SurveyClient';

export const dynamic = 'force-dynamic';

export default function SurveyPage({ params }: { params: { surveyId: string } }) {
  return <SurveyClient surveyId={params.surveyId} />;
}
