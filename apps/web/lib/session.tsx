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
import { clearLoadCache } from "@/hooks/use-load";
import type { ConfirmNewKeys, KeyOwner } from "@envy/shared";
import {
  setUpKeys,
  storeNewKeyCopies,
  unlockKeys,
  unlockWithRecoveryKey,
  type StoredKeys,
  type UnlockedKeys,
} from "./envy";
import { browserTrustStore, type KeyPair } from "./trust";

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

/** Keys this browser has not seen, waiting for the person to confirm them. */
export type KeyConfirmation = {
  owners: Array<KeyOwner & { fingerprint: string }>;
  answer: (trusted: boolean) => void;
};

// Function-typed properties (not methods), so they can be passed straight to onClick.
type SessionActions = {
  /** Set while a key check waits for the person; ConfirmKeysDialog shows it. */
  keyConfirmation: KeyConfirmation | undefined;
  unlock: (password: string) => Promise<void>;
  setUp: (password: string) => Promise<string>;
  /** Forgot the master password: the recovery key opens the keys; returns the new recovery key. */
  recover: (recoveryKeyText: string, newPassword: string) => Promise<string>;
  /** Checks the current master password, then stores the keys under the new one. */
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
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
  const [keyConfirmation, setKeyConfirmation] = useState<KeyConfirmation | undefined>();
  const answerRef = useRef<((trusted: boolean) => void) | undefined>(undefined);

  // Asks through ConfirmKeysDialog and waits for the answer.
  const confirmNewKeys = useCallback<ConfirmNewKeys>(
    (owners) =>
      new Promise<boolean>((resolve) => {
        const answer = (trusted: boolean) => {
          answerRef.current = undefined;
          setKeyConfirmation(undefined);
          resolve(trusted);
        };
        answerRef.current = answer;
        setKeyConfirmation({ owners, answer });
      }),
    [],
  );

  const withTrust = useCallback(
    (profile: Profile, pair: KeyPair): UnlockedKeys => ({
      ...pair,
      trust: { store: browserTrustStore(profile.id), confirm: confirmNewKeys },
    }),
    [confirmNewKeys],
  );

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
    // A question left open when the session locks counts as "no".
    answerRef.current?.(false);
    // Project names, members and the like go too: nothing outlives the unlock.
    clearLoadCache();
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
      keyConfirmation,
      async unlock(password) {
        if (state.status !== "locked" || state.profile.keys === null) {
          return;
        }
        const keys = withTrust(state.profile, await unlockKeys(password, state.profile.keys));
        keysRef.current = keys;
        setState({ status: "unlocked", profile: state.profile, keys });
      },
      async setUp(password) {
        if (state.status !== "setup") {
          throw new Error("Keys are already set up.");
        }
        const { keys, recoveryKeyText } = await setUpKeys(password);
        pendingKeysRef.current = { profile: state.profile, keys: withTrust(state.profile, keys) };
        return recoveryKeyText;
      },
      async recover(recoveryKeyText, newPassword) {
        if (state.status !== "locked" || state.profile.keys === null) {
          throw new Error("Recovery is only for a locked account with keys.");
        }
        const pair = await unlockWithRecoveryKey(recoveryKeyText, state.profile.keys);
        // The typed-in recovery key is replaced too.
        const { recoveryKeyText: newRecoveryKeyText, stored } = await storeNewKeyCopies(
          pair.privateKey,
          newPassword,
          true,
        );
        const profile = { ...state.profile, keys: stored };
        pendingKeysRef.current = { profile, keys: withTrust(profile, pair) };
        return newRecoveryKeyText ?? "";
      },
      async changePassword(currentPassword, newPassword) {
        if (state.status !== "unlocked" || state.profile.keys === null) {
          throw new Error("Unlock first.");
        }
        // Throws a CryptoError when the current password is wrong.
        const check = await unlockKeys(currentPassword, state.profile.keys);
        await clearKey(check.privateKey);
        const { stored } = await storeNewKeyCopies(state.keys.privateKey, newPassword, false);
        setState({ ...state, profile: { ...state.profile, keys: stored } });
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
    [state, lock, load, keyConfirmation, withTrust],
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
