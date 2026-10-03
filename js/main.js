document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.querySelector(".menu-toggle");
  const nav = document.querySelector(".nav");

  if (toggle && nav) {
    toggle.addEventListener("click", () => {
      nav.classList.toggle("open");
      toggle.setAttribute(
        "aria-expanded",
        nav.classList.contains("open")
      );
    });

    nav.querySelectorAll("a").forEach(link => {
      link.addEventListener("click", () => {
        nav.classList.remove("open");
      });
    });
  }

  // Aktív menüpont
  const current = window.location.pathname.replace(/\/+$/, "");

  document
    .querySelectorAll(".nav a, .footer-links a")
    .forEach(link => {
      const href = link.getAttribute("href");

      if (!href || href.startsWith("#")) return;

      const target = new URL(
        href,
        window.location.href
      ).pathname.replace(/\/+$/, "");

      if (
        target === current ||
        (current === "" && target.endsWith("/index.html"))
      ) {
        link.classList.add("active");
      }
    });

  // Galéria lightbox
  const lightbox = document.querySelector(".lightbox");
  const lightboxImg = lightbox?.querySelector("img");
  const closeBtn = lightbox?.querySelector(".lightbox-close");

  document.querySelectorAll(".gallery-item img").forEach(img => {
    img.addEventListener("click", () => {
      if (!lightbox || !lightboxImg) return;

      lightboxImg.src = img.src;
      lightboxImg.alt = img.alt || "";

      lightbox.classList.add("open");
      document.body.style.overflow = "hidden";
    });
  });

  const closeLightbox = () => {
    if (!lightbox) return;

    lightbox.classList.remove("open");
    document.body.style.overflow = "";
  };

  closeBtn?.addEventListener("click", closeLightbox);

  lightbox?.addEventListener("click", e => {
    if (e.target === lightbox) {
      closeLightbox();
    }
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      closeLightbox();
    }
  });

  // Smooth scroll
  document.querySelectorAll("[data-scroll]").forEach(btn => {
    btn.addEventListener("click", () => {
      const target = document.querySelector(
        btn.dataset.scroll
      );

      target?.scrollIntoView({
        behavior: "smooth"
      });
    });
  });

  // =========================================================
  // ÁRLISTA - SCROLL REVEAL ANIMÁCIÓ
  // =========================================================

  const priceRevealItems =
    document.querySelectorAll(".price-reveal");

  if (priceRevealItems.length) {
    const revealObserver =
      new IntersectionObserver(
        entries => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              entry.target.classList.add(
                "is-visible"
              );

              revealObserver.unobserve(
                entry.target
              );
            }
          });
        },
        {
          threshold: 0.12,
          rootMargin:
            "0px 0px -50px 0px"
        }
      );

    priceRevealItems.forEach(
      (item, index) => {

        // A nyitóelemek egymás után jelennek meg
        if (
          item.closest(".price-hero")
        ) {
          item.style.transitionDelay =
            `${index * 80}ms`;
        }

        revealObserver.observe(item);
      }
    );
  }
});