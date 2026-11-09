const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const crypto = require("crypto");
const ical = require("node-ical");
const { DateTime } = require("luxon");

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const TIMEZONE = process.env.TIMEZONE || "Europe/Budapest";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://127.0.0.1:5500";
const ICLOUD_USERNAME = process.env.ICLOUD_USERNAME;
const ICLOUD_APP_PASSWORD = (process.env.ICLOUD_APP_PASSWORD || "").replace(/\s/g, "");
const ICLOUD_CALENDAR_URL = process.env.ICLOUD_CALENDAR_URL || "";
const CALDAV_ROOT = "https://caldav.icloud.com/";

const allowedOrigins = (process.env.CORS_ORIGIN || FRONTEND_URL)
  .split(",").map((value) => value.trim()).filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("CORS origin not allowed"));
  }
}));
app.use(express.json({ limit: "100kb" }));

// A foglalási felületen választható három szolgáltatás.
const services = {
  "Géllak XS - M": 60,
  "Töltés S": 90,
  "Töltés M": 90,
  "Töltés L": 90,
  "Töltés XL": 90,
  "Építés S": 120,
  "Építés M": 120,
  "Építés L": 120,
  "Építés XL": 120
};
app.get('/api/services', (req, res) => {
  res.json({
    success: true,
    services: Object.entries(services).map(([name, duration]) => ({
      name,
      duration
    }))
  });
});

function isICloudConfigured() {
  return Boolean(ICLOUD_USERNAME && ICLOUD_APP_PASSWORD);
}

function authHeader() {
  return "Basic " + Buffer.from(`${ICLOUD_USERNAME}:${ICLOUD_APP_PASSWORD}`).toString("base64");
}

