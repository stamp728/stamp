import type { Metadata } from "next";
import { IDENTITY_PINS } from "@/lib/config";

export const metadata: Metadata = { title: "Security and trust" };

export default function Page() {
  return (
    <>
      <h1 className="font-serif text-5xl leading-tight tracking-tight">Security and trust</h1>
      <p className="mt-4 text-lg">
        What you have to trust when you rely on a passport, stated plainly, worst case first.
      </p>

      <h2>The ERC-8004 registry can be upgraded</h2>
      <p>
        Stamp reads owners and wallets from the shared ERC-8004 registry. That registry is an upgradeable proxy controlled
        by <code>{IDENTITY_PINS.upgradeAuthority}</code>, which Stamp does not control. Whoever holds that key could change
        what <code>ownerOf</code> and <code>getAgentWallet</code> return, and through that take over owner authority of any
        passport.
      </p>
      <p>What it cannot do: un-retire a passport. Retirement lives only in Stamp&apos;s registry, which has no upgrade path.</p>
      <p>
        What we do about it: the manifest pins the current implementation (<code>{IDENTITY_PINS.implementation}</code>) and
        its code hash, and the Verify page fails the moment the proxy points anywhere else. If the upstream registry ever
        stops answering, a controller can still suspend; nothing else moves.
      </p>

      <h2>Stamp&apos;s own contract has no keys</h2>
      <p>
        No owner, no admin, no pause, no proxy, no upgrade. The people who deployed it have exactly the powers of any other
        address. A bug cannot be patched in place; a fixed version would be a new contract, a new trust domain, and BAP-728
        forbids verifiers from switching registries to ignore a retirement.
      </p>

      <h2>Evidence is a claim, not a proof</h2>
      <p>
        The contract records who made a change and the hash of their evidence. It does not check that a payment happened
        or that a runtime lease is real. Read the evidence document, match its hash, and apply your own rules. A controller
        that lies still does so on the record, under its own address, forever.
      </p>

      <h2>Sales that go there and back</h2>
      <p>
        If an identity is sold and bought back, or a wallet is swapped and swapped back, before anyone looks, the snapshot
        matches again. BAP-728 still treats every transfer as invalidating sessions. Verify scans the identity
        registry&apos;s <code>Transfer</code> and <code>MetadataSet</code> events since the record was last written and fails
        if it finds any. Do the same in your own integration.
      </p>

      <h2>A handshake is not permission to spend</h2>
      <p>
        A valid handshake proves the server holds the agent&apos;s key right now. It says nothing about spending authority,
        and it is valid even for a suspended agent. For paid work, also require <code>liveStatus().operational</code>.
      </p>

      <h2>The website</h2>
      <ul>
        <li>No accounts, no cookies, no analytics. Your progress while issuing a passport stays in your browser.</li>
        <li>
          Evidence files and the signed policy are generated in your browser and downloaded to you. Stamp does not store
          them.
        </li>
        <li>
          Verify fetches agent URLs from our server. It only follows https on the default port, refuses private and local
          addresses, pins the checked IP for the connection, follows no redirects, and stops at 64 KiB and 6 seconds.
        </li>
        <li>
          The site hosts one showcase agent whose key only signs handshakes. Its approved policy allows no spending and its
          wallet holds no funds.
        </li>
      </ul>

      <h2>Review</h2>
      <p>
        The contract went through an internal adversarial review before deployment. Four findings were fixed with
        regression tests: a controller could push the epoch to its maximum and block re-binding; a controller could swap
        the policy hash on activation; safe suspension failed if the upstream registry stopped answering; and round-trip
        transfers were invisible to the snapshot (now caught by the verifier). There has been no external audit. Use it
        with that in mind.
      </p>

    </>
  );
}
