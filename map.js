// ---------- 1. SHARED DATA ----------
let locations = [];        // outdoor places (data/locations.json)
let buildings = {};        // indoor floor plans (data/buildings.json)
let rooms = [];            // flat list of every room, built from buildings
let planPos = {};          // room -> pin position(s) on its plan image, in % (data/plans.json)
const markers = [];        // markers[i] belongs to locations[i]
let activeType = "all";
const MAX_ROOM_ROWS = 40;

const typeColors = { entrance: "#b6f03c", building: "#2f6bff", lab: "#a855f7",
                     tree: "#22c55e", facility: "#fb923c", room: "#38bdf8" };
const typeNames = { entrance: "Entrance", building: "Building", lab: "Lab",
                    tree: "Green zone", facility: "Facility", room: "Room" };

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

// which building (if any) does this outdoor place stand for?
function buildingKeyFor(place) {
  return Object.keys(buildings).find(k => buildings[k].locationId === place.id) || null;
}

// ---------- 3. LOAD DATA, THEN BUILD MARKERS ----------
function addMarkers() {
  locations.forEach(function (place, i) {
    const marker = L.marker([place.lat, place.lng], { icon: getIcon(place.type) }).addTo(map);
    const bk = buildingKeyFor(place);
    const plansBtn = bk
      ? ` <button class="route-btn alt" onclick="showPlan('${bk}','G',true)">Floor plans</button>`
      : "";
    marker.bindPopup(`
      <b>${place.name}</b><br>
      ${place.description}<br>
      <button class="route-btn" onclick="showRoute(${i})">Get walking route</button>${plansBtn}
    `);
    markers.push(marker);
  });

  document.getElementById("statPlaces").textContent = locations.length;
  document.getElementById("statRooms").textContent = rooms.length;
  document.querySelectorAll("[data-count]").forEach(function (el) {
    el.textContent = locations.filter(p => p.type === el.dataset.count).length;
  });

  applyFilters(true);
}

// "F-08/09" also answers to "F-09"; "S-11(A)/12" also answers to "S-12"
function normCode(c) { return c.toLowerCase().replace(/[^a-z0-9]/g, ""); }
function codeAliases(code) {
  const list = [normCode(code)];
  const m = code.match(/^([A-Za-z]-)(\d+)(\(\w\))?\/(\d+)$/);
  if (m) {
    list.push(normCode(m[1] + m[2] + (m[3] || "")));
    list.push(normCode(m[1] + m[4]));
  }
  return list;
}

function buildRooms() {
  rooms = [];
  Object.keys(buildings).forEach(function (bk) {
    const b = buildings[bk];
    const locIdx = locations.findIndex(p => p.id === b.locationId);
    Object.keys(b.rooms).forEach(function (fk) {
      const fl = b.floors[fk];
      b.rooms[fk].forEach(function (r) {
        const code = r[0], name = r[1], zone = r[2], extra = r[3] || "";
        let kw = [code, name, extra, b.name, fl.name, fl.dept || "", fl.kw || ""].join(" ");
        if (/toilet/i.test(name)) kw += " washroom restroom bathroom wc";
        if (/lab/i.test(name)) kw += " laboratory";
        if (/class room/i.test(name)) kw += " classroom lecture";
        rooms.push({
          block: bk, floor: fk, code: code, name: name, zone: zone,
          locIdx: locIdx, codes: codeAliases(code), hay: kw.toLowerCase()
        });
      });
    });
  });
}

Promise.all([
  fetch("data/locations.json").then(r => r.json()),
  fetch("data/buildings.json").then(r => r.json()),
  fetch("data/plans.json").then(r => r.json()).catch(() => ({}))
])
  .then(function (res) {
    locations = res[0];
    buildings = res[1];
    planPos = res[2];
    buildRooms();
    addMarkers();
    renderPlans();
  })
  .catch(function () {
    document.getElementById("searchMessage").textContent =
      "Could not load campus data. Open the site with Live Server.";
  });

