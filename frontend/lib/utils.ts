import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function truncateAddress(addr: string, chars = 6): string {
  if (addr.length <= chars * 2 + 3) return addr;
  return `${addr.slice(0, chars)}…${addr.slice(-chars)}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Parse a fraction string like "3/10" (engine score serialization) into a number. */
export function fractionToNumber(frac: string): number {
  if (!frac) return 0;
  if (frac.includes("/")) {
    const [n, d] = frac.split("/").map(Number);
    if (!n || !d) return 0;
    return n / d;
  }
  const v = Number(frac);
  return Number.isFinite(v) ? v : 0;
}

export function shortHash(hash: string, chars = 10): string {
  if (hash.length <= chars * 2 + 2) return hash;
  return `${hash.slice(0, chars)}…${hash.slice(-chars)}`;
}
