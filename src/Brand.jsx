import React, { useId } from "react";

/* Garage 21 emblem: a tachometer ring with a red-line arc and a slanted "21". */
export function Emblem({ size = 46 }) {
  const id = useId().replace(/:/g, "");
  const ticks = Array.from({ length: 28 }, (_, i) => {
    const a = (-225 + i * (270 / 27)) * (Math.PI / 180);
    const major = i % 3 === 0;
    const r1 = 21.5, r2 = major ? 18 : 19.6;
    return <line key={i} x1={24 + r1 * Math.cos(a)} y1={24 + r1 * Math.sin(a)} x2={24 + r2 * Math.cos(a)} y2={24 + r2 * Math.sin(a)} stroke={i >= 21 ? "#e10600" : "#8c8f96"} strokeWidth={major ? 1.4 : 0.9} strokeLinecap="round" />;
  });
  return (
    <svg className="emblem" width={size} height={size} viewBox="0 0 48 48" role="img" aria-label="Garage 21 emblem">
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2a2a2e" /><stop offset="1" stopColor="#0c0c0d" /></linearGradient>
        <linearGradient id={`${id}r`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ff3b30" /><stop offset="1" stopColor="#b00000" /></linearGradient>
      </defs>
      <circle cx="24" cy="24" r="23" fill={`url(#${id}g)`} stroke="#3a3a3f" strokeWidth="1" />
      {ticks}
      <g transform="skewX(-10) translate(4.4 0)">
        <text x="19.5" y="31" textAnchor="middle" fontFamily="'Big Shoulders Display', 'Arial Narrow', sans-serif" fontWeight="800" fontSize="21" fill="#f4f4f5" letterSpacing="-0.5">2</text>
        <text x="29.5" y="31" textAnchor="middle" fontFamily="'Big Shoulders Display', 'Arial Narrow', sans-serif" fontWeight="800" fontSize="21" fill={`url(#${id}r)`}>1</text>
      </g>
      <path d="M13 36.5 H35" stroke="#e10600" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ size = 46, tagline = "Performance workshop", stacked = false }) {
  return (
    <div className={`logo ${stacked ? "logo-stacked" : ""}`}>
      <Emblem size={size} />
      <div className="logo-text">
        <span className="logo-word"><span className="logo-garage">GARAGE</span><span className="logo-21">21</span></span>
        {tagline && <span className="logo-tag">{tagline}</span>}
      </div>
    </div>
  );
}

/* Original car illustrations (side profile). Tone controls the paint. */
const PAINT = {
  red: ["#ff3b30", "#c40a0a", "#5a0606"],
  black: ["#4a4a50", "#202023", "#050506"],
  grey: ["#c4c7cd", "#80848c", "#33353a"],
};

const BODIES = {
  coupe: {
    body: "M62 212 C56 196 64 180 92 174 L186 160 C248 152 292 124 350 107 C404 92 474 92 524 106 C566 118 596 142 646 153 L726 168 C756 175 768 192 764 214 L764 228 L62 228 Z",
    glass: "M304 130 C344 112 420 104 474 110 C504 120 534 138 552 150 L322 152 Z",
    pillar: "M432 106 L446 152",
    lamp: "M704 176 L752 186 L748 194 L700 188 Z",
    tail: "M64 190 L86 186 L88 196 L66 202 Z",
    wheels: [214, 592], line: "M96 196 C260 184 480 190 744 200",
  },
  suv: {
    body: "M66 214 L68 150 C69 136 80 128 96 126 L292 114 C316 96 336 78 360 72 C400 66 520 66 560 72 C584 78 598 96 620 124 L700 146 C742 156 762 172 764 200 L764 228 L66 228 Z",
    glass: "M312 112 C330 94 346 84 366 82 L424 80 L426 118 Z M440 80 L548 82 C566 88 578 104 592 120 L440 120 Z",
    pillar: "M432 80 L434 120",
    lamp: "M716 158 L756 172 L752 182 L712 170 Z",
    tail: "M68 150 L90 148 L90 168 L68 170 Z",
    wheels: [214, 600], line: "M96 176 C260 168 480 168 736 186",
  },
  wedge: {
    body: "M54 214 C52 200 62 192 88 188 L240 170 C330 152 400 124 500 120 C560 120 600 138 650 154 L730 174 C758 182 770 198 768 216 L768 228 L54 228 Z",
    glass: "M366 148 C410 128 462 122 504 124 C540 130 568 144 590 158 L388 164 Z",
    pillar: "M486 124 L498 160",
    lamp: "M708 182 L756 194 L752 201 L704 192 Z",
    tail: "M56 196 L96 190 L96 200 L58 208 Z",
    wheels: [206, 598], line: "M90 200 C260 188 500 188 750 206",
  },
};

export function CarArt({ variant = "coupe", tone = "red", className = "", title }) {
  const id = useId().replace(/:/g, "");
  const b = BODIES[variant] || BODIES.coupe;
  const [c1, c2, c3] = PAINT[tone] || PAINT.red;
  return (
    <svg className={`car-art ${className}`} viewBox="0 0 820 280" role={title ? "img" : "presentation"} aria-label={title} aria-hidden={title ? undefined : true}>
      <defs>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={c1} /><stop offset=".55" stopColor={c2} /><stop offset="1" stopColor={c3} /></linearGradient>
        <linearGradient id={`${id}w`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#3b4048" /><stop offset="1" stopColor="#0a0b0d" /></linearGradient>
        <radialGradient id={`${id}s`}><stop offset="0" stopColor="#000" stopOpacity=".65" /><stop offset="1" stopColor="#000" stopOpacity="0" /></radialGradient>
        <radialGradient id={`${id}l`}><stop offset="0" stopColor="#fff" stopOpacity=".9" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
      </defs>
      <ellipse cx="415" cy="248" rx="370" ry="16" fill={`url(#${id}s)`} />
      <path d={b.body} fill={`url(#${id}b)`} />
      <path d={b.glass} fill={`url(#${id}w)`} stroke="rgba(255,255,255,.18)" strokeWidth="1.2" />
      <path d={b.pillar} stroke="rgba(0,0,0,.55)" strokeWidth="5" strokeLinecap="round" />
      <path d={b.line} fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M62 226 H764 V234 H62 Z" fill="rgba(0,0,0,.55)" />
      <path d={b.lamp} fill="#fff7e0" />
      <ellipse cx={variant === "suv" ? 748 : 752} cy="184" rx="42" ry="20" fill={`url(#${id}l)`} opacity=".55" />
      <path d={b.tail} fill="#ff1a12" />
      {b.wheels.map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy="214" r="54" fill="#09090a" />
          <circle cx={cx} cy="214" r="44" fill="#151517" stroke="#2c2c30" strokeWidth="2" />
          <circle cx={cx} cy="214" r="29" fill="#9b9ea6" />
          <circle cx={cx} cy="214" r="26" fill="#1c1c1f" />
          {Array.from({ length: 6 }, (_, i) => <path key={i} d="M0 -25 L5 -8 L-5 -8 Z" transform={`translate(${cx} 214) rotate(${i * 60})`} fill="#b9bcc4" />)}
          <circle cx={cx} cy="214" r="6" fill="#e10600" />
        </g>
      ))}
    </svg>
  );
}
