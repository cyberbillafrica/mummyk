/* ==========================================================================
 * Mummy K Kiddies Empire — Admin Dashboard Logic (js/admin.js)
 * --------------------------------------------------------------------------
 * Pure frontend: Firebase Auth (email/password) + Firestore + Cloudinary.
 * Only authenticated admins can view the dashboard tabs.
 *
 * FIRESTORE DATA SCHEMA (used by this app):
 *   products : { name, price, category, sizes: [], mediaUrl, mediaType, youtubeUrl, createdAt }
 *   orders   : { orderRef, orderType, customerName, customerPhone, customerAddress, items: [],
 *                subtotal, orderStatus, paymentStatus, paymentMethod, paymentProofUrl, createdAt }
 *                (orderType is "Order" for checkouts, "Booking" for pre-order item bookings)
 *   messages : { name, phone, orderRef, category, message, status, createdAt }
 *   settings : { whatsappNumber, bankName, accountName, accountNumber, announcement }
 * ========================================================================== */

import { firebaseConfig, cloudinary } from "./config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
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

/** Format a number as Nigerian Naira */
const formatNaira = (amount) =>
  "₦" + Number(amount || 0).toLocaleString("en-NG");

/** Format a Firestore Timestamp (or ISO string) for table display */
function formatDate(value) {
  if (!value) return "—";
  const date = value.toDate ? value.toDate() : new Date(value);
  return date.toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Escape user-generated text before inserting into innerHTML (XSS safety) */
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}

/** Toast notifications */
let toastTimer = null;
function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add("hidden"), 3500);
}

/* ==========================================================================
 * 3. AUTHENTICATION
 * ========================================================================== */

/** Show the dashboard only when an admin is signed in */
onAuthStateChanged(auth, (user) => {
  const loginScreen = document.getElementById("login-screen");
  const dashboard = document.getElementById("dashboard");

  if (user) {
    loginScreen.classList.add("hidden");
    dashboard.classList.remove("hidden");
    loadAllData(); // orders, messages, settings
  } else {
    dashboard.classList.add("hidden");
    loginScreen.classList.remove("hidden");
  }
});

/** Password visibility toggle */
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
    // Keep focus on the toggle button so the user can flip back without re-typing
    toggleBtn.focus();
  });
})();

/** Email/password sign-in */
document.getElementById("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const btn = document.getElementById("login-btn");
  const errorBox = document.getElementById("login-error");
  errorBox.classList.add("hidden");
  btn.disabled = true;
  btn.textContent = "Signing in…";

  try {
    await signInWithEmailAndPassword(
      auth,
      document.getElementById("login-email").value.trim(),
      document.getElementById("login-password").value
    );
  } catch (error) {
    console.error("Sign-in failed:", error);
    errorBox.textContent =
      error.code === "auth/invalid-credential" || error.code === "auth/wrong-password"
        ? "Incorrect email or password. Please try again."
        : "Could not sign in. Please check your connection and try again.";
    errorBox.classList.remove("hidden");
  } finally {
    btn.disabled = false;
    btn.textContent = "Sign In";
  }
});

/** Logout */
document.getElementById("logout-btn").addEventListener("click", () => signOut(auth));

/* ==========================================================================
 * 4. TABS
 * ========================================================================== */
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    // Update tab button styles
    document.querySelectorAll(".tab-btn").forEach((b) => {
      b.classList.remove("border-gold", "text-ink");
      b.classList.add("border-transparent", "text-ink/60");
    });
    btn.classList.remove("border-transparent", "text-ink/60");
    btn.classList.add("border-gold", "text-ink");

    // Show the selected panel
    document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.add("hidden"));
    document.getElementById(btn.dataset.tab).classList.remove("hidden");
  });
});

/* ==========================================================================
 * 5. ADD PRODUCTS TAB — dynamic forms + Cloudinary uploads
 * ========================================================================== */

