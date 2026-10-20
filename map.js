

const locations = [
  {
    name: "Main Entrance",
    lat: 23.251615,
    lng: 77.523494,
    type: "entrance",
    description: "Main gate into LNCT campus"
  },
  // Science campus locations
  {
    name: "New Science Building",
    lat: 23.249670,
    lng: 77.527634,
    type: "building",
    description: "New Science Building, LNCT campus"
  },
  {
    name: "Old Science Building",
    lat: 23.249152,
    lng: 77.527682,
    type: "building",
    description: "Old Science Building, LNCT campus"
  },
  {
    name: "Science Workshop",
    lat: 23.248610,
    lng: 77.527868,
    type: "lab",
    description: "Science workshop area"
  },
  {
    name: "Canteen",
    lat: 23.250359,
    lng: 77.526792,
    type: "facility",
    description: "Campus canteen"
  },
  {
    name: "Science Ground",
    lat: 23.249781,
    lng: 77.526253,
    type: "facility",
    description: "Ground near the Science Building"
  }
];


// Start the map near your existing campus locations
const map = L.map("map");

const streetMap = L.tileLayer(
  "https://tile.openstreetmap.de/{z}/{x}/{y}.png",
  {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19
  }
);

const satelliteMap = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  {
    attribution: "Tiles &copy; Esri",
    maxZoom: 19
  }
);

streetMap.addTo(map);

L.control.layers({
  "Street Map": streetMap,
  "Satellite View": satelliteMap
}).addTo(map);

// Different marker colours for different location types
function getIcon(type) {
  const colors = {
    entrance: "#16a34a",
    building: "#2563eb",
    lab: "#9333ea",
    tree: "#15803d",
    facility: "#ea580c"
  };

  return L.divIcon({
    className: "custom-marker",
    html: `<div style="
      background:${colors[type] || "#2563eb"};
      width:18px;
      height:18px;
      border:3px solid white;
      border-radius:50%;
      box-shadow:0 1px 6px #555;
    "></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });
}

// Keep every marker together with its place data so we can filter later
const markers = [];

locations.forEach(function (place) {
  const marker = L.marker(
    [place.lat, place.lng],
    { icon: getIcon(place.type) }
  ).addTo(map);

  marker.bindPopup(`
    <b>${place.name}</b><br>
    ${place.description}<br>
    <small>${place.lat}, ${place.lng}</small>
  `);

  markers.push({ place: place, marker: marker });
});

// ---------- Search and filter ----------
let activeType = "all";

function applyFilter() {
  const query = document.getElementById("searchInput").value.trim().toLowerCase();
  const message = document.getElementById("message");
  const visible = [];

  markers.forEach(function (item) {
    const p = item.place;
    const textMatch =
      p.name.toLowerCase().includes(query) ||
      p.description.toLowerCase().includes(query);
    const typeMatch = activeType === "all" || p.type === activeType;

    if (textMatch && typeMatch) {
      item.marker.addTo(map);        // show
      visible.push(item);
    } else {
      map.removeLayer(item.marker);  // hide
    }
  });

  if (visible.length === 0) {
    message.textContent = "No matching place found.";
  } else if (visible.length === 1) {
    message.textContent = "";
    map.setView(visible[0].marker.getLatLng(), 19);
    visible[0].marker.openPopup();
  } else {
    message.textContent = visible.length + " places found";
    const b = L.latLngBounds(visible.map(i => i.marker.getLatLng()));
    map.fitBounds(b, { padding: [40, 40], maxZoom: 18 });
  }
}

document.getElementById("searchBtn").addEventListener("click", applyFilter);

document.getElementById("searchInput").addEventListener("keyup", function (e) {
  if (e.key === "Enter") applyFilter();
});

document.querySelectorAll(".chip").forEach(function (chip) {
  chip.addEventListener("click", function () {
    document.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    activeType = chip.dataset.type;
    applyFilter();
  });
});
// Click anywhere to discover coordinates for a new place
map.on("click", function(event) {
  const lat = event.latlng.lat.toFixed(6);
  const lng = event.latlng.lng.toFixed(6);

  L.popup()
    .setLatLng(event.latlng)
    .setContent(`
      <b>Selected location</b><br>
      Latitude: ${lat}<br>
      Longitude: ${lng}<br>
      <button onclick="copyCoordinates('${lat}', '${lng}')">
        Copy coordinates
      </button>
    `)
    .openOn(map);
});

window.copyCoordinates = function(lat, lng) {
  const text = `${lat}, ${lng}`;

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text)
      .then(() => alert("Coordinates copied: " + text))
      .catch(() => prompt("Copy these coordinates:", text));
  } else {
    prompt("Copy these coordinates:", text);
  }
};
