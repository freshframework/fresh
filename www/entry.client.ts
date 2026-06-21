document.addEventListener("click", async (ev) => {
  let el = ev.target as HTMLElement | null;
  if (el === null) return;
  if (!(el instanceof HTMLButtonElement)) {
    el = el.closest("button");
  }
  if (el === null) return;

  // Package-manager tab switch.
  if (el.classList.contains("pm-tab")) {
    const pm = el.dataset.pm;
    if (!pm) return;
    document.cookie = `fresh-pm=${encodeURIComponent(pm)}; path=/; max-age=${
      60 * 60 * 24 * 365
    }; samesite=lax`;
    for (const group of document.querySelectorAll<HTMLElement>(".pm-tabs")) {
      const target = group.querySelector<HTMLElement>(`.pm-block[data-pm="${pm}"]`);
      if (!target) continue;
      for (const tab of group.querySelectorAll<HTMLElement>(".pm-tab")) {
        const isActive = tab.dataset.pm === pm;
        tab.classList.toggle("pm-tab-active", isActive);
        tab.setAttribute("aria-selected", String(isActive));
      }
      for (const block of group.querySelectorAll<HTMLElement>(".pm-block")) {
        block.classList.toggle("pm-active", block.dataset.pm === pm);
      }
    }
    return;
  }

  const code = el.dataset.code;
  if (!code) return;

  try {
    await navigator.clipboard.writeText(code);

    el.dataset.copied = "true";

    setTimeout(() => {
      delete el.dataset.copied;
    }, 1000);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // deno-lint-ignore no-console
    console.error(message || "Copy failed");
  }
});
