import type { Course } from "@/lib/types";
import type { StoredChatMessage } from "@/lib/chat-storage";
import { createClient } from "@/lib/supabase/client";
import { normalizeCourse } from "@/lib/courses-local";
import { isValidStoredMessage } from "@/lib/chat-storage";

export type UserWorkspace = {
  courses: Course[];
  chat_messages: StoredChatMessage[];
  updated_at?: string;
};

export async function fetchUserWorkspace(): Promise<UserWorkspace | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("user_workspace")
    .select("courses, chat_messages, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) {
    return { courses: [], chat_messages: [] };
  }

  const courses = Array.isArray(data.courses)
    ? data.courses
        .map((item) => normalizeCourse(item as Partial<Course>))
        .filter((course): course is Course => course !== null)
    : [];

  const chat_messages = Array.isArray(data.chat_messages)
    ? data.chat_messages.filter(isValidStoredMessage)
    : [];

  return {
    courses,
    chat_messages,
    updated_at: data.updated_at,
  };
}

export async function saveUserWorkspace(payload: {
  courses: Course[];
  chat_messages: StoredChatMessage[];
}): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in to save to your account.");

  const { error } = await supabase.from("user_workspace").upsert(
    {
      user_id: user.id,
      courses: payload.courses,
      chat_messages: payload.chat_messages,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) throw new Error(error.message);
}
