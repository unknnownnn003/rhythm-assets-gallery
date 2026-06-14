(() => {
  const themeStorageKey = "rhythm-gallery-theme";
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const canAnimate = !reduceMotion.matches;
  const cores = navigator.hardwareConcurrency || 4;
  const memory = navigator.deviceMemory || 4;
  const isSmallScreen = window.matchMedia("(max-width: 820px)").matches;
  const isLowPower = isSmallScreen || cores <= 4 || memory <= 4;

  document.documentElement.classList.add("has-site-effects");
  if (isLowPower) {
    document.documentElement.classList.add("low-power-effects");
  }

  function getStoredTheme() {
    try {
      return localStorage.getItem(themeStorageKey);
    } catch {
      return null;
    }
  }

  function setStoredTheme(theme) {
    try {
      localStorage.setItem(themeStorageKey, theme);
    } catch {
      // Ignore storage failures.
    }
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
  }

  function currentTheme() {
    return document.documentElement.dataset.theme || (prefersDark.matches ? "dark" : "light");
  }

  function syncThemeButtons() {
    const nextLabel = currentTheme() === "dark" ? "切换浅色" : "切换深色";
    const buttons = document.querySelectorAll("[data-theme-toggle]");

    for (const button of buttons) {
      button.setAttribute("aria-pressed", currentTheme() === "dark" ? "true" : "false");
      const label = button.querySelector("[data-theme-toggle-label]");
      if (label) {
        label.textContent = nextLabel;
      }
    }
  }

  const storedTheme = getStoredTheme();
  if (storedTheme === "dark" || storedTheme === "light") {
    applyTheme(storedTheme);
  } else {
    applyTheme(prefersDark.matches ? "dark" : "light");
  }
  syncThemeButtons();

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest("[data-theme-toggle]") : null;
    if (!target) {
      return;
    }

    const nextTheme = currentTheme() === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
    setStoredTheme(nextTheme);
    syncThemeButtons();
  });

  prefersDark.addEventListener("change", () => {
    if (!getStoredTheme()) {
      applyTheme(prefersDark.matches ? "dark" : "light");
      syncThemeButtons();
    }
  });

  function addAmbientLayer() {
    if (document.querySelector(".ambient-canvas")) {
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.className = "ambient-canvas";
    canvas.setAttribute("aria-hidden", "true");
    document.body.prepend(canvas);

    const orbLayer = document.createElement("div");
    orbLayer.className = "ambient-orbs";
    orbLayer.setAttribute("aria-hidden", "true");
    orbLayer.innerHTML = "<span></span><span></span><span></span>";
    document.body.prepend(orbLayer);

    if (!canAnimate || isSmallScreen) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const colors = ["#38bdf8", "#14b8a6", "#fb7185", "#f59e0b"];
    const particleCount = isLowPower ? 22 : Math.min(42, Math.max(26, Math.round(window.innerWidth / 34)));
    const connectDistance = isLowPower ? 0 : 104;
    const frameInterval = 1000 / 30;
    let width = 0;
    let height = 0;
    let particles = [];
    let rafId = 0;
    let lastFrame = 0;

    const rand = (min, max) => min + Math.random() * (max - min);

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      particles = Array.from({ length: particleCount }, () => ({
        x: rand(0, width),
        y: rand(0, height),
        r: rand(0.8, 1.8),
        vx: rand(-0.1, 0.1),
        vy: rand(-0.075, 0.075),
        color: colors[Math.floor(rand(0, colors.length))],
        alpha: rand(0.16, 0.38),
      }));
    }

    function draw(now = 0) {
      rafId = window.requestAnimationFrame(draw);
      if (document.hidden || now - lastFrame < frameInterval) {
        return;
      }
      lastFrame = now;
      ctx.clearRect(0, 0, width, height);

      for (const particle of particles) {
        particle.x += particle.vx;
        particle.y += particle.vy;
        if (particle.x < -12) particle.x = width + 12;
        if (particle.x > width + 12) particle.x = -12;
        if (particle.y < -12) particle.y = height + 12;
        if (particle.y > height + 12) particle.y = -12;

        ctx.beginPath();
        ctx.globalAlpha = particle.alpha;
        ctx.fillStyle = particle.color;
        ctx.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2);
        ctx.fill();
      }

      if (connectDistance > 0) {
        for (let i = 0; i < particles.length; i += 1) {
          for (let j = i + 1; j < particles.length; j += 1) {
            const left = particles[i];
            const right = particles[j];
            const dx = left.x - right.x;
            const dy = left.y - right.y;
            const distSq = dx * dx + dy * dy;
            const maxSq = connectDistance * connectDistance;
            if (distSq < maxSq) {
              ctx.beginPath();
              ctx.globalAlpha = (1 - distSq / maxSq) * 0.05;
              ctx.strokeStyle = left.color;
              ctx.lineWidth = 0.55;
              ctx.moveTo(left.x, left.y);
              ctx.lineTo(right.x, right.y);
              ctx.stroke();
            }
          }
        }
      }
      ctx.globalAlpha = 1;
    }

    resize();
    rafId = window.requestAnimationFrame(draw);
    window.addEventListener("resize", resize, { passive: true });
    window.addEventListener("pagehide", () => window.cancelAnimationFrame(rafId), { once: true });
  }

  function initReveal() {
    const targets = document.querySelectorAll(
      "[data-reveal], .gallery-page-hero, .home-hero, .home-section, .related-section",
    );
    if (!targets.length) {
      return;
    }

    targets.forEach((target) => target.classList.add("motion-reveal"));
    if (!canAnimate || !("IntersectionObserver" in window)) {
      targets.forEach((target) => target.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -44px 0px", threshold: 0.12 },
    );

    targets.forEach((target) => observer.observe(target));
  }

  function initRipple() {
    document.addEventListener("pointerdown", (event) => {
      const target = event.target instanceof Element ? event.target.closest("a, button") : null;
      if (!target || target.closest(".asset-grid")) {
        return;
      }

      const rect = target.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return;
      }

      const ripple = document.createElement("span");
      const size = Math.max(rect.width, rect.height) * 1.8;
      ripple.className = "tap-ripple";
      ripple.style.width = `${size}px`;
      ripple.style.height = `${size}px`;
      ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
      ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
      target.classList.add("has-ripple");
      target.appendChild(ripple);
      ripple.addEventListener("animationend", () => ripple.remove(), { once: true });
    });
  }

  function initTilt() {
    if (!canAnimate || isLowPower || "ontouchstart" in window) {
      return;
    }

    const cards = document.querySelectorAll(
      ".game-spotlight, .featured-category, .side-card, .home-stat-card, .hero-preview-card",
    );
    for (const card of cards) {
      card.addEventListener("pointermove", (event) => {
        const rect = card.getBoundingClientRect();
        const dx = (event.clientX - rect.left) / rect.width - 0.5;
        const dy = (event.clientY - rect.top) / rect.height - 0.5;
        card.style.setProperty("--tilt-x", `${dy * -7}deg`);
        card.style.setProperty("--tilt-y", `${dx * 7}deg`);
        card.classList.add("is-tilting");
      });
      card.addEventListener("pointerleave", () => {
        card.classList.remove("is-tilting");
        card.style.removeProperty("--tilt-x");
        card.style.removeProperty("--tilt-y");
      });
    }
  }

  function initNavSearch() {
    const navSearch = document.querySelector("[data-nav-search]");
    const hero = document.querySelector(".home-hero");
    if (!navSearch || !hero) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          navSearch.classList.toggle("is-visible", !entry.isIntersecting);
        }
      },
      { rootMargin: "-88px 0px 0px 0px" },
    );

    observer.observe(hero);
  }

  addAmbientLayer();
  initReveal();
  initRipple();
  initTilt();
  initNavSearch();
})();
