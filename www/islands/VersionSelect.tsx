// Copyright 2022-2023 the Deno authors. All rights reserved. MIT license.

import type { VersionLink } from "../routes/docs/[...slug].tsx";

const IS_BROWSER = typeof document !== "undefined";

export default function VersionSelect({
  versions,
  selectedVersion,
}: {
  versions: VersionLink[];
  selectedVersion: string;
}) {
  const selectedIsLatest = selectedVersion === "latest";

  return (
    <>
      <div class="relative mr-4 sm:mr-0">
        <label htmlFor="version" class="sr-only">
          Version
        </label>
        {selectedIsLatest && (
          <div class="flex absolute pointer-events-none select-none w-full h-full items-center justify-end pr-8">
            <div class="rounded-full px-2 py-1 text-xs tag-label bg-[#056CF025] dark:bg-[#2182ff45] text-blue-700 dark:text-blue-400">
              Latest
            </div>
          </div>
        )}
        <select
          id="version"
          class={`rounded-md block border border-foreground-primary/20 appearance-none bg-background-primary form-select-bg font-semibold ${
            selectedIsLatest ? "pr-22" : "pr-10"
          } py-2 pl-3 w-full h-full leading-none sm:text-sm sm:leading-5 focus:outline-hidden focus:border-blue-300 hover:bg-background-secondary`}
          value={selectedVersion}
          onChange={(e) => {
            if (e.currentTarget.value !== selectedVersion) {
              const entry = versions.find((entry) => entry.value === e.currentTarget.value);
              if (entry) {
                location.href = entry.href;
              }
            }
          }}
          disabled={!IS_BROWSER}
        >
          {versions.map((entry) => (
            <option key={entry.value} value={entry.value}>
              {entry.label}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
