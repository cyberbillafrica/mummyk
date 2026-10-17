/* ==========================================================================
 * Mummy K Kiddies Empire — Data Import Tool (js/seed.js)
 * --------------------------------------------------------------------------
 * A script-style alternative to adding everything by hand:
 *   1. Paste a JSON array of products → bulk-write the "products" collection.
 *   2. One click seeds the "settings" document from js/config.js defaults.
 * Writes require the admin login (Firestore Security Rules demand auth).
 *
 * FIRESTORE DATA SCHEMA (used by this app):
 *   products : { name, price, category, sizes: [], mediaUrl, mediaType, youtubeUrl, createdAt }
 *   orders   : { orderRef, orderType, customerName, customerPhone, customerAddress, items: [],
 *                subtotal, orderStatus, paymentStatus, paymentMethod, paymentProofUrl, createdAt }
 *   messages : { name, phone, orderRef, category, message, status, createdAt }
 *   settings : { whatsappNumber, bankName, accountName, accountNumber, announcement }
 * ========================================================================== */

import { firebaseConfig, defaultSettings } from "./config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

/* ==========================================================================
 * 1. FIREBASE INITIALIZATION
 * ========================================================================== */
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

/* ==========================================================================
 * 2. SMALL HELPERS
 * ========================================================================== */

let toastTimer = null;
function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add("hidden"), 3500);
}

/** Append a line to the on-screen import log */
function log(message) {
  const box = document.getElementById("import-log");
  const line = document.createElement("p");
  line.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}

/* ==========================================================================
 * 3. AUTHENTICATION (same admin user as admin.html)
 * ========================================================================== */
onAuthStateChanged(auth, (user) => {
  const loginSection = document.getElementById("login-section");
  const importSection = document.getElementById("import-section");
  const logoutBtn = document.getElementById("logout-btn");

  if (user) {
    loginSection.classList.add("hidden");
    importSection.classList.remove("hidden");
    logoutBtn.classList.remove("hidden");
    log(`Signed in as ${user.email}`);
  } else {
    importSection.classList.add("hidden");
    loginSection.classList.remove("hidden");
    logoutBtn.classList.add("hidden");
  }
});

(function wirePasswordToggle() {
  const passwordInput = document.getElementById("login-password");
  const toggleBtn = document.getElementById("login-password-toggle");
  if (!passwordInput || !toggleBtn) return;

  const eyeOff = document.getElementById("login-eye-off");
  const eyeOn = document.getElementById("login-eye-on");

  toggleBtn.addEventListener("click", () => {
    const isVisible = passwordInput.type === "text";
    passwordInput.type = isVisible ? "password" : "text";
    if (eyeOff) eyeOff.classList.toggle("hidden", isVisible);
    if (eyeOn) eyeOn.classList.toggle("hidden", !isVisible);
    toggleBtn.setAttribute("aria-label", isVisible ? "Show password" : "Hide password");
    toggleBtn.setAttribute("title", isVisible ? "Show password" : "Hide password");
    toggleBtn.focus();
  });
})();

document.getElementById("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const errorBox = document.getElementById("login-error");
  errorBox.classList.add("hidden");
  try {
    await signInWithEmailAndPassword(
      auth,
      document.getElementById("login-email").value.trim(),
      document.getElementById("login-password").value
    );
  } catch (error) {
    console.error("Sign-in failed:", error);
    errorBox.textContent = "Could not sign in. Please check your credentials and connection.";
    errorBox.classList.remove("hidden");
  }
});

document.getElementById("logout-btn").addEventListener("click", () => signOut(auth));

/* ==========================================================================
 * 4. PRODUCT IMPORT — JSON array → products collection
 * ========================================================================== */

/** Sample data so the tool can be tested in seconds */
const SAMPLE_PRODUCTS = [
  {
    name: "Floral Summer Dress",
    price: 7500,
    category: "Clothes",
    sizes: ["2yrs", "4yrs", "6yrs"],
    mediaUrl: "",
    mediaType: "image",
    youtubeUrl: "",
  },
  {
    name: "Kids Sneakers — White",
    price: 12000,
    category: "Shoes",
    sizes: ["28", "30", "32", "34"],
    mediaUrl: "",
    mediaType: "image",
    youtubeUrl: "",
  },
  {
    name: "School Backpack — Unicorn",
    price: 9500,
    category: "Bags",
    sizes: [],
    mediaUrl: "",
    mediaType: "image",
    youtubeUrl: "",
  },
];

