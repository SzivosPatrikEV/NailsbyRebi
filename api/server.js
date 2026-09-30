const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { DateTime } = require("luxon");

dotenv.config();

const app = express();

const PORT = Number(process.env.PORT || 3000);
const TIMEZONE = process.env.TIMEZONE || "Europe/Budapest";
const BOOKING_EMAIL = process.env.BOOKING_EMAIL;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://127.0.0.1:5500";

const allowedOrigins = (process.env.CORS_ORIGIN || FRONTEND_URL)
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("CORS origin not allowed"));
  }
}));

app.use(express.json({ limit: "100kb" }));

// -----------------------------------------------------
// SERVICES – minutes
// -----------------------------------------------------

const services = {
  "Építés – S": 120,
  "Építés – M": 135,
  "Építés – L": 150,
  "Építés – XL": 165,
  "Töltés – S": 105,
  "Töltés – M": 120,
  "Töltés – L": 135,
  "Töltés – XL": 150,
  "Géllakk – XS/S": 75,
  "Géllakk – M": 90,
  "Géllakk – L": 105
};

// -----------------------------------------------------
// GOOGLE OAUTH
// -----------------------------------------------------

const SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/gmail.send"
];

if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  console.warn("Google OAuth environment variables are missing.");
}

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

const localTokenPath = path.join(__dirname, "token.json");
const renderSecretTokenPath = "/etc/secrets/token.json";
const tokenPath = process.env.GOOGLE_TOKEN_PATH ||
  (fs.existsSync(renderSecretTokenPath) ? renderSecretTokenPath : localTokenPath);

let googleAuthenticated = false;

if (fs.existsSync(tokenPath)) {
  try {
    const token = JSON.parse(fs.readFileSync(tokenPath, "utf8"));
    oauth2Client.setCredentials(token);
    googleAuthenticated = true;
  } catch (error) {
    console.error("Could not load Google token:", error.message);
  }
}

oauth2Client.on("tokens", (tokens) => {
  googleAuthenticated = true;

  // Secret files on Render are read-only; token refresh is kept in memory.
  // Locally, updated credentials are persisted to token.json.
  if (tokenPath !== renderSecretTokenPath) {
    try {
      const existing = fs.existsSync(tokenPath)
        ? JSON.parse(fs.readFileSync(tokenPath, "utf8"))
        : {};
      const merged = { ...existing, ...tokens };
      fs.writeFileSync(tokenPath, JSON.stringify(merged, null, 2));
    } catch (error) {
      console.warn("Could not persist refreshed Google token:", error.message);
    }
  }
});

function getGoogleServices() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw new Error("Google OAuth is not configured.");
  }

  return {
    calendar: google.calendar({ version: "v3", auth: oauth2Client }),
    gmail: google.gmail({ version: "v1", auth: oauth2Client })
  };
}

// -----------------------------------------------------
// OAUTH ROUTES
// -----------------------------------------------------

const oauthStates = new Set();

app.get("/auth/google", (req, res) => {
  const state = crypto.randomBytes(24).toString("hex");
  oauthStates.add(state);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state
  });

  res.redirect(authUrl);
});

app.get("/auth/google/callback", async (req, res) => {
  try {
    if (req.query.error) {
      return res.status(400).send(`Google OAuth error: ${req.query.error}`);
    }

    if (!req.query.state || !oauthStates.has(req.query.state)) {
      return res.status(400).send("Invalid OAuth state.");
    }

    oauthStates.delete(req.query.state);

    const { tokens } = await oauth2Client.getToken(req.query.code);
    oauth2Client.setCredentials(tokens);
    googleAuthenticated = true;

    // Save locally if possible. On Render, upload token.json as a Secret File
    // after authorizing, or use the current in-memory token until redeploy.
    if (tokenPath !== renderSecretTokenPath) {
      fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));
    }

    res.redirect(`${FRONTEND_URL}/foglalas/?google=connected`);
  } catch (error) {
    console.error("OAuth callback error:", error);
    res.status(500).send("Google hitelesítés sikertelen.");
  }
});

// -----------------------------------------------------
// HELPERS
// -----------------------------------------------------

function getServiceDuration(service) {
  return services[service] || null;
}

