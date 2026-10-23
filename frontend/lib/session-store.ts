import { create } from "zustand";

export type SessionUser = {
  id: string;
  email: string;
};

type SessionState = {
  user: SessionUser | null;
  setUser: (user: SessionUser | null) => void;
};

export const useSessionStore = create<SessionState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
}));
