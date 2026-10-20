// ---------- 1. CAMPUS DATA ----------
// "keywords" is what the search box matches against
const locations = [
  { name: "Main Entrance", lat: 23.251615, lng: 77.523494, type: "entrance",
    description: "Main gate into LNCT campus", keywords: "gate entrance main" },
  { name: "New Science Building", lat: 23.249670, lng: 77.527634, type: "building",
    description: "New Science Building, LNCT campus",
    keywords: "science building academic block department classroom" },
  { name: "Old Science Building", lat: 23.249152, lng: 77.527682, type: "building",
    description: "Old Science Building, LNCT campus",
    keywords: "science building academic block department classroom" },
  { name: "Science Workshop", lat: 23.248610, lng: 77.527868, type: "lab",
    description: "Science workshop area", keywords: "workshop lab laboratory" },
  { name: "Canteen", lat: 23.250359, lng: 77.526792, type: "facility",
    description: "Campus canteen", keywords: "canteen cafeteria food" },
  { name: "Science Ground", lat: 23.249781, lng: 77.526253, type: "facility",
    description: "Ground near the Science Building", keywords: "ground playground" }
];

// ---------- 2. MAP SETUP ----------
const map = L.map("map");

const streetMap = L.tileLayer("https://tile.openstreetmap.de/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors", maxZoom: 19
});
const satelliteMap = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  { attribution: "Tiles &copy; Esri", maxZoom: 19 }
);
streetMap.addTo(map);
L.control.layers({ "Street Map": streetMap, "Satellite View": satelliteMap }).addTo(map);

function getIcon(type) {
  const colors = { entrance: "#16a34a", building: "#2563eb", lab: "#9333ea",
                   tree: "#15803d", facility: "#ea580c" };
  return L.divIcon({
    className: "custom-marker",
    html: `<div style="background:${colors[type] || "#2563eb"};width:18px;height:18px;
           border:3px solid white;border-radius:50%;box-shadow:0 1px 6px #555;"></div>`,
    iconSize: [24, 24], iconAnchor: [12, 12]
  });
}

// ---------- 3. MARKERS ----------
const markers = [];   // markers[i] belongs to locations[i]

locations.forEach(function (place, i) {
  const marker = L.marker([place.lat, place.lng], { icon: getIcon(place.type) }).addTo(map);
  marker.bindPopup(`
    <b>${place.name}</b><br>
    ${place.description}<br>
    <button class="route-btn" onclick="showRoute(${i})">Get walking route</button>
  `);
  markers.push(marker);
});

map.fitBounds(L.latLngBounds(locations.map(p => [p.lat, p.lng])),
              { padding: [30, 30], maxZoom: 18 });

// ---------- 4. ROUTING ----------
let routeControl = null;
let fallbackLine = null;

function clearRoute() {
  if (routeControl) { map.removeControl(routeControl); routeControl = null; }
  if (fallbackLine) { map.removeLayer(fallbackLine); fallbackLine = null; }
}

// Finds the start point: Main Entrance, or the phone/laptop GPS
function getStart(callback) {
  const info = document.getElementById("routeInfo");
  if (document.getElementById("startSelect").value === "gps") {
    if (!navigator.geolocation) {
      info.textContent = "GPS not available. Starting from Main Entrance instead.";
      callback(L.latLng(locations[0].lat, locations[0].lng));
      return;
    }
    info.textContent = "Finding your location...";
    navigator.geolocation.getCurrentPosition(
      pos => callback(L.latLng(pos.coords.latitude, pos.coords.longitude)),
      () => {
        info.textContent = "Could not get GPS. Starting from Main Entrance instead.";
        callback(L.latLng(locations[0].lat, locations[0].lng));
      }
    );
  } else {
    callback(L.latLng(locations[0].lat, locations[0].lng));
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
      // This server uses walking paths (the word "driving" in the URL is a quirk of it)
      router: L.Routing.osrmv1({
        serviceUrl: "https://routing.openstreetmap.de/routed-foot/route/v1",
        profile: "driving"
      }),
      show: false,               // hide the text directions panel
      addWaypoints: false,
      draggableWaypoints: false,
      routeWhileDragging: false,
      fitSelectedRoutes: true,
      createMarker: () => null,  // we already have our own markers
      lineOptions: { styles: [{ color: "#ff851b", weight: 6, opacity: 0.9 }] }
    }).addTo(map);

    routeControl.on("routesfound", function (e) {
      const s = e.routes[0].summary;
      const metres = Math.round(s.totalDistance);
      const mins = Math.max(1, Math.round(s.totalTime / 60));
      info.textContent = `Route to ${dest.name}: ${metres} m, about ${mins} min walk`;
    });

    // If the routing server fails, draw a simple straight dashed line instead
    routeControl.on("routingerror", function () {
      fallbackLine = L.polyline([start, end],
        { color: "#ff851b", weight: 5, dashArray: "10 10" }).addTo(map);
      map.fitBounds(fallbackLine.getBounds(), { padding: [40, 40] });
      info.textContent = `Straight-line view to ${dest.name} (walking route unavailable)`;
    });
  });
}

// ---------- 5. SEARCH (works with your friend's page) ----------
function searchCampus() {
  const input = document.getElementById("searchInput").value.trim().toLowerCase();
  const cards = document.querySelectorAll(".card");
  const message = document.getElementById("searchMessage");
  const mapSection = document.getElementById("campus-map");

  if (input === "") {
    message.textContent = "Please enter a campus location to search.";
    cards.forEach(c => c.hidden = false);
    return;
  }

  // a) Which cards match?
  let cardFound = false;
  cards.forEach(function (card) {
    const matches = card.dataset.place.includes(input);
    card.hidden = !matches;
    if (matches) cardFound = true;
  });

  // b) Which map locations match?
  const matches = [];
  locations.forEach(function (p, i) {
    if ((p.name + " " + p.keywords).toLowerCase().includes(input)) matches.push(i);
  });

  if (matches.length === 1) {
    cards.forEach(c => c.hidden = false);
    message.textContent = "Found: " + locations[matches[0]].name + ". Showing route on the map below.";
    mapSection.scrollIntoView({ behavior: "smooth" });
    showRoute(matches[0]);
  } else if (matches.length > 1) {
    cards.forEach(c => c.hidden = false);
    message.textContent = matches.length + " places match. Tap a marker on the map and choose a route.";
    clearRoute();
    map.fitBounds(L.latLngBounds(matches.map(i => markers[i].getLatLng())),
                  { padding: [60, 60], maxZoom: 18 });
    mapSection.scrollIntoView({ behavior: "smooth" });
  } else if (cardFound) {
    message.textContent = "Matching facilities are shown below. This place is not on the map yet.";
    document.getElementById("facilities").scrollIntoView({ behavior: "smooth" });
  } else {
    message.textContent = "No matching facility found. Try library, canteen, parking or department.";
  }
}

function quickSearch(word) {
  document.getElementById("searchInput").value = word;
  searchCampus();
}

document.getElementById("searchInput").addEventListener("keydown", function (e) {
  if (e.key === "Enter") searchCampus();
});

// Clicking a facility card searches for it too
document.querySelectorAll(".card").forEach(function (card) {
  card.addEventListener("click", function () {
    quickSearch(card.dataset.place.split(" ")[0]);
  });
});