function decodeXml(value = "") {
  return value
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function tagValue(xml, localName) {
  const escaped = localName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = xml.match(new RegExp(`<(?:[\\w.-]+:)?${escaped}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${escaped}\\s*>`, "i"));
  if (!match) return "";
  return decodeXml(match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim());
}

function nestedHref(xml, propertyName) {
  const escaped = propertyName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const property = xml.match(new RegExp(`<(?:[\\w.-]+:)?${escaped}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${escaped}\\s*>`, "i"));
  return property ? tagValue(property[1], "href") : "";
}

function responseBlocks(xml) {
  return [...xml.matchAll(/<(?:[\w.-]+:)?response\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?response\s*>/gi)]
    .map((match) => match[1]);
}

function absoluteHref(href, base) {
  return new URL(href, base).toString();
}

async function caldavRequest(url, method, body = "", headers = {}) {
  let target = url;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await fetch(target, {
      method,
      redirect: "manual",
      headers: {
        Authorization: authHeader(),
        "User-Agent": "NailsByRebeka-Booking/1.0",
        ...(body ? { "Content-Type": "application/xml; charset=utf-8" } : {}),
        ...headers
      },
      body: body || undefined
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Az iCloud CalDAV átirányítása hiányos.");
      const next = new URL(location, target);
      if (!next.hostname.endsWith(".icloud.com")) {
        throw new Error("Az iCloud CalDAV nem biztonságos átirányítást adott.");
      }
      target = next.toString();
      continue;
    }

    const text = await response.text();
    if (!response.ok && response.status !== 207) {
      const error = new Error(`iCloud CalDAV hiba (${response.status}).`);
      error.status = response.status;
      error.details = text.slice(0, 500);
      throw error;
    }
    return { response, text, url: target };
  }
  throw new Error("Túl sok iCloud CalDAV átirányítás.");
}

const PROPFIND_PRINCIPAL = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>`;

const PROPFIND_HOME = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><c:calendar-home-set/></d:prop>
</d:propfind>`;

const PROPFIND_CALENDARS = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:resourcetype/><d:displayname/>
    <c:supported-calendar-component-set/>
    <d:current-user-privilege-set/>
  </d:prop>
</d:propfind>`;

let calendarDiscoveryCache = null;
let calendarDiscoveryAt = 0;

async function discoverCalendars(force = false) {
  if (!isICloudConfigured()) {
    throw new Error("Hiányzik az ICLOUD_USERNAME vagy az ICLOUD_APP_PASSWORD beállítás.");
  }
  if (!force && calendarDiscoveryCache && Date.now() - calendarDiscoveryAt < 10 * 60 * 1000) {
    return calendarDiscoveryCache;
  }

  const root = await caldavRequest(CALDAV_ROOT, "PROPFIND", PROPFIND_PRINCIPAL, { Depth: "0" });
  const principalHref = nestedHref(root.text, "current-user-principal");
  if (!principalHref) throw new Error("Az iCloud principal címe nem található.");
  const principalUrl = absoluteHref(principalHref, root.url);

  const principal = await caldavRequest(principalUrl, "PROPFIND", PROPFIND_HOME, { Depth: "0" });
  const homeHref = nestedHref(principal.text, "calendar-home-set");
  if (!homeHref) throw new Error("Az iCloud naptárkönyvtára nem található.");
  const homeUrl = absoluteHref(homeHref, principalUrl);

  const home = await caldavRequest(homeUrl, "PROPFIND", PROPFIND_CALENDARS, { Depth: "1" });
  const calendars = responseBlocks(home.text).map((block) => {
    const href = tagValue(block, "href");
    const resourceType = block.match(/<(?:[\w.-]+:)?resourcetype\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?resourcetype\s*>/i)?.[1] || "";
    const supportsEvents = /<(?:[\w.-]+:)?comp\b[^>]*name=["']VEVENT["']/i.test(block);
    const hasCalendar = /<(?:[\w.-]+:)?calendar\b/i.test(resourceType);
    const displayName = tagValue(block, "displayname");
    const privilege = block.match(/<(?:[\w.-]+:)?current-user-privilege-set\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?current-user-privilege-set\s*>/i)?.[1] || "";
    const hasPrivilegeInfo = Boolean(privilege);
    const writable = /<(?:[\w.-]+:)?write-content\b/i.test(privilege) || /<(?:[\w.-]+:)?write\b/i.test(privilege);
    return {
      url: href ? absoluteHref(href, homeUrl) : "",
      displayName,
      isCalendar: hasCalendar,
      supportsEvents,
      writable,
      hasPrivilegeInfo
    };
  }).filter((calendar) => calendar.url && calendar.isCalendar &&
    (calendar.supportsEvents || !calendar.hasPrivilegeInfo));

  if (!calendars.length) throw new Error("Nem található használható iCloud-naptár.");

  let bookingCalendar;
  if (ICLOUD_CALENDAR_URL) {
    bookingCalendar = calendars.find((calendar) => calendar.url === ICLOUD_CALENDAR_URL);
    if (!bookingCalendar) {
      // Explicit calendar URLs are accepted even if they are not in the first PROPFIND listing.
      bookingCalendar = { url: ICLOUD_CALENDAR_URL, displayName: "Configured calendar", writable: true };
    }
  } else {
    bookingCalendar = calendars.find((calendar) => calendar.writable) ||
      calendars.find((calendar) => !calendar.hasPrivilegeInfo);
  }
  if (!bookingCalendar) {
    throw new Error("Nem található írható iCloud-naptár. Add meg az ICLOUD_CALENDAR_URL értékét.");
  }

  calendarDiscoveryCache = { calendars, bookingCalendar };
  calendarDiscoveryAt = Date.now();
  return calendarDiscoveryCache;
}

function getServiceDuration(service) {
  return services[service] || null;
}

function createDateTime(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || !/^\d{2}:\d{2}$/.test(String(time))) {
    throw new Error("Érvénytelen dátum vagy időpont.");
  }
  const value = DateTime.fromISO(`${date}T${time}`, { zone: TIMEZONE });
  if (!value.isValid || value.toFormat("yyyy-MM-dd") !== date || value.toFormat("HH:mm") !== time) {
    throw new Error("Érvénytelen dátum vagy időpont.");
  }
  return value;
}

function getWorkingSessions(date) {
  const day = DateTime.fromISO(date, { zone: TIMEZONE });
  if (!day.isValid || day.weekday > 5) return [];
  return [
    { open: "08:00", close: "12:00" },
    { open: "13:30", close: "18:00" }
  ];
}

function overlaps(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
}

function unfoldIcs(icsText) {
  return icsText.replace(/\r?\n[ \t]/g, "");
}

function eventInstances(parsed, rangeStart, rangeEnd) {
  const instances = [];
  for (const event of Object.values(parsed)) {
    if (!event || event.type !== "VEVENT" || !event.start) continue;
    if (String(event.status || "").toUpperCase() === "CANCELLED") continue;
    if (String(event.transparency || "").toUpperCase() === "TRANSPARENT") continue;

    let expanded = [];
    if (event.rrule) {
      try {
        expanded = ical.expandRecurringEvent(event, {
          from: rangeStart,
          to: rangeEnd,
          includeOverrides: true,
          excludeExdates: true,
          expandOngoing: true
        });
      } catch (error) {
        console.warn("Recurring event expansion failed:", error.message);
      }
    }
    if (!expanded.length) expanded = [event];

    for (const item of expanded) {
      const start = item.start instanceof Date ? item.start : event.start;
      const end = item.end instanceof Date ? item.end : event.end;
      if (!(start instanceof Date)) continue;
      // An event without DTEND is treated as a zero-duration timed event.
      const endDate = end instanceof Date ? end : start;
      const startMs = start.getTime();
      const endMs = endDate.getTime();
      if (endMs < rangeStart.getTime() || startMs > rangeEnd.getTime()) continue;
      instances.push({ start: startMs, end: endMs });
    }
  }
  return instances;
}

const CALENDAR_QUERY = (startUtc, endUtc) => `<?xml version="1.0" encoding="utf-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><d:getetag/><c:calendar-data/></d:prop>
  <c:filter><c:comp-filter name="VCALENDAR">
    <c:comp-filter name="VEVENT">
      <c:time-range start="${startUtc}" end="${endUtc}"/>
    </c:comp-filter>
  </c:comp-filter></c:filter>
</c:calendar-query>`;

async function getBusyPeriods(date) {
  const { calendars } = await discoverCalendars();
  const day = DateTime.fromISO(date, { zone: TIMEZONE }).startOf("day");
  const nextDay = day.plus({ days: 1 });
  const query = CALENDAR_QUERY(
    day.toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'"),
    nextDay.toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'")
  );

  const busy = [];
  for (const calendar of calendars) {
    const result = await caldavRequest(calendar.url, "REPORT", query, {
      Depth: "1",
      "Content-Type": "application/xml; charset=utf-8"
    });
    const blocks = responseBlocks(result.text);
    for (const block of blocks) {
      const icsText = tagValue(block, "calendar-data");
      if (!icsText) continue;
      const parsed = ical.sync.parseICS(unfoldIcs(icsText));
      busy.push(...eventInstances(parsed, day.minus({ days: 2 }).toJSDate(), nextDay.plus({ days: 2 }).toJSDate()));
    }
  }
  return busy;
}

function hasNinetyMinuteBooking(busyPeriods, date) {
  const day = DateTime.fromISO(date, { zone: TIMEZONE }).startOf("day");
  const dayStart = day.toMillis();
  const dayEnd = day.plus({ days: 1 }).toMillis();
  return busyPeriods.some((event) =>
    event.end > event.start &&
    event.end - event.start === 90 * 60 * 1000 &&
    overlaps(event.start, event.end, dayStart, dayEnd)
  );
}

function buildCandidateTimes(date, duration, stepMinutes) {
  const candidates = [];
  for (const session of getWorkingSessions(date)) {
    let current = createDateTime(date, session.open);
    const close = createDateTime(date, session.close);
    while (current.plus({ minutes: duration }) <= close) {
      candidates.push(current);
      current = current.plus({ minutes: stepMinutes });
    }
  }
  return candidates;
}

function filterAvailableTimes(date, duration, busyPeriods, stepMinutes) {
  const now = DateTime.now().setZone(TIMEZONE);
  return buildCandidateTimes(date, duration, stepMinutes)
    .filter((start) => {
      if (start <= now) return false;
      const end = start.plus({ minutes: duration });
      return !busyPeriods.some((busy) =>
        overlaps(start.toMillis(), end.toMillis(), busy.start, busy.end)
      );
    })
    .map((start) => start.toFormat("HH:mm"));
}

async function getAvailableTimes(date, service) {
  const duration = getServiceDuration(service);
  if (!duration) {
    const error = new Error("Ismeretlen szolgáltatás.");
    error.code = "UNKNOWN_SERVICE";
    throw error;
  }
  if (!getWorkingSessions(date).length) return [];
  const busy = await getBusyPeriods(date);
  // Half-hour starts are enabled only when a 90-minute event already exists on this date.
  const step = hasNinetyMinuteBooking(busy, date) ? 30 : 60;
  return { times: filterAvailableTimes(date, duration, busy, step), step };
}

function escapeIcs(value = "") {
  return String(value).replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function formatUtcIcs(dateTime) {
  return dateTime.toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'");
}

function createIcsEvent(booking, start, end, uid) {
  const stamp = formatUtcIcs(DateTime.utc());
  const description = [
    `Vendég: ${booking.name}`,
    `Telefon: ${booking.phone}`,
    `Szolgáltatás: ${booking.service}`,
    `Megjegyzés: ${booking.note || "Nincs"}`
  ].map(escapeIcs).join("\\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Nails by Rebeka//Booking//HU",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${formatUtcIcs(start)}`,
    `DTEND:${formatUtcIcs(end)}`,
    `SUMMARY:${escapeIcs(`Nails by Rebeka – ${booking.service} – ${booking.name}`)}`,
    `DESCRIPTION:${description}`,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
    ""
  ].join("\r\n");
}

