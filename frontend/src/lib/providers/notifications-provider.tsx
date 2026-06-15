import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import axios from 'axios';
import { api } from '@/lib/api';
import { toast } from 'sonner';

export type Notification = {
  id: string;
  type: string;
  title: string | null;
  body: string | null;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
};

type NotificationsContextType = {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  refresh: () => Promise<void>;
};

const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  const fetchNotifications = useCallback(async () => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;
    try {
      setLoading(true);
      const [listRes, countRes] = await Promise.all([
        api.get('/notifications?take=30'),
        api.get('/notifications/unread-count'),
      ]);
      const list = listRes.data?.data ?? listRes.data;
      const count = countRes.data?.data ?? countRes.data;
      setNotifications(Array.isArray(list) ? list : []);
      setUnreadCount(typeof count === 'number' ? count : 0);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  // Proactively refresh the access token 2 minutes before it expires so the
  // WebSocket connection never drops mid-generation due to a stale token.
  useEffect(() => {
    const getExpiry = () => {
      try {
        const t = localStorage.getItem('accessToken');
        if (!t) return null;
        const payload = JSON.parse(atob(t.split('.')[1]));
        return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
      } catch { return null; }
    };

    const scheduleRefresh = () => {
      const exp = getExpiry();
      if (!exp) return;
      const msUntilRefresh = exp - Date.now() - 2 * 60 * 1000; // 2 min before expiry
      if (msUntilRefresh <= 0) return; // already past threshold
      return setTimeout(async () => {
        try {
          const res = await axios.post(
            `${(import.meta as any).env?.VITE_API_URL ?? 'http://localhost:3001'}/auth/refresh`,
            {},
            { withCredentials: true },
          );
          const { accessToken } = res.data?.data ?? res.data;
          if (accessToken) {
            localStorage.setItem('accessToken', accessToken);
            scheduleRefresh(); // reschedule for the new token
          }
        } catch { /* silent — connect_error handler will retry */ }
      }, msUntilRefresh);
    };

    const timer = scheduleRefresh();
    return () => { if (timer) clearTimeout(timer); };
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    fetchNotifications();

    const apiUrl: string = (import.meta as any).env?.VITE_API_URL ?? 'http://localhost:3001';
    const BACKEND_URL = apiUrl.replace(/\/api.*$/, '');
    const REST_BASE = apiUrl.endsWith('/api/v1') ? apiUrl : `${BACKEND_URL}/api/v1`;

    const socket = io(`${BACKEND_URL}/notifications`, {
      // Callback form — Socket.IO calls this fresh on every (re)connect,
      // so it always sends the latest token rather than the one captured at mount.
      auth: (cb: (data: { token: string | null }) => void) => {
        cb({ token: localStorage.getItem('accessToken') });
      },
      reconnectionDelay: 2000,
      reconnectionAttempts: 15,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[Notifications] WebSocket connected');
    });

    socket.on('connect_error', async (err) => {
      console.error('[Notifications] WebSocket connection error:', err.message);

      // JWT expired — refresh before the next automatic reconnect attempt.
      // The auth callback above will pick up the new token on retry.
      const msg = err.message?.toLowerCase() ?? '';
      if (msg.includes('expired') || msg.includes('jwt') || msg.includes('unauthorized')) {
        try {
          const res = await axios.post(
            `${REST_BASE}/auth/refresh`,
            {},
            { withCredentials: true },
          );
          const { accessToken } = res.data?.data ?? res.data;
          if (accessToken) localStorage.setItem('accessToken', accessToken);
        } catch {
          // silent — next reconnect will fail and eventually give up
        }
      }
    });

    socket.on('disconnect', (reason) => {
      console.warn('[Notifications] WebSocket disconnected:', reason);
    });

    socket.on('notification:new', (notif: Notification & { isReplay?: boolean }) => {
      console.log('[Notifications] notification:new received:', notif);
      const { isReplay, ...clean } = notif;
      setNotifications(prev => {
        // Avoid duplicates when the same notification arrives from both the live
        // emit and the missed-notifications replay on reconnect.
        if (prev.some(n => n.id === clean.id)) return prev;
        return [clean, ...prev];
      });
      setUnreadCount(c => c + 1);
      if (!isReplay) {
        toast(clean.title ?? 'New notification', {
          description: clean.body ?? undefined,
          duration: 5000,
        });
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [fetchNotifications]);

  const markRead = useCallback(async (id: string) => {
    await api.patch(`/notifications/${id}/read`);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, readAt: new Date().toISOString() } : n));
    setUnreadCount(c => Math.max(0, c - 1));
  }, []);

  const markAllRead = useCallback(async () => {
    await api.patch('/notifications/read-all');
    setNotifications(prev => prev.map(n => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    setUnreadCount(0);
  }, []);

  return (
    <NotificationsContext.Provider value={{ notifications, unreadCount, loading, markRead, markAllRead, refresh: fetchNotifications }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be inside NotificationsProvider');
  return ctx;
}
