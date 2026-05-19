/**
 * Loading skeleton for the repo segment — keeps the layout stable while the
 * tab's data is fetched.
 */
export default function RepoSegmentLoading() {
  return (
    <div className="h-full overflow-hidden">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="space-y-3 mb-8">
          <div className="h-3 w-24 skeleton rounded" />
          <div className="h-9 w-72 skeleton rounded-lg" />
          <div className="h-4 w-96 skeleton rounded" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="rounded-2xl border border-[hsl(var(--hairline))] p-5 space-y-3">
              <div className="h-3 w-20 skeleton rounded" />
              <div className="h-7 w-28 skeleton rounded-md" />
              <div className="h-3 w-32 skeleton rounded" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-[hsl(var(--hairline))] p-5 h-72 skeleton" />
          <div className="rounded-2xl border border-[hsl(var(--hairline))] p-5 h-72 skeleton" />
        </div>
      </div>
    </div>
  );
}
