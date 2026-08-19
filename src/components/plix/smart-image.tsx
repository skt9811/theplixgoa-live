import { useState, type CSSProperties } from "react";

type SmartImageProps = {
  src: string;
  alt: string;
  loading?: "lazy" | "eager";
  width?: number;
  height?: number;
  className?: string;
  style?: CSSProperties;
};

export function SmartImage({ src, alt, loading = "lazy", width, height, className, style }: SmartImageProps) {
  const [errored, setErrored] = useState(false);

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
      src={src}
      alt={alt}
      loading={loading}
      width={width}
      height={height}
      className={`block ${className ?? ""}`}
      style={style}
      onError={() => setErrored(true)}
    />
  );
}
