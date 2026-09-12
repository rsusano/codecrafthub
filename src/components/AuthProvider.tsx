"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import type { Course } from "@/lib/types";
import {
  DEFAULT_CHAT_WELCOME,
  loadChatHistory,
  saveChatHistory,
  type StoredChatMessage,
} from "@/lib/chat-storage";
import {
  loadLocalCourses,
  saveLocalCourses,
} from "@/lib/courses-local";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/client";
import {
  fetchUserWorkspace,
  saveUserWorkspace,
} from "@/lib/workspace-cloud";

type AuthContextValue = {
  configured: boolean;
  ready: boolean;
  user: User | null;
  email: string | null;
  syncing: boolean;
  authError: string | null;
  authMessage: string | null;
  signInWithEmail: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearAuthFeedback: () => void;
  persistWorkspace: (payload: {
    courses: Course[];
    chat_messages: StoredChatMessage[];
  }) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured();
  const [ready, setReady] = useState(!configured);
  const [user, setUser] = useState<User | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const syncingRef = useRef(false);

  const hydrateFromCloud = useCallback(async (nextUser: User) => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    setAuthError(null);
    try {
      const cloud = await fetchUserWorkspace();
      const localCourses = loadLocalCourses();
      const localChat = loadChatHistory([DEFAULT_CHAT_WELCOME]);

      const cloudCourses = cloud?.courses ?? [];
      const cloudChat = cloud?.chat_messages ?? [];

      // Prefer cloud when it has data; otherwise upload this device's local data.
      if (cloudCourses.length || cloudChat.length > 1) {
        saveLocalCourses(cloudCourses);
        saveChatHistory(cloudChat.length ? cloudChat : [DEFAULT_CHAT_WELCOME]);
        window.dispatchEvent(new CustomEvent("codecrafthub:workspace-reloaded"));
      } else if (localCourses.length || localChat.length > 1) {
        await saveUserWorkspace({
          courses: localCourses,
          chat_messages: localChat,
        });
      } else {
        await saveUserWorkspace({
          courses: [],
          chat_messages: [DEFAULT_CHAT_WELCOME],
        });
      }

      setAuthMessage(`Signed in as ${nextUser.email}. Your courses & chat sync to your account.`);
    } catch (error) {
      setAuthError(
        error instanceof Error
          ? error.message
          : "Could not sync your account workspace.",
      );
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    if (!configured) {
      setReady(true);
      return;
    }

    const supabase = createClient();
    let active = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setUser(data.session?.user ?? null);
      setReady(true);
      if (data.session?.user) {
        void hydrateFromCloud(data.session.user);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (event === "SIGNED_IN" && session?.user) {
        void hydrateFromCloud(session.user);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [configured, hydrateFromCloud]);

  const signInWithEmail = useCallback(async (email: string) => {
    if (!configured) {
      setAuthError("Cloud login is not configured yet on this deployment.");
      return;
    }
    setAuthError(null);
    setAuthMessage(null);
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: redirectTo,
      },
    });
    if (error) {
      setAuthError(error.message);
      return;
    }
    setAuthMessage("Check your email for a magic link to finish signing in.");
  }, [configured]);

  const signOut = useCallback(async () => {
    if (!configured) return;
    setAuthError(null);
    setAuthMessage(null);
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
    setAuthMessage("Signed out. This browser still keeps its local courses & chat.");
  }, [configured]);

  const persistWorkspace = useCallback(
    async (payload: {
      courses: Course[];
      chat_messages: StoredChatMessage[];
    }) => {
      saveLocalCourses(payload.courses);
      saveChatHistory(payload.chat_messages);
      if (!configured || !user) return;
      try {
        await saveUserWorkspace(payload);
      } catch (error) {
        setAuthError(
          error instanceof Error
            ? error.message
            : "Cloud save failed. Local copy is still kept on this device.",
        );
      }
    },
    [configured, user],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      configured,
      ready,
      user,
      email: user?.email ?? null,
      syncing,
      authError,
      authMessage,
      signInWithEmail,
      signOut,
      clearAuthFeedback: () => {
        setAuthError(null);
        setAuthMessage(null);
      },
      persistWorkspace,
    }),
    [
      configured,
      ready,
      user,
      syncing,
      authError,
      authMessage,
      signInWithEmail,
      signOut,
      persistWorkspace,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
