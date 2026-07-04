/**
 * `useCopyToClipboard` \u2014 the only place the FE talks to the browser
 * clipboard.
 *
 * Why a hook (and not a standalone `copy()` helper): the table rows
 * need a transient "copied!" affordance (the spec-locked toast) and
 * a built-in auto-reset so a second click on the Copy button can
 * re-trigger the same feedback. The auto-reset is timer-based and
 * lives inside the hook so the consumer doesn't have to think
 * about timers.
 *
 * Failure mode: the Clipboard API is gated by browser permission
 * and absent from jsdom. We surface the failure via a `false`
 * return value rather than throwing so callers can branch on the
 * return and toasts stay user-friendly ("No se pudo copiar" instead
 * of an unhandled exception).
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseCopyToClipboardOptions {
  /**
   * How long the `copied` flag stays `true` before resetting.
   * Defaults to 1500ms \u2014 long enough to land a toast but short
   * enough that re-clicks feel responsive.
   */
  resetMs?: number;
}

export interface UseCopyToClipboardResult {
  /** `true` for `resetMs` after a successful copy, otherwise `false`. */
  copied: boolean;
  /**
   * Copy the given text. Resolves to `true` on success and `false`
   * on any failure (clipboard unavailable, permission denied, etc.).
   * Never throws.
   */
  copy: (text: string) => Promise<boolean>;
}

/**
 * Browser-only hook. Safe to call on the server: the `copy()` call
 * resolves to `false` when `navigator.clipboard` is undefined, so
 * SSR consumers (or test setup that omits the Clipboard API) get
 * the failure path automatically.
 */
export function useCopyToClipboard(
  options: UseCopyToClipboardOptions = {},
): UseCopyToClipboardResult {
  const { resetMs = 1500 } = options;
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cancel any pending reset when the hook unmounts so a fast
  // navigation away from a "just copied" toast doesn't fire
  // setState on a torn-down component.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  const copy = useCallback(
    async (text: string): Promise<boolean> => {
      if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
        return false;
      }
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        if (timerRef.current !== null) {
          clearTimeout(timerRef.current);
        }
        timerRef.current = setTimeout(() => {
          setCopied(false);
          timerRef.current = null;
        }, resetMs);
        return true;
      } catch {
        return false;
      }
    },
    [resetMs],
  );

  return { copied, copy };
}