/** Product form template (one per product) */
function productFormTemplate(index) {
  return `
  <div class="product-form rounded-2xl border border-ink/10 bg-white p-5 sm:p-6" data-index="${index}">
    <div class="mb-4 flex items-center justify-between">
      <h3 class="font-display text-lg font-bold">Product ${index + 1}</h3>
      <button type="button" class="remove-form-btn rounded-full px-3 py-1 text-xs font-semibold text-red-500 transition hover:bg-red-50">
        ✕ Remove
      </button>
    </div>

    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div>
        <label class="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink/70">Product Name</label>
        <input type="text" class="pf-name w-full rounded-xl border-2 border-ink/10 bg-cream px-4 py-3 text-sm outline-none transition focus:border-gold" placeholder="e.g. Floral Summer Dress" />
      </div>
      <div>
        <label class="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink/70">Price (₦)</label>
        <input type="number" min="0" class="pf-price w-full rounded-xl border-2 border-ink/10 bg-cream px-4 py-3 text-sm outline-none transition focus:border-gold" placeholder="e.g. 7500" />
      </div>
      <div>
        <label class="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink/70">Category</label>
        <select class="pf-category w-full rounded-xl border-2 border-ink/10 bg-cream px-4 py-3 text-sm outline-none transition focus:border-gold">
          <option value="Clothes">Clothes</option>
          <option value="Shoes">Shoes</option>
          <option value="Bags">Bags</option>
          <option value="Others">Others</option>
        </select>
      </div>
      <div>
        <label class="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink/70">Sizes (comma-separated)</label>
        <input type="text" class="pf-sizes w-full rounded-xl border-2 border-ink/10 bg-cream px-4 py-3 text-sm outline-none transition focus:border-gold" placeholder="e.g. 2yrs, 4yrs, 6yrs" />
      </div>
      <div class="sm:col-span-2">
        <label class="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink/70">YouTube Link (optional)</label>
        <input type="url" class="pf-youtube w-full rounded-xl border-2 border-ink/10 bg-cream px-4 py-3 text-sm outline-none transition focus:border-gold" placeholder="https://www.youtube.com/watch?v=…" />
      </div>
    </div>

    <!-- Cloudinary upload -->
    <div class="mt-4">
      <label class="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink/70">Product Media (photo or short video)</label>
      <div class="flex flex-wrap items-center gap-3">
        <button type="button" class="pf-upload-btn rounded-full border-2 border-ink px-5 py-2.5 text-xs font-bold text-ink transition hover:bg-ink hover:text-gold">
          📷 Upload Media
        </button>
        <div class="pf-media-preview flex items-center gap-2"></div>
      </div>
      <!-- Hidden data fields filled by the upload widget -->
      <input type="hidden" class="pf-media-url" />
      <input type="hidden" class="pf-media-type" />
    </div>
  </div>`;
}

/** Keep track of how many product forms exist */
let productFormCount = 0;

/** Add one more product form */
function addProductForm() {
  const container = document.getElementById("product-forms");
  container.insertAdjacentHTML("beforeend", productFormTemplate(productFormCount));
  productFormCount += 1;
  wireProductFormButtons();
}

/** Wire upload + remove buttons on every form (safe to call repeatedly) */
function wireProductFormButtons() {
  document.querySelectorAll(".product-form").forEach((form) => {
    const uploadBtn = form.querySelector(".pf-upload-btn");
    // Avoid double-binding listeners
    if (uploadBtn.dataset.wired === "true") return;
    uploadBtn.dataset.wired = "true";

    // Remove this form
    form.querySelector(".remove-form-btn").addEventListener("click", () => {
      form.remove();
    });

    // Open the Cloudinary Upload Widget (unsigned preset)
    uploadBtn.addEventListener("click", () => {
      if (!window.cloudinary) {
        showToast("Upload widget is still loading. Please try again.");
        return;
      }

      const widget = window.cloudinary.createUploadWidget(
        {
          cloudName: cloudinary.cloudName,
          uploadPreset: cloudinary.uploadPreset,
          folder: cloudinary.productFolder, // mummyk/products
          sources: ["local", "camera"],
          multiple: false,
          resourceType: "auto", // allows both images and short videos
          clientAllowedFormats: ["jpg", "jpeg", "png", "webp", "mp4", "webm", "mov"],
          maxFileSize: 20_000_000, // 20 MB
        },
        (error, result) => {
          if (error) {
            console.error("Cloudinary upload error:", error);
            showToast("Upload failed. Please try again.");
            return;
          }
          if (result && result.event === "success") {
            const info = result.info;
            form.querySelector(".pf-media-url").value = info.secure_url;
            form.querySelector(".pf-media-type").value = info.resource_type === "video" ? "video" : "image";

            // Show a small preview
            const preview = form.querySelector(".pf-media-preview");
            preview.innerHTML =
              info.resource_type === "video"
                ? `<video src="${escapeHtml(info.secure_url)}" class="h-12 w-12 rounded-lg object-cover" muted></video>
                   <span class="text-xs font-semibold text-green-700">Video uploaded ✅</span>`
                : `<img src="${escapeHtml(info.secure_url)}" class="h-12 w-12 rounded-lg object-cover" alt="preview" />
                   <span class="text-xs font-semibold text-green-700">Image uploaded ✅</span>`;
            showToast("Media uploaded ✅");
          }
        }
      );

      widget.open();
    });
  });
}