function createDateTime(date, time) {
  const value = DateTime.fromISO(`${date}T${time}`, { zone: TIMEZONE });

  if (!value.isValid) {
    throw new Error("Érvénytelen dátum vagy időpont.");
  }

  return value;
}

function isSecondSaturday(dateTime) {
  return dateTime.weekday === 6 && dateTime.day >= 8 && dateTime.day <= 14;
}

function getOpeningHours(date) {
  const day = DateTime.fromISO(date, { zone: TIMEZONE });

  if (!day.isValid) return null;

  // Sunday closed.
  if (day.weekday === 7) return null;

  // Saturday: only the second Saturday of the month.
  if (day.weekday === 6) {
    if (!isSecondSaturday(day)) return null;
    return { open: "09:00", close: "14:00" };
  }

  // Monday-Friday.
  return { open: "09:00", close: "18:00" };
}

function overlaps(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
}

function generateCandidateTimes(open, close, duration) {
  const times = [];

  let current = DateTime.fromFormat(open, "HH:mm", { zone: TIMEZONE });
  const closing = DateTime.fromFormat(close, "HH:mm", { zone: TIMEZONE });

  while (current.plus({ minutes: duration }) <= closing) {
    times.push(current.toFormat("HH:mm"));
    current = current.plus({ minutes: 30 });
  }

  return times;
}

async function getBusyPeriods(calendar, date) {
  const opening = getOpeningHours(date);
  if (!opening) return [];

  const day = DateTime.fromISO(date, { zone: TIMEZONE });
  const timeMin = day.set({
    hour: Number(opening.open.slice(0, 2)),
    minute: Number(opening.open.slice(3, 5)),
    second: 0,
    millisecond: 0
  });
  const timeMax = day.set({
    hour: Number(opening.close.slice(0, 2)),
    minute: Number(opening.close.slice(3, 5)),
    second: 0,
    millisecond: 0
  });

  const result = await calendar.freebusy.query({
    requestBody: {
      timeMin: timeMin.toISO(),
      timeMax: timeMax.toISO(),
      timeZone: TIMEZONE,
      items: [{ id: "primary" }]
    }
  });

  const busy = result.data.calendars?.primary?.busy || [];

  return busy.map((item) => ({
    start: DateTime.fromISO(item.start).toMillis(),
    end: DateTime.fromISO(item.end).toMillis()
  }));
}

async function isTimeAvailable(calendar, date, time, duration) {
  const opening = getOpeningHours(date);
  if (!opening) return false;

  const start = createDateTime(date, time);
  const end = start.plus({ minutes: duration });

  const open = createDateTime(date, opening.open);
  const close = createDateTime(date, opening.close);

  if (start < open || end > close) return false;

  const busyPeriods = await getBusyPeriods(calendar, date);
  const startMs = start.toMillis();
  const endMs = end.toMillis();

  return !busyPeriods.some((busy) =>
    overlaps(startMs, endMs, busy.start, busy.end)
  );
}

async function getAvailableTimes(date, service) {
  const duration = getServiceDuration(service);
  if (!duration) {
    const error = new Error("Ismeretlen szolgáltatás.");
    error.code = "UNKNOWN_SERVICE";
    throw error;
  }

  const opening = getOpeningHours(date);
  if (!opening) return [];

  const { calendar } = getGoogleServices();
  const candidates = generateCandidateTimes(
    opening.open,
    opening.close,
    duration
  );

  const busyPeriods = await getBusyPeriods(calendar, date);

  return candidates.filter((time) => {
    const start = createDateTime(date, time);
    const end = start.plus({ minutes: duration });
    const startMs = start.toMillis();
    const endMs = end.toMillis();

    return !busyPeriods.some((busy) =>
      overlaps(startMs, endMs, busy.start, busy.end)
    );
  });
}

