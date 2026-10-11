import { createContext, useState, useEffect } from "react";
import { api } from "../services/api.js";
import { identifySocketUser } from "../services/socket.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem("proxispeak_token"));
  const [isLoading, setIsLoading] = useState(true);

  const logout = () => {
    localStorage.removeItem("proxispeak_token");
    setToken(null);
    setUser(null);
  };

  // Restore session on mount
  useEffect(() => {
    async function loadUser() {
      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        const data = await api.auth.getMe();
        if (data.user) {
          setUser(data.user);
          identifySocketUser(data.user);
        } else {
          logout();
        }
      } catch (err) {
        console.warn("Session expired or invalid:", err.message);
        logout();
      } finally {
        setIsLoading(false);
      }
    }

    loadUser();
  }, [token]);

  const login = async (email, password) => {
    const data = await api.auth.login({ email, password });
    localStorage.setItem("proxispeak_token", data.token);
    setToken(data.token);
    setUser(data.user);
    identifySocketUser(data.user);
    return data.user;
  };

  const register = async (name, email, password) => {
    const data = await api.auth.register({ name, email, password });
    localStorage.setItem("proxispeak_token", data.token);
    setToken(data.token);
    setUser(data.user);
    identifySocketUser(data.user);
    return data.user;
  };

  const refreshUser = async () => {
    try {
      const data = await api.auth.getMe();
      if (data.user) setUser(data.user);
    } catch {
      // ignore
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user,
        isLoading,
        login,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export { AuthContext };
