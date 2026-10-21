import { Suspense } from "react";
import { DocsNav } from "@/components/docs-nav";

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[13rem_1fr]">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <Suspense fallback={<DocsNav static />}>
          <DocsNav />
        </Suspense>
      </aside>
      <article className="prose-doc min-w-0 max-w-3xl">{children}</article>
    </div>
  );
}
