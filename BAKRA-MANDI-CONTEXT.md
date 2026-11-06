# Bakra Mandi — project context (for a new chat)

Paste or attach this file at the start of a new chat. It holds what earlier sessions learned about this project: what the site is, where everything is, how it's built, what's done, the traps, and how the owner likes to work. **It contains no passwords, keys or secrets** — only where they are kept.

Written 2026-11-06. Facts marked *(as of …)* can go stale: check the code before relying on them.

---

## 1. What it is

**Bakra Mandi** is an online marketplace for **qurbani animals around Eid ul Adha** in Pakistan. People list goats, sheep, cows, camels and buffalo for sale. People can also **book a qasai** (butcher and other services) and **book a hissa** (a share in a cow or camel).

- **Folder:** `C:\Users\xomoe\ecomm\bakra mandi` (the path has a space, so always quote it).
- **Local URL:** http://localhost:3400. The admin panel is at `/admin` and the admin sign-in at `/newlogin`.
- **Database:** MongoDB, local, `mongodb://127.0.0.1:27017/bakramandi`.
- **Live:** not deployed yet. There's no domain, no live database and no live CDN.
- **Git:** this folder is **not** a git repo.
- **Owner:** the user speaks Roman Urdu / Urdu-English. Replies to them should be in simple Roman Urdu, and code and comments in English.

### State *(as of 2026-11-06)*

- `node_modules` has been removed from this folder (and from cars, bikes and classifieds), probably to free disk space. **Run `npm ci` before anything else.**
- The **MongoDB Windows service is stopped**.
  - It runs as a service account. Start it with a UAC prompt the owner approves: in PowerShell, `Start-Process net.exe -ArgumentList "start","MongoDB" -Verb RunAs`.
- Drive C: is nearly full (about 5 GB free). Check `df -h /c` (or `Get-PSDrive C`) before builds.
  - `npm cache verify` frees several GB safely.
  - `pagefile.sys` can swell to about 21 GB when many Chrome tabs and builds run.
- The copy of the old classifieds site that was first in this folder (later moved to `ecomm\bakra-mandi-old-classifieds-copy`) **no longer exists**.

### Run it locally

```bash
npm ci          # node_modules is missing
npm run dev     # next dev -p 3400, reads .env.local
```

- `.env.local` already exists. It holds the local config: `NEXT_PUBLIC_VERTICAL=bakra`, DB `bakramandi`, `MEDIA_DRIVER=local`, empty SMTP, generated auth secret and VAPID keys, and an empty Discord webhook.
- **Never print its values.**
- With no SMTP, the 6-digit sign-up code is shown on screen in dev.
- **Logins:** they're in `C:\Users\xomoe\ecomm\TEST-SELLERS.md`.
  - That file holds passwords. Don't copy them into chat, memory or code.
  - There is an admin account, and a test seller `seller1@bakramandi.pk`.
  - The **owner also has their own personal account** in the bakramandi DB, so **never reset or wipe this database**.

---

## 2. How the code is organised (important)

Bakra Mandi is **not a separate codebase**. It's the third "vertical" of one marketplace codebase, together with **Car Mela** (cars) and **Pak Bike** (bikes).

| Site | Folder | Vertical | Dev port | DB |
|---|---|---|---|---|
| Car Mela | `C:\Users\xomoe\ecomm\cars` | `cars` | 3100 | `cars` |
| Pak Bike | `C:\Users\xomoe\ecomm\bikes` | `bikes` | 3200 | `bikes` |
| **Bakra Mandi** | `C:\Users\xomoe\ecomm\bakra mandi` | `bakra` | **3400** (push 3450) | `bakramandi` |
| Mobiles (mymobile.pk/marketplace) | `C:\Users\xomoe\ecomm\classifieds` | none (older code) | 3000 under `/marketplace` | `classifieds` |

- `NEXT_PUBLIC_VERTICAL` picks the vertical. It is **inlined at build time**, so a rebuild is needed after changing it.
- **Everything vertical-specific is in `src/vertical/`:**
  - `bakra.ts`: words on the page, card and ad-page specs, search aliases, spam price floors, scam hints, the Eid date, `bookings`, `subLabels`.
  - `seed/bakra.ts`: sections, breeds, spec fields, extra cities, mandis as areas, FAQs, blog, plans, report reasons, home rails, demo ads.
  - `icons.tsx`: custom goat, sheep, cow, buffalo, camel and tooth icons, plus the registry.
  - `types.ts`: the `Vertical` and `BookingConfig` types.
  - `index.ts`: `formatSpec`, including `kg` (adds maunds from 80 kg) and `inch`.
