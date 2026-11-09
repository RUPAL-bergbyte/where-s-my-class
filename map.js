// ---------- 1. SHARED DATA ----------
let locations = [];
const markers = [];        // markers[i] belongs to locations[i]
let activeType = "all";

const typeColors = { entrance: "#b6f03c", building: "#2f6bff", lab: "#a855f7",
                     tree: "#22c55e", facility: "#fb923c" };
const typeNames = { entrance: "Entrance", building: "Building", lab: "Lab",
                    tree: "Green zone", facility: "Facility" };

// ---------- 2. MAP SETUP ----------
const map = L.map("map").setView([23.2499, 77.5265], 17);

const darkMap = L.tileLayer("https://tile.openstreetmap.de/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors", maxZoom: 19, className: "dark-tiles"
});
const streetMap = L.tileLayer("https://tile.openstreetmap.de/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors", maxZoom: 19
});
const satelliteMap = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  { attribution: "Tiles &copy; Esri", maxZoom: 19 }
);
darkMap.addTo(map);
L.control.layers({ "Dark Map": darkMap, "Street Map": streetMap, "Satellite View": satelliteMap }).addTo(map);

function getIcon(type) {
  const color = typeColors[type] || "#2f6bff";
  return L.divIcon({
    className: "custom-marker",
    html: `<div style="background:${color};width:18px;height:18px;border:3px solid white;
           border-radius:50%;box-shadow:0 0 12px ${color};"></div>`,
    iconSize: [24, 24], iconAnchor: [12, 12]
  });
}

// ---------- 3. LOAD DATA, THEN BUILD MARKERS ----------
function addMarkers() {
  locations.forEach(function (place, i) {
    const marker = L.marker([place.lat, place.lng], { icon: getIcon(place.type) }).addTo(map);
    marker.bindPopup(`
      <b>${place.name}</b><br>
      ${place.description}<br>
      <button class="route-btn" onclick="showRoute(${i})">Get walking route</button>
    `);
    markers.push(marker);
  });

  document.getElementById("statPlaces").textContent = locations.length;
  document.querySelectorAll("[data-count]").forEach(function (el) {
    el.textContent = locations.filter(p => p.type === el.dataset.count).length;
  });

  applyFilters(true);
}

fetch("data/locations.json")
  .then(response => response.json())
  .then(function (data) {
    locations = data;
    addMarkers();
  })
  .catch(function () {
    document.getElementById("searchMessage").textContent =
      "Could not load campus data. Open the site with Live Server.";
  });

// ---------- 4. ROUTING ----------
let routeControl = null;
let fallbackLine = null;

function clearRoute() {
  if (routeControl) { map.removeControl(routeControl); routeControl = null; }
  if (fallbackLine) { map.removeLayer(fallbackLine); fallbackLine = null; }
}

function getStart(callback) {
  const info = document.getElementById("routeInfo");
  const entrance = L.latLng(locations[0].lat, locations[0].lng);

  if (document.getElementById("startSelect").value === "gps") {
    if (!navigator.geolocation) {
      info.textContent = "GPS not available. Starting from Main Entrance instead.";
      callback(entrance);
      return;
    }
    info.textContent = "Finding your location...";
    navigator.geolocation.getCurrentPosition(
      pos => callback(L.latLng(pos.coords.latitude, pos.coords.longitude)),
      () => {
        info.textContent = "Could not get GPS. Starting from Main Entrance instead.";
        callback(entrance);
      }
    );
  } else {
    callback(entrance);
  }
}

function showRoute(index) {
  const dest = locations[index];
  const info = document.getElementById("routeInfo");

  getStart(function (start) {
    clearRoute();
    const end = L.latLng(dest.lat, dest.lng);

    routeControl = L.Routing.control({
      waypoints: [start, end],
      router: L.Routing.osrmv1({
        serviceUrl: "https://routing.openstreetmap.de/routed-foot/route/v1",
        profile: "driving"
      }),
      show: false,
      addWaypoints: false,
      draggableWaypoints: false,
      routeWhileDragging: false,
      fitSelectedRoutes: true,
      createMarker: () => null,
      lineOptions: { styles: [{ color: "#2f6bff", weight: 7, opacity: 0.95 }] }
    }).addTo(map);

    routeControl.on("routesfound", function (e) {
      const s = e.routes[0].summary;
      const metres = Math.round(s.totalDistance);
      const mins = Math.max(1, Math.round(s.totalTime / 60));
      info.textContent = `Route to ${dest.name}: ${metres} m, about ${mins} min walk`;
    });

    routeControl.on("routingerror", function () {
      fallbackLine = L.polyline([start, end],
        { color: "#2f6bff", weight: 5, dashArray: "10 10" }).addTo(map);
      map.fitBounds(fallbackLine.getBounds(), { padding: [40, 40] });
      info.textContent = `Straight-line view to ${dest.name} (walking route unavailable)`;
    });
  });
}

