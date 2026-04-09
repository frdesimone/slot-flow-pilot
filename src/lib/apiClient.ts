// Cliente HTTP centralizado. Inyecta el JWT en cada request y maneja 401.

const TOKEN_KEY = "slotting_auth_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export const API_BASE = import.meta.env.VITE_API_URL as string;

interface ApiFetchInit extends Omit<RequestInit, "headers"> {
  headers?: Record<string, string>;
  skipAuth?: boolean;
}

/**
 * Fetch con Bearer token automático. En 401 limpia el token y recarga
 * (vuelve al login).
 */
export async function apiFetch(path: string, init: ApiFetchInit = {}): Promise<Response> {
  const { skipAuth, headers = {}, ...rest } = init;
  const finalHeaders: Record<string, string> = { ...headers };

  if (!skipAuth) {
    const token = getToken();
    if (token) {
      finalHeaders["Authorization"] = `Bearer ${token}`;
    }
  }

  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const res = await fetch(url, { ...rest, headers: finalHeaders });

  if (res.status === 401 && !skipAuth) {
    clearToken();
    // Forzar navegación al login si no estamos ya ahí
    if (!window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
  }

  return res;
}

/** Helper para requests JSON (automaticamente pone Content-Type). */
export async function apiJson<T = unknown>(
  path: string,
  method: "GET" | "POST" | "PATCH" | "DELETE" = "GET",
  body?: unknown,
  init: ApiFetchInit = {},
): Promise<T> {
  const headers = { ...(init.headers || {}) };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const res = await apiFetch(path, {
    ...init,
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      detail = (data?.detail as string) || detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
