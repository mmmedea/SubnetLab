"use client";

import { createContext, useContext, useMemo, useState } from "react";

export type WorkspacePreferences = {
  theme: "dark" | "light" | "system";
  email_notifications: boolean;
  in_app_notifications: boolean;
  compact_mode: boolean;
  default_ip_version: "ipv4" | "ipv6";
  monospace_font_size: number;
};
export type WorkspaceProfile = {
  id: string;
  email: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  emailConfirmed?: boolean;
  identities?: { provider: string }[];
  preferences: WorkspacePreferences;
};
type ProfileContextValue = {
  profile: WorkspaceProfile;
  updateProfile: (updates: Partial<WorkspaceProfile>) => void;
};
const ProfileContext = createContext<ProfileContextValue | null>(null);

export default function UserProfileProvider({
  initialProfile,
  children,
}: {
  initialProfile: WorkspaceProfile;
  children: React.ReactNode;
}) {
  const [profile, setProfile] = useState(initialProfile);
  const value = useMemo<ProfileContextValue>(() => ({
    profile,
    updateProfile: updates => setProfile(current => ({ ...current, ...updates })),
  }), [profile]);
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useWorkspaceProfile() {
  const context = useContext(ProfileContext);
  if (!context) throw new Error("useWorkspaceProfile must be used inside UserProfileProvider");
  return context.profile;
}

export function useUpdateWorkspaceProfile() {
  const context = useContext(ProfileContext);
  if (!context) throw new Error("useUpdateWorkspaceProfile must be used inside UserProfileProvider");
  return context.updateProfile;
}
