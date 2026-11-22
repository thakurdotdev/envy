"use client";

import { clearKey } from "@envy/crypto";
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
import {
  ApiError,
  call,
  forgetAccessToken,
  refreshAccessToken,
  signOut as apiSignOut,
} from "./api";
import { setUpKeys, unlockKeys, type StoredKeys, type UnlockedKeys } from "./envy";

export type Profile = {
  id: string;
  email: string;
  name: string | null;
  githubLogin: string;
  keys: StoredKeys | null;
};

export type SessionState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "error"; message: string }
  | { status: "setup"; profile: Profile }
  | { status: "locked"; profile: Profile }
  | { status: "unlocked"; profile: Profile; keys: UnlockedKeys };

// Function-typed properties (not methods), so they can be passed straight to onClick.
type SessionActions = {
  unlock: (password: string) => Promise<void>;
  setUp: (password: string) => Promise<string>;
  finishSetUp: () => void;
  lock: () => void;
  signOut: () => Promise<void>;
  retry: () => void;
};

const SessionContext = createContext<(SessionState & SessionActions) | undefined>(undefined);

/** The private key is forgotten after this long without activity. */
const IDLE_LOCK_MS = 15 * 60 * 1000;
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "scroll", "touchstart"] as const;

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: "loading" });
  const keysRef = useRef<UnlockedKeys | undefined>(undefined);
  // Held between set-up and "I saved my recovery key", so the page can show the key first.
  const pendingKeysRef = useRef<{ profile: Profile; keys: UnlockedKeys } | undefined>(undefined);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      await refreshAccessToken();
    } catch (error) {
      const isSignedOut =
        error instanceof ApiError &&
        error.code !== "NETWORK_ERROR" &&
        error.code !== "INTERNAL_ERROR";
      setState(
        isSignedOut
          ? { status: "signedOut" }
          : { status: "error", message: "Could not reach the Envy server." },
      );
      return;
    }
    try {
      const profile = await call((api) => api.v1.me.get());
      setState(
        profile.keys === null ? { status: "setup", profile } : { status: "locked", profile },
      );
    } catch {
      setState({ status: "error", message: "Could not load your account. Try again." });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const lock = useCallback(() => {
    const keys = keysRef.current;
    keysRef.current = undefined;
    if (keys !== undefined) {
      void clearKey(keys.privateKey);
    }
    setState((current) =>
      current.status === "unlocked" ? { status: "locked", profile: current.profile } : current,
    );
  }, []);

  // Lock after 15 minutes idle, and wipe the key when the tab goes away.
  useEffect(() => {
    if (state.status !== "unlocked") {
      return undefined;
    }
    let timer = setTimeout(lock, IDLE_LOCK_MS);
    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(lock, IDLE_LOCK_MS);
    };
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, resetTimer, { passive: true });
    }
    window.addEventListener("pagehide", lock);
    return () => {
      clearTimeout(timer);
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, resetTimer);
      }
      window.removeEventListener("pagehide", lock);
    };
  }, [state.status, lock]);

  const actions = useMemo<SessionActions>(
    () => ({
      async unlock(password) {
        if (state.status !== "locked" || state.profile.keys === null) {
          return;
        }
        const keys = await unlockKeys(password, state.profile.keys);
        keysRef.current = keys;
        setState({ status: "unlocked", profile: state.profile, keys });
      },
      async setUp(password) {
        if (state.status !== "setup") {
          throw new Error("Keys are already set up.");
        }
        const { keys, recoveryKeyText } = await setUpKeys(password);
        pendingKeysRef.current = { profile: state.profile, keys };
        return recoveryKeyText;
      },
      finishSetUp() {
        const pending = pendingKeysRef.current;
        pendingKeysRef.current = undefined;
        if (pending !== undefined) {
          keysRef.current = pending.keys;
          setState({ status: "unlocked", profile: pending.profile, keys: pending.keys });
        }
      },
      lock,
      async signOut() {
        lock();
        await apiSignOut().catch(() => {});
        forgetAccessToken();
        setState({ status: "signedOut" });
      },
      retry() {
        void load();
      },
    }),
    [state, lock, load],
  );

  return (
    <SessionContext.Provider value={{ ...state, ...actions }}>{children}</SessionContext.Provider>
  );
}

export function useSession() {
  const session = useContext(SessionContext);
  if (session === undefined) {
    throw new Error("useSession must be used inside SessionProvider.");
  }
  return session;
}

/** For pages behind the gate: the unlocked keys and profile. */
export function useUnlocked(): { profile: Profile; keys: UnlockedKeys } {
  const session = useSession();
  if (session.status !== "unlocked") {
    throw new Error("useUnlocked must be used inside an unlocked SessionGate.");
  }
  return { profile: session.profile, keys: session.keys };
}
