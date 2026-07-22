const BASE_URL = "/api";

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text();
    throw new ApiError(res.status, `${res.status} ${res.statusText}: ${body}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get<T>(path: string): Promise<T> {
    return fetch(`${BASE_URL}${path}`, { credentials: "include" }).then((res) => handle<T>(res));
  },
  post<T>(path: string, body?: unknown): Promise<T> {
    return fetch(`${BASE_URL}${path}`, {
      method: "POST",
      credentials: "include",
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }).then((res) => handle<T>(res));
  },
  put<T>(path: string, body?: unknown): Promise<T> {
    return fetch(`${BASE_URL}${path}`, {
      method: "PUT",
      credentials: "include",
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }).then((res) => handle<T>(res));
  },
  delete<T>(path: string): Promise<T> {
    return fetch(`${BASE_URL}${path}`, { method: "DELETE", credentials: "include" }).then((res) =>
      handle<T>(res),
    );
  },
  upload<T>(path: string, file: Blob, filename: string): Promise<T> {
    const form = new FormData();
    form.append("file", file, filename);
    return fetch(`${BASE_URL}${path}`, {
      method: "POST",
      credentials: "include",
      body: form,
    }).then((res) => handle<T>(res));
  },
};

export { ApiError };
