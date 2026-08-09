export type ApiError = {
  code: string;
  message_key: string;
  field_errors: { field: string; code: string }[];
  correlation_id: string;
};
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiError,
  ) {
    super(body.code);
  }
}
export const AUTHENTICATION_REQUIRED_EVENT = "vnsf:authentication-required";
export function cookie(name: string, cookieHeader = document.cookie) {
  return (
    cookieHeader
      .split(";")
      .map((value) => value.trim())
      .find((value) => value.startsWith(`${name}=`))
      ?.slice(name.length + 1) ?? ""
  );
}
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (init.method && !["GET", "HEAD"].includes(init.method.toUpperCase()))
    headers.set("x-csrf-token", decodeURIComponent(cookie("vnsf_csrf")));
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = new HttpError(response.status, body as ApiError);
    if (
      response.status === 401 &&
      ["AUTH_REQUIRED", "AUTH_MFA_REQUIRED"].includes(error.body.code)
    ) {
      window.dispatchEvent(
        new CustomEvent(AUTHENTICATION_REQUIRED_EVENT, {
          detail: { code: error.body.code },
        }),
      );
    }
    throw error;
  }
  return (body as { data: T }).data;
}
