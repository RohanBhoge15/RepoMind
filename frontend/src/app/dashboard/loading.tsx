export default function DashboardLoading() {
  return (
    <div>
      <div className="mb-8 space-y-3">
        <div className="h-3 w-24 skeleton rounded" />
        <div className="h-9 w-72 skeleton rounded-lg" />
        <div className="h-4 w-96 skeleton rounded" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="rounded-2xl border border-[hsl(var(--hairline))] p-5 h-52 skeleton" />
        ))}
      </div>
    </div>
  );
}
