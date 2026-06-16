(function () {
  const DATA_URL = "/data/search-suggestions.json";
  let suggestions = [];
  let activeInput = null;
  let dropdown = null;
  let selectedIndex = -1;

  function createDropdown() {
    if (dropdown) return;
    dropdown = document.createElement("ul");
    dropdown.className = "autocomplete-dropdown";
    dropdown.setAttribute("role", "listbox");
    document.body.appendChild(dropdown);
  }

  function hideDropdown() {
    if (dropdown) {
      dropdown.classList.remove("is-open");
      dropdown.innerHTML = "";
    }
    selectedIndex = -1;
    activeInput = null;
  }

  function showDropdown(input, matches) {
    if (!dropdown || matches.length === 0) {
      hideDropdown();
      return;
    }

    const rect = input.getBoundingClientRect();
    dropdown.style.top = rect.bottom + 4 + "px";
    dropdown.style.left = rect.left + "px";
    dropdown.style.minWidth = rect.width + "px";

    dropdown.innerHTML = "";
    selectedIndex = -1;

    matches.slice(0, 8).forEach(function (text, i) {
      const li = document.createElement("li");
      li.className = "autocomplete-item";
      li.setAttribute("role", "option");
      li.textContent = text;
      li.addEventListener("mousedown", function (e) {
        e.preventDefault();
        input.value = text;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        hideDropdown();
        input.focus();
        // auto-submit if it's a search form
        const form = input.closest("form");
        if (form) {
          form.requestSubmit();
        }
      });
      li.addEventListener("mouseenter", function () {
        setSelected(i);
      });
      dropdown.appendChild(li);
    });

    dropdown.classList.add("is-open");
    activeInput = input;
  }

  function setSelected(index) {
    if (!dropdown) return;
    const items = dropdown.querySelectorAll(".autocomplete-item");
    items.forEach(function (item, i) {
      item.classList.toggle("is-selected", i === index);
    });
    selectedIndex = index;
  }

  function matchSuggestions(query) {
    if (!query || query.length < 1) return [];
    const q = query.toLowerCase();
    const exact = [];
    const starts = [];
    const contains = [];
    for (let i = 0; i < suggestions.length; i++) {
      const s = suggestions[i];
      const lower = s.toLowerCase();
      if (lower === q) {
        exact.push(s);
      } else if (lower.startsWith(q)) {
        starts.push(s);
      } else if (lower.includes(q)) {
        contains.push(s);
      }
    }
    return exact.concat(starts).concat(contains);
  }

  function onInput(e) {
    const input = e.target;
    const query = input.value.trim();
    const matches = matchSuggestions(query);
    activeInput = input;
    showDropdown(input, matches);
  }

  function onKeyDown(e) {
    if (!dropdown || !dropdown.classList.contains("is-open")) return;
    const items = dropdown.querySelectorAll(".autocomplete-item");
    if (items.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((selectedIndex + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((selectedIndex - 1 + items.length) % items.length);
    } else if (e.key === "Enter" && selectedIndex >= 0) {
      e.preventDefault();
      const item = items[selectedIndex];
      if (item && activeInput) {
        activeInput.value = item.textContent;
        activeInput.dispatchEvent(new Event("input", { bubbles: true }));
        hideDropdown();
        const form = activeInput.closest("form");
        if (form) {
          form.requestSubmit();
        }
      }
    } else if (e.key === "Escape") {
      hideDropdown();
    }
  }

  function onClickOutside(e) {
    if (dropdown && activeInput && !dropdown.contains(e.target) && e.target !== activeInput) {
      hideDropdown();
    }
  }

  function init() {
    // Load suggestions
    fetch(DATA_URL)
      .then(function (res) { return res.json(); })
      .then(function (data) {
        suggestions = data;
      })
      .catch(function () {
        // Suggestions unavailable, autocomplete silently disabled
      });

    createDropdown();

    // Attach to all search inputs
    document.addEventListener("input", function (e) {
      if (e.target.matches('input[type="search"]')) {
        onInput(e);
      }
    });

    document.addEventListener("keydown", function (e) {
      if (e.target.matches('input[type="search"]')) {
        onKeyDown(e);
      }
    });

    document.addEventListener("click", onClickOutside);
    document.addEventListener("focusin", function (e) {
      if (e.target.matches('input[type="search"]')) {
        const query = e.target.value.trim();
        if (query) {
          activeInput = e.target;
          showDropdown(e.target, matchSuggestions(query));
        }
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
