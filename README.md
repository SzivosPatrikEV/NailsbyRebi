# Nails by Rebeka – GitHub Pages + Node.js API

A frontend can be hosted on GitHub Pages, but the booking backend must run on a Node.js host such as Render. GitHub Pages serves the HTML/CSS/JS; the API talks to Google Calendar and Gmail.

## 1. GitHub Pages

Upload the contents of this folder to the repository used for the website. Enable GitHub Pages from the repository's Pages settings.

After the API is deployed, edit `js/config.js` and replace:

`https://YOUR-RENDER-SERVICE.onrender.com`

with the real API URL.

## 2. Backend

The `api` folder is designed to run as a Render Web Service.

Build command:

`npm install`

Start command:

`npm start`

The server listens on `0.0.0.0` and the Render-provided `PORT`.

## 3. Render environment variables

Set these in Render:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI` = `https://YOUR-RENDER-SERVICE.onrender.com/auth/google/callback`
- `BOOKING_EMAIL`
- `FRONTEND_URL` = your GitHub Pages URL
- `TIMEZONE` = `Europe/Budapest`
- `CORS_ORIGIN` = your GitHub Pages URL

Do not commit `.env`, `token.json`, or `credentials.json`.

## 4. Google OAuth

The OAuth client must contain the production callback URL above. The account that owns the calendar/Gmail access must authorize the backend.

For a production public app, check Google's OAuth verification requirements because Calendar/Gmail scopes can be sensitive.