function encodeBase64Url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function sendBookingEmail(gmail, booking) {
  if (!BOOKING_EMAIL) {
    throw new Error("BOOKING_EMAIL nincs beállítva.");
  }

  const subject = `Új foglalás – ${booking.name} – ${booking.date} ${booking.time}`;

  const text = [
    "Új időpontfoglalás érkezett.",
    "",
    `Név: ${booking.name}`,
    `Telefonszám: ${booking.phone}`,
    `Szolgáltatás: ${booking.service}`,
    `Dátum: ${booking.date}`,
    `Időpont: ${booking.time}`,
    `Időtartam: ${booking.duration} perc`,
    `Megjegyzés: ${booking.note || "Nincs"}`
  ].join("\n");

  const raw = [
    `To: ${BOOKING_EMAIL}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
    "",
    text
  ].join("\r\n");

  await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: encodeBase64Url(raw)
    }
  });
}

// -----------------------------------------------------
// ROUTES
// -----------------------------------------------------

app.get("/", (req, res) => {
  res.json({
    success: true,
    server: "Nails by Rebeka API",
    googleAuthenticated,
    timezone: TIMEZONE
  });
});

app.get("/api/status", (req, res) => {
  res.json({
    success: true,
    server: "Nails by Rebeka API",
    googleAuthenticated,
    timezone: TIMEZONE
  });
});

app.get("/api/availability", async (req, res) => {
  try {
    const { date, service } = req.query;

    if (!date || !service) {
      return res.status(400).json({
        success: false,
        message: "A dátum és a szolgáltatás kötelező."
      });
    }

    if (!googleAuthenticated) {
      return res.status(503).json({
        success: false,
        message: "A Google Calendar még nincs hitelesítve."
      });
    }

    const duration = getServiceDuration(service);
    if (!duration) {
      return res.status(400).json({
        success: false,
        message: "Ismeretlen szolgáltatás."
      });
    }

    const availableTimes = await getAvailableTimes(date, service);

    return res.json({
      success: true,
      date,
      service,
      duration,
      availableTimes
    });
  } catch (error) {
    console.error("Availability error:", error);
    return res.status(500).json({
      success: false,
      message: "Nem sikerült lekérni a szabad időpontokat."
    });
  }
});

app.post("/api/book", async (req, res) => {
  try {
    const {
      name,
      phone,
      service,
      date,
      time,
      note = ""
    } = req.body || {};

    if (!name || !phone || !service || !date || !time) {
      return res.status(400).json({
        success: false,
        message: "Hiányzó kötelező adat."
      });
    }

    const duration = getServiceDuration(service);
    if (!duration) {
      return res.status(400).json({
        success: false,
        message: "Ismeretlen szolgáltatás."
      });
    }

    if (!googleAuthenticated) {
      return res.status(503).json({
        success: false,
        message: "A Google Calendar még nincs hitelesítve."
      });
    }

    const { calendar, gmail } = getGoogleServices();

    // Always re-check on the server immediately before creating the event.
    const available = await isTimeAvailable(
      calendar,
      date,
      time,
      duration
    );

    if (!available) {
      return res.status(409).json({
        success: false,
        message: "Ezt az időpontot közben lefoglalták. Kérlek, válassz másikat."
      });
    }

    const start = createDateTime(date, time);
    const end = start.plus({ minutes: duration });

    const event = await calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: `Nails by Rebeka – ${service} – ${name}`,
        description: [
          `Vendég: ${name}`,
          `Telefon: ${phone}`,
          `Szolgáltatás: ${service}`,
          `Megjegyzés: ${note || "Nincs"}`
        ].join("\n"),
        start: {
          dateTime: start.toISO(),
          timeZone: TIMEZONE
        },
        end: {
          dateTime: end.toISO(),
          timeZone: TIMEZONE
        }
      }
    });

    try {
      await sendBookingEmail(gmail, {
        name,
        phone,
        service,
        date,
        time,
        duration,
        note
      });
    } catch (emailError) {
      // The calendar event already exists. Return the event ID so the booking
      // is not silently treated as failed just because email delivery failed.
      console.error("Booking email error:", emailError);

      return res.status(201).json({
        success: true,
        emailSent: false,
        warning: "A foglalás létrejött, de az értesítő e-mailt nem sikerült elküldeni.",
        eventId: event.data.id
      });
    }

    return res.status(201).json({
      success: true,
      emailSent: true,
      eventId: event.data.id
    });
  } catch (error) {
    console.error("Booking error:", error);

    return res.status(500).json({
      success: false,
      message: "A foglalást nem sikerült létrehozni."
    });
  }
});

// -----------------------------------------------------
// SERVER
// -----------------------------------------------------

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Nails by Rebeka API listening on port ${PORT}`);
  console.log(`Timezone: ${TIMEZONE}`);
  console.log(`Frontend: ${FRONTEND_URL}`);
});
