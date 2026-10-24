export const REACTOR_ENDPOINTS = Object.freeze({
  production: 'https://api.reactor.inc',
  development: 'https://api.rea.live',
});

export async function mintToken({ apiKey, apiUrl, signal }, fetchImpl = fetch) {
  if (!apiKey?.trim()) throw new Error('Add your Reactor API key to start EdenLive. You can play the original without one.');
  if (!Object.values(REACTOR_ENDPOINTS).includes(apiUrl)) throw new Error('Choose an official Reactor API endpoint.');
  const response = await fetchImpl(`${apiUrl}/tokens`, {
    method: 'POST', signal, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
    headers: { 'Content-Type': 'application/json', 'Reactor-API-Key': apiKey.trim() },
    body: JSON.stringify({ expires_after: 3600, authorization_details: [{
      type: 'session', resources: { models: { match: ['reactor/eden-live'] } },
      constraints: { max_sessions: 1, max_session_duration_seconds: 900 },
    }] }),
  });
  // Do not display upstream error bodies; they can echo request details.
  if (!response.ok) {
    if (response.status === 401) throw new Error('That API key was not accepted. Check the key and selected environment.');
    if (response.status === 403) throw new Error('This key does not have access to EdenLive. Check your Reactor account permissions.');
    if (response.status === 429 || response.status === 503) throw new Error('Reactor is busy or your account has reached a limit. Wait a moment and try again.');
    throw new Error(`Reactor could not create a token (${response.status}). Try again shortly.`);
  }
  const token = await response.json();
  if (typeof token.jwt !== 'string' || !token.jwt) throw new Error('Reactor returned an invalid token response.');
  return token.jwt;
}
