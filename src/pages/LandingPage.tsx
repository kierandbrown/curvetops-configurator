const LandingPage: React.FC = () => {
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
        <div className="h-64 rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-800" />
      </section>
    </div>
  );
};

export default LandingPage;