/** "+ Add More Product" button */
document.getElementById("add-product-form-btn").addEventListener("click", addProductForm);

/** "Clear Forms" button */
document.getElementById("clear-products-btn").addEventListener("click", () => {
  document.getElementById("product-forms").innerHTML = "";
  productFormCount = 0;
  addProductForm(); // always keep at least one form
});

/** "Save All Products" — bulk commit to Firestore */
document.getElementById("save-products-btn").addEventListener("click", async () => {
  const forms = [...document.querySelectorAll(".product-form")];
  const products = [];

  for (const form of forms) {
    const name = form.querySelector(".pf-name").value.trim();
    const price = Number(form.querySelector(".pf-price").value);
    const category = form.querySelector(".pf-category").value;
    const sizesRaw = form.querySelector(".pf-sizes").value.trim();
    const youtubeUrl = form.querySelector(".pf-youtube").value.trim();
    const mediaUrl = form.querySelector(".pf-media-url").value;
    const mediaType = form.querySelector(".pf-media-type").value || "image";

    // Skip completely empty forms
    if (!name && !price && !mediaUrl) continue;

    // Validate the important fields
    if (!name || !price || price <= 0) {
      showToast("Please fill in a name and a valid price for every product.");
      return;
    }

    products.push({
      name,
      price,
      category,
      sizes: sizesRaw
        ? sizesRaw.split(",").map((size) => size.trim()).filter(Boolean)
        : [],
      mediaUrl,
      mediaType,
      youtubeUrl,
      createdAt: serverTimestamp(),
    });
  }

  if (!products.length) {
    showToast("Nothing to save — please fill in at least one product.");
    return;
  }

  const btn = document.getElementById("save-products-btn");
  btn.disabled = true;
  btn.textContent = "Saving…";

  try {
    // Bulk commit: one addDoc per product
    await Promise.all(products.map((product) => addDoc(collection(db, "products"), product)));
    showToast(`${products.length} product(s) saved and published 🎉`);
    document.getElementById("product-forms").innerHTML = "";
    productFormCount = 0;
    addProductForm();
  } catch (error) {
    console.error("Failed to save products:", error);
    showToast("Could not save products. Please try again.");
  } finally {
    btn.disabled = false;
    btn.textContent = "💾 Save All Products";
  }
});

/* ==========================================================================
 * 5b. MANAGE PRODUCTS TAB — view, edit and delete products
 * ========================================================================== */

