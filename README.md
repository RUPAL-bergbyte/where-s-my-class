# Where's My Class? (LNCT Bhopal campus navigation)

Search any building, lab, classroom, toilet or office on the LNCT campus.
The site draws a walking route from the gate to the block, then gives
step-by-step directions inside it (entrance, stairs, floor, corridor, rooms you pass).

## Run it

Open the folder in VS Code and start **Live Server** on `index.html`.
Opening the file directly will not work because the data files are loaded with `fetch`.

## Folder layout

```
index.html            page structure
style.css             design
map.js                map, search, routing, indoor directions
data/locations.json   outdoor places (gate, blocks, canteen, ground...)
data/buildings.json   indoor data: every room of the Old Block and New Block
images/               photos (see images/README.txt for exact file names)
```

## How indoor directions work

`data/buildings.json` has one entry per block. Each room is a row:

```json
["F-14", "DSA Lab", "bottom", "data structures algorithms"]
```

`[room code, name, zone, optional search words]`

- **zone** is a stretch of corridor (`top`, `left`, `right`, `bottom`, `se`, `center` ...).
  The block's `zones` section holds the sentence to show for each zone, and which
  staircase to use.
- Rooms in the same zone are listed in walking order, so the site can say
  "Rooms along this stretch, in order: F-16(A) → F-15 → **F-14** → F-13".

To fix a direction, edit the sentence in `zones`. To add a room, add one row.

## Notes

- The Old Block is linked to the `old-science` pin and the New Block to `new-science`.
  Swap `locationId` in `buildings.json` if the pins are the other way round.
- Corridor wording was written from the floor-plan photos; walk each block once and correct anything that reads wrong.