'use client';
import { useEffect } from "react";

/**
 * Locks page scroll while `locked` is true — used by every full-screen popup
 * (the OTP modal, the callback modal, the quick-check popup).
 *
 * Without this, the background page (long and vertically scrollable) keeps
 * its own scrollbar the whole time a modal is open. That scrollbar reserves
 * a few pixels of horizontal space, but a `position: fixed; inset: 0` overlay
 * (and anything inside it sized off the raw viewport width) doesn't account
 * for it — so the overlay renders a little WIDER than the page's actual
 * visible area, pushing the page into genuine horizontal overflow while the
 * modal is up. That's the "flickers/snaps back" visual: the browser briefly
 * settles into that wider layout, then corrects once something (a resize,
 * the countdown re-render, closing the modal) forces a reflow. Locking body
 * scroll removes the scrollbar for as long as the modal is open, so there's
 * nothing for the overlay's own sizing to disagree with in the first place.
 */
export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    const { overflow, paddingRight } = document.body.style;
    // Compensate for the scrollbar's own width disappearing (which would
    // otherwise shift the whole page left by a few pixels the instant it's
    // hidden) by padding the body out by exactly that much.
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
    };
  }, [locked]);
}