// ---------- 4. OUTDOOR ROUTING ----------
let routeControl = null;
let fallbackLine = null;

function clearRoute() {
  if (routeControl) { map.removeControl(routeControl); routeControl = null; }
  if (fallbackLine) { map.removeLayer(fallbackLine); fallbackLine = null; }
}

function getStart(callback) {
  const info = document.getElementById("routeInfo");
  const gate = locations.find(p => p.id === "main-entrance") || locations[0];
  const entrance = L.latLng(gate.lat, gate.lng);

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
  if (!dest) return;

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

// ---------- 5. INDOOR DIRECTIONS (new) ----------
function escapeHtml(s) {
  return s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// Builds the walking steps: outdoor leg -> entrance -> stairs -> corridor -> room
function indoorSteps(r) {
  const b = buildings[r.block];
  const fl = b.floors[r.floor];
  const z = b.zones[r.zone] || {};
  const ground = r.floor === "G";
  const steps = [];

  steps.push(`Walk to the ${b.name}. Follow the blue line on the map.`);
  steps.push(b.entry);

  if (!ground) {
    const stairText = b.stairs[z.stairs || "main"] || b.stairs.main;
    steps.push(`Take ${stairText} up to the ${fl.name}.`);
  }

  const walk = ground ? (z.g || z.up) : (z.up || z.g);
  if (walk) steps.push(walk);

  const mates = b.rooms[r.floor].filter(x => x[2] === r.zone).map(x => x[0]);
  if (mates.length > 1) {
    const chain = mates.map(c => c === r.code ? "**" + c + "**" : c).join(" → ");
    steps.push(`Rooms along this stretch, in order: ${chain}.`);
  }

  steps.push(`You have arrived: **${r.code}**, ${r.name}.`);
  return steps;
}

function renderIndoor(r) {
  const b = buildings[r.block];
  const fl = b.floors[r.floor];
  document.getElementById("indoorTitle").textContent = `${r.code} · ${r.name}`;
  document.getElementById("indoorMeta").textContent =
    `${b.name} · ${fl.name}` + (fl.dept ? ` · ${fl.dept}` : "");

  const list = document.getElementById("indoorSteps");
  list.innerHTML = "";
  indoorSteps(r).forEach(function (text) {
    const li = document.createElement("li");
    li.innerHTML = escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
    list.appendChild(li);
  });

  // small copy of the floor plan with the room ringed in red
  const stage = document.getElementById("indoorStage");
  const mini = document.getElementById("indoorImg");
  stage.hidden = false;
  mini.onerror = function () { stage.hidden = true; };
  mini.removeAttribute("src");
  mini.src = planFile(r.block, r.floor);
  drawPins(stage, r);
  stage.onclick = function () { showPlan(r.block, r.floor, true, r); };

  const planBtn = document.getElementById("indoorPlanBtn");
  planBtn.onclick = function () { showPlan(r.block, r.floor, true, r); };
  document.getElementById("indoorCard").hidden = false;
}

function openRoom(r) {
  if (r.locIdx >= 0) {
    showRoute(r.locIdx);
    markers[r.locIdx].addTo(map);
  }
  renderIndoor(r);
}

// ---------- 6. FLOOR PLAN BROWSER (new) ----------
let planBlock = "old";
let planFloor = "G";
let planHighlight = null;

function showPlan(block, floor, scroll, room) {
  planBlock = block;
  planFloor = floor;
  planHighlight = room || null;
  renderPlans();
  if (scroll) document.getElementById("plans").scrollIntoView({ behavior: "smooth", block: "start" });
}

function planFile(block, floor) {
  return `images/${block}-${buildings[block].floors[floor].slug}.jpg`;
}

// pulsing ring(s) over a plan image; positions are percentages so any image size works
function drawPins(stage, r) {
  stage.querySelectorAll(".plan-pin").forEach(p => p.remove());
  if (!r) return;
  (planPos[`${r.block}-${r.floor}-${r.code}`] || []).forEach(function (pt) {
    const pin = document.createElement("div");
    pin.className = "plan-pin";
    pin.style.left = pt[0] + "%";
    pin.style.top = pt[1] + "%";
    stage.appendChild(pin);
  });
}

function directionsFromPlan(r) {
  setChip("all");
  document.getElementById("searchInput").value = r.code + " " + r.name;
  applyFilters(false);
  goToMap();
  setTimeout(() => openRoom(r), 500);
}

function renderPlans() {
  const b = buildings[planBlock];
  if (!b) return;

  const blockBox = document.getElementById("planBlocks");
  blockBox.innerHTML = "";
  Object.keys(buildings).forEach(function (bk) {
    const btn = document.createElement("button");
    btn.className = "chip" + (bk === planBlock ? " active" : "");
    btn.textContent = buildings[bk].name;
    btn.addEventListener("click", () => showPlan(bk, planFloor in buildings[bk].floors ? planFloor : "G", false));
    blockBox.appendChild(btn);
  });

  const floorBox = document.getElementById("planFloors");
  floorBox.innerHTML = "";
  Object.keys(b.floors).forEach(function (fk) {
    const btn = document.createElement("button");
    btn.className = "chip" + (fk === planFloor ? " active" : "");
    btn.textContent = b.floors[fk].name;
    btn.addEventListener("click", () => showPlan(planBlock, fk, false));
    floorBox.appendChild(btn);
  });

  const fl = b.floors[planFloor];
  const stage = document.getElementById("planStage");
  const img = document.getElementById("planImg");
  const note = document.getElementById("planNote");
  const file = planFile(planBlock, planFloor);
  note.textContent = `${b.name} · ${fl.name}` + (fl.dept ? ` · ${fl.dept}` : "");
  stage.hidden = false;
  img.alt = `${b.name} ${fl.name} floor plan`;
  img.onerror = function () {
    stage.hidden = true;
    note.textContent = `${b.name} · ${fl.name}. Plan photo not added yet. Save it as ${file}`;
  };
  img.removeAttribute("src");
  img.src = file;
  drawPins(stage, planHighlight);

  const bar = document.getElementById("planBar");
  if (planHighlight) {
    document.getElementById("planBarText").textContent = `${planHighlight.code} · ${planHighlight.name}`;
    document.getElementById("planBarBtn").onclick = () => directionsFromPlan(planHighlight);
    bar.hidden = false;
  } else {
    bar.hidden = true;
  }

  const ul = document.getElementById("planRooms");
  ul.innerHTML = "";
  rooms.filter(r => r.block === planBlock && r.floor === planFloor).forEach(function (r) {
    const li = document.createElement("li");
    li.className = "plan-room" + (planHighlight && planHighlight.code === r.code ? " active" : "");
    li.innerHTML = `<b>${escapeHtml(r.code)}</b><span>${escapeHtml(r.name)}</span>`;
    li.addEventListener("click", function () {
      showPlan(planBlock, planFloor, false, r);
      stage.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    ul.appendChild(li);
  });
}

// ---------- 7. SEARCH, FILTERS AND PLACE LIST ----------
function tokensOf(q) { return q.split(/\s+/).filter(Boolean); }

function placeScore(p, q) {
  const name = p.name.toLowerCase();
  const other = (p.keywords + " " + p.description).toLowerCase();
  if (name.startsWith(q)) return 3;
  if (name.includes(q)) return 2;
  if (other.includes(q)) return 1;
  return 0;
}

function roomScore(r, q) {
  const qn = normCode(q);
  if (qn && r.codes.includes(qn)) return 5;
  if (qn.length >= 2 && r.codes.some(c => c.startsWith(qn))) return 4;
  if (r.name.toLowerCase().includes(q)) return 3;
  if (tokensOf(q).every(t => r.hay.includes(t))) return 2;
  return 0;
}

// what the panel list shows right now: { places: [i...], rooms: [room...] }
function getVisible() {
  const q = document.getElementById("searchInput").value.trim().toLowerCase();
  const places = [];
  const roomHits = [];

  locations.forEach(function (p, i) {
    const typeOk = activeType === "all" || p.type === activeType;
    const textOk = q === "" || placeScore(p, q) > 0 ||
      tokensOf(q).every(t => (p.name + " " + p.keywords + " " + p.description).toLowerCase().includes(t));
    if (typeOk && textOk) places.push(i);
  });

  // rooms only appear once the person types something (or picks the Rooms chip)
  if (q !== "" && (activeType === "all" || activeType === "room")) {
    rooms.forEach(function (r) {
      const s = roomScore(r, q);
      if (s > 0) roomHits.push({ r: r, s: s });
    });
    roomHits.sort((a, b) => b.s - a.s);
  }
  return { places: places, rooms: roomHits.map(h => h.r) };
}

function renderList(v) {
  const list = document.getElementById("placeList");
  list.innerHTML = "";

  v.places.forEach(function (i) {
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

  v.rooms.slice(0, MAX_ROOM_ROWS).forEach(function (r) {
    const b = buildings[r.block];
    const item = document.createElement("li");
    item.className = "place-item";
    item.innerHTML = `
      <span class="place-dot" style="background:${typeColors.room}"></span>
      <div>
        <div class="place-name">${escapeHtml(r.code)} · ${escapeHtml(r.name)}</div>
        <div class="place-desc">${b.name}, ${b.floors[r.floor].name}</div>
      </div>`;
    item.addEventListener("click", () => openRoom(r));
    list.appendChild(item);
  });
}

function applyFilters(shouldFit) {
  const v = getVisible();
  const message = document.getElementById("searchMessage");
  const q = document.getElementById("searchInput").value.trim();

  // markers: matching places, plus the buildings that contain matching rooms
  const show = new Set(v.places);
  v.rooms.forEach(r => { if (r.locIdx >= 0) show.add(r.locIdx); });
  markers.forEach(function (m, i) {
    if (show.has(i)) map.addLayer(m); else map.removeLayer(m);
  });

  renderList(v);

  const total = v.places.length + v.rooms.length;
  if (activeType === "room" && q === "") {
    message.textContent = "Type a room number (like F-14) or a lab name.";
  } else if (total === 0) {
    message.textContent = "No match. Try canteen, F-14, library or toilet.";
  } else if (v.rooms.length > MAX_ROOM_ROWS) {
    message.textContent = `${total} results. Showing the first ${MAX_ROOM_ROWS} rooms, type more to narrow down.`;
  } else {
    message.textContent = total + (total === 1 ? " result" : " results");
  }

  if (shouldFit && show.size > 0) {
    map.fitBounds(L.latLngBounds(Array.from(show).map(i => markers[i].getLatLng())),
                  { padding: [60, 60], maxZoom: 18 });
  }
}

function goToMap() {
  document.getElementById("explore").scrollIntoView({ behavior: "smooth", block: "start" });
}

function focusPlace(i) {
  markers[i].addTo(map);
  map.flyTo(markers[i].getLatLng(), 19, { duration: 0.8 });
  setTimeout(() => markers[i].openPopup(), 850);
}

function searchCampus() {
  if (locations.length === 0) {
    document.getElementById("searchMessage").textContent = "Campus data is still loading.";
    return;
  }
  applyFilters(true);
  const v = getVisible();
  if (v.places.length + v.rooms.length === 1) {
    if (v.places.length === 1) focusPlace(v.places[0]); else openRoom(v.rooms[0]);
  } else if (v.places.length === 0 && v.rooms.length > 0 && roomScore(v.rooms[0], document.getElementById("searchInput").value.trim().toLowerCase()) === 5 &&
             (v.rooms.length === 1 || roomScore(v.rooms[1], document.getElementById("searchInput").value.trim().toLowerCase()) < 5)) {
    openRoom(v.rooms[0]);   // an exact room number was typed
  }
}

function setChip(type) {
  document.querySelectorAll(".chip[data-type]").forEach(c =>
    c.classList.toggle("active", c.dataset.type === type));
  activeType = type;
}

document.getElementById("searchInput").addEventListener("input", () => applyFilters(false));
document.getElementById("searchBtn").addEventListener("click", searchCampus);

document.querySelectorAll(".chip[data-type]").forEach(function (chip) {
  chip.addEventListener("click", function () {
    setChip(chip.dataset.type);
    applyFilters(true);
  });
});

// ---------- 8. AUTOCOMPLETE (places AND rooms) ----------
function findMatches(text) {
  const q = text.trim().toLowerCase();
  if (q === "") return [];

  const results = [];
  locations.forEach(function (p, i) {
    const s = placeScore(p, q);
    if (s > 0) results.push({ kind: "place", ref: i, score: s, label: p.name });
  });
  rooms.forEach(function (r) {
    const s = roomScore(r, q);
    if (s > 0) results.push({ kind: "room", ref: r, score: s, label: r.code + " · " + r.name });
  });

  results.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  return results.slice(0, 6);
}

function highlight(label, text) {
  const q = text.trim().toLowerCase();
  const at = label.toLowerCase().indexOf(q);
  if (q === "" || at === -1) return escapeHtml(label);
  return escapeHtml(label.slice(0, at)) + "<mark>" + escapeHtml(label.slice(at, at + q.length)) + "</mark>" +
         escapeHtml(label.slice(at + q.length));
}

// onPick(item) runs when a suggestion is chosen; onEnter() when Enter is pressed with none selected
function attachAutocomplete(input, onPick, onEnter) {
  const box = document.createElement("ul");
  box.className = "suggest";
  box.hidden = true;
  input.parentElement.appendChild(box);

  let items = [];
  let active = -1;

  function close() { box.hidden = true; active = -1; }
  function paintActive() {
    Array.from(box.children).forEach((li, n) => li.classList.toggle("active", n === active));
  }
  function pick(item) { close(); onPick(item); }

  function render() {
    const text = input.value;
    items = findMatches(text);
    box.innerHTML = "";
    active = -1;

    if (text.trim() === "") { box.hidden = true; return; }

    if (items.length === 0) {
      box.innerHTML = '<li class="suggest-empty">No match. Try canteen, F-14 or library.</li>';
      box.hidden = false;
      return;
    }

    items.forEach(function (item) {
      const li = document.createElement("li");
      li.className = "suggest-item";
      let color, tag;
      if (item.kind === "place") {
        const p = locations[item.ref];
        color = typeColors[p.type] || "#2f6bff";
        tag = typeNames[p.type] || p.type;
      } else {
        const b = buildings[item.ref.block];
        color = typeColors.room;
        tag = b.name + " · " + b.floors[item.ref.floor].name;
      }
      li.innerHTML = `
        <span class="place-dot" style="background:${color}"></span>
        <span class="suggest-name">${highlight(item.label, text)}</span>
        <span class="suggest-type">${escapeHtml(tag)}</span>`;
      li.addEventListener("mousedown", function (e) { e.preventDefault(); pick(item); });
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
        e.preventDefault();
        pick(items[active]);
      } else if (onEnter) {
        close();
        onEnter();
      }
    }
  });
}

function labelOf(item) {
  return item.kind === "place" ? locations[item.ref].name : item.ref.code + " " + item.ref.name;
}

function openItem(item) {
  if (item.kind === "place") focusPlace(item.ref); else openRoom(item.ref);
}

// Panel search box
attachAutocomplete(
  document.getElementById("searchInput"),
  function (item) {
    setChip("all");
    document.getElementById("searchInput").value = labelOf(item);
    applyFilters(false);
    openItem(item);
  },
  searchCampus
);

// Hero search box: scroll to the map, then show the place or room
attachAutocomplete(
  document.getElementById("heroInput"),
  function (item) {
    setChip("all");
    document.getElementById("heroInput").value = labelOf(item);
    document.getElementById("searchInput").value = labelOf(item);
    applyFilters(false);
    goToMap();
    setTimeout(() => openItem(item), 600);
  }
);

// ---------- 9. HERO SEARCH AND CATEGORY CARDS ----------
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