- **`cars` is the source of truth.** Change code in `cars/src`, then mirror it:
  - **To bakra mandi:** copy all of `cars/src` and `cars/public`, for example `robocopy "...\cars\src" "...\bakra mandi\src" /MIR`. **Never copy** `.env*`, `seed/bundle.json`, `storage/` or `cdn/data`.
  - **To bikes:** `cars/src` except two files where the owner made their own edits (`follow: true` in robots): `src/app/setup/page.tsx` and `src/app/[...slug]/page.tsx`. Never overwrite those two.
  - **To classifieds (mobiles):** its code differs, so merge 3-way with `git merge-file`, using a snapshot of `cars/src` from before the change as the base.
    - Files with different line endings (CRLF vs LF) conflict across the whole file. Restore those and patch them by hand.
    - classifieds has no `src/vertical` and no bookings. It has `src/lib/bookings/enabled.ts` that exports `BOOKINGS_ON = false`.
- Per-site files that are **not** mirrored: `package.json` (name, port), `.env.example`, `load-test.mjs`, `nginx.web.conf.example`, and the site's own `*.md`.
- Some files are CRLF (e.g. `src/vertical/types.ts`, `Header.tsx`, `SellerDashboard.tsx`, `ads/[slug]/page.tsx`). Scripted edits must keep line endings.

### Stack

| | |
|---|---|
| **Framework** | **Next.js 16.3.6** (Turbopack; App Router); React 19.2 |
| **Auth** | next-auth 5 beta (Auth.js, JWT sessions) |
| **Database** | Mongoose 9 on MongoDB 8 |
| **Push** | own web push (VAPID, `web-push`) |
| **Other** | sharp, nodemailer 7, Pusher (optional) |
| **Styling** | Tailwind 4 plus some unlayered CSS in `globals.css` (unlayered CSS beats Tailwind utilities) |

**Read `node_modules/next/dist/docs/` before writing Next.js code** (`AGENTS.md` says so). Next 16 differs from older versions:
- `params`, `searchParams`, `cookies()` and `headers()` are async.
- `middleware.ts` is now `proxy.ts`.
- `revalidateTag` needs a second argument.
- Use `images.remotePatterns`.
- `next lint` is gone.
- `next dev` uses `.next/dev` and a lockfile (one dev server per folder). `next build` uses `.next`.
- `next dev` rewrites the Next block in `AGENTS.md` by itself. That's expected and harmless.

---

## 3. The Bakra Mandi catalogue

### Sections and breeds

Breeds are a flat second level; the post wizard asks "Which breed?".

| Section | Second level |
|---|---|
| **Bakray** (`bakray`) | Beetal, Makhi Cheeni, Rajanpuri, Teddy, Kamori, Barbari, Nachi, Pateri, Dera Din Panah, Gulabi, Lehri, Kaghani, Desi / Other |
| **Dumbay & Chatray** (`dumbay-chatray`) | Afghani Dumba, Balochi, Kajli, Lohi, Kachhi, Thalli, Rakhshani, Hashtnagri, Damani, Desi / Other |
| **Gaye & Bail** (`gaye-bail`) | Sahiwal, Cholistani, Red Sindhi, Tharparkar, Dhanni, Bhagnari, Lohani, Dajal, Achai, Australian Cross, Brahman, Desi / Other |
| **Oont** (`oont`) | Marecha, Barela, Brahvi, Kohi, Thari, Desi / Other |
| **Bhains & Katta** (`bhains-katta`) | Nili-Ravi, Kundi, Azi Kheli, Desi / Other |
| **Qurbani Hissay** (`qurbani-hissay`, fixed price) | Gaye ka Hissa, Oont ka Hissa, Ijtimai Qurbani Package |
| **Qasai & Services** (`qasai-services`) | Qasai, Rakhwali until Eid, Transport & Pickup, Cutting & Packing, Vet & Doctor |
| **Chara & Saman** (`chara-saman`) | Chara & Wanda, Sajawat (Ghungroo, Mala), Rassi & Khoonta, Shed & Tent, Chhuri & Tools |

