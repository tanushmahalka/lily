export class ApiError extends Error {
  constructor(public status: number, public body: any) {
    super(typeof body?.error === "string" ? body.error : `Request failed (${status})`);
  }
}

export async function api<T = any>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(`/api${path}`, {
    ...rest,
    headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...rest.headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const text = await res.text();
  let body: any = text;
  try { body = text ? JSON.parse(text) : null; } catch { /* plain text */ }
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}

export const post = <T = any>(path: string, json?: unknown) => api<T>(path, { method: "POST", json: json ?? {} });
export const patch = <T = any>(path: string, json: unknown) => api<T>(path, { method: "PATCH", json });
export const put = <T = any>(path: string, json: unknown) => api<T>(path, { method: "PUT", json });

export const videoUrl = (localPath?: string | null) =>
  localPath ? `/api/videos/${encodeURIComponent(localPath.split("/").pop()!)}` : null;
