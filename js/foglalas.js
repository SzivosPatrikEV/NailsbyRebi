// =====================================================
// NAILS BY REBEKA - FOGLALÁS
// =====================================================

const API_URL =
  (window.NAILS_CONFIG && window.NAILS_CONFIG.API_URL) ||
  "http://localhost:3000";

const bookingForm = document.getElementById("bookingForm");

if (bookingForm) {
  const nameInput = document.getElementById("name");
  const phoneInput = document.getElementById("phone");
  const serviceSelect = document.getElementById("service");
  const dateInput = document.getElementById("date");
  const timeSelect = document.getElementById("time");
  const noteInput = document.getElementById("note");
  const availabilityStatus = document.getElementById("availabilityStatus");
  const formMessage = document.getElementById("formMessage");
  const submitButton = document.getElementById("submitButton");

  const successModal = document.getElementById("successModal");
  const closeSuccessModal = document.getElementById("closeSuccessModal");
  const successOkButton = document.getElementById("successOkButton");

  function getTodayString() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  dateInput.min = getTodayString();

  function showMessage(message, type = "error") {
    formMessage.textContent = message;
    formMessage.className = `form-message show ${type}`;
  }

  function hideMessage() {
    formMessage.textContent = "";
    formMessage.className = "form-message";
  }

  function setLoading(loading) {
    submitButton.disabled = loading;
    submitButton.textContent = loading ? "Foglalás..." : "Foglalás";
  }

  function openSuccessModal() {
    successModal.classList.add("show");
    successModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");

    setTimeout(() => successOkButton.focus(), 50);
  }

  function closeSuccessBookingModal() {
    successModal.classList.remove("show");
    successModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  }

  closeSuccessModal.addEventListener("click", closeSuccessBookingModal);
  successOkButton.addEventListener("click", closeSuccessBookingModal);

  successModal
    .querySelector(".success-modal-overlay")
    .addEventListener("click", closeSuccessBookingModal);

  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      successModal.classList.contains("show")
    ) {
      closeSuccessBookingModal();
    }
  });

  async function loadAvailability() {
    const date = dateInput.value;
    const service = serviceSelect.value;

    if (!date || !service) {
      timeSelect.innerHTML = `
        <option value="">Válassz először szolgáltatást és dátumot</option>
      `;
      timeSelect.disabled = true;
      availabilityStatus.textContent =
        "Válassz szolgáltatást és dátumot az időpontok megjelenítéséhez.";
      availabilityStatus.className = "availability-status";
      return;
    }

    timeSelect.disabled = true;
    timeSelect.innerHTML = `<option value="">Időpontok betöltése...</option>`;
    availabilityStatus.textContent = "Szabad időpontok keresése...";
    availabilityStatus.className = "availability-status loading";

    try {
      const url =
        `${API_URL}/api/availability` +
        `?date=${encodeURIComponent(date)}` +
        `&service=${encodeURIComponent(service)}`;

      const response = await fetch(url);
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || data.error || "Nem sikerült lekérni a szabad időpontokat."
        );
      }

      const availableTimes = Array.isArray(data.availableTimes)
        ? data.availableTimes
        : [];

      timeSelect.innerHTML = "";

      if (availableTimes.length === 0) {
        timeSelect.innerHTML = `
          <option value="">Nincs szabad időpont</option>
        `;
        timeSelect.disabled = true;
        availabilityStatus.textContent = "Ezen a napon nincs szabad időpont.";
        availabilityStatus.className = "availability-status unavailable";
        return;
      }

      const defaultOption = document.createElement("option");
      defaultOption.value = "";
      defaultOption.textContent = "Válassz időpontot";
      timeSelect.appendChild(defaultOption);

      availableTimes.forEach((time) => {
        const option = document.createElement("option");
        option.value = time;
        option.textContent = time;
        timeSelect.appendChild(option);
      });

      timeSelect.disabled = false;
      availabilityStatus.textContent =
        `${availableTimes.length} szabad időpont elérhető.`;
      availabilityStatus.className = "availability-status available";
    } catch (error) {
      console.error("Availability error:", error);

      timeSelect.innerHTML = `
        <option value="">Nem sikerült betölteni</option>
      `;
      timeSelect.disabled = true;
      availabilityStatus.textContent =
        "Nem sikerült kapcsolódni a foglalási rendszerhez.";
      availabilityStatus.className = "availability-status unavailable";
    }
  }

  dateInput.addEventListener("change", () => {
    hideMessage();
    loadAvailability();
  });

  serviceSelect.addEventListener("change", () => {
    hideMessage();
    loadAvailability();
  });

  bookingForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideMessage();

    const name = nameInput.value.trim();
    const phone = phoneInput.value.trim();
    const service = serviceSelect.value;
    const date = dateInput.value;
    const time = timeSelect.value;
    const note = noteInput.value.trim();

    if (!name) {
      showMessage("Kérlek, add meg a neved!");
      nameInput.focus();
      return;
    }

    if (!phone) {
      showMessage("Kérlek, add meg a telefonszámod!");
      phoneInput.focus();
      return;
    }

    if (!service) {
      showMessage("Kérlek, válassz szolgáltatást!");
      serviceSelect.focus();
      return;
    }

    if (!date) {
      showMessage("Kérlek, válassz dátumot!");
      dateInput.focus();
      return;
    }

    if (!time) {
      showMessage("Kérlek, válassz időpontot!");
      timeSelect.focus();
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, service, date, time, note })
      });

      const data = await response.json();

      if (response.status === 409) {
        showMessage(
          data.message ||
            data.error ||
            "Ezt az időpontot közben lefoglalták. Kérlek, válassz másikat."
        );
        await loadAvailability();
        return;
      }

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || data.error || "A foglalást nem sikerült elküldeni."
        );
      }

      bookingForm.reset();
      dateInput.min = getTodayString();

      timeSelect.innerHTML = `
        <option value="">Válassz először szolgáltatást és dátumot</option>
      `;
      timeSelect.disabled = true;

      availabilityStatus.textContent =
        "Válassz szolgáltatást és dátumot az időpontok megjelenítéséhez.";
      availabilityStatus.className = "availability-status";

      openSuccessModal();
    } catch (error) {
      console.error("Booking error:", error);
      showMessage(
        error.message ||
          "Hiba történt a foglalás során. Kérlek, próbáld újra."
      );
    } finally {
      setLoading(false);
    }
  });
}
