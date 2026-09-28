/**
 * Resolves the base HTTP/HTTPS API URL.
 * Prefers process.env.NEXT_PUBLIC_API_URL if configured.
 * Otherwise falls back to window.location.origin or http://localhost:8000.
 */
export function getApiUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined') {
    if (window.location.port === '3000') {
      return `${window.location.protocol}//${window.location.hostname}:8000`;
    }
    return window.location.origin;
  }
  return 'http://localhost:8000';
}

/**
 * Resolves WebSocket URL (ws:// or wss://) for the backend.
 * Automatically handles HTTPS -> wss:// conversion for ngrok or production domains.
 * Supports explicit NEXT_PUBLIC_WS_URL override if backend WS is on a dedicated host.
 */
export function getWsUrl(path: string = ''): string {
  const cleanPath = path ? (path.startsWith('/') ? path : `/${path}`) : '';
  if (process.env.NEXT_PUBLIC_WS_URL) {
    const baseWs = process.env.NEXT_PUBLIC_WS_URL.replace(/\/+$/, '');
    return `${baseWs}${cleanPath}`;
  }
  const apiUrl = getApiUrl();
  const wsProto = apiUrl.startsWith('https') ? 'wss:' : 'ws:';
  const host = apiUrl.replace(/^https?:\/\//, '');
  return `${wsProto}//${host}${cleanPath}`;
}

interface RequestOptions extends RequestInit {
  headers?: Record<string, string>;
}

export async function fetchApi<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const apiUrl = getApiUrl();
  const url = `${apiUrl}${endpoint}`;
  
  const headers: Record<string, string> = {
    ...options.headers,
  };

  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  // Get token if in client environment
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('access_token');
    if (token && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  let response = await fetch(url, {
    ...options,
    headers,
  });

  // Automatic Token Refresh on 401 Unauthorized
  if (response.status === 401 && typeof window !== 'undefined') {
    const refreshToken = localStorage.getItem('refresh_token');
    if (refreshToken && !endpoint.includes('/auth/refresh') && !endpoint.includes('/auth/login')) {
      try {
        const refreshResponse = await fetch(`${apiUrl}/api/v1/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });

        if (refreshResponse.ok) {
          const data = await refreshResponse.json();
          localStorage.setItem('access_token', data.access_token);
          localStorage.setItem('refresh_token', data.refresh_token);
          localStorage.setItem('user', JSON.stringify(data.user));
          
          // Set role cookie for Next.js Middleware
          document.cookie = `user_role=${data.user.role}; path=/; max-age=604800; SameSite=Lax`;
          document.cookie = `auth_token=${data.access_token}; path=/; max-age=604800; SameSite=Lax`;

          // Retry original request with new access token
          headers['Authorization'] = `Bearer ${data.access_token}`;
          response = await fetch(url, {
            ...options,
            headers,
          });
        } else {
          // Token refresh failed - clear storage
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          localStorage.removeItem('user');
          document.cookie = 'user_role=; path=/; max-age=0';
          document.cookie = 'auth_token=; path=/; max-age=0';
          window.location.href = '/login';
        }
      } catch {
        window.location.href = '/login';
      }
    }
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: 'An unexpected error occurred' }));
    throw new Error(errorData.detail || `Request failed with status ${response.status}`);
  }

  return response.json();
}

export function getImageUrl(path?: string | null): string {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
    return path;
  }
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${getApiUrl()}${cleanPath}`;
}
