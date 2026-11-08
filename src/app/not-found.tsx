import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-bold">Not found</h1>
      <p className="mt-2 text-sm text-ink-2">This page does not exist or you do not have access to it.</p>
      <Link href="/" className="btn-primary mt-6">Go home</Link>
    </main>
  );
}
