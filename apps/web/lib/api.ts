export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
// Only retry a read while sleeping pilot compute starts. Never replay an auth POST.
export async function waitForAuthService() {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch('/api/v1/me', {
        credentials: 'same-origin', cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      });
      if ([200, 401, 403].includes(response.status)) return;
      if (![502, 503, 504].includes(response.status)) break;
    } catch { /* A sleeping instance may close or time out the proxy request. */ }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error('The service is taking longer to start. Please wait a minute and try again. Your request was not submitted.');
}
export async function api<T = Record<string, unknown>>(
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
  method?: string,
): Promise<T> {
  const response = await fetch(path, {
    method: method || (body === undefined ? "GET" : "POST"),
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiError(
      response.status,
      response.status === 503 &&
      ["PLATFORM_CAPACITY", "ADMISSION_PAUSED", "PROCESSING_PAUSED"].includes(
        data.code,
      )
        ? data.detail
        : response.status >= 500
          ? "The service is temporarily unavailable. Please try again."
          : response.status === 429
            ? data.detail ||
              "Too many attempts. Please wait a minute before trying again."
            : data.detail ||
              data.message ||
              "This action could not be completed.",
    );
  return data as T;
}
export function safeNext(value: string | null) {
  if (
    !value ||
    value.length > 512 ||
    !/^\/app(?:\/|$)/.test(value) ||
    /[\\?#%\u0000-\u0020\u007f]/.test(value) ||
    value.split("/").some((part) => part === "." || part === "..")
  )
    return "/app";
  return value;
}
