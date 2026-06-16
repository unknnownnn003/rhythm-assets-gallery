(() => {
  const buttons = document.querySelectorAll("[data-copy-url]");
  if (!buttons.length) {
    return;
  }

  const resetLabel = (button, label) => {
    window.setTimeout(() => {
      button.textContent = label;
    }, 1600);
  };

  for (const button of buttons) {
    if (!(button instanceof HTMLButtonElement)) {
      continue;
    }

    const defaultLabel = button.textContent || "\u590d\u5236\u76f4\u94fe";
    button.addEventListener("click", async () => {
      const rawUrl = button.getAttribute("data-copy-url") || "";
      const url = new URL(rawUrl, window.location.origin).toString();

      try {
        await navigator.clipboard.writeText(url);
        button.textContent = "\u5df2\u590d\u5236";
      } catch {
        button.textContent = "\u590d\u5236\u5931\u8d25";
      }

      resetLabel(button, defaultLabel);
    });
  }
})();
