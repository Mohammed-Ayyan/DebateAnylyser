export default function SignInLoading() {
  return (
    <div className="space-y-4" role="status" aria-live="polite">
      <div className="h-3 w-28 animate-pulse bg-[#262626] motion-reduce:animate-none" />
      <div className="h-7 w-64 max-w-full animate-pulse bg-[#1a1a1a] motion-reduce:animate-none" />
      <div className="h-12 w-full animate-pulse bg-[#141414] motion-reduce:animate-none" />
      <span className="sr-only">Loading authentication…</span>
    </div>
  )
}
