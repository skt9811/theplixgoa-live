import { useEffect, useState, type CSSProperties } from "react";

type SmartImageProps = {
  src: string;
  alt: string;
  loading?: "lazy" | "eager";
  width?: number;
  height?: number;
  className?: string;
  style?: CSSProperties;
  // If the primary src (and its one retry) both fail, fall back to this
  // src instead of showing the "Image unavailable" placeholder — e.g. a
  // gallery carousel substituting the property's main photo for a single
  // broken slide, rather than leaving a hole mid-gallery.
  fallbackSrc?: string | undefined;
};

// Previously: one failed load (a transient network blip, a slow connection,
// a momentary CDN hiccup — not necessarily anything wrong with the file
// itself) permanently marked this component instance as broken, with no way
// back even if `src` later changed to a different, perfectly good image.
// Now: an error triggers exactly one automatic retry. Incrementing
// `attempt` (used in the <img>'s key) forces React to unmount and remount a
// brand-new <img> element for the same src — changing the src attribute on
// an already-failed element does NOT make the browser retry, only a fresh
// element does. The error state, and the retry count, both reset whenever
// `src` itself changes, so a new image always gets its own clean attempt.
export function SmartImage({ src, alt, loading = "lazy", width, height, className, style, fallbackSrc }: SmartImageProps) {
  const [errored, setErrored] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [usedFallback, setUsedFallback] = useState(false);

  useEffect(() => {
    setErrored(false);
    setAttempt(0);
    setUsedFallback(false);
  }, [src]);

  function handleError() {
    if (attempt === 0) {
      setAttempt(1);
      return;
    }
    if (!usedFallback && fallbackSrc && fallbackSrc !== src) {
      setUsedFallback(true);
      setAttempt(0);
      return;
    }
    setErrored(true);
  }

  // `onError` alone misses a real failure mode: a response cut short mid
  // transfer (flaky mobile network, a proxy that truncates) still reports
  // as "loaded" by the <img> element — the browser paints whatever partial
  // data it received (often just a rendered top strip) and fills the rest
  // solid grey, without ever firing `error`. `naturalWidth`/`naturalHeight`
  // don't catch it either, since those come from the file's header, not
  // from how much of the body actually arrived. `decode()` forces a real,
  // full decode pass and rejects if that data is incomplete, so we run it
  // after every load and route a rejection through the same retry path.
  function handleLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget;
    if (typeof img.decode !== "function") return;
    img.decode().catch(() => {
      handleError();
    });
  }

  if (errored) {
    return (
      <div
        className={`flex items-center justify-center bg-muted text-muted-foreground ${className ?? ""}`}
        style={style}
        role="img"
        aria-label={alt}
      >
        <span className="text-xs font-medium uppercase tracking-wider opacity-60">Image unavailable</span>
      </div>
    );
  }

  const currentSrc = usedFallback && fallbackSrc ? fallbackSrc : src;

  return (
    <img
      key={`${currentSrc}-${attempt}`}
      src={currentSrc}
      alt={alt}
      loading={loading}
      width={width}
      height={height}
      className={`block ${className ?? ""}`}
      style={style}
      onError={handleError}
      onLoad={handleLoad}
    />
  );
}
