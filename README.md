# Mummy K Kiddies Empire — E-Commerce Portal

A complete, mobile-first e-commerce portal for a kids' business. **Pure frontend** —
HTML5 + Tailwind CSS (CDN) + Vanilla JavaScript (ES Modules), with **Firebase**
(Firestore database + Firebase Auth) and **Cloudinary** (media & payment-proof uploads).

> ⚠️ **Constraint:** there is **no backend, no Node.js and no Cloud Functions**.
> Security relies entirely on **Firebase Security Rules** and **manual admin
> verification** of payments.

---

## 📁 File Structure

```
MummyK/
├── index.html      → Storefront (products, cart, checkout, messages)
├── admin.html      → Admin dashboard (products, orders, messages, settings, help)
├── js/
│   ├── config.js   → 🔑 ALL keys go here (Firebase, Cloudinary, WhatsApp)
│   ├── main.js     → Storefront logic
│   └── admin.js    → Admin logic
└── README.md       → This guide
```

---

## 🚀 Quick Start

1. Fill in your keys in **`js/config.js`** (see below).
2. Set up Firebase (Auth + Firestore + Security Rules).
3. Set up Cloudinary (two unsigned upload presets).
4. Open `index.html` in a browser — for local testing use a simple static server
   (e.g. the VSCode **"Live Server"** extension) because ES Modules need
   `http://`, not `file://`.
5. Deploy anywhere static files are hosted (Netlify, Vercel, Firebase Hosting,
   GitHub Pages, Cloudflare Pages…).

---

## 🔥 Firebase Setup

### 1. Create the project

1. Go to <https://console.firebase.google.com> → **Add project**.
2. Enable **Google Analytics** optionally → Create project.

### 2. Register a web app

1. Project settings → **General** → **Your apps** → **Web** (`</>` icon).
2. Register the app and copy the **`firebaseConfig`** values into
   `js/config.js`.

### 3. Enable Authentication

1. **Build → Authentication → Get started → Sign-in method**.
2. Enable **Email/Password**.
3. **Users → Add user** → create the admin account (email + password).
   Use these credentials to log into `admin.html`.

### 4. Create Firestore

1. **Build → Firestore Database → Create database** → Start in **production mode**.
2. Choose a region close to your customers (e.g. `europe-west1` or `us-central`).

You do **not** need to create collections manually — the app creates these on
first write:

| Collection  | Document shape |
|-------------|----------------|
| `products`  | `{ name, price, category, sizes: [], mediaUrl, mediaType, youtubeUrl, createdAt }` |
| `orders`    | `{ orderRef, customerName, customerPhone, customerAddress, items: [], subtotal, orderStatus, paymentStatus, paymentMethod, paymentProofUrl, createdAt }` |
| `messages`  | `{ name, phone, orderRef, category, message, status, createdAt }` |
| `settings`  | `{ whatsappNumber, bankName, accountName, accountNumber, announcement }` |

Field notes:

- `products.category` — one of `Clothes`, `Shoes`, `Bags`, `Others`
- `products.mediaType` — `"image"` or `"video"`
- `orders.orderStatus` — `"New"` → `"Delivered"`
- `orders.paymentStatus` — `"Unpaid"` → `"Proof Submitted"` → `"Confirmed"` / `"Rejected"`
- `orders.paymentMethod` — `""` (until chosen), `"WhatsApp"` or `"Bank Transfer"`
- `messages.status` — `"New"` → `"In Progress"` → `"Resolved"`
- `settings` — one document holding the business details.

### 5. Firestore Security Rules (very important!)

Because there is no backend, the rules below are the **only** protection for the
admin area. Paste them into **Firestore → Rules** and click **Publish**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Anyone can browse products…
    match /products/{productId} {
      allow read: if true;
      allow write: if request.auth != null; // only signed-in admins
    }

    // Anyone can place an order (customers are not signed in)…
    match /orders/{orderId} {
      allow read: if request.auth != null; // only admins can view orders
      allow create: if true;               // storefront creates orders
      allow update: if request.auth != null
                    || request.resource.data.diff(resource.data)
                         .affectedKeys()
                         .hasOnly(['paymentMethod', 'paymentProofUrl', 'paymentStatus']);
      allow delete: if false;              // never delete orders
    }

    // Anyone can send a message…
    match /messages/{messageId} {
      allow read: if request.auth != null; // only admins can read messages
      allow create: if true;               // storefront creates messages
      allow update: if request.auth != null; // only admins change status
      allow delete: if false;
    }

    // Business settings: readable by everyone (bank details show at checkout),
    // writable only by signed-in admins.
    match /settings/{settingsId} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

