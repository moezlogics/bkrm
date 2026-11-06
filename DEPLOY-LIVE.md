# Bakra Mandi — live karna (bakramandi.pk)

Ye guide sirf Bakra Mandi ke liye hai. Server wohi CloudPanel VPS hai jahan Car Mela aur Pak Bike chal rahe hain.

## Ek nazar mein

| Kya | Value |
|---|---|
| Site | https://bakramandi.pk → `127.0.0.1:3080` |
| CDN (photos) | https://cdn.bakramandi.pk → `127.0.0.1:3081` |
| Push worker (andar ka, bahar nahi khulta) | `127.0.0.1:3082` |
| Database | MongoDB isi server par, database `bakramandi`, apna user `bakramandi` |
| PM2 processes | `bakramandi-web`, `bakramandi-push`, `bakramandi-cdn` |
| Admin panel | https://bakramandi.pk/newlogin |

## Pehle se tayyar (is folder mein)

- **`.env.production.local`** — site ki saari live settings: domain, ports, database ka URL (user + password ke saath), naye secrets, `SETUP_KEY`, CDN keys, push (VAPID) keys. Server par build, start aur PM2 isay khud parhte hain.
- **`cdn/.env`** — CDN ki settings: port 3081, `cdn.bakramandi.pk`, wohi keys jo site mein hain.

**Sirf ek cheez bharni hai: email (SMTP)**, `.env.production.local` mein. Iske baghair sign-up code aur password reset nahi jayenge. Car Mela wala SMTP account bhi chal jayega.

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=aap-ka-account@gmail.com
SMTP_PASS=app-password
```

Ye dono files private rakhein — in mein secrets hain. Git mein ye nahi jaati (`.gitignore`).

> Local par OLX se aayi hui test ads live par **nahi** jayengi. Live site khaali (sirf categories, shehar, pages, plans ke saath) shuru hogi.

---

## 1. DNS

In teeno naamon ko server ke IP par point karein (Cloudflare proxied — orange cloud — theek hai):

- `bakramandi.pk`
- `www.bakramandi.pk`
- `cdn.bakramandi.pk`

## 2. Files upload

`C:\Users\xomoe\ecomm\deploy\bakramandi.zip` server par upload karein aur site ke folder mein unzip karein, masalan `/home/bakramandi/htdocs/bakramandi.pk`.

Zip mein `.env.production.local` aur `cdn/.env` shamil hain; `node_modules`, `.next`, `storage/` aur local `.env.local` nahi.

```bash
cd /home/bakramandi/htdocs/bakramandi.pk
unzip -o bakramandi.zip
```

## 3. Database (MongoDB)

MongoDB isi server par pehle se chal raha hai (Car Mela / Pak Bike ka). Check:

```bash
mongosh --quiet --eval "db.version()"
```

Bakra Mandi ka apna user banayein. Password `.env.production.local` se khud uthaya jata hai (screen par print nahi hota):

```bash
DBPASS=$(grep '^MONGODB_URI=' .env.production.local | sed -E 's#.*://bakramandi:([^@]+)@.*#\1#')
mongosh --quiet --eval "db.getSiblingDB('bakramandi').createUser({user:'bakramandi',pwd:'$DBPASS',roles:[{role:'readWrite',db:'bakramandi'},{role:'dbAdmin',db:'bakramandi'}]})"
unset DBPASS
```

- Agar MongoDB par pehle se login lagta hai (authorization on hai), to `mongosh` ke saath admin login dein: `mongosh -u admin -p --authenticationDatabase admin --quiet --eval "…"`
- **Authorization abhi on na karein** agar Car Mela / Pak Bike baghair password ke connect karte hain — warna woh band ho jayengi. Pehle unke liye bhi user banayein, phir on karein.
- MongoDB sirf `127.0.0.1` par sun raha ho (bahar se band). Check: `grep bindIp /etc/mongod.conf`.

Agar kabhi naye server par MongoDB install karna ho (Ubuntu 24.04):

```bash
curl -fsSL https://www.mongodb.org/static/pgp/server-8.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-8.0.gpg --dearmor
echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/ubuntu noble/mongodb-org/8.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-8.0.list
sudo apt-get update && sudo apt-get install -y mongodb-org
sudo systemctl enable --now mongod
```

## 4. Pehle CDN chalayein

```bash
cd cdn
npm ci
npm run build
pm2 start ecosystem.config.cjs
pm2 save
curl http://127.0.0.1:3081/health
```

Aakhri line `{"status":"ok", …}` dikhaye.

## 5. Site build aur start

Project folder mein (`cdn/` mein nahi):

```bash
cd ..
npm ci
npm run build
pm2 start ecosystem.config.cjs
pm2 save
curl -I http://127.0.0.1:3080/
```

Aakhri line `307` aur `location: /setup` dikhaye — ye sahi hai, site abhi setup nahi hui.

Build memory kam ho to ruk jaye? `.env.production.local` mein `NEXT_BUILD_CPUS=2` pehle se hai; build ke dauran doosre builds band rakhein.

## 6. CloudPanel (Nginx + SSL)

1. **Site:** `bakramandi.pk` ke liye *Node.js* (ya reverse proxy) site banayein, app port **3080**. `www.bakramandi.pk` alias ho jo `bakramandi.pk` par redirect kare. Let's Encrypt certificate lein.
2. **CDN:** `cdn.bakramandi.pk` ke liye *reverse proxy* site → `http://127.0.0.1:3081`. Certificate lein.
3. **Upload size:** site ke vhost mein `client_max_body_size 30m;` aur CDN ke vhost mein `client_max_body_size 110m;`.
4. Vhost mein `Permissions-Policy: geolocation=()` header **na ho** — warna "Use my location" kaam nahi karega.

