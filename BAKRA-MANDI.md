# Bakra Mandi

An online mandi for **qurbani animals** around Eid ul Adha (Pakistan). It runs on the same code as Car Mela and Pak Bike, with its own vertical: `NEXT_PUBLIC_VERTICAL=bakra`.

## Run it on this computer

```bash
npm run dev
```

Then open http://localhost:3400. The first build of each page takes a few seconds in dev.

- **Database:** `mongodb://127.0.0.1:27017/bakramandi`. It's already set up.
- **Admin:** http://localhost:3400/newlogin. The login is in `C:\Users\xomoe\ecomm\TEST-SELLERS.md`.
- **Test seller:** `seller1@bakramandi.pk` with the shared local test password from the same file.
- **Sign-up codes:** email isn't set up locally, so in dev the 6-digit code shows on screen.

## What's in it

| | |
|---|---|
| **Sections** | Bakray · Dumbay & Chatray · Gaye & Bail · Oont · Bhains & Katta · Qurbani Hissay · Qasai & Services · Chara & Saman |
| **Breeds** | Goats: Beetal, Makhi Cheeni, Rajanpuri, Teddy, Kamori, Barbari… · Sheep: Afghani Dumba, Balochi, Kajli, Lohi… · Cattle: Sahiwal, Cholistani, Red Sindhi, Tharparkar, Dhanni… · Camels: Marecha, Barela… · Buffalo: Nili-Ravi, Kundi… |
| **Ad fields** | Teeth (dant), age, live weight (kg, shown in maunds too), height, gender (male / khassi / female), colour, how many animals, price per kg, kept at (farm / home / mandi), which mandi, delivery, highlights (qurbani age complete, be-aib, vaccinated, tick-free, kept until Eid…) |
| **Shares (hissa)** | Animal, total and remaining shares, qurbani day, what's included |
| **Qasai & services** | Services, the days available (before Eid / Eid day 1–3), how the price is counted |
| **Places** | The usual 10 cities, plus livestock districts: Quetta, Bahawalpur, Sahiwal, Okara, Sargodha, D.G. Khan, Rajanpur, R.Y. Khan, Jhang, Kasur, Sheikhupura, Chakwal, Sukkur, Larkana, Mirpur Khas, Mithi, Mardan, D.I. Khan |
| **Mandis as areas** | Sohrab Goth, Malir and Lyari Bakra Piri (Karachi) · Shahpur Kanjran, Saggian, Township (Lahore) · I-12 (Islamabad). Each has its own page, e.g. `/karachi/sohrab-goth-mandi/gaye-bail` |
| **Search words** | bakra, bakri, chatra, dumba, bheir, gaye, bail, bachhra, wacha, oont, bhains, katta, hissa, qasai, chara, plus the breed names |
| **Help content** | FAQs: telling age from the teeth, qurbani age and defects, how a hissa works, Congo-virus safety, rakhwali. Four guides. Report reasons for advance-payment and hissa scams. |
| **Plans** | Starter · Beopari · Farm & Mandi |

## Bookings: qasai and hissa

Qasai and hissa ads can be **booked**, not only called. The ad shows a "Book a qasai" / "Book a hissa" box with what's still free, and on phones the bottom bar's main button books.

- **Qasai & services** (`/ads/<ad>/book`)
  - The customer picks:
    - the day (Before Eid with a date, or Eid day 1–3)
    - a time (right after Eid prayer, morning, afternoon, evening)
    - how many animals of each kind
    - the address
  - The ad's own fields drive it:
    - *Rate: bakra / dumba*, *Rate: gaye / bail / bhains* and *Rate: oont* give the estimate.
    - *Animals per day* stops a day taking bookings when it's full.
    - *Available* chooses which days are offered.
- **Qurbani hissay**
  - The customer picks how many shares and the name on each (for the niyyat).
  - Waiting requests hold their shares, so the last share can't be booked twice.
  - Confirming takes the shares off the ad's *Shares left*. Cancelling a confirmed booking puts them back.
- **My bookings** (`/dashboard/bookings`)
  - *My bookings*: what I booked. The provider's number appears once they confirm. Each booking can be cancelled.
  - *For my ads*, for qasai and organisers:
    - a day-by-day summary
    - the customer's number, with Call and WhatsApp
    - Confirm (with a note such as the time), Decline (with a reason) and Mark done
    - for hissa ads, a share list per animal that can be printed
- **Notifications**: these go to the bell and the phone, plus an email for a new request and a confirmation.
  - new request
  - confirmed or declined
  - cancelled by either side
  - a reminder the evening before
  - a request nobody answered before its day closes by itself, and the customer is told
- **Admin → Bookings**: every booking, how full each day is, search by code, ad, name or number, and cancel one in a dispute (both sides are told why).
- **Nothing is paid online.** The customer pays the qasai in person after the work, and the organiser directly.

Other sites built on this code (Car Mela, Pak Bike) have no `bookings` in their vertical, so none of this shows there.

## The Eid countdown

The home page shows "N days to Eid ul Adha".

- To change the name or date, go to **Admin → Settings → Homepage → Event countdown**. The date format is YYYY-MM-DD, Pakistan time.
- The default is **16 May 2027**, the expected date. Update it once the moon is sighted.
- From Eid day until three days after, it says "Eid Mubarak", then it hides until you set next year's date.

## Before going live

1. Remove the 17 demo ads: Admin → Dashboard → **Remove demo data**.
2. Create `.env.production.local` from `.env.example`:
   - `NEXT_PUBLIC_VERTICAL=bakra`
   - the domain
   - secrets
   - a `SETUP_KEY`
   - the CDN settings
   - SMTP
3. Do the same steps as `DEPLOY-LIVE.md` in the cars/bikes folders: CDN first, then `npm ci && npm run build && pm2 start ecosystem.config.cjs`. Then open `/setup`.

## Where the Bakra Mandi specifics live

- `src/vertical/bakra.ts`: the words on the page, card and ad-page facts, search words, spam price floors and scam hints, the Eid date.
- `src/vertical/seed/bakra.ts`: sections, breeds, fields, places and mandis, FAQs, guides, plans, demo ads.
- `src/vertical/icons.tsx`: the goat, sheep, cow, buffalo, camel and tooth icons.

The rest of the code is shared with Car Mela and Pak Bike. Make changes in `C:\Users\xomoe\ecomm\cars` and copy them here.

The classifieds copy that was in this folder before was moved, unchanged, to `C:\Users\xomoe\ecomm\bakra-mandi-old-classifieds-copy`. It contains the live mymobile `.env` files, so keep it private.
