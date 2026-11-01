import { IG_SCOPES, type InstagramConfig } from "./config.js";
export class InstagramError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
const token = (v: unknown) =>
  typeof v === "string" &&
  v.length > 5 &&
  v.length <= 8192 &&
  !/[\s\u0000-\u001f]/.test(v);
const remoteId = (v: unknown) =>
  typeof v === "string" && /^\d{3,40}$/.test(v)
    ? v
    : typeof v === "number" && Number.isSafeInteger(v) && v > 0
      ? String(v)
      : null;
async function request(
  fetcher: typeof fetch,
  url: string,
  init: RequestInit = {},
) {
  try {
    const r = await fetcher(url, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) {
      await r.body?.cancel();
      throw new InstagramError(
        [400, 401, 403].includes(r.status)
          ? "INSTAGRAM_REAUTH_REQUIRED"
          : r.status === 429
            ? "INSTAGRAM_RATE_LIMIT"
            : "INSTAGRAM_UNAVAILABLE",
      );
    }
    const reader = r.body?.getReader();
    if (!reader) throw new InstagramError("INSTAGRAM_RESPONSE_INVALID");
    let size = 0;
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 100000) {
        await reader.cancel();
        throw new InstagramError("INSTAGRAM_RESPONSE_INVALID");
      }
      chunks.push(value);
    }
    const data = JSON.parse(Buffer.concat(chunks).toString());
    if (!data || typeof data !== "object" || data.error)
      throw new InstagramError("INSTAGRAM_RESPONSE_INVALID");
    return data;
  } catch (e) {
    if (e instanceof InstagramError) throw e;
    throw new InstagramError("INSTAGRAM_UNAVAILABLE");
  }
}
function expiry(data: any) {
  if (
    !token(data.access_token) ||
    !Number.isInteger(data.expires_in) ||
    data.expires_in < 1 ||
    data.expires_in > 90 * 86400
  )
    throw new InstagramError("INSTAGRAM_RESPONSE_INVALID");
  return {
    token: data.access_token as string,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
}
export async function exchangeCode(
  config: InstagramConfig,
  code: string,
  fetcher: typeof fetch = fetch,
) {
  const short = await request(
    fetcher,
    "https://api.instagram.com/oauth/access_token",
    {
      method: "POST",
      body: new URLSearchParams({
        client_id: config.appId,
        client_secret: config.appSecret,
        grant_type: "authorization_code",
        redirect_uri: config.redirect,
        code,
      }),
    },
  );
  const record =
    Array.isArray(short.data) && short.data.length === 1 && !short.access_token
      ? short.data[0]
      : short;
  const account = remoteId(record.user_id);
  if (!account || !token(record.access_token))
    throw new InstagramError("INSTAGRAM_RESPONSE_INVALID");
  const granted = Array.isArray(record.permissions)
    ? record.permissions
    : typeof record.permissions === "string"
      ? record.permissions.split(/[ ,]+/)
      : [];
  if (!IG_SCOPES.every((s) => granted.includes(s)))
    throw new InstagramError("INSTAGRAM_PERMISSIONS_REQUIRED");
  const longURL = new URL("https://graph.instagram.com/access_token");
  longURL.search = new URLSearchParams({
    grant_type: "ig_exchange_token",
    client_secret: config.appSecret,
    access_token: record.access_token,
  }).toString();
  const result = expiry(await request(fetcher, longURL.href));
  const profile = await request(
    fetcher,
    "https://graph.instagram.com/" +
      config.version +
      "/" +
      account +
      "?fields=user_id,username,account_type",
    { headers: { Authorization: "Bearer " + result.token } },
  );
  const id = remoteId(profile.user_id);
  if (
    !id ||
    typeof profile.username !== "string" ||
    !profile.username.length ||
    profile.username.length > 160 ||
    !["BUSINESS", "MEDIA_CREATOR", "CREATOR"].includes(profile.account_type)
  )
    throw new InstagramError("INSTAGRAM_PROFESSIONAL_REQUIRED");
  return {
    ...result,
    remoteAccountId: id,
    displayName: profile.username,
    scopes: IG_SCOPES.slice(),
  };
}
export async function refreshToken(
  config: InstagramConfig,
  token: string,
  fetcher: typeof fetch = fetch,
) {
  const url = new URL("https://graph.instagram.com/refresh_access_token");
  url.search = new URLSearchParams({
    grant_type: "ig_refresh_token",
    access_token: token,
  }).toString();
  return expiry(await request(fetcher, url.href));
}
export type InstagramProvider = {
  exchangeCode: typeof exchangeCode;
  refreshToken: typeof refreshToken;
};