document.getElementById("load-sample-btn").addEventListener("click", () => {
  document.getElementById("products-json").value = JSON.stringify(SAMPLE_PRODUCTS, null, 2);
  showToast("Sample data loaded — edit it, then import.");
});

document.getElementById("clear-json-btn").addEventListener("click", () => {
  document.getElementById("products-json").value = "";
});

/** Validate one product object and normalise it to the schema */
function normaliseProduct(raw) {
  if (!raw || typeof raw !== "object") throw new Error("each item must be an object");
  if (!raw.name || typeof raw.name !== "string") throw new Error("missing product name");
  const price = Number(raw.price);
  if (!Number.isFinite(price) || price <= 0) throw new Error(`"${raw.name}": price must be a positive number`);

  const validCategories = ["Clothes", "Shoes", "Bags", "Others"];
  const category = validCategories.includes(raw.category) ? raw.category : "Others";

  return {
    name: raw.name.trim(),
    price,
    category,
    sizes: Array.isArray(raw.sizes)
      ? raw.sizes.map((size) => String(size).trim()).filter(Boolean)
      : String(raw.sizes || "")
          .split(",")
          .map((size) => size.trim())
          .filter(Boolean),
    mediaUrl: typeof raw.mediaUrl === "string" ? raw.mediaUrl.trim() : "",
    mediaType: raw.mediaType === "video" ? "video" : "image",
    youtubeUrl: typeof raw.youtubeUrl === "string" ? raw.youtubeUrl.trim() : "",
    createdAt: serverTimestamp(),
  };
}

document.getElementById("import-products-btn").addEventListener("click", async () => {
  const btn = document.getElementById("import-products-btn");
  const raw = document.getElementById("products-json").value.trim();

  if (!raw) {
    showToast("Paste a JSON array of products first (or load the sample).");
    return;
  }

  // Parse + validate everything BEFORE writing anything
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    showToast("Invalid JSON — check for missing commas or quotes.");
    log(`❌ JSON parse error: ${error.message}`);
    return;
  }
  if (!Array.isArray(parsed) || !parsed.length) {
    showToast("Expected a non-empty JSON array of products.");
    return;
  }

  const products = [];
  for (let i = 0; i < parsed.length; i += 1) {
    try {
      products.push(normaliseProduct(parsed[i]));
    } catch (error) {
      showToast(`Item ${i + 1}: ${error.message}`);
      log(`❌ Item ${i + 1}: ${error.message}`);
      return;
    }
  }

  btn.disabled = true;
  btn.textContent = "Importing…";
  log(`⏳ Importing ${products.length} product(s)…`);

  try {
    // One document per product
    await Promise.all(products.map((product) => addDoc(collection(db, "products"), product)));
    log(`✅ Done — ${products.length} product(s) written to the "products" collection.`);
    showToast(`${products.length} product(s) imported 🎉`);
    document.getElementById("products-json").value = "";
  } catch (error) {
    console.error("Import failed:", error);
    log(`❌ Import failed: ${error.message}`);
    showToast("Import failed — see the log below.");
  } finally {
    btn.disabled = false;
    btn.textContent = "📦 Import Products";
  }
});

/* ==========================================================================
 * 5. SETTINGS SEED — one document from js/config.js defaults
 * ========================================================================== */
document.getElementById("seed-settings-btn").addEventListener("click", async () => {
  const btn = document.getElementById("seed-settings-btn");
  btn.disabled = true;
  btn.textContent = "Seeding…";

  try {
    const snapshot = await getDocs(collection(db, "settings"));
    if (snapshot.empty) {
      await addDoc(collection(db, "settings"), { ...defaultSettings });
      log('✅ Created the "settings" document with defaults from js/config.js.');
    } else {
      await updateDoc(doc(db, "settings", snapshot.docs[0].id), { ...defaultSettings });
      log('✅ Updated the existing "settings" document with defaults from js/config.js.');
    }
    showToast("Settings seeded ✅");
  } catch (error) {
    console.error("Settings seed failed:", error);
    log(`❌ Settings seed failed: ${error.message}`);
    showToast("Could not seed settings — see the log below.");
  } finally {
    btn.disabled = false;
    btn.textContent = "⚙️ Seed Settings Document";
  }
});
