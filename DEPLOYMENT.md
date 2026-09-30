# Élesítés – GitHub Pages + Render

## Frontend

A GitHub Pages a statikus weboldalt szolgálja ki. A GitHub Pages nem futtat Node.js backendet.

GitHub:
1. Repository -> Settings -> Pages.
2. Source: Deploy from a branch.
3. Branch: `main`, folder: `/ (root)`.

## Backend

Render -> New -> Web Service.

A legegyszerűbb megoldás, ha az `api` mappát külön repositoryba teszed, vagy monorepo esetén a Render Root Directory értéke `api`.

Build Command:
`npm install`

Start Command:
`npm start`

A backendnek publikus HTTPS címe lesz, pl. `https://nails-by-rebeka-api.onrender.com`.

## Render változók

```text
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://YOUR-RENDER-SERVICE.onrender.com/auth/google/callback
BOOKING_EMAIL=...
FRONTEND_URL=https://YOUR-USERNAME.github.io/YOUR-REPOSITORY
CORS_ORIGIN=https://YOUR-USERNAME.github.io/YOUR-REPOSITORY
TIMEZONE=Europe/Budapest
```

Ha saját domain kerül a GitHub Pages elé, akkor a `FRONTEND_URL` és `CORS_ORIGIN` értéke legyen az a domain.

## Google token

A helyi `api/token.json` ne kerüljön GitHubra.

Render -> Service -> Environment -> Secret Files -> Add Secret File:
- Filename: `token.json`
- Contents: a hitelesített Google-fiók token.json tartalma

Render runtime alatt a secret file `/etc/secrets/token.json` néven érhető el.

## Google OAuth callback

Google Cloud Console -> OAuth Client -> Authorized redirect URIs:

```text
https://YOUR-RENDER-SERVICE.onrender.com/auth/google/callback
```

A redirect URI-nak pontosan egyeznie kell.

## Frontend API cím

A `js/config.js` fájlban:

```js
window.NAILS_CONFIG = {
  API_URL: "https://YOUR-RENDER-SERVICE.onrender.com"
};
```

Ezt az éles Render URL-re kell cserélni.

## Fontos Google OAuth megjegyzés

A jelenlegi Calendar/Gmail OAuth scope-ok érzékeny scope-ok. Tesztelésre működhet a Test User megoldás, de Google szerint a Testing státuszú OAuth authorizációk 7 nap után lejárhatnak. Nyilvános, tartós használathoz a Google OAuth production/verification követelményeit is rendezni kell.