Advanced nginx (page micro-cache) chahiye to `deploy/nginx.web.conf.example` mein `3100` ki jagah `3080` aur domain `bakramandi.pk` likhein; CDN ke liye `cdn/deploy/nginx.conf.example` mein `3061` ki jagah `3081`.

Check:
- https://bakramandi.pk → /setup par jaye
- https://cdn.bakramandi.pk/health → `ok`

## 7. Setup (sirf ek dafa)

1. **https://bakramandi.pk/setup** kholein.
2. Site name: **Bakra Mandi**. Admin ka naam, email, password (10+ characters) aur support phone.
3. **Setup key:** `.env.production.local` mein `SETUP_KEY` ki value (`grep SETUP_KEY .env.production.local`).
4. **"Add about a dozen sample … ads" wala checkbox khaali chhorein** — live site par demo/test ads nahi chahiye.
5. *Create my marketplace* dabayein. Categories, breeds, shehar aur mandis, pages, FAQs, plans load ho jayenge.
6. Phir `.env.production.local` se `SETUP_KEY=` wali line hata dein aur `pm2 restart bakramandi-web`.

## 8. Launch se pehle Admin mein

- **Admin → Invoices → Payment options:** JazzCash / Easypaisa / bank account daalein (warna plans ka checkout sirf WhatsApp dikhata hai).
- **Admin → Settings → Homepage:** Eid ki date chand dekhne ke baad theek karein (abhi 16 May 2027 andaza hai).
- **Admin → Settings → Branding:** logo, favicon, rang. Contact email / phone / WhatsApp.
- **Pages:** Privacy aur Terms parh kar apne hisaab se theek karein.

## 9. Check karein

- Home aur ek ad: photo par right-click → new tab, address `https://cdn.bakramandi.pk/…` se shuru ho.
- Sign up: email par code aaye (SMTP chahiye).
- Ad post karein: photo upload ho aur us ka address `cdn.bakramandi.pk` par ho.
- Qasai ad bana kar booking karein; doosre account se "My bookings" mein confirm karein.
- `https://bakramandi.pk/robots.txt` aur `https://bakramandi.pk/sitemap.xml` khulein.

---

## Baad mein update

```bash
npm ci
npm run build
pm2 reload bakramandi-web
pm2 restart bakramandi-push
```

Sirf CDN badla ho:

```bash
cd cdn && npm ci && npm run build && pm2 restart bakramandi-cdn
```

`NEXT_PUBLIC_…` wali koi value badli (masalan CDN address)? Dobara build karein — ye values build ke waqt fix ho jati hain.

## Backup

```bash
DBPASS=$(grep '^MONGODB_URI=' .env.production.local | sed -E 's#.*://bakramandi:([^@]+)@.*#\1#')
mongodump --uri "mongodb://bakramandi:$DBPASS@127.0.0.1:27017/bakramandi?authSource=bakramandi" --out /backups/bakramandi-$(date +%F)
unset DBPASS
```

Photos: `cdn/data/` folder.

## Masla ho to

| Masla | Wajah |
|---|---|
| bakramandi.pk par 502 | `bakramandi-web` band hai (`pm2 logs bakramandi-web`), ya CloudPanel port **3080** nahi |
| Photos nahi aa rahi | `bakramandi-cdn` band, ya cdn vhost **3081** par nahi |
| "Authentication failed" logs mein | Step 3 ka user nahi bana, ya password `.env.production.local` se match nahi |
| Setup "set NEXT_PUBLIC_CDN_URL" kahe | Build ke waqt `.env.production.local` mojood nahi tha — dobara build |
| Setup key match nahi | `SETUP_KEY` dobara exact copy karein |
| Sign-up email nahi aati | SMTP khaali (`pm2 logs bakramandi-web` mein mail error) |
| Build ruk jaye / bohat slow | Memory kam: doosre builds band, `NEXT_BUILD_CPUS=2` |
