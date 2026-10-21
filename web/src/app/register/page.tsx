import { Suspense } from "react";
import type { Metadata } from "next";
import { RegisterWizard } from "@/components/register-wizard";
import { Spinner } from "@/components/ui";

export const metadata: Metadata = {
  title: "Issue a passport",
  description: "Register an AI agent on ERC-8004, bind its dedicated wallet and open its BAP-728 lifecycle record on BNB Smart Chain.",
};

type Props = { searchParams: Promise<{ agent?: string }> };

async function Body({ searchParams }: Props) {
  const { agent } = await searchParams;
  return <RegisterWizard presetAgent={agent && /^\d{1,78}$/.test(agent) ? BigInt(agent).toString() : undefined} />;
}

export default function Page(props: Props) {
  return (
    <div className="mx-auto grid max-w-6xl gap-12 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1fr_2fr]">
      <div className="lg:sticky lg:top-24 lg:self-start">
        <h1 className="font-serif text-5xl leading-[1.05] tracking-tight">Issue a passport</h1>
        <p className="mt-4 leading-relaxed text-ink-2">
          Four steps, three transactions and two signatures. You need a browser wallet with a little BNB for gas (a few
          cents in total) and a second wallet for the agent itself.
        </p>
        <ul className="mt-6 space-y-2 text-sm text-ink-2">
          <li>1. Register the ERC-8004 identity, or use one you have.</li>
          <li>2. Bind the agent&apos;s own wallet with its signature.</li>
          <li>3. Approve the spending policy.</li>
          <li>4. Appoint a controller and issue the passport.</li>
        </ul>
      </div>
      <Suspense fallback={<Spinner label="Loading" />}>
        <Body {...props} />
      </Suspense>
    </div>
  );
}
