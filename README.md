# Automobile marketplace (cars / bikes)

One codebase, two sites. `NEXT_PUBLIC_VERTICAL` in `.env.local` decides what a
copy sells:

| Vertical | Sells | Main section | Headline specs |
|---|---|---|---|
| `cars`  | cars, commercial vehicles, spare parts, tyres, accessories | `/cars/<make>/<model>` | year · mileage · fuel · transmission |
| `bikes` | motorcycles, scooters, electric bikes, parts, riding gear | `/motorcycles/<make>/<model>` | year · mileage · engine / range · registration |

Everything vertical-specific lives in **`src/vertical/`**:

- `cars.ts`, `bikes.ts`: names, copy, search words, spec strip, price floors,
  budgets and moderation hints
- `icons.tsx`: category and spec icons (also used by the admin icon picker)
- `seed/`: the starter catalogue (makes, models, spec fields, FAQs, guides,
  demo ads) that first-run setup loads

The site name, logo, colours, contact details, pages, plans, categories and
fields are **data**, edited in the admin panel. Nothing is hard-coded.

## Run locally

```bash
cp .env.example .env.local      # set NEXT_PUBLIC_VERTICAL, MONGODB_URI, secrets, PORT
npm ci
npm run dev -- -p 3100
```

Open the site. On an empty database it sends you to **`/setup`**, which does the following:

- names the site and creates the admin account
- loads the catalogue for the vertical
- can add a dozen clearly-marked demo ads

The admin panel is at **`/newlogin`**. Before launch, remove the demo ads from the
admin dashboard.

## Deploy (root domain)

Each site runs on its own domain, with its own database and CDN:

1. **CDN** (`./cdn`)
   - Copy `cdn/.env.example` to `cdn/.env` and set `SERVICE_NAME`, `AI_SUBJECT`, the keys and `CDN_PUBLIC_URL`.
   - Run: `npm ci && npm run build && pm2 start ecosystem.config.cjs`.
2. **App**
   - Copy `.env.example` to `.env.local` and set:
     - the domain in `NEXT_PUBLIC_APP_URL` and `NEXTAUTH_URL`
     - `NEXT_PUBLIC_BASE_PATH=` (leave it empty)
     - `PORT`, `APP_ID` and `MONGODB_URI`
     - `SETUP_KEY` and the CDN keys
   - Run: `npm ci && npm run build && pm2 start ecosystem.config.cjs && pm2 save`.
3. **Nginx**
   - Start from `deploy/nginx.web.conf.example` for the app and `cdn/deploy/nginx.conf.example` for the CDN.
   - Set the `server_name` and the upstream port.
4. **Setup**
   - Open `https://your-domain/setup` and enter `SETUP_KEY`.
   - `/setup` disappears once it has run.
5. Run `npm run reindex` once after importing ads in bulk (search keywords).

## New server with this site's data (seed bundle)

`seed/bundle.json` is this site's structure, exported from the local database:
- makes and models, spec fields and their options
- cities and areas
- pages, FAQs, blog posts, plans and home rails
- non-secret settings

It contains no users, ads, photos, secrets or contact details.

1. Upload the project, including `seed/bundle.json`, and give it a new, empty `MONGODB_URI` and a `SETUP_KEY` in `.env.local`.
2. Open `https://your-domain/setup`: enter the site name, your admin account and `SETUP_KEY`.
3. Setup loads the bundle, **deletes `seed/bundle.json`**, and `/setup` stops existing.

To make a fresh bundle after changing the local data:

```bash
node scripts/export-seed-bundle.mjs                  # structure only
node scripts/export-seed-bundle.mjs --with-content   # + sellers, ads and their photos
```

**`--with-content`** also exports the sellers (never admins), their ads, plans, reviews, sliders and media.
- **Photos:** every photo is uploaded through the site's own CDN service (started by the script) into **`cdn/data`**.
- **Photo URLs:** in the bundle they read `{{CDN}}/u/…`. Setup replaces that with the server's `NEXT_PUBLIC_CDN_URL`.
- **Passwords:** sellers get random passwords unless you add `--keep-passwords`.

To deploy it:
1. Deploy the `cdn` folder **with its `data/` folder**. `cdn/.gitignore` excludes `data/`, so upload it directly or copy it separately.
2. Set `NEXT_PUBLIC_CDN_URL` on the site before `npm run build` and `/setup`.

Other options: `--drop-category <path>` and `--rename-category "<path>=<Name>"`.

**Test or staging server:** set `SITE_NOINDEX=1` in `.env` before building. robots.txt then blocks everything and every response carries `X-Robots-Tag: noindex`.

## Photos and the CDN

The `MEDIA_DRIVER` setting decides where photos go:
- `MEDIA_DRIVER=cdn`: every upload goes straight to the CDN, and nothing is kept on the app server. Use this on live.
- Empty: uploads are saved in `storage/media` on this server. This is only for local development.

If photos were saved locally (in development, or before the CDN was switched on), move them to the CDN:

```bash
node scripts/migrate-media-to-cdn.mjs --dry-run   # what would move
node scripts/migrate-media-to-cdn.mjs --no-ai     # upload + rewrite every URL (listings, users, settings, pages)
```

The script only moves files that are still local, so it's safe to run again. Add `--delete-local` to remove the local copies afterwards.

Cars and bikes can share one server: give them different `PORT`, `PUSH_PORT`,
`APP_ID`, `MONGODB_URI` and CDN `SERVICE_NAME` / `PORT`.