> 💡 **Security note:** "admins" = anyone signed in with Firebase Auth. Only
> share the admin login with people you trust, and use a strong password.

---

## ☁️ Cloudinary Setup

1. Create a free account at <https://cloudinary.com>.
2. From the **Dashboard**, copy your **Cloud name** into `js/config.js`.
3. Go to **Settings → Upload → Upload presets → Add upload preset** and create
   **two unsigned presets**:

| Preset purpose | Folder | Signing | Allowed formats |
|----------------|--------|---------|-----------------|
| Product media  | `mummyk/products` | **Unsigned** | jpg, jpeg, png, webp, mp4, webm, mov |
| Payment proof  | `mummyk/receipts` | **Unsigned** | jpg, jpeg, png, webp |

4. Put the preset name(s) in `js/config.js` (`uploadPreset`). The app sends the
   correct folder with each upload (`mummyk/products` for products,
   `mummyk/receipts` for receipts).

> ⚠️ Unsigned presets are required (no backend to sign uploads). In the preset
> settings you can restrict allowed formats and set a max file size to prevent
> abuse.

---

## 🔑 Filling in `js/config.js`

```js
export const firebaseConfig = {
  apiKey: "…",              // Firebase → Project settings → General
  authDomain: "…",
  projectId: "…",
  storageBucket: "…",
  messagingSenderId: "…",
  appId: "…",
};

export const cloudinary = {
  cloudName: "…",           // Cloudinary dashboard
  uploadPreset: "…",        // the UNSIGNED upload preset name
  productFolder: "mummyk/products",
  receiptFolder: "mummyk/receipts",
};

export const whatsappNumber = "2348012345678"; // fallback only
```

> The WhatsApp number saved in **Admin → Business Settings** always takes
> priority. The `config.js` value is just a fallback until settings are saved.

---

## 🛍️ How the Store Works

1. **Browse & filter** — customers filter products by All / Clothes / Shoes /
   Bags / Others.
2. **Cart** — saved in `localStorage` (survives refreshes). Choose sizes, change
   quantities, remove items.
3. **Checkout** — customer enters name, phone and delivery address. An order is
   saved with a unique reference like **`MKE-2026-4821`**, `orderStatus: "New"`
   and `paymentStatus: "Unpaid"`.
4. **Payment** — two options:
   - **WhatsApp Order** — opens a pre-filled WhatsApp chat with the cart items,
     total and customer details.
   - **Bank Transfer** — shows the bank details from settings; the customer
     uploads proof of payment to Cloudinary (`mummyk/receipts`). The order is
     updated to `paymentStatus: "Proof Submitted"`.
5. **Messages** — the floating "Send us a Message" button saves complaints /
   enquiries to the `messages` collection.

## 🛠️ How the Admin Portal Works

Open `admin.html` and sign in with the Firebase admin user.

| Tab | What it does |
|-----|--------------|
| **Add Products** | Dynamic forms ("+ Add More Product"), Cloudinary uploads, bulk **Save All Products**. |
| **Manage Orders** | All orders in a table with **Confirm Payment**, **Mark Delivered**, **Reject Proof** buttons. |
| **Messages** | Customer messages; click the status button to cycle **New → In Progress → Resolved**. |
| **Business Settings** | WhatsApp number, bank details, announcement banner text. |
| **Help Guide** | Built-in usage manual for the admin. |

---

## 🎨 Design

- Tailwind CSS via CDN
- Colours: **Black** (`#111111`), **Gold** (`#D4AF37`), **Cream** (`#FDFBF7`)
- Mobile-first, responsive grid, sticky header, slide-in cart drawer
- Fonts: *Playfair Display* (headings) + *Inter* (body)

---

## ❓ Troubleshooting

| Problem | Fix |
|---------|-----|
| Products don't load | Check `firebaseConfig` in `js/config.js`, and that Firestore has data. |
| `permission-denied` on orders | Publish the Security Rules above. |
| Admin can't log in | Enable **Email/Password** sign-in and create the user in Firebase → Authentication. |
| Upload widget won't open | Check `cloudName` + `uploadPreset`; the preset must be **unsigned**. |
| Page blank when opened via `file://` | Use a local static server (Live Server) — ES Modules require `http://`. |
| WhatsApp doesn't open with details | Save the number in **Business Settings** in international format without `+`. |