// ---------- 5. SEARCH, FILTERS AND PLACE LIST ----------
function getVisible() {
  const q = document.getElementById("searchInput").value.trim().toLowerCase();
  const result = [];
  locations.forEach(function (p, i) {
    const typeOk = activeType === "all" || p.type === activeType;
    const textOk = q === "" ||
      (p.name + " " + p.keywords + " " + p.description).toLowerCase().includes(q);
    if (typeOk && textOk) result.push(i);
  });
  return result;
}

function renderList(visible) {
  const list = document.getElementById("placeList");
  list.innerHTML = "";

  visible.forEach(function (i) {
    const p = locations[i];
    const item = document.createElement("li");
    item.className = "place-item";
    item.innerHTML = `
      <span class="place-dot" style="background:${typeColors[p.type] || "#2f6bff"}"></span>
      <div>
        <div class="place-name">${p.name}</div>
        <div class="place-desc">${p.description}</div>
      </div>`;
    item.addEventListener("click", () => focusPlace(i));
    list.appendChild(item);
  });
}

function applyFilters(shouldFit) {
  const visible = getVisible();
  const message = document.getElementById("searchMessage");

  markers.forEach(function (m, i) {
    if (visible.includes(i)) map.addLayer(m); else map.removeLayer(m);
  });

  renderList(visible);

  if (visible.length === 0) {
    message.textContent = "No places match. Try canteen, science or lab.";
  } else {
    message.textContent = visible.length + (visible.length === 1 ? " place found" : " places found");
  }

  if (shouldFit && visible.length > 0) {
    map.fitBounds(L.latLngBounds(visible.map(i => markers[i].getLatLng())),
                  { padding: [60, 60], maxZoom: 18 });
  }
}

function goToMap() {
  document.getElementById("explore").scrollIntoView({ behavior: "smooth", block: "start" });
}

function focusPlace(i) {
  map.flyTo(markers[i].getLatLng(), 19, { duration: 0.8 });
  setTimeout(() => markers[i].openPopup(), 850);
}

function searchCampus() {
  if (locations.length === 0) {
    document.getElementById("searchMessage").textContent = "Campus data is still loading.";
    return;
  }
  applyFilters(true);
  const visible = getVisible();
  if (visible.length === 1) focusPlace(visible[0]);
}

function setChip(type) {
  document.querySelectorAll(".chip").forEach(c =>
    c.classList.toggle("active", c.dataset.type === type));
  activeType = type;
}

document.getElementById("searchInput").addEventListener("input", () => applyFilters(false));
document.getElementById("searchBtn").addEventListener("click", searchCampus);

document.querySelectorAll(".chip").forEach(function (chip) {
  chip.addEventListener("click", function () {
    setChip(chip.dataset.type);
    applyFilters(true);
  });
});

// ---------- 6. AUTOCOMPLETE (new in Step 3) ----------

// Finds up to 5 places for the typed text, best matches first
function findMatches(text) {
  const q = text.trim().toLowerCase();
  if (q === "") return [];

  const results = [];
  locations.forEach(function (p, i) {
    const name = p.name.toLowerCase();
    const other = (p.keywords + " " + p.description).toLowerCase();
    let score = 0;
    if (name.startsWith(q)) score = 3;         // "can" -> Canteen
    else if (name.includes(q)) score = 2;      // "science" -> New Science Building
    else if (other.includes(q)) score = 1;     // "food" -> Canteen (keyword)
    if (score > 0) results.push({ i: i, score: score });
  });

  results.sort((a, b) => b.score - a.score || locations[a.i].name.localeCompare(locations[b.i].name));
  return results.slice(0, 5).map(r => r.i);
}