- None of the sections has a "condition" (new/used). The server stores `condition: null` for them.
- `VERTICAL.subLabels` makes the ad page say "Service", "Type" or "Item" instead of "Breed" for qasai, hissa and chara ads.

### Spec fields

| Ads | Fields |
|---|---|
| **Animals** | teeth/dant (required), age, weight_kg, height_in, gender incl. khassi (required), colour, quantity, price_per_kg (Rs/kg), kept_at (farm / home / mandi), mandi (list + custom), delivery, highlights (qurbani age complete, be-aib, vaccinated, tick-free, kept until Eid, …) |
| **Hissa** | share_animal, shares_total, **shares_left**, qurbani_day, share_includes |
| **Qasai & services** | services, **available_days** (Before Eid, Eid day 1/2/3), price_basis, **rate_small** (bakra/dumba), **rate_large** (gaye/bail/bhains), **rate_camel**, **daily_capacity** (animals per day) |

### Places, search, event and content

- **Places:** the usual 10 cities, plus Balochistan and 18 livestock cities:
  - Quetta, Bahawalpur, Sahiwal, Okara, Sargodha, D.G. Khan, Rajanpur, R.Y. Khan, Jhang, Kasur
  - Sheikhupura, Chakwal, Sukkur, Larkana, Mirpur Khas, Mithi, Mardan, D.I. Khan
- **Mandis are areas**, each with its own page, e.g. `/karachi/sohrab-goth-mandi/gaye-bail`:
  - Karachi: Sohrab Goth, Malir Bakra Piri, Lyari Bakra Piri
  - Lahore: Shahpur Kanjran, Saggian, Township
  - Islamabad: I-12
- **Search words** (`searchAliases`): bakra/bakri/goat, dumba/chatra/bheir, gaye/bail/bachhra/wacha, oont/unt, bhains/katta, hissa, qasai, chara, plus breed names. Each redirects to its section or breed.
  - Known quirk: "sahiwal …" resolves to Sahiwal **city** first, because it is also a city.
- **Eid countdown:** `components/home/EventBanner.tsx`, set in Settings `event_name`, `event_date` and `event_note`.
  - The default date is **16 May 2027**, an *expected* date: update it after the moon sighting (Admin → Settings → Homepage).
  - From Eid day until 3 days after, it says "Eid Mubarak"; after that it hides.
  - The banner also has "Book a qasai" and "Book a hissa" buttons.
- **Plans** (seed): Starter Rs 699 (5 ads, 1 featured), **Beopari** Rs 1,999 (25 ads, 5 featured, popular), Farm & Mandi Rs 4,999 (100 ads, 20 featured). All are 30 days.
- **Content:** 9 FAQs (teeth and age, qurbani age, defects, hissa, safety, Congo virus, rakhwali, verification), 4 blog guides, scam-focused report reasons, and custom About, How it works and Safety pages.
- **Demo ads:** about 17 local ads with generated animal pictures (`isDemo: true`).
  - The seed now has 21 (extra qasai and hissa ads), but only new setups get those.
  - Before launch: Admin → Dashboard → **Remove demo data**.
- **DB contents** *(as of 2026-10-29)*: 28 cities, 107 areas, 66 categories, 17 demo listings.
  - The demo qasai ad "Qasai team for Eid" was given rates: 4,000, 12,000, and 14 animals per day.

---

## 4. Features (shared with Car Mela and Pak Bike unless noted)

### Setup and core

- **First run:** an empty DB redirects `/` to `/setup`.
  - Setup creates the admin, settings, locations, categories, fields, plans, pages and optional demo ads.
  - Production needs `SETUP_KEY`.
  - Code: `lib/setup.ts`, `api/setup`.
- `lib/catalogue-sync.ts` runs at server start. It adds spec fields that were added to `seed/bakra.ts` after the site was set up.
  - It remembers the slugs it has offered (Setting `catalogue_fields_seen`), so a field the admin deleted doesn't come back.
- `lib/ensure-indexes.ts` builds missing DB indexes at boot and after setup.
  - Production runs with `MONGODB_AUTO_INDEX=0`. Without this step, a new live DB 500'd on map queries.

