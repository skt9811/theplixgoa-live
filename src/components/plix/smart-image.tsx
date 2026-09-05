import { useEffect, useState, type CSSProperties } from "react";

type SmartImageProps = {
  src: string;
  alt: string;
  loading?: "lazy" | "eager";
  width?: number;
  height?: number;
  className?: string;
  style?: CSSProperties;
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
export function SmartImage({ src, alt, loading = "lazy", width, height, className, style }: SmartImageProps) {
  const [errored, setErrored] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setErrored(false);
    setAttempt(0);
  }, [src]);

  function handleError() {
    if (attempt === 0) {
      setAttempt(1);
      return;
    }
    setErrored(true);
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

  return (
    <img
      key={`${src}-${attempt}`}
      src={src}
      alt={alt}
      loading={loading}
      width={width}
      height={height}
      className={`block ${className ?? ""}`}
      style={style}
      onError={handleError}
    />
  );
}
