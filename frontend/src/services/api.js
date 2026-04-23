import axios from 'axios';
import storage from '../utils/storage';

const BASE_URL = 'https://varipro-backend.onrender.com'; 
// When live on Render: const BASE_URL = 'https://varipro-backend.onrender.com';

const api = axios.create({ baseURL: BASE_URL, timeout: 60000 });

// Attach JWT to every request
api.interceptors.request.use(async (config) => {
  try {
    const token = await storage.getItemAsync('auth_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  } catch {}
  return config;
});

// Auto-refresh on 401
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (!error.response) {
      console.warn('[API] Network Error - possible CORS or Connection Refused:', error.message);
    }
    // Skip refresh logic for the login endpoint itself
    const isLoginRequest = error.config?.url?.includes('/auth/login');
    if (error.response?.status === 401 && !isLoginRequest) {
      try {
        const refresh_token = await storage.getItemAsync('refresh_token');
        if (refresh_token) {
          const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refresh_token });
          await storage.setItemAsync('auth_token', data.token);
          error.config.headers.Authorization = `Bearer ${data.token}`;
          return api(error.config);
        }
      } catch {}
    }
    return Promise.reject(error);
  }
);

// ── Auth ──────────────────────────────────────────────────────────────────
export const register = (payload) => api.post('/auth/register', payload).then(r => r.data);
export const login = (payload) => api.post('/auth/login', payload).then(r => r.data);
export const refreshToken = (refresh_token) => api.post('/auth/refresh', { refresh_token }).then(r => r.data);
export const requestPasswordReset = (email) => api.post('/auth/password-reset', { email }).then(r => r.data);

// ── Quotes ────────────────────────────────────────────────────────────────
export const getQuotes = (params) => api.get('/quotes', { params }).then(r => r.data);
export const getQuote = (id) => api.get(`/quotes/${id}`).then(r => r.data);
export const createQuote = (payload) => api.post('/quotes', payload).then(r => r.data);
export const updateQuote = (id, payload) => api.put(`/quotes/${id}`, payload).then(r => r.data);
export const deleteQuote = (id) => api.delete(`/quotes/${id}`).then(r => r.data);

export const uploadPhotos = async (quoteId, photoUris) => {
  const formData = new FormData();
  for (const uri of photoUris) {
    const name = uri.split('/').pop();
    const match = /\.(\w+)$/.exec(name);
    const type = match ? `image/${match[1]}` : 'image/jpeg';
    formData.append('photos', { uri, name, type });
  }
  return api.post(`/quotes/${quoteId}/photos`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }).then(r => r.data);
};

// ── Clients ───────────────────────────────────────────────────────────────
export const getClients = (params) => api.get('/clients', { params }).then(r => r.data);
export const getClient = (id) => api.get(`/clients/${id}`).then(r => r.data);
export const createClient = (payload) => api.post('/clients', payload).then(r => r.data);
export const updateClient = (id, payload) => api.put(`/clients/${id}`, payload).then(r => r.data);
export const deleteClient = (id) => api.delete(`/clients/${id}`).then(r => r.data);

// ── Users ─────────────────────────────────────────────────────────────────
export const getUsers = () => api.get('/users').then(r => r.data);
export const createUser = (payload) => api.post('/users', payload).then(r => r.data);
export const deleteUser = (id) => api.delete(`/users/${id}`).then(r => r.data);

// ── Account Settings ──────────────────────────────────────────────────────
export const getAccountSettings = () => api.get('/account/settings').then(r => r.data);
export const updateAccountSettings = (payload) => api.put('/account/settings', payload).then(r => r.data);

export default api;
