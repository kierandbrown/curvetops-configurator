import { memo, useState } from 'react';

// Small helper so we only describe the arrow shape once.
const ArrowIcon = ({ className }: { className?: string }) => (
  <svg
    aria-hidden
    viewBox="0 0 24 24"
    className={`h-4 w-4 ${className ?? ''}`}
    fill="none"
    stroke="currentColor"
    strokeWidth={2.5}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4 12 H20" />
    <path d="M14 6 L20 12 L14 18" />
  </svg>
);

const interactions = [
  {
    label: 'Left click + drag',
    description: 'Orbit the tabletop to inspect every corner.',
    accent: 'text-emerald-300',
    // Slow spin animation visually hints that the view will rotate.
    icon: (
      <span
        aria-hidden
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-emerald-300 text-[0.7rem] text-emerald-200"
        style={{ animation: 'spin 6s linear infinite' }}
      >
        ⤾
      </span>
    )
  },
  {
    label: 'Right click + drag',
    description: 'Pan the camera to slide across the workspace.',
    accent: 'text-sky-300',
    icon: <ArrowIcon className="text-sky-300 animate-pulse" />
  },
  {
    label: 'Scroll wheel',
    description: 'Zoom in to the edges or pull back for context.',
    accent: 'text-amber-300',
    icon: (
      <div className="flex items-center gap-0.5 text-amber-300">
        <ArrowIcon className="-rotate-90 animate-bounce" />
        <ArrowIcon className="rotate-90 animate-bounce" />
      </div>
    )
  }
];

const ViewportMouseGuide = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-10">
      <div className="pointer-events-auto flex flex-col gap-2 text-[0.7rem] text-slate-200">
        {isCollapsed ? (
          <button
            type="button"
            onClick={() => setIsCollapsed(false)}
            className="flex items-center gap-2 rounded-full bg-slate-900/90 px-4 py-2 text-xs font-semibold text-slate-100 shadow-lg ring-1 ring-slate-800/80 transition hover:bg-slate-900"
            aria-expanded="false"
            aria-label="Show navigation help"
          >
            <span aria-hidden className="text-emerald-300">?</span>
            Show navigation help
          </button>
        ) : (
          <div className="relative flex max-w-sm gap-3 rounded-2xl bg-slate-950/85 p-3 shadow-2xl ring-1 ring-slate-800">
            {/* Inline toggle keeps the guidance available without permanently covering the viewport. */}
            <button
              type="button"
              onClick={() => setIsCollapsed(true)}
              className="absolute -top-2 -right-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-900/90 text-xs font-semibold text-slate-200 shadow-lg ring-1 ring-slate-700 transition hover:bg-slate-900"
              aria-expanded="true"
              aria-label="Hide navigation help"
            >
              ×
            </button>
            {/* Stylised mouse body that anchors the hint visually to hardware controls. */}
            <svg
              role="img"
              aria-label="Mouse navigation guide"
              viewBox="0 0 90 140"
              className="h-20 w-14 text-slate-200"
            >
              <defs>
                <linearGradient id="mouseBody" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#1e293b" />
                  <stop offset="100%" stopColor="#0f172a" />
                </linearGradient>
              </defs>
              <path
                d="M45 5 C65 5 80 25 80 55 V95 C80 115 65 135 45 135 C25 135 10 115 10 95 V55 C10 25 25 5 45 5 Z"
                fill="url(#mouseBody)"
                stroke="#475569"
                strokeWidth={3}
              />
              <line x1="45" y1="20" x2="45" y2="65" stroke="#38bdf8" strokeWidth={2} strokeDasharray="6 4" />
              <circle cx="45" cy="85" r="8" fill="#1e1b4b" stroke="#38bdf8" strokeWidth={2} />
            </svg>

            {/* Textual legend that explains how each mouse input manipulates the viewport. */}
            <div className="space-y-1.5">
              <p className="font-semibold text-slate-100">Need help navigating?</p>
              {interactions.map(interaction => (
                <div key={interaction.label} className="flex items-start gap-2">
                  <div className={`mt-0.5 ${interaction.accent}`}>{interaction.icon}</div>
                  <div>
                    <p className="font-semibold text-slate-100">{interaction.label}</p>
                    <p className="text-slate-300">{interaction.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(ViewportMouseGuide);