/** Render the Manage Products table (newest first) */
async function loadManageProducts() {
  const tbody = document.getElementById("manage-products-table-body");
  try {
    const snapshot = await getDocs(collection(db, "products"));
    const products = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    products.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));

    if (!products.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-8 text-center text-ink/50">No products yet. Use the Add Products tab to create your first product.</td></tr>`;
      return;
    }

    tbody.innerHTML = products
      .map((product) => {
        const sizesText = (product.sizes || [])
          .map((size) => escapeHtml(String(size)))
          .join(", ") || "—";

        const mediaCell =
          product.mediaUrl
            ? `<div class="flex items-center gap-2">
                 <div class="relative">
                   ${product.mediaType === "video"
                     ? `<video src="${escapeHtml(product.mediaUrl)}" class="h-10 w-10 rounded-lg object-cover" muted></video>`
                     : `<img src="${escapeHtml(product.mediaUrl)}" class="h-10 w-10 rounded-lg object-cover" alt="" />`}
                   <button type="button" data-action="clear-media" data-id="${escapeHtml(product.id)}"
                     class="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white border border-ink/20 text-ink shadow"
                     title="Remove this media">&times;</button>
                 </div>
                 <span class="text-xs text-ink/50">${product.mediaType === "video" ? "Video" : "Photo"}</span>
               </div>`
            : `<span class="text-ink/40">None</span>`;

        return `
        <tr class="align-top transition hover:bg-cream">
          <td class="whitespace-nowrap px-4 py-3 text-xs text-ink/60">${formatDate(product.createdAt)}</td>
          <td class="whitespace-nowrap px-4 py-3 font-semibold text-ink">${escapeHtml(product.name)}</td>
          <td class="whitespace-nowrap px-4 py-3">
            <span class="rounded-full bg-ink/5 px-2.5 py-1 text-[11px] font-bold text-ink">${escapeHtml(product.category || "—")}</span>
          </td>
          <td class="whitespace-nowrap px-4 py-3 text-xs text-ink/70">${escapeHtml(sizesText)}</td>
          <td class="whitespace-nowrap px-4 py-3 font-bold text-ink">${formatNaira(product.price)}</td>
          <td class="whitespace-nowrap px-4 py-3">${mediaCell}</td>
          <td class="whitespace-nowrap px-4 py-3">
            <div class="flex flex-wrap gap-1.5">
              <button data-action="edit" data-id="${escapeHtml(product.id)}"
                class="rounded-full bg-gold px-3 py-1.5 text-[11px] font-bold text-ink transition hover:bg-gold-light">
                ✏️ Edit
              </button>
              <button data-action="delete" data-id="${escapeHtml(product.id)}"
                class="rounded-full border border-red-500 px-3 py-1.5 text-[11px] font-bold text-red-600 transition hover:bg-red-50">
                🗑 Delete
              </button>
            </div>
          </td>
        </tr>`;
      })
      .join("");

    // Wire the action buttons
    tbody.querySelectorAll("button[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => handleManageProductAction(btn.dataset.action, btn.dataset.id));
    });
  } catch (error) {
    console.error("Failed to load products:", error);
    tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-8 text-center text-red-500">Could not load products. Please refresh.</td></tr>`;
  }
}

