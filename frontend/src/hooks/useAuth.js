import React, { createContext, useContext, useState, useEffect } from 'react';
import storage from '../utils/storage';
import { login as apiLogin, register as apiRegister } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const stored = await storage.getItemAsync('user_data');
        const token = await storage.getItemAsync('auth_token');
        if (stored && token) setUser(JSON.parse(stored));
      } catch {}
      setLoading(false);
    })();
  }, []);

  const login = async (credentials) => {
    const data = await apiLogin(credentials);
    await storage.setItemAsync('auth_token', data.token);
    await storage.setItemAsync('refresh_token', data.refresh_token);
    await storage.setItemAsync('user_data', JSON.stringify(data.user));
    setUser(data.user);
    return data;
  };

  const register = async (payload) => {
    const data = await apiRegister(payload);
    await storage.setItemAsync('auth_token', data.token);
    await storage.setItemAsync('refresh_token', data.refresh_token);
    const userData = {
      user_id: data.user_id,
      account_number: data.account_number,
      account_name: data.account_name,
      is_admin: true,
    };
    await storage.setItemAsync('user_data', JSON.stringify(userData));
    setUser(userData);
    return data;
  };

  const logout = async () => {
    await storage.deleteItemAsync('auth_token');
    await storage.deleteItemAsync('refresh_token');
    await storage.deleteItemAsync('user_data');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
