import { useSyncExternalStore } from "react";

/** Demo mode lets a presenter switch between the seeded roles without signing in again. */
export const DEMO_MODE = true;
export const PERSONA_HEADER = "x-kpiflow-persona";

const KEY = "kpiflow.persona";
const listeners = new Set<() => void>();

export function getPersonaId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(KEY);
}

export function setPersonaId(id: string | null) {
  if (typeof window === "undefined") return;
  if (id) window.localStorage.setItem(KEY, id);
  else window.localStorage.removeItem(KEY);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function useDemoPersonaId(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => getPersonaId(),
    () => null,
  );
}
