/* ==========================================================================
 * Mummy K Kiddies Empire — Storefront Logic (js/main.js)
 * --------------------------------------------------------------------------
 * Pure frontend: Firebase Firestore (database) + Cloudinary (media uploads).
 * No backend / no Cloud Functions — security is handled by Firestore Rules
 * and manual admin verification (see README.md).
 *
 * FIRESTORE DATA SCHEMA (used by this app):
 *   products : { name, price, category, sizes: [], mediaUrl, mediaType, youtubeUrl, createdAt }
 *   orders   : { orderRef, orderType, customerName, customerPhone, customerAddress, items: [],
 *                subtotal, orderStatus, paymentStatus, paymentMethod, paymentProofUrl, createdAt }
 *                (orderType is "Order" for checkouts, "Booking" for pre-order item bookings)
 *   messages : { name, phone, orderRef, category, message, status, createdAt }
 *   settings : { whatsappNumber, bankName, accountName, accountNumber, announcement }
 * ========================================================================== */

import {
  firebaseConfig,
  cloudinary,
  whatsappNumber,
  defaultSettings,
} from "./config.js";
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

/* ==========================================================================
 * 1. FIREBASE INITIALIZATION
 * ========================================================================== */
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/* ==========================================================================
 * 2. SMALL HELPERS
 * ========================================================================== */

/** Format a number as Nigerian Naira, e.g. 2500 → "₦2,500" */
const formatNaira = (amount) =>
  "₦" + Number(amount || 0).toLocaleString("en-NG");

/** Show a quick toast message at the bottom of the screen */
let toastTimer = null;
function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add("hidden"), 3500);
}

/** Escape user-generated text before inserting into innerHTML (XSS safety) */
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}

/** Extract a YouTube video ID from common URL formats */
function getYouTubeId(url) {
  if (!url) return null;
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/
  );
  return match ? match[1] : null;
}

/** Modal open/close helpers */
const openModal = (id) => document.getElementById(id).classList.remove("hidden");
const closeModal = (id) => document.getElementById(id).classList.add("hidden");

/* ==========================================================================
 * 3. CART (localStorage)
 * Cart item shape: { id, name, price, size, quantity, mediaUrl, mediaType }
 * ========================================================================== */
const CART_KEY = "mummyk_cart";

function loadCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || [];
  } catch {
    return [];
  }
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  renderCart();
}

/** Add a product (with chosen size) to the cart */
function addToCart(product, size) {
  const cart = loadCart();
  // Same product + same size → just bump the quantity
  const existing = cart.find((item) => item.id === product.id && item.size === size);
  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({
      id: product.id,
      name: product.name,
      price: product.price,
      size: size || "",
      quantity: 1,
      mediaUrl: product.mediaUrl || "",
      mediaType: product.mediaType || "image",
    });
  }
  saveCart(cart);
  showToast(`${product.name} added to cart ✅`);
}

/** Update quantity of a cart item (by index) */
function updateQuantity(index, delta) {
  const cart = loadCart();
  if (!cart[index]) return;
  cart[index].quantity += delta;
  if (cart[index].quantity <= 0) cart.splice(index, 1);
  saveCart(cart);
}

/** Remove a cart item (by index) */
function removeItem(index) {
  const cart = loadCart();
  cart.splice(index, 1);
  saveCart(cart);
}

/** Total items count (for the header badge) */
const cartCount = () => loadCart().reduce((sum, item) => sum + item.quantity, 0);

/** Total price of the cart */
const cartTotal = () =>
  loadCart().reduce((sum, item) => sum + item.price * item.quantity, 0);