// Wraps the matching part of the name in <mark> so it shows highlighted
function highlight(name, text) {
  const q = text.trim().toLowerCase();
  const at = name.toLowerCase().indexOf(q);
  if (q === "" || at === -1) return name;
  return name.slice(0, at) + "<mark>" + name.slice(at, at + q.length) + "</mark>" + name.slice(at + q.length);
}

// Adds a suggestion dropdown to any text box.
//   onPick(i)  runs when a suggestion is chosen
//   onEnter()  runs when Enter is pressed with no suggestion selected (optional)
function attachAutocomplete(input, onPick, onEnter) {
  const box = document.createElement("ul");
  box.className = "suggest";
  box.hidden = true;
  input.parentElement.appendChild(box);

  let items = [];     // place numbers currently suggested
  let active = -1;    // which suggestion is highlighted by keyboard

  function close() { box.hidden = true; active = -1; }

  function paintActive() {
    Array.from(box.children).forEach((li, n) => li.classList.toggle("active", n === active));
  }

  function pick(i) {
    close();
    onPick(i);
  }

  function render() {
    const text = input.value;
    items = findMatches(text);
    box.innerHTML = "";
    active = -1;

    if (text.trim() === "") { box.hidden = true; return; }

    if (items.length === 0) {
      box.innerHTML = '<li class="suggest-empty">No place found. Try canteen or science.</li>';
      box.hidden = false;
      return;
    }

    items.forEach(function (i) {
      const p = locations[i];
      const li = document.createElement("li");
      li.className = "suggest-item";
      li.innerHTML = `
        <span class="place-dot" style="background:${typeColors[p.type] || "#2f6bff"}"></span>
        <span class="suggest-name">${highlight(p.name, text)}</span>
        <span class="suggest-type">${typeNames[p.type] || p.type}</span>`;
      // mousedown (not click) so it fires before the box loses focus
      li.addEventListener("mousedown", function (e) { e.preventDefault(); pick(i); });
      box.appendChild(li);
    });
    box.hidden = false;
  }

  input.addEventListener("input", render);
  input.addEventListener("focus", render);
  input.addEventListener("blur", close);

  input.addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown" && items.length) {
      e.preventDefault();
      active = (active + 1) % items.length;
      paintActive();
    } else if (e.key === "ArrowUp" && items.length) {
      e.preventDefault();
      active = (active - 1 + items.length) % items.length;
      paintActive();
    } else if (e.key === "Escape") {
      close();
    } else if (e.key === "Enter") {
      if (active >= 0) {
        e.preventDefault();          // stops the form from submitting
        pick(items[active]);
      } else if (onEnter) {
        close();
        onEnter();
      }
    }
  });
}

// Chosen from the panel search box: show that place on the map
attachAutocomplete(
  document.getElementById("searchInput"),
  function (i) {
    setChip("all");
    document.getElementById("searchInput").value = locations[i].name;
    applyFilters(false);
    focusPlace(i);
  },
  searchCampus
);

// Chosen from the big hero search box: scroll to the map, then show the place
attachAutocomplete(
  document.getElementById("heroInput"),
  function (i) {
    setChip("all");
    document.getElementById("heroInput").value = locations[i].name;
    document.getElementById("searchInput").value = locations[i].name;
    applyFilters(false);
    goToMap();
    setTimeout(() => focusPlace(i), 600);
  }
  // no onEnter: pressing Enter submits the hero form, handled below
);

// ---------- 7. HERO SEARCH AND CATEGORY CARDS ----------
function heroSearch(word) {
  setChip("all");
  document.getElementById("searchInput").value = word;
  goToMap();
  setTimeout(searchCampus, 500);
}

document.getElementById("heroForm").addEventListener("submit", function (e) {
  e.preventDefault();
  heroSearch(document.getElementById("heroInput").value.trim());
});

document.querySelectorAll(".hero-quick button").forEach(function (btn) {
  btn.addEventListener("click", () => heroSearch(btn.dataset.q));
});

document.querySelectorAll(".cat").forEach(function (card) {
  card.addEventListener("click", function () {
    document.getElementById("searchInput").value = "";
    setChip(card.dataset.type);
    goToMap();
    setTimeout(() => applyFilters(true), 500);
  });
});