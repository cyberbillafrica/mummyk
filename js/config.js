/* ==========================================================================
 * Mummy K Kiddies Empire — Environment Configuration
 * --------------------------------------------------------------------------
 * ALL keys and business info live in THIS file only.
 * Firebase web keys are safe to expose in client code ONLY when the Firestore
 * Security Rules from README.md are published (they are the real protection).
 * ========================================================================== */

/* --------------------------------------------------------------------------
 * 1. FIREBASE CONFIG
 * Firebase Console → Project settings → General → Your apps → SDK setup (Web)
 * NOTE: use this gstatic ES-module style (see js/main.js) — never the
 * bare "import ... from 'firebase/app'" style, which browsers cannot resolve
 * without a bundler.
 * -------------------------------------------------------------------------- */
export const firebaseConfig = {
  apiKey: "AIzaSyARKuGJIN5f7YftfeOfdcOQCy0hF4ne01c",
  authDomain: "mummykkiddies.firebaseapp.com",
  projectId: "mummykkiddies",
  storageBucket: "mummykkiddies.firebasestorage.app",
  messagingSenderId: "436703284165",
  appId: "1:436703284165:web:7e82d68f5dd21da30dd9ac",
};

/* --------------------------------------------------------------------------
 * 2. CLOUDINARY CONFIG
 * Unsigned upload preset (Settings → Upload → Upload presets).
 * Product media goes to mummyk/products, payment receipts to mummyk/receipts.
 * -------------------------------------------------------------------------- */
export const cloudinary = {
  cloudName: "dvvwuktq",
  uploadPreset: "mummyk",
  productFolder: "mummyk/products",
  receiptFolder: "mummyk/receipts",
};

/* --------------------------------------------------------------------------
 * 3. WHATSAPP NUMBER (fallback)
 * International format, digits only, no "+".
 * NOTE: the number saved in Firestore (Admin → Business Settings) takes
 * priority at runtime — this value is the fallback.
 * -------------------------------------------------------------------------- */
export const whatsappNumber = "2347014368767";

/* --------------------------------------------------------------------------
 * 4. BUSINESS INFO (from the official flyers — shown on the storefront)
 * -------------------------------------------------------------------------- */
export const businessInfo = {
  name: "Mummy K Kiddies Empire",
  tagline: "Home of kids lovers",
  motto: "Same Passion, Bigger Dreams!",
  phoneDisplay: "07014368767",
  whatsappNumber: "2347014368767",
  address:
    "No. 6, 8 and 10 Nnamuchinabo Street, Off Town School Road, Emene, Enugu State (At the back of Eminite company)",
  location: "Emene, Enugu State",
  facebook: "Mummy k kiddies Empire & @Nnamchi sandra",
  instagram: "Mummyk_kiddies_",
  freeDelivery:
    "Enjoy free delivery within Enugu State and nationwide on all orders above ₦50,000.",
};

/* --------------------------------------------------------------------------
 * 5. DEFAULT SETTINGS
 * Used as fallback when the Firestore settings collection is still empty.
 * Once you save anything in Admin → Business Settings, Firestore wins.
 * -------------------------------------------------------------------------- */
export const defaultSettings = {
  whatsappNumber: "2347014368767",
  bankName: "OPAY",
  accountName: "MummyK Kiddies Empire",
  accountNumber: "7014368767",
  announcement:
    "Book your kids shoes now! We are already shipping 🚢 from China 🇨🇳 to Nigeria 🇳🇬 — all sizes will be available in less than 2 weeks. At our Enugu branch, we sell at a very cheap rate.",
};
