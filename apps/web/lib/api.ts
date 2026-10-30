export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
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
