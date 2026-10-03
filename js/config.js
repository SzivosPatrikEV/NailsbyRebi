// =====================================================
// NAILS BY REBEKA - API BEÁLLÍTÁS
// =====================================================
const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);

window.NAILS_CONFIG = {
  API_URL: isLocal
    ? "http://localhost:3000"
    : "https://nails-by-rebeka-api.onrender.com"
};
