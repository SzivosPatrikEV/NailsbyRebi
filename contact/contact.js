
"use strict";

/*
 * NAILS BY REBEKA – KAPCSOLAT BEÁLLÍTÁSOK
 *
 * Cseréld ki az alábbi két értéket a valós adatokra!
 */

const contactConfig = {
    address: "IDE ÍRD A SZALON PONTOS CÍMÉT",
    phone: "+36300000000"
};

document.addEventListener("DOMContentLoaded", () => {
    const address = contactConfig.address.trim();
    const phone = contactConfig.phone.trim();

    const phoneLink = document.getElementById("phone-link");
    const callButton = document.getElementById("call-button");

    const addressText = document.getElementById("address-text");
    const directionsLink = document.getElementById("directions-link");
    const mapOverlayLink = document.getElementById("map-overlay-link");
    const googleMap = document.getElementById("google-map");

    // Telefonszám megjelenítése
    if (phone && phone !== "+36300000000") {
        const phoneHref = `tel:${phone.replace(/[^\d+]/g, "")}`;

        if (phoneLink) {
            phoneLink.href = phoneHref;
            phoneLink.textContent = phone;
        }

        if (callButton) {
            callButton.href = phoneHref;
        }
    } else {
        if (phoneLink) {
            phoneLink.textContent = "Telefonszám megadása szükséges";
            phoneLink.removeAttribute("href");
        }

        if (callButton) {
            callButton.textContent = "Telefonszám megadása";
            callButton.removeAttribute("href");
        }
    }

    // Google Maps beállítása a pontos cím alapján
    const validAddress =
        address && address !== "IDE ÍRD A SZALON PONTOS CÍMÉT";

    if (validAddress) {
        const encodedAddress = encodeURIComponent(address);

        const mapsUrl =
            `https://www.google.com/maps/dir/?api=1&destination=${encodedAddress}`;

        const embedUrl =
            `https://maps.google.com/maps?q=${encodedAddress}&z=16&output=embed`;

        if (addressText) {
            addressText.textContent = address;
        }

        if (directionsLink) {
            directionsLink.href = mapsUrl;
        }

        if (mapOverlayLink) {
            mapOverlayLink.href = mapsUrl;
        }

        if (googleMap) {
            googleMap.src = embedUrl;
        }
    } else {
        if (addressText) {
            addressText.textContent =
                "A pontos szaloncímet hamarosan megadjuk.";
        }

        if (directionsLink) {
            directionsLink.href = "https://maps.google.com";
        }

        if (mapOverlayLink) {
            mapOverlayLink.href = "https://maps.google.com";
        }
    }

    // Finom megjelenési animáció
    const cards = document.querySelectorAll(".contact-card");

    if ("IntersectionObserver" in window) {
        const observer = new IntersectionObserver(
            (entries, currentObserver) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add("is-visible");
                        currentObserver.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.12 }
        );

        cards.forEach((card) => {
            card.classList.add("reveal");
            observer.observe(card);
        });
    }
});
