import type { Metadata } from "next";
import Link from "next/link";
import { LifecycleDiagram } from "@/components/lifecycle-diagram";
import { IDENTITY_REGISTRY, LIFECYCLE_REGISTRY } from "@/lib/config";

export const metadata: Metadata = { title: "How Stamp works" };

export default function Page() {
  return (
    <>
      <h1 className="font-serif text-5xl leading-tight tracking-tight">How Stamp works</h1>
      <p className="mt-4 text-lg">
        AI agents are starting to hold wallets, buy services and take jobs. Before you pay one, you want three answers: who
        is behind it, which wallet really speaks for it, and whether it is still allowed to work. Stamp puts those answers
        on BNB Smart Chain, where anyone can read them and nobody can rewrite them.
      </p>

      <h2>The pieces</h2>
      <table>
        <thead>
          <tr>
            <th>Piece</th>
            <th>What it is</th>
            <th>Who runs it</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>ERC-8004 identity registry</td>
            <td>
              The shared registry of agent IDs on BNB Smart Chain, at <code>{IDENTITY_REGISTRY}</code>. Each agent is a token
              with an owner, a registration file and a verified wallet. The BNBAgent SDK uses the same registry.
            </td>
            <td>Already deployed; Stamp does not control it.</td>
          </tr>
          <tr>
            <td>Lifecycle registry</td>
            <td>
              Stamp&apos;s contract{LIFECYCLE_REGISTRY ? <> at <code>{LIFECYCLE_REGISTRY}</code></> : null}. It keeps one record per agent:
              state, sequence, owner and wallet snapshots, controller, authority epoch, policy hash and evidence hash. This is
              the part BAP-728 asks implementers to build.
            </td>
            <td>Nobody. No owner, no admin, no upgrade.</td>
          </tr>
          <tr>
            <td>Descriptor and handshake</td>
            <td>
              A small JSON file the agent serves at <code>/.well-known/alp.json</code>, and an endpoint that signs a fresh
              challenge with the agent&apos;s wallet. This is how a client knows it is talking to the real agent.
            </td>
            <td>
              The agent&apos;s operator. A ready server is in the <Link href="/docs/builders">builder guide</Link>.
            </td>
          </tr>
          <tr>
            <td>This website</td>
            <td>A front end for all of the above: issue, inspect, manage and verify passports.</td>
            <td>Optional. Everything it does can be done with the contract directly.</td>
          </tr>
        </tbody>
      </table>

      <h2>The lifecycle</h2>
      <p>
        BAP-728 defines six states. Two of them happen on your own machine before anything touches the chain: Draft (you
        have a configuration) and Provisioned (the agent has its own wallet and you approved what it may spend). The
        passport is created at Registered.
      </p>
      <div className="my-6 rounded-2xl border border-rule bg-card p-4 sm:p-6">
        <LifecycleDiagram />
      </div>
      <ul>
        <li>
          <strong>Registered.</strong> Identity exists, the dedicated wallet is bound and read back, the policy hash and a
          controller are recorded. Not yet cleared for paid work.
        </li>
        <li>
          <strong>Active.</strong> The controller confirmed the agent is running under one current authority (the epoch)
          and has completed a real payment on its funding rail. Only now should counterparties send it paid work.
        </li>
        <li>
          <strong>Suspended.</strong> New work and ordinary spending stop. The identity stays. The controller can resume it
          with a new epoch.
        </li>
        <li>
          <strong>Retired.</strong> Final. The contract refuses every update afterwards, from anyone, forever. A sale of the
          identity does not revive it.
        </li>
      </ul>

      <h2>Who can do what</h2>
      <table>
        <thead>
          <tr>
            <th>Role</th>
            <th>Can</th>
            <th>Cannot</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Owner (holds the ERC-8004 token)</td>
            <td>Open the record, suspend, retire, re-bind (new controller, new policy)</td>
            <td>Activate, unless also the controller. Re-bind while active.</td>
          </tr>
          <tr>
            <td>Controller</td>
            <td>Activate, resume, suspend, retire</td>
            <td>Change owner, wallet or policy. Anything but suspend after the owner changes.</td>
          </tr>
          <tr>
            <td>Agent wallet</td>
            <td>Sign handshakes and, through its own signer, payments within the policy</td>
            <td>Change its own record. It cannot be the controller.</td>
          </tr>
          <tr>
            <td>Anyone</td>
            <td>Read everything; suspend a record whose owner or wallet no longer matches</td>
            <td>Anything else</td>
          </tr>
        </tbody>
      </table>

      <h2>What happens when an agent is sold</h2>
      <p>
        Transferring the ERC-8004 token clears its agent wallet in the identity registry. From that block on, the passport
        no longer matches the chain: the old controller is frozen to suspend-only, anyone can suspend the record, and
        verifiers report it as not operational. The new owner binds a fresh wallet and re-binds the record, which raises
        the authority epoch so no lease from the previous owner works again. A retired agent stays retired.
      </p>

      <h2>Evidence, and why only a hash goes on chain</h2>
      <p>
        Every change carries an evidence commitment: the SHA-256 of a JSON document describing why the change happened,
        with links to payment transactions or receipts and a random salt. The document stays with whoever made the change
        (the site downloads it before the wallet opens). Publishing the hash means nobody can later swap in a different
        story; keeping the document private means prompts, credentials and customer data never end up on chain, as BAP-728
        section 9 requires.
      </p>
      <p>
        The contract checks who may make a change and whether it is a legal move. It cannot check that the evidence is
        true. That is your call, under your own rules.
      </p>

      <h2>Next</h2>
      <ul>
        <li>
          <Link href="/register">Issue a passport</Link> for your agent.
        </li>
        <li>
          Serve the descriptor and handshake: <Link href="/docs/builders">builder guide</Link>.
        </li>
        <li>
          Read the exact rules: <Link href="/docs/contract">contract reference</Link>.
        </li>
        <li>
          See what is and is not covered: <Link href="/docs/conformance">conformance</Link>.
        </li>
      </ul>
    </>
  );
}
