/**
 * Tests for the `useCopyToClipboard` hook.
 *
 * The hook is the only place the FE talks to `navigator.clipboard`.
 * It MUST:
 *  - Resolve to `true` when the copy succeeds.
 *  - Resolve to `false` when the browser denies permission / the
 *    clipboard API is unavailable (jsdom doesn't implement the
 *    Clipboard API, so the failure path is the only one we can
 *    drive from tests without mocking).
 *  - Reset the `copied` flag back to `false` after a short delay
 *    so the consumer (e.g. the "URL copiada" toast) can re-trigger
 *    by calling `copy(...)` again.
 *
 * We mock the clipboard on a per-test basis (jsdom leaves it
 * undefined) and the timer to assert the auto-reset.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useCopyToClipboard } from './use-copy-to-clipboard.js';

const ORIGINAL_WRITE = navigator.clipboard?.writeText;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (navigator.clipboard) {
    if (ORIGINAL_WRITE) {
      (navigator.clipboard as { writeText: typeof navigator.clipboard.writeText }).writeText =
        ORIGINAL_WRITE;
    } else {
      delete (navigator.clipboard as { writeText?: unknown }).writeText;
    }
  }
});

describe('useCopyToClipboard', () => {
  beforeEach(() => {
    // jsdom does not implement the Clipboard API by default.
    // Re-define it on the navigator before every test.
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn() },
    });
  });

  it('resolves true and flips copied to true on a successful copy', async () => {
    const writeText = vi.fn(async () => undefined);
    (navigator.clipboard as { writeText: typeof navigator.clipboard.writeText }).writeText =
      writeText;

    const { result } = renderHook(() => useCopyToClipboard());
    expect(result.current.copied).toBe(false);

    let success: boolean | undefined;
    await act(async () => {
      success = await result.current.copy('hello world');
    });
    expect(success).toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello world');
    expect(result.current.copied).toBe(true);
  });

  it('resolves false and does not flip copied when the clipboard rejects', async () => {
    const writeText = vi.fn(async () => {
      throw new Error('NotAllowedError');
    });
    (navigator.clipboard as { writeText: typeof navigator.clipboard.writeText }).writeText =
      writeText;

    const { result } = renderHook(() => useCopyToClipboard());
    let success: boolean | undefined;
    await act(async () => {
      success = await result.current.copy('nope');
    });
    expect(success).toBe(false);
    expect(result.current.copied).toBe(false);
  });

  it('resets copied back to false after a short delay', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn(async () => undefined);
    (navigator.clipboard as { writeText: typeof navigator.clipboard.writeText }).writeText =
      writeText;

    const { result } = renderHook(() => useCopyToClipboard({ resetMs: 1000 }));
    await act(async () => {
      await result.current.copy('a');
    });
    expect(result.current.copied).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    // After advancing the fake timer, the state update from the
    // setTimeout callback is committed synchronously inside `act`.
    expect(result.current.copied).toBe(false);
  });

  it('cancels a pending reset when copy is called again before the reset fires', async () => {
    // The `timerRef.current !== null` branch — a second copy while
    // the reset timer is pending must clear the previous timer so
    // the copied state doesn't flicker.
    vi.useFakeTimers();
    const writeText = vi.fn(async () => undefined);
    (navigator.clipboard as { writeText: typeof navigator.clipboard.writeText }).writeText =
      writeText;

    const { result } = renderHook(() => useCopyToClipboard({ resetMs: 1000 }));
    await act(async () => {
      await result.current.copy('a');
    });
    expect(result.current.copied).toBe(true);

    // Advance to 500ms (well before the 1000ms reset).
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current.copied).toBe(true);

    // Copy again — this MUST clear the pending timer and reset
    // the 1000ms countdown.
    await act(async () => {
      await result.current.copy('b');
    });
    expect(result.current.copied).toBe(true);

    // Advance to 500ms (would have triggered the FIRST timer had
    // it not been cleared). The copied state should still be true.
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current.copied).toBe(true);

    // Advance another 500ms — the SECOND timer fires, copied flips to false.
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current.copied).toBe(false);
  });
});

describe('useCopyToClipboard (no clipboard API)', () => {
  it('resolves false when navigator.clipboard is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });

    const { result } = renderHook(() => useCopyToClipboard());
    let success: boolean | undefined;
    await act(async () => {
      success = await result.current.copy('whatever');
    });
    expect(success).toBe(false);
    expect(result.current.copied).toBe(false);
  });
});
