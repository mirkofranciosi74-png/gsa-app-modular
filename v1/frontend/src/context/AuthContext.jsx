import { createContext, useContext, useState, useEffect, useCallback } from "react";

const AuthContext = createContext(null);

const TOKEN_KEY = "gsa_token";

function decodeToken(token) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g,"+").replace(/_/g,"/")));
    if (payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch { return null; }
}

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);

  const applyToken = useCallback(async (token) => {
    const payload = decodeToken(token);
    if (!payload) { localStorage.removeItem(TOKEN_KEY); setUser(null); return; }

    localStorage.setItem(TOKEN_KEY, token);

    // Carica profilo completo (incluse restrizioni viewer)
    try {
      const res = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setUser(await res.json());
      } else {
        localStorage.removeItem(TOKEN_KEY);
        setUser(null);
      }
    } catch {
      // Fallback al payload del token se l'API non risponde
      setUser({ ...payload, allowedAppartamenti: [], allowedInquilini: [] });
    }
  }, []);

  useEffect(() => {
    // Controlla token nell'URL (redirect post-OAuth)
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get("token");
    const authError = params.get("auth_error");

    if (authError) {
      alert(`Errore di accesso: ${authError}`);
      window.history.replaceState({}, "", window.location.pathname);
    }

    if (urlToken) {
      window.history.replaceState({}, "", window.location.pathname);
      applyToken(urlToken).finally(() => setLoading(false));
      return;
    }

    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored) {
      applyToken(stored).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [applyToken]);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }, []);

  const getToken = useCallback(() => localStorage.getItem(TOKEN_KEY), []);

  return (
    <AuthContext.Provider value={{ user, loading, logout, getToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
