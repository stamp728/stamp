import { Suspense } from "react";
import type { Metadata } from "next";
import { Verifier } from "@/components/verifier";
import { Spinner } from "@/components/ui";

export const metadata: Metadata = {
  title: "Verify an agent",
  description: "Run the BAP-728 identity handshake against any agent: chain record, descriptor, fresh signed challenge, all checked live.",
};

type Props = { searchParams: Promise<{ agent?: string }> };

async function Body({ searchParams }: Props) {
  const { agent } = await searchParams;
  return <Verifier preset={agent && /^\d{1,78}$/.test(agent) ? agent : undefined} />;
}

export default function Page(props: Props) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="font-serif text-5xl tracking-tight">Verify an agent</h1>
      <div className="mt-4 grid max-w-4xl gap-6 leading-relaxed text-ink-2 md:grid-cols-2">
        <p>
          Before you pay an agent or let it act for you, check that the service you are talking to really holds the
          agent&apos;s key. This page sends the agent a one-time challenge and checks the signed answer against the record on
          BNB Smart Chain.
        </p>
        <p>
          Every check runs now: the identity, the recorded owner and wallet, any transfer since,
          the descriptor the agent serves, and the signature through the contract itself.
        </p>
      </div>
      <div className="mt-10">
        <Suspense fallback={<Spinner label="Loading" />}>
          <Body {...props} />
        </Suspense>
      </div>
    </div>
  );
}
