const BASE_URL = "/api";

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// Mensagem mostrada quando a resposta de erro não traz nada aproveitável.
// Nunca cai em texto técnico: o que aparece na tela precisa fazer sentido
// para quem está usando o produto, inclusive na frente de uma plateia.
const FALLBACK_ERROR = "Não foi possível concluir a operação. Tente novamente em alguns instantes.";

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    // O backend já devolve `message` pronta para exibição e sanitizada
    // (services/providers/vendorError.ts). Antes, o corpo cru inteiro virava
    // a mensagem — a tela mostrava algo como
    // '502 Bad Gateway: {"error":"...","message":"..."}'.
    let message = FALLBACK_ERROR;
    try {
      const body = await res.json();
      if (body && typeof body.message === "string" && body.message.trim()) {
        message = body.message;
      }
    } catch {
      // resposta sem JSON (proxy, HTML de erro, corpo vazio): fica o fallback
    }
    throw new ApiError(res.status, message);
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
  /**
   * `fields` viaja no MESMO multipart do arquivo, e não em query string.
   *
   * O primeiro campo a usar isto é a flag de substituição de voz, e ela é uma
   * autorização: numa query string ela apareceria no log de acesso do proxy e
   * no histórico do navegador, e ficaria a um copiar-e-colar de ser repetida
   * sem o arquivo que a justificava.
   *
   * A ORDEM importa: os campos entram antes do arquivo, porque o
   * `@fastify/multipart` só expõe em `file.fields` o que chegou ANTES da parte
   * do arquivo — invertida, a flag chega tarde demais e a rota a lê como
   * ausente, ou seja, falha fechado. Falhar fechado é o desfecho certo, mas
   * pelo motivo errado, e o sintoma seria "cliquei em substituir e ele diz que
   * a voz já existe".
   */
  upload<T>(path: string, file: Blob, filename: string, fields?: Record<string, string>): Promise<T> {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields ?? {})) form.append(key, value);
    form.append("file", file, filename);
    return fetch(`${BASE_URL}${path}`, {
      method: "POST",
      credentials: "include",
      body: form,
    }).then((res) => handle<T>(res));
  },
};

export { ApiError };
