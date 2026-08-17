'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { getUsersAPI } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

/**
 * A lookup of user id → avatar, so a component that only knows an id can still
 * draw the right face.
 *
 * Most endpoints now return `avatarUrl` alongside the author, and that always
 * wins — it is current by definition. This directory is the safety net for the
 * places that don't (socket payloads assembled by hand, ids kept in local
 * state), and it means changing your photo doesn't require every screen to be
 * re-plumbed.
 */

interface DirectoryEntry {
  id: string;
  name: string;
  avatarUrl: string | null;
}

interface UserDirectoryContextType {
  getAvatar: (userId: string) => string | null;
  getName: (userId: string) => string | null;
  /** Record an avatar we just learned about (e.g. the signed-in user's own change). */
  setAvatar: (userId: string, avatarUrl: string | null) => void;
  refresh: () => Promise<void>;
}

const UserDirectoryContext = createContext<UserDirectoryContextType | undefined>(undefined);

export function UserDirectoryProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const [entries, setEntries] = useState<Record<string, DirectoryEntry>>({});

  const refresh = useCallback(async () => {
    try {
      const users = await getUsersAPI();
      const next: Record<string, DirectoryEntry> = {};
      for (const u of users) {
        const id = u._id || u.id;
        if (!id) continue;
        next[id] = { id, name: u.name, avatarUrl: u.avatarUrl ?? null };
      }
      setEntries(next);
    } catch {
      // The directory is an enhancement — avatars fall back to initials if the
      // fetch fails, so a failure here is never worth surfacing.
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setEntries({});
      return;
    }
    refresh();
  }, [isAuthenticated, refresh]);

  // Keep the signed-in user's own entry in step the instant they change it,
  // without waiting for a refetch.
  useEffect(() => {
    if (!user?._id) return;
    setEntries((prev) => ({
      ...prev,
      [user._id]: { id: user._id, name: user.name, avatarUrl: user.avatarUrl ?? null },
    }));
  }, [user?._id, user?.name, user?.avatarUrl]);

  const value = useMemo<UserDirectoryContextType>(() => ({
    getAvatar: (userId: string) => entries[userId]?.avatarUrl ?? null,
    getName: (userId: string) => entries[userId]?.name ?? null,
    setAvatar: (userId: string, avatarUrl: string | null) =>
      setEntries((prev) => ({
        ...prev,
        [userId]: { id: userId, name: prev[userId]?.name ?? '', avatarUrl },
      })),
    refresh,
  }), [entries, refresh]);

  return <UserDirectoryContext.Provider value={value}>{children}</UserDirectoryContext.Provider>;
}

/**
 * Safe outside the provider (returns nulls) so <UserAvatar> can be used on
 * public pages that render before anyone is signed in.
 */
export function useUserDirectory(): UserDirectoryContextType {
  const context = useContext(UserDirectoryContext);
  if (!context) {
    return {
      getAvatar: () => null,
      getName: () => null,
      setAvatar: () => {},
      refresh: async () => {},
    };
  }
  return context;
}