async function createCalendarEvent(booking, start, end) {
  const { bookingCalendar } = await discoverCalendars();
  const uid = `${crypto.randomUUID()}@nailsbyrebeka.hu`;
  const eventUrl = new URL(`${uid}.ics`, bookingCalendar.url).toString();
  const ics = createIcsEvent(booking, start, end, uid);
  const result = await caldavRequest(eventUrl, "PUT", ics, {
    "Content-Type": "text/calendar; charset=utf-8",
    "If-None-Match": "*"
  });
  if (![201, 204].includes(result.response.status)) {
    throw new Error(`Az iCloud nem tudta menteni az eseményt (${result.response.status}).`);
  }
  return uid;
}

// Prevent simultaneous overlapping bookings in this Node process.
// The iCloud calendar is re-read inside the lock before every create.
let bookingQueue = Promise.resolve();
function withBookingLock(task) {
  const run = bookingQueue.then(task, task);
  bookingQueue = run.catch(() => { });
  return run;
}

app.get("/", (req, res) => {
  res.json({ success: true, server: "Nails by Rebeka API", calendar: "Apple iCloud CalDAV", timezone: TIMEZONE });
});

app.get("/api/status", async (req, res) => {
  try {
    await discoverCalendars();
    res.json({ success: true, calendar: "Apple iCloud CalDAV", connected: true, timezone: TIMEZONE });
  } catch (error) {
    res.status(503).json({ success: false, connected: false, calendar: "Apple iCloud CalDAV", message: error.message });
  }
});

