export default function LabLoading() {
  return (
    <div className="h-full overflow-hidden">
      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="space-y-3 mb-10">
          <div className="h-3 w-32 skeleton rounded" />
          <div className="h-9 w-40 skeleton rounded-lg" />
          <div className="h-4 w-80 skeleton rounded" />
        </div>
        {[0, 1, 2].map((g) => (
          <section key={g} className="mb-10">
            <div className="mb-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-[hsl(var(--hairline))]" />
              <div className="h-3 w-20 skeleton rounded" />
              <div className="h-px flex-1 bg-[hsl(var(--hairline))]" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="rounded-2xl border border-[hsl(var(--hairline))] p-5 h-36 skeleton"
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
