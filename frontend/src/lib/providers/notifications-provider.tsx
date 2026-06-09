import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
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

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    fetchNotifications();

    const apiUrl: string = (import.meta as any).env?.VITE_API_URL ?? 'http://localhost:3001';
    const BACKEND_URL = apiUrl.replace(/\/api.*$/, '');

    const socket = io(`${BACKEND_URL}/notifications`, {
      auth: { token },
      reconnectionDelay: 3000,
      reconnectionAttempts: 10,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[Notifications] WebSocket connected');
    });

    socket.on('connect_error', (err) => {
      console.error('[Notifications] WebSocket connection error:', err.message, err);
    });

    socket.on('disconnect', (reason) => {
      console.warn('[Notifications] WebSocket disconnected:', reason);
    });

    socket.on('notification:new', (notif: Notification) => {
      setNotifications(prev => [notif, ...prev]);
      setUnreadCount(c => c + 1);
      toast(notif.title ?? 'New notification', {
        description: notif.body ?? undefined,
        duration: 5000,
      });
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
