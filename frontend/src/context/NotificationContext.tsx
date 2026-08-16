'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import {
  getNotificationsAPI,
  markNotificationReadAPI,
  markAllNotificationsReadAPI,
  clearAllNotificationsAPI,
  handleJoinRequestAPI,
} from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { io, Socket } from 'socket.io-client';

// Notification types
export type NotificationType = 'chat' | 'feed' | 'group' | 'event' | 'event_reminder' | 'system' | 'group_join_request';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  createdAt: string;
  isRead: boolean;
  link?: string;
  metadata?: string;
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  addNotification: (notification: Omit<Notification, 'id' | 'createdAt' | 'isRead'>) => void;
  clearAll: () => void;
  refreshNotifications: () => void;
  handleJoinRequest: (requestId: string, action: 'approve' | 'reject') => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000';

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [socketRef, setSocketRef] = useState<Socket | null>(null);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  // Load notifications from API
  const refreshNotifications = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const data = await getNotificationsAPI();
      setNotifications(data);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    }
  }, [isAuthenticated]);

  // Load notifications on mount and when auth changes
  useEffect(() => {
    if (isAuthenticated) {
      refreshNotifications();
    } else {
      setNotifications([]);
    }
  }, [isAuthenticated, refreshNotifications]);

  // Socket connection for real-time notifications
  useEffect(() => {
    if (!isAuthenticated || !user) return;

    const token = localStorage.getItem('token');
    if (!token) return;

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socket.on('new_notification', (notif: Notification) => {
      setNotifications(prev => {
        if (prev.some(n => n.id === notif.id)) return prev;
        return [notif, ...prev];
      });
    });

    setSocketRef(socket);

    return () => {
      socket.disconnect();
      setSocketRef(null);
    };
  }, [isAuthenticated, user]);

  // Refresh notifications periodically
  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(refreshNotifications, 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated, refreshNotifications]);

  const markAsRead = async (id: string) => {
    try {
      await markNotificationReadAPI(id);
      setNotifications(prev => prev.map(n =>
        n.id === id ? { ...n, isRead: true } : n
      ));
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  const markAllAsRead = async () => {
    try {
      await markAllNotificationsReadAPI();
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  };

  const addNotification = (notif: Omit<Notification, 'id' | 'createdAt' | 'isRead'>) => {
    const newNotification: Notification = {
      ...notif,
      id: `local_${Date.now()}`,
      createdAt: new Date().toISOString(),
      isRead: false,
    };
    setNotifications(prev => [newNotification, ...prev]);
  };

  const clearAll = async () => {
    try {
      await clearAllNotificationsAPI();
      setNotifications([]);
    } catch (err) {
      console.error('Failed to clear notifications:', err);
    }
  };

  const handleJoinReq = async (requestId: string, action: 'approve' | 'reject') => {
    try {
      await handleJoinRequestAPI(requestId, action);
      // Remove the notification related to this join request
      setNotifications(prev =>
        prev.filter(n => {
          if (n.metadata) {
            try {
              const meta = JSON.parse(n.metadata);
              return meta.joinRequestId !== requestId;
            } catch {
              return true;
            }
          }
          return true;
        })
      );
      refreshNotifications();
    } catch (err) {
      console.error('Failed to handle join request:', err);
    }
  };

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        markAsRead,
        markAllAsRead,
        addNotification,
        clearAll,
        refreshNotifications,
        handleJoinRequest: handleJoinReq,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotifications must be used within NotificationProvider');
  return context;
};
