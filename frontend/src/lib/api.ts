import axios from 'axios';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3001') + '/api/v1';

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true, // Important for refresh tokens in cookies
});

// Add a request interceptor to add the JWT token to headers
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Add a response interceptor to handle token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    // If the error is 401 and we haven't retried yet
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      try {
        // Attempt to refresh the token
        // The backend `refreshTokens` endpoint expects the refresh token in a cookie
        // so we just need to call it.
        const res = await axios.post(`${API_URL}/auth/refresh`, {}, { withCredentials: true });
        
        if (res.status === 201 || res.status === 200) {
          const { accessToken } = res.data.data;
          localStorage.setItem('accessToken', accessToken);
          
          // Retry the original request with the new token
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return api(originalRequest);
        }
      } catch (refreshError) {
        localStorage.removeItem('accessToken');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }
    
    return Promise.reject(error);
  }
);