/** Edit or delete a product */
async function handleManageProductAction(action, productId) {
  if (action === "delete") {
    if (window.confirm("Delete this product from the store? This cannot be undone.")) {
      try {
        await deleteDoc(doc(db, "products", productId));
        showToast("Product deleted 🗑");
        loadManageProducts();
      } catch (error) {
        console.error("Failed to delete product:", error);
        showToast("Could not delete product. Please try again.");
      }
    }
    return;
  }

  if (action === "edit") {
    try {
      const snapshot = await getDocs(collection(db, "products"));
      const product = snapshot.docs.find((docSnap) => docSnap.id === productId);
      if (!product) {
        showToast("Product not found.");
        return;
      }

      const data = product.data();

      // Switch to the Add Products tab
      document.querySelector('[data-tab="tab-products"]')?.click();

      // Clear existing forms and build one pre-filled form
      document.getElementById("product-forms").innerHTML = "";
      productFormCount = 0;
      addProductForm();

      const form = document.querySelector(".product-form");
      form.querySelector(".pf-name").value = data.name || "";
      form.querySelector(".pf-price").value = data.price ?? "";
      form.querySelector(".pf-category").value = data.category || "Clothes";
      form.querySelector(".pf-sizes").value = (data.sizes || []).join(", ");
      form.querySelector(".pf-youtube").value = data.youtubeUrl || "";
      form.querySelector(".pf-media-url").value = data.mediaUrl || "";
      form.querySelector(".pf-media-type").value = data.mediaType || "image";

      // Show the stored media preview (if any)
      const mediaUrl = data.mediaUrl;
      const mediaType = data.mediaType || "image";
      const preview = form.querySelector(".pf-media-preview");
      if (mediaUrl) {
        preview.innerHTML =
          mediaType === "video"
            ? `<video src="${escapeHtml(mediaUrl)}" class="h-12 w-12 rounded-lg object-cover" muted></video>
               <span class="text-xs font-semibold text-green-700">Video uploaded ✅</span>`
            : `<img src="${escapeHtml(mediaUrl)}" class="h-12 w-12 rounded-lg object-cover" alt="preview" />
               <span class="text-xs font-semibold text-green-700">Image uploaded ✅</span>`;
      }

      showToast("Edit the product above and save to update it.");
    } catch (error) {
      console.error("Failed to load product for editing:", error);
      showToast("Could not load product. Please try again.");
    }
    return;
  }

  if (action === "clear-media") {
    const tbody = document.getElementById("manage-products-table-body");
    const row = btn.closest("tr");
    const productId = row ? row.querySelector("button[data-action='delete']")?.dataset.id : null;
    // Optimistically clear the media cell
    const mediaCell = row?.querySelector("td:nth-child(6)");
    if (mediaCell) {
      mediaCell.innerHTML = `<span class="text-ink/40">None</span>`;
    }
    try {
      const productRef = doc(db, "products", productId);
      await updateDoc(productRef, { mediaUrl: "", mediaType: "image" });
      showToast("Media removed ✅");
      loadManageProducts();
    } catch (error) {
      console.error("Failed to clear media:", error);
      loadManageProducts();
      showToast("Could not remove media. Please try again.");
    }
  }
}

/* ==========================================================================
 * 6. MANAGE ORDERS TAB
 * ========================================================================== */

/** Colour helpers for status badges */
const paymentStatusStyles = {
  Unpaid: "bg-red-100 text-red-700",
  "Proof Submitted": "bg-yellow-100 text-yellow-800",
  Confirmed: "bg-green-100 text-green-700",
  Rejected: "bg-red-100 text-red-700",
};

const orderStatusStyles = {
  New: "bg-blue-100 text-blue-700",
  Delivered: "bg-green-100 text-green-700",
};