/** Re-render the cart drawer + badge */
function renderCart() {
  const cart = loadCart();
  const itemsContainer = document.getElementById("cart-items");
  const emptyNote = document.getElementById("cart-empty");

  // Header badge
  document.getElementById("cart-count").textContent = cartCount();

  // Empty state
  emptyNote.classList.toggle("hidden", cart.length > 0);

  // Items list
  itemsContainer.innerHTML = cart
    .map(
      (item, index) => `
      <div class="flex gap-3 rounded-2xl border border-ink/10 bg-white p-3">
        <div class="h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl bg-cream">
          ${
            item.mediaType === "video"
              ? `<video src="${escapeHtml(item.mediaUrl)}" class="h-full w-full object-cover" muted></video>`
              : `<img src="${escapeHtml(item.mediaUrl)}" alt="${escapeHtml(item.name)}" class="h-full w-full object-cover" />`
          }
        </div>
        <div class="flex flex-1 flex-col">
          <div class="flex items-start justify-between gap-2">
            <p class="text-sm font-semibold leading-tight">${escapeHtml(item.name)}</p>
            <button data-remove="${index}" class="cart-remove text-ink/40 transition hover:text-red-500" aria-label="Remove item">✕</button>
          </div>
          ${item.size ? `<p class="mt-0.5 text-xs text-ink/50">Size: ${escapeHtml(item.size)}</p>` : ""}
          <div class="mt-auto flex items-center justify-between">
            <div class="flex items-center gap-2 rounded-full border border-ink/10 px-2 py-1">
              <button data-qty="-1" data-index="${index}" class="qty-btn px-1 text-sm font-bold text-ink/60 hover:text-ink">−</button>
              <span class="text-xs font-semibold">${item.quantity}</span>
              <button data-qty="1" data-index="${index}" class="qty-btn px-1 text-sm font-bold text-ink/60 hover:text-ink">+</button>
            </div>
            <span class="text-sm font-bold text-ink">${formatNaira(item.price * item.quantity)}</span>
          </div>
        </div>
      </div>`
    )
    .join("");

  // Subtotal
  document.getElementById("cart-subtotal").textContent = formatNaira(cartTotal());

  // Wire up per-item buttons (event delegation on the container)
  itemsContainer.querySelectorAll(".qty-btn").forEach((btn) =>
    btn.addEventListener("click", () =>
      updateQuantity(Number(btn.dataset.index), Number(btn.dataset.qty))
    )
  );
  itemsContainer.querySelectorAll(".cart-remove").forEach((btn) =>
    btn.addEventListener("click", () => removeItem(Number(btn.dataset.remove)))
  );
}

/* ==========================================================================
 * 4. PRODUCTS — fetch from Firestore & render the grid
 * ========================================================================== */
let allProducts = []; // cached so filters don't re-fetch
let activeCategory = "All";
let searchQuery = ""; // text typed into the search box
let sortMode = "newest"; // newest | price-asc | price-desc

/** Combine category filter + search + sorting into the visible product list */
function getVisibleProducts() {
  let list =
    activeCategory === "All"
      ? [...allProducts]
      : allProducts.filter((p) => p.category === activeCategory);

  // Search by product name (case-insensitive)
  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    list = list.filter((p) => (p.name || "").toLowerCase().includes(query));
  }

  // Sort by price (low→high / high→low) or newest first
  if (sortMode === "price-asc") {
    list.sort((a, b) => (a.price || 0) - (b.price || 0));
  } else if (sortMode === "price-desc") {
    list.sort((a, b) => (b.price || 0) - (a.price || 0));
  } else {
    list.sort(
      (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0)
    );
  }

  return list;
}

