/* ==========================================================================
 * Mummy K Kiddies Empire — Environment Configuration
 * --------------------------------------------------------------------------
 * Fill in EVERY placeholder below in VSCode before deploying the site.
 * This is the ONLY file you need to edit. Never commit real keys to a public
 * repository — these Firebase keys are safe to expose in a client app ONLY
 * when your Firestore Security Rules are configured correctly (see README).
 * ========================================================================== */

/* --------------------------------------------------------------------------
 * 1. FIREBASE CONFIG
 * Firebase Console → Project settings → General → Your apps → SDK setup
 * (Web app) → Config. Copy the whole config object values in below.
 * -------------------------------------------------------------------------- */
export const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID",
};

/* --------------------------------------------------------------------------
 * 2. CLOUDINARY CONFIG
 * Cloudinary Dashboard → Product Environment Credentials → "Cloud name".
 * Create TWO unsigned upload presets (Settings → Upload → Upload presets):
 *   - one for product media    (folder: mummyk/products)
 *   - one for payment receipts (folder: mummyk/receipts)
 * Each preset must be UNSIGNED and set to the folder shown above.
 * -------------------------------------------------------------------------- */
export const cloudinary = {
  cloudName: "YOUR_CLOUDINARY_CLOUD_NAME",
  // Unsigned upload preset used by BOTH widgets (set its folder per call)
  uploadPreset: "YOUR_UNSIGNED_UPLOAD_PRESET",
  // Asset folders (set these on the upload presets too)
  productFolder: "mummyk/products",
  receiptFolder: "mummyk/receipts",
};

/* --------------------------------------------------------------------------
 * 3. WHATSAPP NUMBER (fallback)
 * Business WhatsApp number in INTERNATIONAL format, digits only, no "+".
 * Example: 2348012345678
 * NOTE: the number saved in Firestore (settings/whatsappNumber) takes
 * priority at runtime — this value is only a fallback until settings exist.
 * -------------------------------------------------------------------------- */
export const whatsappNumber = "2348000000000";
