'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import SessionSplash from '@/components/SessionSplash';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Public routes that don't require authentication
  // '/confirm-email' is public because the link is opened from an inbox, which
  // is often a browser where nobody is signed in.
  const publicRoutes = ['/', '/login', '/signup', '/forgot-password', '/reset-password', '/confirm-email'];
  const isPublicRoute = publicRoutes.includes(pathname);

  useEffect(() => {
    // If not authenticated and trying to access protected route, but only after auth has finished hydrating.
    if (!loading && !isAuthenticated && !isPublicRoute) {
      router.push('/login');
    }
  }, [loading, isAuthenticated, pathname, router, isPublicRoute]);

  // On public routes, no backend check needed (landing page)
  if (isPublicRoute) {
    return <>{children}</>;
  }

  // While auth is hydrating on a protected page, show the branded splash
  // instead of a blank screen — session restore can ride out a backend
  // cold start, and the user should see that something is happening.
  if (loading) {
    return <SessionSplash />;
  }

  // If not authenticated and on protected route, show nothing (will redirect)
  if (!isAuthenticated) {
    return null;
  }

  return <div className="app-shell min-h-screen">{children}</div>;
}
