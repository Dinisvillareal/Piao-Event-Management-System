import React, { useEffect, useState } from "react";

interface IdCardFlipProps {
  frontUrl: string;
  backUrl: string;
  alt?: string;
  /** Flip by itself every `intervalMs` (restarts after any manual flip). */
  autoFlip?: boolean;
  intervalMs?: number;
  /** If given, clicking calls this instead of flipping the card. */
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
}

const CARD_ASPECT = "1011 / 638";

/**
 * Two-sided ID card that turns smoothly around its vertical axis. Shows the
 * front first; optionally flips on a timer, and flips when clicked (unless an
 * `onClick` override is supplied, e.g. to open a pop-up).
 */
export default function IdCardFlip({
  frontUrl,
  backUrl,
  alt = "ID card",
  autoFlip = false,
  intervalMs = 10000,
  onClick,
  className = "",
  style,
  title,
}: IdCardFlipProps) {
  const [flipped, setFlipped] = useState(false);

  // Depends on `flipped` so every flip -- timed or manual -- restarts the wait.
  useEffect(() => {
    if (!autoFlip) return;
    const id = setTimeout(() => setFlipped((f) => !f), intervalMs);
    return () => clearTimeout(id);
  }, [autoFlip, intervalMs, flipped]);

  const face: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    backfaceVisibility: "hidden",
    WebkitBackfaceVisibility: "hidden",
  };

  return (
    <button
      type="button"
      onClick={() => (onClick ? onClick() : setFlipped((f) => !f))}
      title={title}
      aria-label={alt}
      className={`block cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 rounded-[4%] ${className}`}
      style={{ perspective: "1400px", aspectRatio: CARD_ASPECT, ...style }}
    >
      <div
        className="relative h-full w-full"
        style={{
          transformStyle: "preserve-3d",
          transition: "transform 1.4s cubic-bezier(0.45, 0.05, 0.25, 1)",
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        <img src={frontUrl} alt={`${alt} (front)`} draggable={false} style={face} />
        <img
          src={backUrl}
          alt={`${alt} (back)`}
          draggable={false}
          style={{ ...face, transform: "rotateY(180deg)" }}
        />
      </div>
    </button>
  );
}
