// Our campus locations - each one has a name, coordinates, and description
const locations = [
  {
    name: "Main Entrance",
    lat: 23.251615,
    lng: 77.523494,
    description: "Main gate into LNCT campus"
  },
  {
    name: "Temple Entrance",
    lat: 23.251213,
    lng: 77.523988,
    description: "Entrance near the campus temple"
  },
  {
    name: "Bus Stop",
    lat: 23.251361,
    lng: 77.523198,
    description: "Campus bus stop"
  },
  {
    name: "Aryabhat Auditorium",
    lat: 23.250926,
    lng: 77.523613,
    description: "Entry to Aryabhat Auditorium"
  },
  {
    name: "Main Building",
    lat: 23.251568,
    lng: 77.524659,
    description: "Main entrance to the main academic building"
  }
];

// Create the map, centered on LNCT Bhopal
const map = L.map('map').setView([23.2143, 77.4341], 17);

// Add map tiles
L.tileLayer('https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 20
}).addTo(map);

// Loop through every location and add a marker for each one
locations.forEach(function (place) {
  const marker = L.marker([place.lat, place.lng]).addTo(map);
  marker.bindPopup(`<b>${place.name}</b><br>${place.description}`);
});