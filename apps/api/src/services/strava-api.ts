/** Cliente mínimo da API do Strava (https://developers.strava.com/docs/reference/). */

export interface StravaTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  scope?: string;
  athlete?: { id: number };
}

export interface StravaActivity {
  id: number;
  name?: string;
  sport_type?: string;
  type?: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  max_speed: number;
  average_speed: number;
  start_date: string;
  start_date_local?: string;
}

export interface StravaBestEffort {
  name: string;
  distance: number;
  elapsed_time: number;
  moving_time: number;
  start_date?: string;
}

export interface StravaDetailedActivity extends StravaActivity {
  best_efforts?: StravaBestEffort[];
}

export interface StravaApi {
  readonly configured: boolean;
  authorizeUrl(p: { redirectUri: string; state: string }): string;
  exchangeCode(code: string): Promise<StravaTokenResponse>;
  refresh(refreshToken: string): Promise<StravaTokenResponse>;
  listActivities(accessToken: string, p: { after: number; perPage: number; page: number }): Promise<StravaActivity[]>;
  getActivity(accessToken: string, id: number): Promise<StravaDetailedActivity>;
  revoke(token: string): Promise<void>;
}

export class StravaError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const BASE = 'https://www.strava.com';

export function createStravaApi(creds: { clientId: string; clientSecret: string } | null, fetchImpl: typeof fetch = fetch): StravaApi {
  const need = () => {
    if (!creds) throw new StravaError(503, 'Strava não configurado no servidor');
    return creds;
  };
  const token = async (params: Record<string, string>) => {
    const c = need();
    const res = await fetchImpl(`${BASE}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, ...params }),
    });
    if (!res.ok) throw new StravaError(res.status, `Strava recusou o token (${res.status})`);
    return (await res.json()) as StravaTokenResponse;
  };
  const get = async <T>(accessToken: string, pathAndQuery: string): Promise<T> => {
    const res = await fetchImpl(`${BASE}/api/v3${pathAndQuery}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (res.status === 429) throw new StravaError(429, 'Limite de consultas do Strava atingido; tente em 15 minutos');
    if (!res.ok) throw new StravaError(res.status, `Erro do Strava (${res.status})`);
    return (await res.json()) as T;
  };
  return {
    configured: !!creds,
    authorizeUrl({ redirectUri, state }) {
      const c = need();
      const q = new URLSearchParams({ client_id: c.clientId, redirect_uri: redirectUri, response_type: 'code', approval_prompt: 'auto', scope: 'activity:read_all', state });
      return `${BASE}/oauth/authorize?${q}`;
    },
    exchangeCode: (code) => token({ code, grant_type: 'authorization_code' }),
    refresh: (refreshToken) => token({ refresh_token: refreshToken, grant_type: 'refresh_token' }),
    listActivities: (t, p) => get(t, `/athlete/activities?after=${p.after}&per_page=${p.perPage}&page=${p.page}`),
    getActivity: (t, id) => get(t, `/activities/${id}`),
    async revoke(tok) {
      const c = need();
      const res = await fetchImpl(`${BASE}/oauth/revoke`, {
        method: 'POST',
        headers: { Authorization: `Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: tok }),
      });
      if (!res.ok && res.status !== 400) throw new StravaError(res.status, `Falha ao revogar no Strava (${res.status})`);
    },
  };
}
