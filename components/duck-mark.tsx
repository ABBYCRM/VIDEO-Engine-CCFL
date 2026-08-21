// Inline duck brand mark. Used in the app shell, login, and anywhere we want
// the mascot visible at small sizes. The full vector lives at /public/duck-logo.svg.
import * as React from "react";

type Props = {
  size?: number;
  className?: string;
  rounded?: boolean;
};

export function DuckMark({ size = 36, className, rounded = true }: Props) {
  return (
    <span
      className={[
        "inline-grid shrink-0 place-items-center overflow-hidden",
        rounded ? "rounded-xl" : "",
        className || ""
      ].join(" ")}
      style={{ width: size, height: size, background: "linear-gradient(135deg,#8B5CF6 0%,#6E56CF 50%,#5B4BBD 100%)", boxShadow: "0 1px 0 rgba(255,255,255,0.5) inset, 0 6px 18px -8px rgba(110,86,207,0.35)" }}
    >
      <svg
        viewBox="0 0 256 256"
        width={size}
        height={size}
        xmlns="http://www.w3.org/2000/svg"
        aria-label="VIDEO-Engine duck"
      >
        <defs>
          <linearGradient id="dm-duck" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#22D3EE" />
            <stop offset="55%" stopColor="#38BDF8" />
            <stop offset="100%" stopColor="#A78BFA" />
          </linearGradient>
          <linearGradient id="dm-beak" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FB923C" />
            <stop offset="100%" stopColor="#F59E0B" />
          </linearGradient>
          <radialGradient id="dm-shine" cx="0.35" cy="0.3" r="0.6">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.55" />
            <stop offset="60%" stopColor="#FFFFFF" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Body */}
        <path
          d="M 64 156 C 48 142, 52 110, 84 100 C 96 80, 124 76, 146 90 C 174 84, 202 102, 204 130 C 206 156, 188 178, 160 184 C 134 192, 96 188, 78 178 C 68 174, 64 168, 64 156 Z"
          fill="url(#dm-duck)"
        />
        <path
          d="M 84 116 C 104 102, 142 100, 168 110 C 152 102, 124 100, 104 110 C 96 114, 88 118, 84 116 Z"
          fill="url(#dm-shine)"
        />
        <path
          d="M 110 154 C 130 140, 168 142, 184 160 C 168 174, 138 178, 116 170 C 108 168, 106 160, 110 154 Z"
          fill="#0F172A"
          opacity="0.25"
        />
        <path
          d="M 200 132 C 214 124, 222 130, 218 144 C 214 152, 206 150, 200 144 Z"
          fill="url(#dm-duck)"
        />
        {/* Head */}
        <circle cx="84" cy="108" r="34" fill="url(#dm-duck)" />
        <ellipse cx="74" cy="96" rx="14" ry="8" fill="#FFFFFF" opacity="0.35" />
        <circle cx="74" cy="104" r="6" fill="#0F172A" />
        <circle cx="72" cy="102" r="2" fill="#FFFFFF" />
        {/* Clapperboard beak */}
        <g transform="translate(38 116) rotate(-8)">
          <rect x="0" y="6" width="58" height="22" rx="6" fill="url(#dm-beak)" />
          <rect x="3" y="9" width="8" height="3" rx="1" fill="#0F172A" opacity="0.85" />
          <rect x="3" y="18" width="8" height="3" rx="1" fill="#0F172A" opacity="0.85" />
          <rect x="19" y="9" width="8" height="3" rx="1" fill="#0F172A" opacity="0.85" />
          <rect x="19" y="18" width="8" height="3" rx="1" fill="#0F172A" opacity="0.85" />
          <rect x="35" y="9" width="8" height="3" rx="1" fill="#0F172A" opacity="0.85" />
          <rect x="35" y="18" width="8" height="3" rx="1" fill="#0F172A" opacity="0.85" />
          <rect x="-4" y="0" width="60" height="10" rx="2" fill="#0F172A" />
          <polygon points="6,0 14,0 18,10 10,10" fill="#FB923C" />
          <polygon points="22,0 30,0 34,10 26,10" fill="#FB923C" />
          <polygon points="38,0 46,0 50,10 42,10" fill="#FB923C" />
        </g>
        {/* REC dot */}
        <circle cx="206" cy="48" r="9" fill="#EF4444" />
        <text
          x="206"
          y="52"
          textAnchor="middle"
          fontFamily="ui-monospace, monospace"
          fontSize="7"
          fontWeight="700"
          fill="#FFFFFF"
          letterSpacing="0.5"
        >
          REC
        </text>
      </svg>
    </span>
  );
}
