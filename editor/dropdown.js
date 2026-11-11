"use strict";

// Reusable labelled single-select control with keyboard and pointer support.
class Dropdown {
	constructor(trigger, list, valueLabel, onChange) {
		this.trigger = trigger;
		this.list = list;
		this.valueLabel = valueLabel;
		this.onChange = onChange;
		this.options = Array.from(list.querySelectorAll('[role="option"]'));
		trigger.addEventListener("click", () => list.hidden ? this.open() : this.close());
		trigger.addEventListener("keydown", event => {
			if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); this.open(); }
		});
		list.addEventListener("click", event => {
			const option = event.target.closest('[role="option"]');
			if (!option || !list.contains(option)) return;
			this.setValue(option.dataset.value);
			this.close(true);
			this.onChange(option.dataset.value);
		});
		list.addEventListener("keydown", event => {
			if (event.key === "Escape") { event.preventDefault(); this.close(true); return; }
			if (event.key === "Tab") { this.close(); return; }
			const index = this.options.indexOf(document.activeElement);
			let next;
			if (event.key === "ArrowDown") next = (index + 1) % this.options.length;
			else if (event.key === "ArrowUp") next = (index + this.options.length - 1) % this.options.length;
			else if (event.key === "Home") next = 0;
			else if (event.key === "End") next = this.options.length - 1;
			else return;
			event.preventDefault();
			this.options[next].focus();
		});
		document.addEventListener("pointerdown", event => {
			if (!trigger.parentElement.contains(event.target)) this.close();
		});
	}
	setValue(value) {
		const selected = this.options.find(option => option.dataset.value === value);
		if (!selected) return;
		this.options.forEach(option => option.setAttribute("aria-selected", String(option === selected)));
		this.valueLabel.textContent = selected.textContent;
	}
	open() {
		this.list.hidden = false;
		this.trigger.setAttribute("aria-expanded", "true");
		(this.options.find(option => option.getAttribute("aria-selected") === "true") || this.options[0]).focus();
	}
	close(restoreFocus = false) {
		this.list.hidden = true;
		this.trigger.setAttribute("aria-expanded", "false");
		if (restoreFocus) this.trigger.focus();
	}
}
