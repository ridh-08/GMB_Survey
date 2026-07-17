// Cookie-based resume: each survey a browser starts gets its own cookie
// naming the in-progress response, so the person is picked back up
// automatically on their next visit — no response ID to type in, no
// localStorage on the client.
export function resumeCookieName(surveyId: string): string {
  return `resp_${surveyId}`;
}

// 180 days — long enough to cover a survey field season.
export const RESUME_COOKIE_MAX_AGE = 60 * 60 * 24 * 180;
