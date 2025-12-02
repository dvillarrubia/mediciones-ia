import { useState, useCallback } from 'react';
import { Notification } from '../components/NotificationSystem';

export const useNotifications = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = useCallback((
    type: Notification['type'],
    title: string,
    message: string,
    options?: {
      autoClose?: boolean;
      duration?: number;
    }
  ) => {
    const notification: Notification = {
      id: `notification-${Date.now()}-${Math.random()}`,
      type,
      title,
      message,
      timestamp: new Date(),
      autoClose: options?.autoClose,
      duration: options?.duration,
    };

    setNotifications(prev => [...prev, notification]);
    return notification.id;
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const clearAllNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  // Funciones de conveniencia
  const notifySuccess = useCallback((title: string, message: string, options?: { autoClose?: boolean; duration?: number }) => {
    return addNotification('success', title, message, options);
  }, [addNotification]);

  const notifyError = useCallback((title: string, message: string, options?: { autoClose?: boolean; duration?: number }) => {
    return addNotification('error', title, message, { autoClose: false, ...options });
  }, [addNotification]);

  const notifyInfo = useCallback((title: string, message: string, options?: { autoClose?: boolean; duration?: number }) => {
    return addNotification('info', title, message, options);
  }, [addNotification]);

  const notifyWarning = useCallback((title: string, message: string, options?: { autoClose?: boolean; duration?: number }) => {
    return addNotification('warning', title, message, options);
  }, [addNotification]);

  return {
    notifications,
    addNotification,
    removeNotification,
    clearAllNotifications,
    notifySuccess,
    notifyError,
    notifyInfo,
    notifyWarning,
  };
};

export default useNotifications;