import type { Metadata } from "next";
import { Directory } from "@/components/directory";

export const metadata: Metadata = {
  title: "Agent directory",
  description: "Every AI agent with a lifecycle passport on BNB Smart Chain, read straight from the registry contract.",
};

export default function Page() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="font-serif text-5xl tracking-tight">Agent directory</h1>
      <p className="mt-4 max-w-2xl leading-relaxed text-ink-2">
        Read live from the lifecycle registry, newest first. A directory is only a hint: anyone can register an agent, so
        open the passport and check its state before you trust or pay it.
      </p>
      <div className="mt-10">
        <Directory />
      </div>
    </div>
  );
}