/** Render the product grid for the selected category + search + sort */
function renderProducts() {
  const grid = document.getElementById("product-grid");
  const empty = document.getElementById("product-empty");
  const shareSection = document.getElementById("share-store-section");

  const filtered = getVisibleProducts();

  empty.classList.toggle("hidden", filtered.length > 0);
  // Show the Share the Store bar once there are products on the page to share
  if (shareSection) {
    shareSection.classList.toggle("hidden", filtered.length === 0);
  }

  grid.innerHTML = filtered
    .map((product) => {
      // Media: Cloudinary image or video
      let mediaHtml = "";
      if (product.mediaType === "video" && product.mediaUrl) {
        mediaHtml = `<video src="${escapeHtml(product.mediaUrl)}" controls playsinline
          class="aspect-square w-full object-cover"></video>`;
      } else if (product.mediaUrl) {
        mediaHtml = `<img src="${escapeHtml(product.mediaUrl)}" alt="${escapeHtml(product.name)}"
          class="aspect-square w-full object-cover" loading="lazy" />`;
      } else {
        mediaHtml = `<div class="flex aspect-square w-full items-center justify-center bg-cream text-3xl">🧸</div>`;
      }

      // Optional YouTube embed
      const ytId = getYouTubeId(product.youtubeUrl);
      const youtubeHtml = ytId
        ? `<div class="mt-3 aspect-video w-full overflow-hidden rounded-xl">
             <iframe src="https://www.youtube.com/embed/${ytId}" title="${escapeHtml(product.name)} video"
               class="h-full w-full" frameborder="0"
               allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
               allowfullscreen></iframe>
           </div>`
        : "";

      // Size dropdown (only when the product has sizes)
      const sizesHtml =
        product.sizes && product.sizes.length
          ? `<select class="size-select w-full rounded-xl border-2 border-ink/10 bg-white px-3 py-2 text-xs outline-none focus:border-gold">
              ${product.sizes
                .map((size) => `<option value="${escapeHtml(size)}">${escapeHtml(size)}</option>`)
                .join("")}
            </select>`
          : "";

      return `
      <article class="product-card flex flex-col overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-sm transition hover:shadow-lg">
        <div class="relative overflow-hidden">
          ${mediaHtml}
          <span class="absolute left-2 top-2 rounded-full bg-ink/80 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-gold">
            ${escapeHtml(product.category || "Others")}
          </span>
        </div>
        <div class="flex flex-1 flex-col p-3 sm:p-4">
          <h3 class="text-sm font-semibold leading-snug text-ink sm:text-base">${escapeHtml(product.name)}</h3>
          <p class="mt-1 font-display text-lg font-bold text-gold-dark">${formatNaira(product.price)}</p>
          ${youtubeHtml}
          <div class="mt-3 space-y-2">
            ${sizesHtml}
            <button class="add-to-cart-btn w-full rounded-full bg-ink px-4 py-2.5 text-xs font-bold text-gold transition hover:bg-gold hover:text-ink sm:text-sm">
              Add to Cart
            </button>
          </div>
        </div>
      </article>`;
    })
    .join("");

  // Wire "Add to Cart" buttons
  grid.querySelectorAll(".add-to-cart-btn").forEach((btn, index) => {
    btn.addEventListener("click", () => {
      const product = filtered[index];
      const card = btn.closest(".product-card");
      const sizeSelect = card.querySelector(".size-select");
      const size = sizeSelect ? sizeSelect.value : "";
      addToCart(product, size);
    });
  });
}

/** Fetch products from Firestore (sorted newest first) */
async function fetchProducts() {
  const loading = document.getElementById("product-loading");
  try {
    const snapshot = await getDocs(collection(db, "products"));
    allProducts = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));
    // Sort newest first (createdAt is a Firestore Timestamp)
    allProducts.sort(
      (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0)
    );
    loading.classList.add("hidden");
    renderProducts();
  } catch (error) {
    console.error("Failed to load products:", error);
    loading.classList.add("hidden");

    // On a real failure, still render whatever is cached (possibly empty) so the
    // page is usable and the Share bar can still appear once products do load.
    allProducts = allProducts || [];
    renderProducts();

    const toast =
      (error && (error.code === "permission-denied" || error.code === "unauthenticated"))
        ? "We couldn’t load products right now — please come back shortly."
        : "Could not load products. Check your internet and refresh.";
    showToast(toast);
  }
}

/** Category filter buttons */
function initCategoryFilters() {
  const buttons = document.querySelectorAll(".category-btn");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      activeCategory = btn.dataset.category;

      // Update active button styling
      buttons.forEach((b) => {
        b.classList.remove("border-ink", "bg-ink", "text-gold");
        b.classList.add("border-ink/15", "bg-white", "text-ink");
      });
      btn.classList.remove("border-ink/15", "bg-white", "text-ink");
      btn.classList.add("border-ink", "bg-ink", "text-gold");

      renderProducts();
    });
  });
}

/** Build the canonical share URL from the page's <link rel="canonical"> when present,
 * otherwise fall back to the current page. */
function canonicalShareUrl() {
  const canonical = document.querySelector('link[rel="canonical"]');
  const href =
    canonical && canonical.getAttribute("href"
    ) ? canonical.getAttribute("href") : window.location.href;

  // KeepQUERY-less URLs stable; resolve relatives against the page origin.
  try {
    return new URL(href, window.location.origin).href;
  } catch {
    return window.location.href;
  }
}

