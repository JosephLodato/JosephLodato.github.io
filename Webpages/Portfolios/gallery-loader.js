// gallery-loader.js
// Fetches images from the Cloudflare Worker, groups them into headed
// sections by Cloudinary subfolder, and builds the grid + wires up the
// existing lightbox. Drop this in after your existing lightbox <script>
// (or merge it in) on each gallery page.

const WORKER_URL = "https://restless-sea-9979.mainejoey.workers.dev";

// Turns a raw subfolder path into a display title.
// e.g. "portfolio/action/citrus-racing" -> "Citrus Racing"
function titleFromFolder(folderPath, topFolder) {
  const rest = folderPath.slice(topFolder.length).replace(/^\/+/, "");
  if (!rest) return null; // image sits directly in the top folder, no subsection
  const lastSegment = rest.split("/").pop();
  return lastSegment
    .replace(/[-_]+/g, " ")
    .replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1));
}

async function loadGallery(topFolder, gridContainerId, sectionOrder = []) {
  const container = document.getElementById(gridContainerId);
  container.innerHTML = '<p class="gallery-loading">Loading photos…</p>';

  let images;
  try {
    const res = await fetch(`${WORKER_URL}/?folder=${encodeURIComponent(topFolder)}`);
    const data = await res.json();
    images = data.images || [];
  } catch (err) {
    container.innerHTML = '<p class="gallery-loading">Couldn\'t load photos — try refreshing.</p>';
    console.error("Gallery load failed:", err);
    return;
  }

  if (images.length === 0) {
    container.innerHTML = '<p class="gallery-loading">No photos here yet.</p>';
    return;
  }

  // Group images by subsection title. Images with no subsection (sitting
  // directly in the top folder) go in a group keyed by null, rendered first
  // with no header.
  const groups = new Map();
  images.forEach((img) => {
    const title = titleFromFolder(img.folder || "", topFolder);
    if (!groups.has(title)) groups.set(title, []);
    groups.get(title).push(img);
  });

  container.innerHTML = "";

  // Render ungrouped images first (no header), then named sections.
  // If sectionOrder was passed in, honor it exactly; any section not
  // listed there falls in afterward, in default (first-seen) order.
  const orderedKeys = [...groups.keys()].sort((a, b) => {
    if (a === null) return -1;
    if (b === null) return 1;
    const aIndex = sectionOrder.indexOf(a);
    const bIndex = sectionOrder.indexOf(b);
    if (aIndex === -1 && bIndex === -1) return 0; // neither listed, keep as-is
    if (aIndex === -1) return 1;  // unlisted sections go after listed ones
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });

  let frameNumber = 0;

  orderedKeys.forEach((title) => {
    const section = document.createElement("div");
    section.className = "gallery-section";

    if (title) {
      const heading = document.createElement("h2");
      heading.className = "gallery-section-title";
      heading.textContent = title;
      section.appendChild(heading);
    }

    const grid = document.createElement("div");
    grid.className = "grid-wrapper";

    groups.get(title).forEach((img) => {
      frameNumber += 1;
      const item = document.createElement("div");
      item.className = "grid-item";
      item.dataset.frame = String(frameNumber).padStart(3, "0");
      item.innerHTML = `
        <img src="${img.url}" alt="${img.publicId}">
        <div class="grid-item-overlay"><span class="grid-item-expand">View ↗</span></div>
      `;
      grid.appendChild(item);
    });

    section.appendChild(grid);
    container.appendChild(section);
  });

  // Photo count across all sections
  const countEl = document.getElementById("photo-count");
  if (countEl) countEl.textContent = images.length + " photos";

  initLightbox();
}

// Wires up the lightbox against whatever .grid-item elements currently
// exist in the DOM (flattened across all sections, in visual order — so
// prev/next moves through the whole page regardless of which section
// an image is in). Safe to call again after re-rendering the grid.
function initLightbox() {
  const items = Array.from(document.querySelectorAll(".grid-item"));
  const modal = document.getElementById("modal");
  const modalImg = document.getElementById("modal-img");
  const caption = document.getElementById("modal-caption");
  const counter = document.getElementById("modal-counter");
  let current = 0;

  function openModal(index) {
    current = index;
    const img = items[current].querySelector("img");
    modalImg.src = img.src;
    modalImg.alt = img.alt;
    caption.textContent = img.alt;
    counter.textContent = current + 1 + " / " + items.length;
    modal.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    modal.classList.remove("open");
    document.body.style.overflow = "";
  }

  function navigate(dir) {
    current = (current + dir + items.length) % items.length;
    const img = items[current].querySelector("img");
    modalImg.style.opacity = "0";
    setTimeout(() => {
      modalImg.src = img.src;
      modalImg.alt = img.alt;
      caption.textContent = img.alt;
      counter.textContent = current + 1 + " / " + items.length;
      modalImg.style.opacity = "1";
    }, 120);
  }

  modalImg.style.transition = "opacity 0.12s ease";

  items.forEach((item, i) => item.addEventListener("click", () => openModal(i)));

  document.getElementById("modal-close").onclick = closeModal;
  document.getElementById("modal-prev").onclick = () => navigate(-1);
  document.getElementById("modal-next").onclick = () => navigate(1);

  modal.onclick = (e) => {
    if (e.target === modal) closeModal();
  };

  document.onkeydown = (e) => {
    if (!modal.classList.contains("open")) return;
    if (e.key === "Escape") closeModal();
    if (e.key === "ArrowLeft") navigate(-1);
    if (e.key === "ArrowRight") navigate(1);
  };
}

// This file is shared across all gallery pages. Each page calls
// loadGallery(topFolder, gridContainerId) itself in a small inline
// <script> tag right after this file loads — see the bottom of each
// gallery HTML page for that one-line call.