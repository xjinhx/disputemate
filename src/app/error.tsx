"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="mt-2 text-sm text-ink-2">Your dispute information is saved. Please try again.</p>
      {error.digest && <p className="mt-2 font-mono text-[11px] text-ink-3">Error ref {error.digest}</p>}
      <button onClick={reset} className="btn-primary mt-6">Try again</button>
    </main>
  );
}