/** Copy-safe share message: store intro + the actual page link */
function shareMessageForWhatsApp() {
  const storeName =
    document.querySelector('meta[name="og:title"]')?.getAttribute("content") || document.title;
  const url = canonicalShareUrl();
  // Always include the link so the friend can open the store directly from the message.
  return `${storeName} — quality kids' clothes, shoes, bags and more.\n${url}`;
}

/** Wire the Share the Store buttons (WhatsApp, Facebook, Instagram) */
function wireShareButtons() {
  const url = canonicalShareUrl();

  // WhatsApp — "Share with a friend": pre-filled message that INCLUDES the store link.
  // No business phone number, so the customer picks the contact inside WhatsApp before sending.
  const shareWsBtn = document.getElementById("share-whatsapp-btn");
  if (shareWsBtn) {
    shareWsBtn.addEventListener("click", (e) => {
      e.preventDefault();

      const message = shareMessageForWhatsApp();
      const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
      window.open(whatsappUrl, "_blank");
    });
  }

  // Facebook — share the page URL (OG tags give title/description/image)
  const shareFbBtn = document.getElementById("share-facebook-btn");
  if (shareFbBtn) {
    shareFbBtn.addEventListener("click", (e) => {
      e.preventDefault();
      window.open(
        `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
        "_blank"
      );
    });
  }

  // Instagram — copy a share caption + link to clipboard, then notify the customer
  const shareIgBtn = document.getElementById("share-instagram-btn");
  if (shareIgBtn) {
    shareIgBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const caption =
        "Shop Mummy K Kiddies Empire — kids' clothes, shoes, bags & more.\n" + url;

      const copyLink = async () => {
        try {
          await navigator.clipboard.writeText(caption);
          showToast("Link copied — share it in Instagram!");
        } catch {
          // Fallback for older browsers / insecure origins
          const textarea = document.createElement("textarea");
          textarea.value = caption;
          textarea.setAttribute("readonly", "");
          textarea.style.position = "absolute";
          textarea.style.left = "-9999px";
          document.body.appendChild(textarea);
          textarea.select();
          try {
            document.execCommand("copy");
            showToast("Link copied — share it in Instagram!");
          } catch {
            showToast("Copy failed — please copy the link and share it on Instagram.");
          }
          document.body.removeChild(textarea);
        }
      };

      copyLink();
    });
  }
}

/** Search box + price sort dropdown */
function initSearchAndSort() {
  const searchInput = document.getElementById("product-search");
  const sortSelect = document.getElementById("product-sort");

  // Re-render live as the customer types
  searchInput.addEventListener("input", () => {
    searchQuery = searchInput.value.trim();
    renderProducts();
  });

  // Re-render when the sort order changes
  sortSelect.addEventListener("change", () => {
    sortMode = sortSelect.value;
    renderProducts();
  });
}

/* ==========================================================================
 * 5. SETTINGS — announcement banner, WhatsApp number, bank details
 * The settings doc lives at: settings/business
 * ========================================================================== */
let businessSettings = {
  whatsappNumber: defaultSettings.whatsappNumber,
  bankName: defaultSettings.bankName,
  accountName: defaultSettings.accountName,
  accountNumber: defaultSettings.accountNumber,
  announcement: defaultSettings.announcement,
};

async function fetchSettings() {
  try {
    const snapshot = await getDocs(collection(db, "settings"));
    if (!snapshot.empty) {
      businessSettings = { ...businessSettings, ...snapshot.docs[0].data() };
    }
  } catch (error) {
    console.error("Failed to load settings:", error);
  }

  // Announcement banner (Firestore settings win, config default otherwise)
  const bar = document.getElementById("announcement-bar");
  const announcement =
    businessSettings.announcement || defaultSettings.announcement;
  if (announcement) {
    bar.textContent = announcement;
    bar.classList.remove("hidden");
  }

  // Bank details in the checkout modal (Firestore settings win, config defaults otherwise)
  document.getElementById("bank-name-display").textContent =
    businessSettings.bankName || defaultSettings.bankName;
  document.getElementById("account-name-display").textContent =
    businessSettings.accountName || defaultSettings.accountName;
  document.getElementById("account-number-display").textContent =
    businessSettings.accountNumber || defaultSettings.accountNumber;
}

/* ==========================================================================
 * 6. CHECKOUT — create order, then WhatsApp or Bank Transfer
 * ========================================================================== */
let currentOrder = null; // the Firestore order we just created

/** Generate a unique order reference like MKE-2026-4821 */
function generateOrderRef() {
  const year = new Date().getFullYear();
  const random = Math.floor(1000 + Math.random() * 9000); // 4 digits
  return `MKE-${year}-${random}`;
}

/** STEP 1 — save the order to Firestore */
async function handleCheckoutSubmit(event) {
  event.preventDefault();
  const cart = loadCart();
  if (!cart.length) {
    showToast("Your cart is empty.");
    return;
  }

  const btn = document.getElementById("place-order-btn");
  btn.disabled = true;
  btn.textContent = "Placing order…";

  const order = {
    orderRef: generateOrderRef(),
    orderType: "Order",
    customerName: document.getElementById("customer-name").value.trim(),
    customerPhone: document.getElementById("customer-phone").value.trim(),
    customerAddress: document.getElementById("customer-address").value.trim(),
    items: cart.map(({ id, name, price, size, quantity }) => ({
      productId: id,
      name,
      price,
      size,
      quantity,
    })),
    subtotal: cartTotal(),
    orderStatus: "New",
    paymentStatus: "Unpaid",
    paymentMethod: "",
    paymentProofUrl: "",
    createdAt: serverTimestamp(),
  };

  try {
    const docRef = await addDoc(collection(db, "orders"), order);
    currentOrder = { ...order, id: docRef.id };

    // Move to the payment step
    document.getElementById("order-ref-display").textContent = order.orderRef;
    document.getElementById("checkout-step-details").classList.add("hidden");
    document.getElementById("checkout-step-payment").classList.remove("hidden");
    showToast(`Order ${order.orderRef} created ✅`);
  } catch (error) {
    console.error("Failed to save order:", error);
    showToast("Could not place order. Please try again.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Place Order";
  }
}

/** STEP 2a — WhatsApp order: update paymentMethod & open wa.me */
async function handleWhatsAppOrder() {
  if (!currentOrder) return;

  try {
    await updateDoc(doc(db, "orders", currentOrder.id), { paymentMethod: "WhatsApp" });
  } catch (error) {
    console.error("Failed to update payment method:", error);
  }

  const number = businessSettings.whatsappNumber || whatsappNumber;
  const lines = currentOrder.items.map(
    (item) =>
      `• ${item.name}${item.size ? ` (Size: ${item.size})` : ""} x${item.quantity} = ${formatNaira(
        item.price * item.quantity
      )}`
  );

  const message = [
    `🛍️ *New Order — Mummy K Kiddies Empire*`,
    ``,
    `*Order Ref:* ${currentOrder.orderRef}`,
    `*Name:* ${currentOrder.customerName}`,
    `*Phone:* ${currentOrder.customerPhone}`,
    `*Address:* ${currentOrder.customerAddress}`,
    ``,
    `*Items:*`,
    ...lines,
    ``,
    `*Total:* ${formatNaira(currentOrder.subtotal)}`,
    ``,
    `I would like to complete this order via WhatsApp. Thank you!`,
  ].join("\n");

  const waUrl = `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
  window.open(waUrl, "_blank");
  showToast("Opening WhatsApp…");
}

/** STEP 2b — Bank transfer: show bank details + Cloudinary proof upload */
function initProofUpload() {
  document.getElementById("upload-proof-btn").addEventListener("click", () => {
    if (!window.cloudinary) {
      showToast("Upload widget is still loading. Please try again.");
      return;
    }

    const widget = window.cloudinary.createUploadWidget(
      {
        cloudName: cloudinary.cloudName,
        uploadPreset: cloudinary.uploadPreset,
        folder: cloudinary.receiptFolder, // mummyk/receipts
        sources: ["local", "camera"],
        multiple: false,
        resourceType: "image",
        clientAllowedFormats: ["jpg", "jpeg", "png", "webp"],
        maxFileSize: 5_000_000, // 5 MB
      },
      async (error, result) => {
        if (error) {
          console.error("Cloudinary upload error:", error);
          showToast("Upload failed. Please try again.");
          return;
        }
        if (result && result.event === "success") {
          const proofUrl = result.info.secure_url;
          try {
            await updateDoc(doc(db, "orders", currentOrder.id), {
              paymentMethod: "Bank Transfer",
              paymentProofUrl: proofUrl,
              paymentStatus: "Proof Submitted",
            });
            const note = document.getElementById("payment-status-note");
            note.textContent =
              "✅ Proof of payment uploaded! We will verify and confirm your order shortly.";
            note.classList.remove("hidden");
            showToast("Proof of payment submitted ✅");
          } catch (err) {
            console.error("Failed to save proof:", err);
            showToast("Upload succeeded but saving failed. Please contact us.");
          }
        }
      }
    );

    widget.open();
  });
}

/** Also mark the order as Bank Transfer when that option is chosen (before proof) */
function markBankTransfer() {
  if (!currentOrder) return;
  updateDoc(doc(db, "orders", currentOrder.id), { paymentMethod: "Bank Transfer" }).catch(
    (error) => console.error("Failed to update payment method:", error)
  );
}

/** Finish checkout: clear cart & reset the modal for next time */
function finishCheckout() {
  saveCart([]); // empties the cart + updates badge
  currentOrder = null;
  closeModal("checkout-modal");

  // Reset modal to step 1 for the next order
  document.getElementById("checkout-step-payment").classList.add("hidden");
  document.getElementById("checkout-step-details").classList.remove("hidden");
  document.getElementById("payment-status-note").classList.add("hidden");
  document.getElementById("checkout-form").reset();
}

/* ==========================================================================
 * 7. MESSAGE / COMPLAINT FORM
 * ========================================================================== */
async function handleMessageSubmit(event) {
  event.preventDefault();
  const btn = document.getElementById("send-message-btn");
  btn.disabled = true;
  btn.textContent = "Sending…";

  try {
    await addDoc(collection(db, "messages"), {
      name: document.getElementById("msg-name").value.trim(),
      phone: document.getElementById("msg-phone").value.trim(),
      orderRef: document.getElementById("msg-order-ref").value.trim(),
      category: document.getElementById("msg-category").value,
      message: document.getElementById("msg-message").value.trim(),
      status: "New",
      createdAt: serverTimestamp(),
    });
    showToast("Message sent! We will get back to you soon ✅");
    document.getElementById("message-form").reset();
    closeModal("message-modal");
  } catch (error) {
    console.error("Failed to send message:", error);
    showToast("Could not send message. Please try again.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Send Message";
  }
}

/* ==========================================================================
 * 7b. ITEM BOOKING (PRE-ORDER) — save a booking record + hand off to WhatsApp
 * Works for shoes, clothes, bags and more (item type chosen in a dropdown).
 * Bookings live in the orders collection with orderType "Booking" so they are
 * visible in the admin Manage Orders table.
 * ========================================================================== */

/** Reset the booking modal for next time */
function resetBookingModal() {
  document.getElementById("booking-form").reset();
  document.getElementById("booking-form").classList.remove("hidden");
  document.getElementById("booking-success").classList.add("hidden");
}

/** Save the booking to Firestore, then open a pre-filled WhatsApp chat */
async function handleBookingSubmit(event) {
  event.preventDefault();
  const btn = document.getElementById("booking-submit-btn");
  btn.disabled = true;
  btn.textContent = "Saving booking…";

  const itemType = document.getElementById("book-item-type").value;
  const size = document.getElementById("book-size").value.trim();
  const quantity = Number(document.getElementById("book-quantity").value) || 1;
  const note = document.getElementById("book-note").value.trim();

  const booking = {
    orderRef: generateOrderRef(),
    orderType: "Booking",
    customerName: document.getElementById("book-name").value.trim(),
    customerPhone: document.getElementById("book-phone").value.trim(),
    customerAddress: "Enugu branch",
    items: [
      {
        productId: "",
        name: `${itemType} Booking`,
        price: 0,
        size,
        quantity,
      },
    ],
    subtotal: 0,
    orderStatus: "New",
    paymentStatus: "Unpaid",
    paymentMethod: "WhatsApp Booking",
    paymentProofUrl: "",
    note,
    createdAt: serverTimestamp(),
  };

  try {
    await addDoc(collection(db, "orders"), booking);

    // Show the reference on screen
    document.getElementById("booking-ref-display").textContent = booking.orderRef;
    document.getElementById("booking-form").classList.add("hidden");
    document.getElementById("booking-success").classList.remove("hidden");

    // Hand off to WhatsApp with the booking details
    const number = businessSettings.whatsappNumber || whatsappNumber;
    const message = [
      `🛍️ *${itemType} Booking — Mummy K Kiddies Empire*`,
      ``,
      `*Booking Ref:* ${booking.orderRef}`,
      `*Item:* ${itemType}`,
      `*Name:* ${booking.customerName}`,
      `*Phone:* ${booking.customerPhone}`,
      `*Size / Measurement:* ${size}`,
      `*Quantity:* ${quantity}`,
      ...(note ? [`*Note:* ${note}`] : []),
      ``,
      `I would like to book ${itemType.toLowerCase()} from the China 🇨🇳 → Nigeria 🇳🇬 shipment. Thank you!`,
    ].join("\n");

    window.open(
      `https://wa.me/${number}?text=${encodeURIComponent(message)}`,
      "_blank"
    );
    showToast(`Booking ${booking.orderRef} saved ✅`);
  } catch (error) {
    console.error("Failed to save booking:", error);
    showToast("Could not save booking. Please try again.");
  } finally {
    btn.disabled = false;
    btn.textContent = "📲 Book via WhatsApp";
  }
}

/** Wire the shoe booking modal */
function initBooking() {
  const open = () => openModal("booking-modal");
  document.getElementById("book-item-btn").addEventListener("click", open);
  document
    .getElementById("close-booking")
    .addEventListener("click", () => closeModal("booking-modal"));
  document
    .getElementById("booking-backdrop")
    .addEventListener("click", () => closeModal("booking-modal"));
  document
    .getElementById("close-booking-success")
    .addEventListener("click", () => {
      closeModal("booking-modal");
      resetBookingModal();
    });
  document
    .getElementById("booking-form")
    .addEventListener("submit", handleBookingSubmit);
}

/* ==========================================================================
 * 8. INITIALIZATION — wire up all events
 * ========================================================================== */
function init() {
  // Footer year
  document.getElementById("footer-year").textContent = new Date().getFullYear();

  // Cart drawer
  document.getElementById("cart-btn").addEventListener("click", () => openModal("cart-modal"));
  document.getElementById("close-cart").addEventListener("click", () => closeModal("cart-modal"));
  document.getElementById("cart-backdrop").addEventListener("click", () => closeModal("cart-modal"));

  // Checkout modal
  document.getElementById("checkout-btn").addEventListener("click", () => {
    if (!loadCart().length) {
      showToast("Your cart is empty.");
      return;
    }
    closeModal("cart-modal");
    openModal("checkout-modal");
  });
  document.getElementById("close-checkout").addEventListener("click", () => closeModal("checkout-modal"));
  document.getElementById("checkout-backdrop").addEventListener("click", () => closeModal("checkout-modal"));
  document.getElementById("checkout-form").addEventListener("submit", handleCheckoutSubmit);
  document.getElementById("done-checkout-btn").addEventListener("click", finishCheckout);

  // Payment options
  document.getElementById("whatsapp-btn").addEventListener("click", handleWhatsAppOrder);
  document.getElementById("upload-proof-btn").addEventListener("click", markBankTransfer);
  initProofUpload();

  // Message modal
  const openMessage = () => openModal("message-modal");
  document.getElementById("message-fab").addEventListener("click", openMessage);
  document.getElementById("footer-message-btn").addEventListener("click", openMessage);
  document.getElementById("close-message").addEventListener("click", () => closeModal("message-modal"));
  document.getElementById("message-backdrop").addEventListener("click", () => closeModal("message-modal"));
  document.getElementById("message-form").addEventListener("submit", handleMessageSubmit);

  // Load data + wire search, sorting and shoe booking
  initCategoryFilters();
  initSearchAndSort();
  wireShareButtons();
  initBooking();
  renderCart();
  fetchProducts();
  fetchSettings();
}

init();