/** Render the orders table (newest first) */
async function loadOrders() {
  const tbody = document.getElementById("orders-table-body");
  try {
    const snapshot = await getDocs(collection(db, "orders"));
    const orders = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    orders.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));

    if (!orders.length) {
      tbody.innerHTML = `<tr><td colspan="9" class="px-4 py-8 text-center text-ink/50">No orders yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = orders
      .map((order) => {
        const itemsText = (order.items || [])
          .map((item) => `${escapeHtml(item.name)}${item.size ? ` (${escapeHtml(item.size)})` : ""} ×${item.quantity}`)
          .join("<br>");

        const proofCell = order.paymentProofUrl
          ? `<a href="${escapeHtml(order.paymentProofUrl)}" target="_blank" rel="noopener"
               class="font-semibold text-gold-dark underline hover:text-gold">View Proof</a>`
          : `<span class="text-ink/40">None</span>`;

        return `
        <tr class="align-top transition hover:bg-cream">
          <td class="whitespace-nowrap px-4 py-3 text-xs text-ink/60">${formatDate(order.createdAt)}</td>
          <td class="whitespace-nowrap px-4 py-3 font-bold text-ink">
            ${escapeHtml(order.orderRef)}
            ${
              order.orderType === "Booking"
                ? `<span class="ml-1 rounded-full bg-gold px-2 py-0.5 text-[10px] font-bold uppercase text-ink">Booking</span>`
                : ""
            }
          </td>
          <td class="px-4 py-3 text-xs">
            <p class="font-semibold text-ink">${escapeHtml(order.customerName)}</p>
            <p class="text-ink/60">${escapeHtml(order.customerPhone)}</p>
            <p class="text-ink/60">${escapeHtml(order.customerAddress)}</p>
          </td>
          <td class="px-4 py-3 text-xs text-ink/70">${itemsText}${
            order.note
              ? `<p class="mt-1 italic text-ink/50">Note: ${escapeHtml(order.note)}</p>`
              : ""
          }</td>
          <td class="whitespace-nowrap px-4 py-3 font-bold text-ink">${formatNaira(order.subtotal)}</td>
          <td class="px-4 py-3 text-xs">${proofCell}</td>
          <td class="whitespace-nowrap px-4 py-3">
            <span class="rounded-full px-2.5 py-1 text-[11px] font-bold ${paymentStatusStyles[order.paymentStatus] || "bg-ink/10 text-ink"}">
              ${escapeHtml(order.paymentStatus)}
            </span>
          </td>
          <td class="whitespace-nowrap px-4 py-3">
            <span class="rounded-full px-2.5 py-1 text-[11px] font-bold ${orderStatusStyles[order.orderStatus] || "bg-ink/10 text-ink"}">
              ${escapeHtml(order.orderStatus)}
            </span>
          </td>
          <td class="px-4 py-3">
            <div class="flex flex-wrap gap-1.5">
              <button data-action="confirm" data-id="${order.id}"
                class="rounded-full bg-green-600 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-green-700">
                Confirm Payment
              </button>
              <button data-action="reject" data-id="${order.id}"
                class="rounded-full bg-red-600 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-red-700">
                Reject Proof
              </button>
              <button data-action="deliver" data-id="${order.id}"
                class="rounded-full bg-ink px-3 py-1.5 text-[11px] font-bold text-gold transition hover:bg-ink/90">
                Mark Delivered
              </button>
            </div>
          </td>
        </tr>`;
      })
      .join("");

    // Wire the action buttons
    tbody.querySelectorAll("button[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => handleOrderAction(btn.dataset.action, btn.dataset.id));
    });
  } catch (error) {
    console.error("Failed to load orders:", error);
    tbody.innerHTML = `<tr><td colspan="9" class="px-4 py-8 text-center text-red-500">Could not load orders. Please refresh.</td></tr>`;
  }
}

/** Update an order's payment/order status */
async function handleOrderAction(action, orderId) {
  const updates = {};
  if (action === "confirm") updates.paymentStatus = "Confirmed";
  if (action === "reject") updates.paymentStatus = "Rejected";
  if (action === "deliver") updates.orderStatus = "Delivered";

  try {
    await updateDoc(doc(db, "orders", orderId), updates);
    showToast("Order updated ✅");
    loadOrders();
  } catch (error) {
    console.error("Failed to update order:", error);
    showToast("Could not update order. Please try again.");
  }
}

/* ==========================================================================
 * 7. MESSAGES TAB
 * ========================================================================== */
const messageStatusCycle = ["New", "In Progress", "Resolved"];
const messageStatusStyles = {
  New: "bg-blue-100 text-blue-700",
  "In Progress": "bg-yellow-100 text-yellow-800",
  Resolved: "bg-green-100 text-green-700",
};

/** Render the messages table (newest first) */
async function loadMessages() {
  const tbody = document.getElementById("messages-table-body");
  try {
    const snapshot = await getDocs(collection(db, "messages"));
    const messages = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    messages.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));

    if (!messages.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-8 text-center text-ink/50">No messages yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = messages
      .map((message) => `
        <tr class="align-top transition hover:bg-cream">
          <td class="whitespace-nowrap px-4 py-3 text-xs text-ink/60">${formatDate(message.createdAt)}</td>
          <td class="whitespace-nowrap px-4 py-3 font-semibold text-ink">${escapeHtml(message.name)}</td>
          <td class="whitespace-nowrap px-4 py-3 text-xs text-ink/70">${escapeHtml(message.phone)}</td>
          <td class="px-4 py-3 text-xs text-ink/70">
            <span class="mb-1 inline-block rounded-full bg-ink/5 px-2 py-0.5 text-[10px] font-bold uppercase text-ink/60">
              ${escapeHtml(message.category)}${message.orderRef ? ` • ${escapeHtml(message.orderRef)}` : ""}
            </span>
            <p>${escapeHtml(message.message)}</p>
          </td>
          <td class="whitespace-nowrap px-4 py-3">
            <button data-message-id="${message.id}" data-status="${escapeHtml(message.status)}"
              class="message-status-btn rounded-full px-3 py-1.5 text-[11px] font-bold transition hover:opacity-80 ${messageStatusStyles[message.status] || "bg-ink/10 text-ink"}">
              ${escapeHtml(message.status)}
            </button>
          </td>
        </tr>`)
      .join("");

    // Wire the status cycle buttons
    tbody.querySelectorAll(".message-status-btn").forEach((btn) => {
      btn.addEventListener("click", () =>
        handleMessageStatus(btn.dataset.messageId, btn.dataset.status)
      );
    });
  } catch (error) {
    console.error("Failed to load messages:", error);
    tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-8 text-center text-red-500">Could not load messages. Please refresh.</td></tr>`;
  }
}

