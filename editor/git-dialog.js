(() => {
  "use strict";

  // Each invocation owns its dialog and settles once, including when Escape closes it.
  function openDialog(options, build) {
    return new Promise(resolve => {
      const previousFocus = document.activeElement;
      const dialog = document.createElement("dialog");
      dialog.className = "git-action-dialog";
      const heading = document.createElement("h2");
      heading.id = `git-dialog-title-${Math.random().toString(36).slice(2)}`;
      heading.textContent = options.title || "";
      dialog.setAttribute("aria-labelledby", heading.id);
      dialog.append(heading);
      let result = null;
      let settled = false;
      const finish = value => {
        if (settled) return;
        result = value;
        if (dialog.open) dialog.close();
      };
      dialog.addEventListener("close", () => {
        if (settled) return;
        settled = true;
        dialog.remove();
        if (previousFocus?.isConnected && typeof previousFocus.focus === "function") previousFocus.focus();
        resolve(result);
      });
      const focusTarget = build(dialog, finish);
      document.body.append(dialog);
      dialog.showModal();
      (focusTarget || dialog).focus();
      if (focusTarget instanceof HTMLInputElement) focusTarget.select();
    });
  }

  function labels() {
    const english = document.documentElement.lang === "en";
    return { cancel: english ? "Cancel" : "Hủy", close: english ? "Close" : "Đóng", confirm: english ? "OK" : "Đồng ý", empty: english ? "No items" : "Không có mục nào" };
  }

  function button(text, className, action) {
    const element = document.createElement("button");
    element.type = "button";
    element.className = `button ${className}`;
    element.textContent = text;
    element.addEventListener("click", action);
    return element;
  }

  function actions(dialog, children) {
    const row = document.createElement("div");
    row.className = "git-action-dialog-actions";
    row.append(...children);
    dialog.append(row);
  }

  window.gitDialog = {
    input(options = {}) {
      return openDialog(options, (dialog, finish) => {
        const form = document.createElement("form");
        const label = document.createElement("label");
        label.textContent = options.label || options.title || "";
        const input = document.createElement("input");
        input.className = "git-action-dialog-input";
        input.value = options.value ?? "";
        input.placeholder = options.placeholder || "";
        input.autocomplete = "off";
        label.append(input);
        form.append(label);
        dialog.append(form);
        form.addEventListener("submit", event => { event.preventDefault(); finish(input.value); });
        const cancel = button(options.cancel || labels().cancel, "secondary", () => finish(null));
        const confirm = button(options.confirm || labels().confirm, "primary", () => finish(input.value));
        actions(form, [cancel, confirm]);
        return input;
      });
    },
    choose(options = {}) {
      return openDialog(options, (dialog, finish) => {
        const list = document.createElement("div");
        list.className = "git-action-dialog-list";
        const items = options.items || [];
        if (!items.length) {
          const empty = document.createElement("p");
          empty.className = "git-action-dialog-empty";
          empty.textContent = options.empty || labels().empty;
          list.append(empty);
        }
        for (const item of items) {
          const choice = document.createElement("button");
          choice.type = "button";
          choice.className = "git-action-dialog-choice";
          const title = document.createElement("span");
          title.textContent = item.label;
          choice.append(title);
          if (item.detail) {
            const detail = document.createElement("span");
            detail.className = "git-action-dialog-detail";
            detail.textContent = item.detail;
            choice.append(detail);
          }
          choice.addEventListener("click", () => finish(item.value));
          list.append(choice);
        }
        list.addEventListener("keydown", event => {
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          const choices = [...list.querySelectorAll("button")];
          if (!choices.length) return;
          event.preventDefault();
          const index = choices.indexOf(document.activeElement);
          choices[(index + (event.key === "ArrowDown" ? 1 : choices.length - 1)) % choices.length].focus();
        });
        dialog.append(list);
        const cancel = button(options.cancel || labels().cancel, "secondary", () => finish(null));
        actions(dialog, [cancel]);
        return list.querySelector("button") || cancel;
      });
    },
    output(options = {}) {
      return openDialog(options, (dialog, finish) => {
        const text = document.createElement("pre");
        text.className = "git-action-dialog-output";
        text.textContent = options.text || "";
        dialog.append(text);
        const close = button(options.close || labels().close, "secondary", () => finish(null));
        actions(dialog, [close]);
        return close;
      });
    }
  };
})();
