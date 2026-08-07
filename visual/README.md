# Visual assets

Extracted from `docs/VELO-PITCH-EN-ES.pptx` (the other two decks,
`VELO-FAQ-EN.pptx` and `VELO-FAQ-ES.pptx`, contain no images at all —
their `ppt/media/` folders are empty).

The deck embeds 30 image files, but only **three are distinct**: the same
backgrounds repeated across slides. They are flat textured backgrounds,
not diagrams or screenshots.

| File | Used on | Sampled colour | Design token |
|---|---:|---|---|
| `background-pergamino.jpg` | 22 slides | `#EBE5D8` | `pergamino` — the public side |
| `background-velo.jpg` | 7 slides | `#3C414E` | `velo` — the private, veiled side |
| `background-sello.jpg` | 1 slide | `#8D3D32` | `sello` — the single saturated accent |

Worth noting: those sampled values land within a couple of points of the
palette written down before the deck existed (`#EDE7DA`, `#3A3F4B`,
`#8B3A2F`). The deck and the interface are drawing from the same system
rather than each inventing one.

Also here:

- `../docs/velo-architecture.html` — standalone architecture diagram.
  The README's Mermaid version is the one GitHub renders inline; this is
  the richer standalone page.

## What is not here

No screenshots of the running UI, and no rendered slide images. If the
demo video needs stills, they have to be captured from the live app —
exporting slides to PNG from the `.pptx` would produce pictures of the
deck, not of the product.
