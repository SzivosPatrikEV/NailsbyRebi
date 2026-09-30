NAILS BY REBEKA – GITHUB PAGES + NODE.JS API

A weboldal GitHub Pages-en fut. A foglalási backend külön Node.js Web Service-ként fut (pl. Render), mert GitHub Pages statikus HTML/CSS/JS tárhely.

1. GitHub Pages:
- töltsd fel a projekt gyökérkönyvtárát GitHubra
- Settings -> Pages -> Deploy from a branch -> main -> / (root)

2. Backend:
- az api mappát külön Node.js Web Service-ként telepítsd Renderre
- Build: npm install
- Start: npm start

3. A js/config.js fájlban a Render API címét kell megadni.

4. Render környezeti változók:
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI
BOOKING_EMAIL
FRONTEND_URL
CORS_ORIGIN
TIMEZONE=Europe/Budapest

5. A token.json-t ne tedd GitHubra. Renderen Secret File-ként add hozzá token.json néven.

6. Google Cloud OAuth kliensben add hozzá az éles callback URL-t:
https://SAJAT-RENDER-CIM/auth/google/callback

7. Tesztelés után a saját Google-fiók helyett a megrendelő Google-fiókját kell OAuth-tal hitelesíteni, és az ő token.json fájlját kell használni.
