const LandingPage: React.FC = () => {
  const gallery = [
    {
      title: "Cafe-ready curves",
      description: "Warm timber tones and soft radii for relaxed hospitality settings.",
      image:
        "https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=1200&q=90",
    },
    {
      title: "Boardroom presence",
      description: "Sculptural meeting tables that pair premium veneers with precise edges.",
      image:
        "https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=1200&q=90",
    },
    {
      title: "Workspace flow",
      description: "Collaborative islands with cable-ready cutouts and durable finishes.",
      image:
        "https://images.unsplash.com/photo-1529429617124-aee1f1650a5c?auto=format&fit=crop&w=1200&q=90",
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <section className="mt-6 grid gap-8 md:grid-cols-2 md:items-center">
        <div className="space-y-4">
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Curved tabletops, custom built in minutes.
          </h1>
          <p className="text-slate-300 text-sm">
            Configure free-form table tops, visualise them in 3D, and get
            real-time pricing. Designed for architects, designers, builders and
            end clients.
          </p>
          <div className="flex flex-col gap-4">
            <a
              href="/configurator"
              className="rounded bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400"
            >
              Launch configurator
            </a>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Quick-start styles
              </p>
              <div className="flex flex-wrap gap-2 text-sm">
                <a
                  href="/configurator?style=cafe"
                  className="rounded-full border border-emerald-700/60 bg-emerald-900/30 px-4 py-2 text-emerald-100 transition hover:border-emerald-400/80 hover:text-emerald-50"
                >
                  Cafe Top
                </a>
                <a
                  href="/configurator?style=boardroom"
                  className="rounded-full border border-emerald-700/60 bg-emerald-900/30 px-4 py-2 text-emerald-100 transition hover:border-emerald-400/80 hover:text-emerald-50"
                >
                  Boardroom Top
                </a>
                <a
                  href="/configurator?style=meeting-room"
                  className="rounded-full border border-emerald-700/60 bg-emerald-900/30 px-4 py-2 text-emerald-100 transition hover:border-emerald-400/80 hover:text-emerald-50"
                >
                  Meeting Room Top
                </a>
                <a
                  href="/configurator?style=workstation"
                  className="rounded-full border border-emerald-700/60 bg-emerald-900/30 px-4 py-2 text-emerald-100 transition hover:border-emerald-400/80 hover:text-emerald-50"
                >
                  Workstation Top
                </a>
              </div>
            </div>
          </div>
        </div>
        <div className="relative h-64 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-xl shadow-emerald-900/30">
          <img
            src="https://images.unsplash.com/photo-1545239351-1141bd82e8a6?auto=format&fit=crop&w=1400&q=90"
            alt="Curved timber table in a modern interior"
            className="h-full w-full object-cover opacity-90"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-900/30 to-transparent" />
          <div className="absolute bottom-4 left-4 flex items-center gap-3 rounded-full bg-slate-900/70 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-200/90 ring-1 ring-emerald-700/50 backdrop-blur">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" aria-hidden />
            Live 3D preview
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-200/80">
              Inspiration
            </p>
            <h2 className="text-lg font-semibold text-emerald-50">High-fidelity table forms</h2>
            <p className="text-sm text-slate-400">
              Browse reference builds that match the configurator presets so you can quote with confidence.
            </p>
          </div>
          <a
            href="/configurator"
            className="hidden rounded-full border border-emerald-700/60 px-4 py-2 text-xs font-medium text-emerald-100 transition hover:border-emerald-400/80 hover:text-emerald-50 md:inline-flex"
          >
            Explore designs
          </a>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {gallery.map((item) => (
            <figure
              key={item.title}
              className="group relative overflow-hidden rounded-2xl border border-slate-800/70 bg-slate-900/70 shadow-lg shadow-emerald-950/40"
            >
              <img src={item.image} alt={item.title} className="h-44 w-full object-cover transition duration-500 group-hover:scale-105" />
              <figcaption className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-slate-950/80 via-slate-900/40 to-transparent p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-200/90">{item.title}</p>
                <p className="text-sm text-slate-200">{item.description}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>
    </div>
  );
};

export default LandingPage;
