"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { ConnectedAPI } from "@midnight-ntwrk/dapp-connector-api";
import { clearServerSession, establishServerSession } from "@/lib/api";

export type WalletKind = "lace" | "1am" | "demo";

export const WALLET_KEYS: Record<Exclude<WalletKind, "demo">, string> = {
  lace: "mnLace",
  "1am": "1am",
};

// Match an injected wallet by the `name` it reports. Injection keys are NOT
// stable across wallets/versions: 1AM injects under the fixed key "1am", but
// Lace 4.x injects under a per-install random UUID rather than the historical
// "mnLace" — so a hardcoded key lookup finds 1AM and misses Lace entirely.
const WALLET_NAME_MATCH: Record<Exclude<WalletKind, "demo">, RegExp> = {
  lace: /lace/i,
  "1am": /1\s*am/i,
};

export const WALLET_LABELS: Record<WalletKind, string> = {
  lace: "Lace",
  "1am": "1AM",
  demo: "Anonymous examiner",
};

export const WALLET_INSTALL_URLS: Record<Exclude<WalletKind, "demo">, string> = {
  lace: "https://docs.midnight.network/relnotes/lace",
  "1am": "https://chromewebstore.google.com/detail/1am/bphnkdkcnfhompoegfpgnkidcjfbojjp",
};

export type NetworkId = "mainnet" | "preview" | "preprod" | "undeployed";

// Preview is VELO's official target network — not preprod, which earlier
// local testing defaulted to.
export const DEFAULT_NETWORK: NetworkId = "preview";

interface WalletSession {
  kind: WalletKind;
  networkId: NetworkId;
  name: string;
  address: string;
}

interface WalletContextValue {
  session: WalletSession | null;
  connecting: boolean;
  error: string | null;
  detected: Partial<Record<WalletKind, boolean>>;
  connect: (kind: WalletKind, networkId?: NetworkId) => Promise<boolean>;
  disconnect: () => void;
  isAttestor: boolean; // true when a real wallet is connected (demo mode can't attest)
}

const WalletContext = createContext<WalletContextValue | null>(null);

type InjectedWallet = NonNullable<Window["midnight"]>[string];

// Resolve a wallet by its reported `name` first (robust to non-stable injection
// keys like Lace's random UUID), falling back to the legacy fixed key.
function resolveInjected(kind: Exclude<WalletKind, "demo">): InjectedWallet | undefined {
  if (typeof window === "undefined" || !window.midnight) return undefined;
  const match = WALLET_NAME_MATCH[kind];
  const byName = Object.values(window.midnight).find(
    (w) => typeof w?.name === "string" && match.test(w.name),
  );
  return byName ?? window.midnight[WALLET_KEYS[kind]];
}

function detectInstalled(): Partial<Record<WalletKind, boolean>> {
  if (typeof window === "undefined" || !window.midnight) return {};
  return {
    lace: !!resolveInjected("lace"),
    "1am": !!resolveInjected("1am"),
  };
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<WalletSession | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detected, setDetected] = useState<Partial<Record<WalletKind, boolean>>>({});

  useEffect(() => {
    setDetected(detectInstalled());
    const onMidnightChange = () => setDetected(detectInstalled());
    window.addEventListener("midnight-injected", onMidnightChange);
    window.addEventListener("storage", onMidnightChange);
    return () => {
      window.removeEventListener("midnight-injected", onMidnightChange);
      window.removeEventListener("storage", onMidnightChange);
    };
  }, []);

  // Best-effort silent reconnect if a session was persisted.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("velo-wallet");
      if (!raw) return;
      const saved = JSON.parse(raw) as WalletSession;
      if (saved.kind === "demo") {
        setSession(saved);
        return;
      }
      const wallet = resolveInjected(saved.kind);
      if (!wallet) return;
      wallet
        .connect(saved.networkId)
        .then(async (api) => {
          const status = await api.getConnectionStatus();
          if (status.status !== "connected") return;
          const { shieldedAddress } = await api.getShieldedAddresses();
          setSession({
            kind: saved.kind,
            networkId: saved.networkId,
            name: wallet.name ?? WALLET_LABELS[saved.kind],
            address: shieldedAddress,
          });
          // Restore the server session too — persistence decisions are made
          // server-side from the cookie, so it must exist for seals to persist.
          establishServerSession(shieldedAddress, wallet.name ?? WALLET_LABELS[saved.kind]).catch(
            () => undefined,
          );
        })
        .catch(() => {
          /* wallet may be locked — leave disconnected */
        });
    } catch {
      localStorage.removeItem("velo-wallet");
    }
  }, []);

  const connect = useCallback(async (kind: WalletKind, networkId: NetworkId = DEFAULT_NETWORK) => {
    setError(null);
    setConnecting(true);
    try {
      if (kind === "demo") {
        const demoSession: WalletSession = {
          kind: "demo",
          networkId: "undeployed",
          name: "Anonymous examiner",
          address: "demo-mode",
        };
        setSession(demoSession);
        localStorage.setItem("velo-wallet", JSON.stringify(demoSession));
        return true;
      }

      const wallet = resolveInjected(kind);
      if (!wallet) {
        throw new Error(
          `${WALLET_LABELS[kind]} wallet is not installed. Install it, then refresh the page.`,
        );
      }

      // connect() must stay inside the user gesture (wallet pop-up blocking).
      const api: ConnectedAPI = await wallet.connect(networkId);
      const status = await api.getConnectionStatus();
      if (status.status !== "connected") {
        throw new Error(`Wallet did not finish connecting on ${networkId}.`);
      }
      const { shieldedAddress } = await api.getShieldedAddresses();
      const next: WalletSession = {
        kind,
        networkId,
        name: wallet.name ?? WALLET_LABELS[kind],
        address: shieldedAddress,
      };
      setSession(next);
      localStorage.setItem("velo-wallet", JSON.stringify(next));
      // AC-J2.1: exchange the wallet address for a server session. Failure
      // here does not fail the connect — it only means seals won't persist.
      await establishServerSession(shieldedAddress, next.name).catch(() => undefined);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setSession(null);
    setError(null);
    localStorage.removeItem("velo-wallet");
    clearServerSession();
  }, []);

  const isAttestor = session !== null && session.kind !== "demo";

  return (
    <WalletContext.Provider
      value={{ session, connecting, error, detected, connect, disconnect, isAttestor }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}
