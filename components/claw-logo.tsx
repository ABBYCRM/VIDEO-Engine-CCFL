import Image from "next/image";

// Shared brand mark for the Claw app. The source art is a square-ish
// cartoon, so we render it inside a rounded, clipped box and let it cover
// the frame. `size` is the box edge in px; callers pass Tailwind sizing via
// className when they need responsive control.
export function ClawLogo({
  size = 32,
  className = "",
  rounded = "rounded-lg",
}: {
  size?: number;
  className?: string;
  rounded?: string;
}) {
  return (
    <span
      className={`relative block shrink-0 overflow-hidden bg-[hsl(var(--claw-elevated))] ${rounded} ${className}`}
      style={{ width: size, height: size }}
    >
      <Image
        src="/claw-logo.jpeg"
        alt="Claw"
        fill
        sizes={`${size}px`}
        className="object-cover"
        priority
      />
    </span>
  );
}
