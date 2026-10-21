import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Passport } from "@/components/passport";
import { Spinner } from "@/components/ui";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Agent #${id}`,
    description: `Lifecycle passport of ERC-8004 agent #${id} on BNB Smart Chain: owner, verified wallet, state and every stamp.`,
  };
}

async function Body({ params }: Props) {
  const { id } = await params;
  if (!/^\d{1,78}$/.test(id)) notFound();
  return <Passport agentId={BigInt(id).toString()} />;
}

export default function Page({ params }: Props) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <Suspense fallback={<Spinner label="Opening passport" />}>
        <Body params={params} />
      </Suspense>
    </div>
  );
}