app.get("/api/availability", async (req, res) => {
  try {
    const { date, service } = req.query;
    if (!date || !service) {
      return res.status(400).json({ success: false, message: "A dátum és a szolgáltatás kötelező." });
    }
    if (!getServiceDuration(service)) {
      return res.status(400).json({ success: false, message: "Ismeretlen szolgáltatás." });
    }
    const availability = await getAvailableTimes(date, service);
    return res.json({
      success: true,
      date,
      service,
      duration: getServiceDuration(service),
      intervalMinutes: availability.step,
      availableTimes: availability.times
    });
  } catch (error) {
    console.error("Availability error:", error);
    return res.status(503).json({
      success: false,
      message: "Nem sikerült lekérni az iCloud-naptár szabad időpontjait. Ellenőrizd az Apple-kapcsolatot."
    });
  }
});

app.post("/api/book", async (req, res) => {
  try {
    const { name, phone, service, date, time, note = "" } = req.body || {};
    if (![name, phone, service, date, time].every((value) => typeof value === "string" && value.trim())) {
      return res.status(400).json({ success: false, message: "Hiányzó kötelező adat." });
    }
    const duration = getServiceDuration(service);
    if (!duration) return res.status(400).json({ success: false, message: "Ismeretlen szolgáltatás." });

    const result = await withBookingLock(async () => {
      const busy = await getBusyPeriods(date);
      const step = hasNinetyMinuteBooking(busy, date) ? 30 : 60;
      const validTimes = filterAvailableTimes(date, duration, busy, step);
      if (!validTimes.includes(time)) return null;

      const start = createDateTime(date, time);
      const end = start.plus({ minutes: duration });
      const uid = await createCalendarEvent({ name: name.trim(), phone: phone.trim(), service, note: String(note).trim() }, start, end);
      return { uid };
    });

    if (!result) {
      return res.status(409).json({
        success: false,
        message: "Ez az időpont már nem szabad, vagy nem illeszkedik a nyitvatartásba. Kérlek, válassz másikat."
      });
    }

    return res.status(201).json({ success: true, eventId: result.uid, calendar: "Apple iCloud" });
  } catch (error) {
    console.error("Booking error:", error);
    return res.status(503).json({
      success: false,
      message: "A foglalást nem sikerült elmenteni az Apple Naptárba. Kérlek, próbáld újra."
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Nails by Rebeka API listening on port ${PORT}`);
  console.log(`Calendar: Apple iCloud CalDAV | Timezone: ${TIMEZONE}`);
});
