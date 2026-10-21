"use client";

import { useState } from "react";
import { LIFECYCLE_REGISTRY } from "@/lib/config";
import { PassportList, useDirectory } from "./home-islands";
import { Button, Notice, Spinner } from "./ui";

const PAGE = 25;

export function Directory() {
  const [page, setPage] = useState(0);
  const { items, total, err } = useDirectory(page * PAGE, PAGE);
  if (!LIFECYCLE_REGISTRY) return <Notice>The lifecycle registry is not deployed yet.</Notice>;
  if (err) return <Notice tone="error">Could not read the chain: {err}</Notice>;
  if (!items) return <Spinner label="Reading the registry" />;
  if (items.length === 0 && page === 0) return <Notice>No passports yet.</Notice>;
  const pages = Math.max(1, Math.ceil(Number(total) / PAGE));
  return (
    <div className="space-y-4">
      <PassportList items={items} />
      <div className="flex items-center justify-between text-sm text-muted">
        <span>
          {total.toString()} passports · page {page + 1} of {pages}
        </span>
        <div className="flex gap-2">
          <Button variant="secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Newer
          </Button>
          <Button variant="secondary" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>
            Older
          </Button>
        </div>
      </div>
    </div>
  );
}