### Selling and ads

- The post wizard (`app/ads/post/PostWizard.tsx`) has a spam score plus optional AI screening.
  - After posting, it opens the ad with `?posted=1`.
  - It copies the ad's 03xx number onto the account when the account has none.
- **OwnerPanel** (`components/ads/OwnerPanel.tsx`): a seller viewing their own ad sees its status, views, leads and saves, Edit, Sold and My ads, plus Boost.
  - On the free plan it shows "Reach up to 3x more buyers" instead of call buttons.
- **Ad expiry:** `listing_expiry_days` (default 30), with reminders 2 days before.
  - Renew with `POST /api/ads/[id]/renew`. Admins' ads never expire.
- **Free quota:** `default_free_ad_quota` (default 1) live ads at a time.
- **Boost:** uses a plan's featured slots, taken atomically.

### Plans and payments

There is no card gateway. The seller pays by JazzCash, Easypaisa or bank, uploads a screenshot, and the admin approves.
- **Plans page** (`app/dashboard/plans/page.tsx`):
  - a "Your plan" card with usage meters
  - a banner for an open invoice (unpaid, being checked, or not verified with the reason)
  - a 3-step checkout: copy the amount and the account, choose which account was used, upload the screenshot
- An unpaid invoice is reused rather than piled up. A second purchase while one is "submitted" returns 409.
- The screenshot must be the payer's own private `payments` upload.
- **Payment accounts** are set in Admin → Invoices → Payment options (Setting `payment_methods`).
  - **They are empty on Bakra Mandi.**
  - The checkout then offers WhatsApp to the support number, or the contact page.
  - The admin dashboard shows a warning until an account is added.
- Approve or reject (and an admin "give plan") sends the seller a notification and an email (`sendPlanResultEmail`).

### Seller verification

