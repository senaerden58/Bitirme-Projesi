import React, { createContext, useContext, useMemo, useState } from "react";

export type ProfileUser = {
  email: string;
  id: string;
  name: string;
};

type AuthContextValue = {
  user: ProfileUser | null;
  setUser: (user: ProfileUser | null) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<ProfileUser | null>(null);
  const value = useMemo(() => ({ user, setUser }), [user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