/** Cycle a message's status: New → In Progress → Resolved → New */
async function handleMessageStatus(messageId, currentStatus) {
  const nextIndex = (messageStatusCycle.indexOf(currentStatus) + 1) % messageStatusCycle.length;
  try {
    await updateDoc(doc(db, "messages", messageId), { status: messageStatusCycle[nextIndex] });
    loadMessages();
  } catch (error) {
    console.error("Failed to update message:", error);
    showToast("Could not update message. Please try again.");
  }
}

/* ==========================================================================
 * 8. BUSINESS SETTINGS TAB
 * ========================================================================== */
let settingsDocId = null; // Firestore doc id inside the settings collection

/** Load settings into the form */
async function loadSettings() {
  try {
    const snapshot = await getDocs(collection(db, "settings"));
    if (!snapshot.empty) {
      const docSnap = snapshot.docs[0];
      settingsDocId = docSnap.id;
      const settings = docSnap.data();
      document.getElementById("setting-whatsapp").value = settings.whatsappNumber || "";
      document.getElementById("setting-bank-name").value = settings.bankName || "";
      document.getElementById("setting-account-name").value = settings.accountName || "";
      document.getElementById("setting-account-number").value = settings.accountNumber || "";
      document.getElementById("setting-announcement").value = settings.announcement || "";
    }
  } catch (error) {
    console.error("Failed to load settings:", error);
    showToast("Could not load settings.");
  }
}

/** Save settings (update existing doc, or create the first one) */
document.getElementById("settings-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  const settings = {
    whatsappNumber: document.getElementById("setting-whatsapp").value.trim(),
    bankName: document.getElementById("setting-bank-name").value.trim(),
    accountName: document.getElementById("setting-account-name").value.trim(),
    accountNumber: document.getElementById("setting-account-number").value.trim(),
    announcement: document.getElementById("setting-announcement").value.trim(),
  };

  try {
    if (settingsDocId) {
      await updateDoc(doc(db, "settings", settingsDocId), settings);
    } else {
      const docRef = await addDoc(collection(db, "settings"), settings);
      settingsDocId = docRef.id;
    }
    showToast("Settings saved ✅");
  } catch (error) {
    console.error("Failed to save settings:", error);
    showToast("Could not save settings. Please try again.");
  }
});

/* ==========================================================================
 * 9. INITIALIZATION
 * ========================================================================== */

/** Load everything the dashboard needs (called after sign-in) */
function loadAllData() {
  loadOrders();
  loadMessages();
  loadSettings();
  loadManageProducts();
}

/** One starter product form + footer year */
document.getElementById("footer-year").textContent = new Date().getFullYear();
addProductForm();

/** Wire the "Add New Product" button on the Manage Products tab */
document.getElementById("add-product-from-manage-btn").addEventListener("click", () => {
  document.getElementById("tab-manage-products").classList.remove("hidden");
  const manageBtn = document.querySelector('[data-tab="tab-manage-products"]');
  manageBtn?.classList.add("border-gold", "text-ink");
  manageBtn?.classList.remove("border-transparent", "text-ink/60");
  loadManageProducts();
  // Open Add Products tab so the user can actually add the product
  document.querySelector('[data-tab="tab-products"]')?.click();
});
