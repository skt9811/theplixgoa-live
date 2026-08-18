import { useEffect, useState, type CSSProperties } from "react";

type SmartImageProps = {
  src: string;
  alt: string;
  fallbackSrc?: string;
  loading?: "lazy" | "eager";
  width?: number;
  height?: number;
  className?: string;
  style?: CSSProperties;
};

export function SmartImage({
  src,
  alt,
  fallbackSrc,
  loading = "lazy",
  width,
  height,
  className,
  style,
}: SmartImageProps) {
  const [currentSrc, setCurrentSrc] = useState(src);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setCurrentSrc(src);
    setHidden(false);
  }, [src]);

  if (hidden || !currentSrc) return null;

  function handleError() {
    if (fallbackSrc && currentSrc !== fallbackSrc) {
      setCurrentSrc(fallbackSrc);
      return;
    }
    setHidden(true);
  }

  return (
    <img
      src={currentSrc}
      alt={alt}
      loading={loading}
      decoding="async"
      width={width}
      height={height}
      className={`block h-full w-full object-cover object-center ${className ?? ""}`}
      style={style}
      onError={handleError}
    />
  );
}
