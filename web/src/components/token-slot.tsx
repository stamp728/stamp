import { STAMP_TOKEN } from "@/lib/config";
import { Addr } from "./ui";

const ZERO = "0x0000000000000000000000000000000000000000";

/** Reserved place for the $STAMP contract address. Shows the zero address until it exists. */
export function TokenSlot() {
  return (
    <section className="mx-auto max-w-6xl px-4 pt-20 sm:px-6">
      <div className="flex flex-col gap-6 rounded-2xl border border-rule bg-card p-6 sm:p-10 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="font-serif text-3xl tracking-tight">$STAMP</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-2">
            The Stamp token. Its contract address is published here, on this page, and nowhere else.
          </p>
        </div>
        <div className="min-w-0 space-y-1.5">
          <p className="text-xs tracking-wide text-muted uppercase">Contract address</p>
          {STAMP_TOKEN ? (
            <Addr value={STAMP_TOKEN} full />
          ) : (
            <>
              <p className="hash text-muted">{ZERO}</p>
              <p className="text-xs text-suspended">Not launched yet. Anything sold as $STAMP today is not ours.</p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