- It uses **only the CNIC**: number (`lib/cnic.ts`, 35202-1234567-1), the name on the card, and front and back photos.
  - The photos are private uploads in the `verification` folder.
  - **No phone number is asked for** (the owner's request: sellers give it on every ad).
- One CNIC can verify only one account (pending or approved).
- The admin (`/admin/verifications`) sees the CNIC number, the phone from the seller's latest ad, an ads count and a "CNIC reused" warning.
- The badge rule is in `lib/trust.ts`: a selling account gets "Verified seller" only after the CNIC is approved.

### Notifications

- **Own web push** (`lib/push/**`): admin automations, templates, quiet hours, a daily cap and campaigns, in Admin → Push notifications.
- **The bell:** `models/UserNotification` (kept 120 days) gets every automatic notification except chat messages and the welcome.
  - It's written by `pushToUsers` in `lib/push/notify.ts`, even with no device or VAPID key.
  - Pages and APIs: `/dashboard/notifications` (list), `/dashboard/notifications/settings` (device, categories, devices), `/api/notifications`, `/api/me/badges`.
  - Client store: `lib/badges-client.ts`.
  - The header bell and the Account-tab dot show it. The Chat tab shows unread chats.
- **Types:**
  - messages and offers
  - ad approved or rejected, views milestone, saved, review
  - boost ending, ad expiring or expired
  - **boost_offer** ("Reach 3x more buyers", a day after a free seller's ad goes live) and **boost_unused**
  - **reply_reminder** (a message unanswered for 2 hours)
  - **saved_sold**, price drop
  - **plan_activated**, **payment_rejected**, **plan_expiring**, **plan_expired**
  - **payment_submitted** and verification_submitted (to admins)
  - verification result
  - **booking_*** (bookings sites only)
- Timed ones run in `lib/reminders.ts` and `lib/bookings/jobs.ts`. They're called from `lib/jobs.ts` every 10 minutes, on the worker process (`PUSH_WORKER=1`).
- **"Turn on notifications" asks:**
  - a popup after posting, saving, chatting, paying, sending the CNIC or booking (`askForPush(context)`, at most once every 3 days per moment)
  - inline cards (`components/push/PushNudge.tsx`) on the bell page, chats, My ads, plans and bookings

### Admin

- Dashboard with charts and "waiting for you" items.
- Insights and leads (calls, WhatsApp, chats).
- Users: filters, CSV, drawer, block (hides their ads), delete, give or end a plan, note, sign out everywhere.
- **`/admin/users/[id]`, the full account page:**
  - CNIC
  - every number on their ads, and **other accounts using the same number**
  - ads, plan and payments
  - **conversations, read-only**: each one opened is written to the activity log as `chat.view`
  - offers, reviews, reports, saved ads, devices, recent notifications, bookings
- Also:
  - listings moderation with bulk actions
  - reports grouped by seller
  - verifications
  - invoices and payment options
  - **Bookings**
  - activity log (`models/AdminLog`, kept 1 year)
- Discord alerts can be switched per category, with a 9:00 PKT digest and server-error alerts (`lib/discord.ts`, `lib/admin-digest.ts`, `instrumentation.ts`).
- **Security** already in place:
  - the session is re-checked against the DB on each request (`lib/account-state.ts`): block, admin removal and delete apply at once
  - admin-only server checks
  - ads in review or rejected are visible only to the owner and admins
  - admin sign-in rate limits

---

## 5. Bookings (Bakra Mandi only)

- **Config:** `VERTICAL.bookings` in `src/vertical/bakra.ts`.
  - `service` covers `qasai-services`: the units and the rate field for each, the capacity field, the days field, the days (Before Eid as a date picker; Eid day 1/2/3 as offsets from the event date) and the time slots.
  - `share` covers `qurbani-hissay`: the total and left fields, the day field, and at most 7 per booking.
  - Cars and bikes have no `bookings`, so `BOOKINGS_ON` is false and none of it shows (`/dashboard/bookings` returns 404 there).

### The flows

- **Qasai** (`/ads/[slug]/book`):
  - The customer picks a day (days already full or past are disabled), a time, the number of animals of each kind, the area and address, their name and phone, and a note.
  - The estimate comes from the ad's rates.
  - A day stops accepting requests when pending plus confirmed animals reach `daily_capacity`.
- **Hissa:**
  - The customer picks the number of shares and a name for each (for the niyyat), plus an optional meat-delivery address.
  - **Pending requests hold their shares**, so two people can't book the last one.
  - **Confirming** takes the shares off the ad's `shares_left` atomically. **Cancelling a confirmed booking** puts them back.
- **Rules:**
  - You can't book your own ad.
  - At most 3 pending bookings per customer per ad, and 10 bookings an hour.
  - A signed-out visitor fills in the form and signs in on Send; the draft is kept in sessionStorage.

### Statuses and pages

- **Statuses:** pending → confirmed → completed. Also declined, cancelled (by the customer, provider, admin or system) and expired.
  - A pending booking whose day has passed becomes expired, and the customer is told.
  - The evening before (from 16:00 PKT), both sides get a reminder.
- **`/dashboard/bookings`:**
  - *My bookings*: what I booked. The provider's number shows only after they confirm. Cancel is available.
  - *For my ads*:
    - a summary per day
    - the customer's number, with Call and WhatsApp
    - Confirm (with a note, e.g. the time), Decline (with a reason), Mark done, Cancel
    - a **printable share list** per hissa animal
  - `?tab=received` opens *For my ads*, and `&b=CODE` highlights one booking.
- **`/admin/bookings`:** counts by status, how full each day is, search by code, ad, name or number, and cancel with a reason (both sides are told, and it's logged).
- **The ad page** shows a `BookingBox` ("Book a qasai: Eid day 1: 6 of 14 left") and puts **Book** in the phone's bottom bar.
- **Nothing is paid online.** The customer pays the qasai in person after the work, and pays the organiser directly.
- **Notifications** (bell, push and some email): booking_request, booking_confirmed, booking_declined, booking_cancelled, booking_reminder.

### Files

- `src/models/Booking.ts`
- `src/lib/bookings/{enabled,shared,server,jobs}.ts`
- `src/app/api/bookings/route.ts` (GET list, POST create)
- `src/app/api/bookings/[id]/route.ts` (PATCH confirm/decline/cancel/complete)
- `src/app/api/admin/bookings/route.ts`
- `src/app/ads/[slug]/book/{page,BookingForm}.tsx`
- `src/app/dashboard/bookings/{page,layout}.tsx`
- `src/app/admin/bookings/page.tsx`
- `src/components/bookings/BookingBox.tsx`

---

## 6. Key file map

| What | Where |
|---|---|
| Vertical config / seed / icons | `src/vertical/bakra.ts`, `src/vertical/seed/bakra.ts`, `src/vertical/icons.tsx` |
| Setup | `src/lib/setup.ts`, `src/app/setup/*`, `src/app/api/setup` |
| Ad page / actions | `src/app/ads/[slug]/page.tsx`, `DetailActions.tsx` |
| Post / edit wizard | `src/app/ads/post/PostWizard.tsx`, `src/lib/ad-form.ts`, `src/app/api/ads/publish/route.ts` |
| Archives (section/city/area/breed URLs) | `src/app/[...slug]/page.tsx` |
| Home + Eid banner | `src/app/page.tsx`, `src/components/home/EventBanner.tsx` |
| Header / phone tab bar / app screens | `src/components/layout/{Header,MobileNav,AppChrome}.tsx` |
| Account / seller dashboard | `src/app/dashboard/page.tsx`, `src/app/dashboard/seller/*` |
| Plans & checkout | `src/app/dashboard/plans/page.tsx`, `src/app/api/{plans,invoices}/**`, `src/lib/plan.ts` |
| Verification | `src/app/dashboard/verify/page.tsx`, `src/app/api/seller/verify/route.ts`, `src/lib/{cnic,trust}.ts` |
| Push & bell | `src/lib/push/{config,notify,events,scheduler}.ts`, `src/lib/push-client.ts`, `src/components/push/*`, `src/lib/reminders.ts`, `src/models/UserNotification.ts` |
| Background jobs | `src/lib/jobs.ts`, `src/instrumentation.ts` |
| Emails | `src/lib/email.ts` (one branded layout, `sendEmailQuietly`) |
| Admin | `src/app/admin/**`, `src/app/api/admin/**`, `src/lib/{admin-log,admin-stats,user-admin,account-state}.ts` |
| Settings defaults | `src/lib/settings.ts` |
| Guide for the owner | `BAKRA-MANDI.md` (in this folder) |

---

## 7. Going live (not done yet)

1. Remove the demo data. Set the payment accounts. Update the Eid date. Edit the Privacy and Terms pages.
2. Create `.env.production.local` from `.env.example`. It needs:
   - `NEXT_PUBLIC_VERTICAL=bakra`
   - the domain URLs (`NEXT_PUBLIC_APP_URL`, `NEXTAUTH_URL`)
   - new secrets (`NEXTAUTH_SECRET`/`AUTH_SECRET`)
   - `SETUP_KEY`
   - `MONGODB_URI`
   - the CDN settings (`MEDIA_DRIVER=cdn`, `CDN_URL`, `NEXT_PUBLIC_CDN_URL`, `CDN_API_KEY`, `CDN_SIGNING_SECRET`)
   - SMTP
   - VAPID keys (changing them later kills every push subscription)
   - optionally `DISCORD_WEBHOOK_URL` and `OPENAI_API_KEY`
3. Follow the cars `DEPLOY-LIVE.md` steps:
   1. the CDN service first (`cdn/`)
   2. `npm ci && npm run build`
   3. `pm2 start ecosystem.config.cjs`: web processes run with `PUSH_WORKER=0`, and one push/jobs worker with `PUSH_WORKER=1`
   4. open `/setup`
4. `deploy/nginx.web.conf.example` is the nginx template.
   - The other sites run on a CloudPanel VPS with nginx; mymobile.pk shares it.
   - Watch for an nginx `Permissions-Policy geolocation=()` header, which blocks the location prompt.

---

## 8. Testing the way that has worked

- **Gates:** `npx tsc --noEmit -p .`, a running dev server, and API checks. Then `npx next build` (set `NEXT_BUILD_CPUS=2` when memory is tight).
- **Sign in as any user in scripts:** mint an Auth.js session cookie.
  - Use `@auth/core/jwt` `encode` with the site's `NEXTAUTH_SECRET`/`AUTH_SECRET` from `.env.local`, read in the script and never printed.
  - Salt and cookie name: `authjs.session-token`.
  - Token fields: `sub`, `userId`, `role`, `name`, `email`, `onboardingCompleted`, `loginAt`.
- **Run a background job directly:** `MONGODB_URI=mongodb://127.0.0.1:27017/bakramandi NEXT_PUBLIC_VERTICAL=bakra npx tsx --tsconfig tsconfig.json script.ts`, where the script imports e.g. `@/lib/reminders`.
- **QA safety rules:**
  - Use **your own throwaway test users** (e.g. `@round5.test` emails inserted into the DB) and **delete everything they created** afterwards: users, bookings, invoices, media files in `storage/media/...`, notifications, admin-log rows. Never use the owner's personal account.
  - **Never test against a live CDN, live DB or live Discord.** For QA servers, blank `DISCORD_WEBHOOK_URL` (or point it at a dead port), SMTP and `OPENAI_API_KEY`, and set `MEDIA_DRIVER=local`.
  - The in-app browser pane may hold an earlier **admin session** (an httpOnly cookie). `document.cookie` can't replace it, so check `/api/auth/session` before submitting anything in the browser.
  - Don't sign the owner out of anything, and don't delete other people's data.
- **Last full QA** (2026-10-29): 56/56 API checks on Bakra (bookings, hissa holds, plans, checkout, CNIC, bell, admin data, owner panel), and 34/34 on mobiles. The reminders and booking jobs were run directly and worked. The Bakra production build passed.

---

## 9. Traps learned the hard way

- **Patching files with scripts:**
  - Bash heredocs turned `\\` into `\`, and then a JS template literal ate the rest. That silently broke regexes in patched code.
  - **Write patch scripts with a file-writing tool, not a heredoc**, and grep the result afterwards.
  - PowerShell `@("a", 'x' + "`n" + 'y')` is broken: the comma binds before `+`.
  - Keep CRLF files CRLF.
- **@next/env never overrides an existing process env var**, even an empty one. QA builds of a site with a live `.env.production.local` must override every live variable through process env, then be rebuilt normally afterwards.
- **`NEXT_PUBLIC_*` values are baked in at build.**
- **Mongoose 9** rejects pipeline updates unless the query has `{ updatePipeline: true }`.
- **Listing status** values are `review | approved | rejected | sold out | expired`. Note "sold out", not "sold"; the API accepts the alias `sold`.
- **Spec values** are stored on `listing.customFieldValues` keyed by the field **slug**. A listing's section is found through `allCategoryIds` (the category whose `parentCategoryId` is null).
- **MongoDB stops building indexes** when C: has less than 500 MB free. When the disk filled once, MongoDB crashed and builds failed with vague errors.
- **The dev server** writes `.next/dev`. Don't delete another dev server's `.next/dev`.

---

## 10. How the owner likes to work

- **Fix bugs and security holes found in passing, in the same session.** Don't ask first, and don't leave them as a separate task; mention them in the summary. Still ask before destructive data operations or before changing product behaviour they chose on purpose.
- **"Kuch fuzool nahi"**: nothing useless, and everything professional and well managed.
- **Changes that are generic should go to every site:** cars, bikes, mobiles and bakra. Mobiles needs the 3-way merge.
- **Never show secrets in chat**, and never copy them into memory, code, commits or pages. Test credentials go in `C:\Users\xomoe\ecomm\TEST-SELLERS.md`, not in chat.
  - `C:\xampp\htdocs\mobiles\CLAUDE_INTEGRATION_CONTEXT.md` (the mymobile.pk ecosystem) holds live secrets: read it only when needed, never copy from it.
  - classifieds' `.env`, `.env.production*` and `.env.production.example` hold live secrets: never copy them to a new site.
- **Commit or push only when asked.** classifieds has uncommitted work. The bakra folder has no git repo.
- Replies should be short and in Roman Urdu, with the result first.

---

## 11. Open items and ideas *(as of 2026-11-06)*

- Not live yet; see section 7.
- Payment accounts are empty: add them in Admin → Invoices.
- The Eid date is an estimate: update it when the moon is sighted.
- Remove the demo ads before launch.
- Only new setups get the seed's extra qasai and hissa demo ads; the local DB has the original 17.
- Searching "sahiwal" goes to Sahiwal city first, not the breed.
- If needed later, the booking flow could add:
  - a provider-set price per slot
  - booking reviews tied to completed bookings (today "Rate {provider}" links to their profile)
  - a calendar or print view for a qasai's whole day
