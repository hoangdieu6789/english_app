import { create } from "zustand";

export type SessionUser = {
  id: string;
  email: string;
  selfBand?: number | null; // the learner's own estimate (onboarding)
  targetBand?: number | null;
  lang?: string; // the learner's language saved on the server
};

type SessionState = {
  user: SessionUser | null;
  setUser: (user: SessionUser | null) => void;
};

export const useSessionStore = create<SessionState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
}));
