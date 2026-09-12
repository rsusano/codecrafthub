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
  signInWithPassword: (email: string, password: string) => Promise<boolean>;
  signUpWithPassword: (email: string, password: string) => Promise<boolean>;
  signInWithGoogle: () => Promise<void>;
  signInWithMagicLink: (email: string) => Promise<boolean>;
  resetPassword: (email: string) => Promise<boolean>;
  updatePassword: (password: string) => Promise<boolean>;
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

      setAuthMessage(
        `Signed in as ${nextUser.email}. Your courses & chat sync to your account.`,
      );
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
      if (event === "PASSWORD_RECOVERY") {
        setAuthMessage("Choose a new password to finish resetting.");
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [configured, hydrateFromCloud]);

  const requireConfigured = useCallback(() => {
    if (!configured) {
      setAuthError("Cloud login is not configured yet on this deployment.");
      return false;
    }
    return true;
  }, [configured]);

  const signInWithPassword = useCallback(
    async (email: string, password: string) => {
      if (!requireConfigured()) return false;
      setAuthError(null);
      setAuthMessage(null);
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        setAuthError(error.message);
        return false;
      }
      setAuthMessage("Signed in successfully.");
      return true;
    },
    [requireConfigured],
  );

  const signUpWithPassword = useCallback(
    async (email: string, password: string) => {
      if (!requireConfigured()) return false;
      setAuthError(null);
      setAuthMessage(null);
      const supabase = createClient();
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) {
        setAuthError(error.message);
        return false;
      }
      if (data.session) {
        setAuthMessage("Account created and signed in.");
      } else {
        setAuthMessage(
          "Account created. Check your email to confirm, then sign in.",
        );
      }
      return true;
    },
    [requireConfigured],
  );

  const signInWithGoogle = useCallback(async () => {
    if (!requireConfigured()) return;
    setAuthError(null);
    setAuthMessage(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) setAuthError(error.message);
  }, [requireConfigured]);

  const signInWithMagicLink = useCallback(
    async (email: string) => {
      if (!requireConfigured()) return false;
      setAuthError(null);
      setAuthMessage(null);
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) {
        setAuthError(error.message);
        return false;
      }
      setAuthMessage("Check your email for a magic link to finish signing in.");
      return true;
    },
    [requireConfigured],
  );

  const resetPassword = useCallback(
    async (email: string) => {
      if (!requireConfigured()) return false;
      setAuthError(null);
      setAuthMessage(null);
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/auth/reset")}`,
      });
      if (error) {
        setAuthError(error.message);
        return false;
      }
      setAuthMessage("Password reset email sent. Check your inbox.");
      return true;
    },
    [requireConfigured],
  );

  const updatePassword = useCallback(
    async (password: string) => {
      if (!requireConfigured()) return false;
      setAuthError(null);
      setAuthMessage(null);
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setAuthError(error.message);
        return false;
      }
      setAuthMessage("Password updated. You’re signed in.");
      return true;
    },
    [requireConfigured],
  );

  const signOut = useCallback(async () => {
    if (!configured) return;
    setAuthError(null);
    setAuthMessage(null);
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
    setAuthMessage(
      "Signed out. This browser still keeps its local courses & chat.",
    );
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
      signInWithPassword,
      signUpWithPassword,
      signInWithGoogle,
      signInWithMagicLink,
      resetPassword,
      updatePassword,
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
      signInWithPassword,
      signUpWithPassword,
      signInWithGoogle,
      signInWithMagicLink,
      resetPassword,
      updatePassword,
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
