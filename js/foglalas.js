// NAILS BY REBEKA – FOGLALÁS (Apple iCloud CalDAV API)
const API_URL = (window.NAILS_CONFIG && window.NAILS_CONFIG.API_URL) || "http://localhost:3000";
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

  function todayInBudapest() {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Budapest",
      year: "numeric", month: "2-digit", day: "2-digit"
    }).format(new Date());
  }

  dateInput.min = todayInBudapest();

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
    submitButton.textContent = loading ? "Mentés az Apple Naptárba..." : "Foglalás";
  }
  function openSuccessModal() {
    successModal.classList.add("show");
    successModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    window.setTimeout(() => successOkButton.focus(), 50);
  }
  function closeSuccessBookingModal() {
    successModal.classList.remove("show");
    successModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  }

  closeSuccessModal?.addEventListener("click", closeSuccessBookingModal);
  successOkButton?.addEventListener("click", closeSuccessBookingModal);
  successModal?.querySelector(".success-modal-overlay")?.addEventListener("click", closeSuccessBookingModal);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && successModal?.classList.contains("show")) closeSuccessBookingModal();
  });

  async function loadAvailability() {
    const date = dateInput.value;
    const service = serviceSelect.value;
    if (!date || !service) {
      timeSelect.innerHTML = '<option value="">Válassz először szolgáltatást és dátumot</option>';
      timeSelect.disabled = true;
      availabilityStatus.textContent = "Válassz szolgáltatást és dátumot az időpontok megjelenítéséhez.";
      availabilityStatus.className = "availability-status";
      return;
    }

    timeSelect.disabled = true;
    timeSelect.innerHTML = '<option value="">Időpontok betöltése...</option>';
    availabilityStatus.textContent = "Szabad időpontok keresése az Apple Naptárban...";
    availabilityStatus.className = "availability-status loading";

    try {
      const url = `${API_URL}/api/availability?date=${encodeURIComponent(date)}&service=${encodeURIComponent(service)}`;
      const response = await fetch(url);
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "Nem sikerült lekérni a szabad időpontokat.");

      timeSelect.innerHTML = "";
      if (!Array.isArray(data.availableTimes) || data.availableTimes.length === 0) {
        timeSelect.innerHTML = '<option value="">Nincs szabad időpont</option>';
        timeSelect.disabled = true;
        availabilityStatus.textContent = "Ezen a napon nincs szabad időpont.";
        availabilityStatus.className = "availability-status unavailable";
        return;
      }

      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Válassz időpontot";
      timeSelect.appendChild(placeholder);
      data.availableTimes.forEach((time) => {
        const option = document.createElement("option");
        option.value = time;
        option.textContent = time;
        timeSelect.appendChild(option);
      });
      timeSelect.disabled = false;
      availabilityStatus.textContent = `${data.availableTimes.length} szabad időpont elérhető (${data.intervalMinutes === 30 ? "30 perces" : "órás"} kezdési időközökkel).`;
      availabilityStatus.className = "availability-status available";
    } catch (error) {
      console.error("Availability error:", error);
      timeSelect.innerHTML = '<option value="">Nem sikerült betölteni</option>';
      timeSelect.disabled = true;
      availabilityStatus.textContent = error.message || "Nem sikerült kapcsolódni az Apple Naptárhoz.";
      availabilityStatus.className = "availability-status unavailable";
    }
  }

  dateInput.addEventListener("change", () => { hideMessage(); loadAvailability(); });
  serviceSelect.addEventListener("change", () => { hideMessage(); loadAvailability(); });

  bookingForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideMessage();

    const name = nameInput.value.trim();
    const phone = phoneInput.value.trim();
    const service = serviceSelect.value;
    const date = dateInput.value;
    const time = timeSelect.value;
    const note = noteInput.value.trim();

    if (!name || !phone || !service || !date || !time) {
      showMessage("Kérlek, töltsd ki az összes kötelező mezőt, és válassz szabad időpontot.");
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
        showMessage(data.message || "Ezt az időpontot közben lefoglalták. Válassz másikat.");
        await loadAvailability();
        return;
      }
      if (!response.ok || !data.success) throw new Error(data.message || "A foglalást nem sikerült az Apple Naptárba menteni.");

      bookingForm.reset();
      dateInput.min = todayInBudapest();
      timeSelect.innerHTML = '<option value="">Válassz először szolgáltatást és dátumot</option>';
      timeSelect.disabled = true;
      availabilityStatus.textContent = "Válassz szolgáltatást és dátumot az időpontok megjelenítéséhez.";
      availabilityStatus.className = "availability-status";
      openSuccessModal();
    } catch (error) {
      console.error("Booking error:", error);
      showMessage(error.message || "Hiba történt a foglalás során.");
    } finally {
      setLoading(false);
    }
  });
}

async function loadServices() {
  const serviceSelect = document.getElementById('service');

  if (!serviceSelect) return;

  try {
    const API_BASE = window.NAILS_CONFIG.API_URL.replace(/\/$/, '');

    const response = await fetch(`${API_BASE}/api/services`);

    if (!response.ok) {
      throw new Error('Nem sikerült betölteni a szolgáltatásokat.');
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error('Hibás szolgáltatáslista.');
    }

    serviceSelect.innerHTML =
      '<option value="">Válassz szolgáltatást</option>';

    data.services.forEach(service => {
      const option = document.createElement('option');

      option.value = service.name;
      option.textContent = service.name;
      option.dataset.duration = service.duration;

      serviceSelect.appendChild(option);
    });

  } catch (error) {
    console.error('Services error:', error);

    serviceSelect.innerHTML =
      '<option value="">Nem sikerült betölteni a szolgáltatásokat</option>';
  }
}

document.addEventListener('DOMContentLoaded', loadServices); 
