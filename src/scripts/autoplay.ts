/**
 * Stops videos that play automatically when the reader prefers reduced motion,
 * on page load or when the preference changes.
 * These videos show controls, so readers can still play them.
 */
export function setUpAutoplay(
  root: ParentNode = document,
  reducedMotion: MediaQueryList = matchMedia("(prefers-reduced-motion: reduce)"),
): void {
  const stop = () => {
    if (!reducedMotion.matches) return;
    for (const video of root.querySelectorAll<HTMLVideoElement>("video[autoplay]")) {
      video.autoplay = false;
      video.pause();
    }
  };
  stop();
  reducedMotion.addEventListener("change", stop);
}
