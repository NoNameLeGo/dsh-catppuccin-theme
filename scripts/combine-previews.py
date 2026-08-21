"""Combine theme screenshots into slanted-split preview images.

Produces two composite images:
  combined.png        — 4 flavours (latte, frappe, macchiato, mocha)
  glass-combined.png  — 2 glass-mode flavours (glass-latte, glass-mocha)

Each pixel is taken from exactly one source image. The boundary between
adjacent strips is a diagonal line from top-right to bottom-left, shifted
by total_shift = W // 4 pixels (25 % of the image width).

Requires: Pillow, numpy  (pip install Pillow numpy)
"""

from PIL import Image
import numpy as np
from pathlib import Path

ASSETS = Path(__file__).resolve().parent.parent / "assets" / "previews"


def combine_slanted(names: list[str], output: str) -> None:
    """Combine *names* (source filenames inside ASSETS) into *output*."""
    images = [Image.open(ASSETS / n).convert("RGB") for n in names]
    W, H = images[0].size
    n = len(images)
    total_shift = W // 4  # slant amount (25 % of image width)

    # Pre-compute y-normalised coordinate column (H x 1)
    y_norm = np.arange(H, dtype=np.float64).reshape(-1, 1) / H   # shape (H, 1)
    x_coords = np.arange(W, dtype=np.float64).reshape(1, -1)      # shape (1, W)

    # For each strip boundary i (0..n) the x position at row y is:
    #   boundary_x(i, y) = i * W / n - total_shift * (y / H)
    # A pixel (y, x) belongs to strip k when:
    #   boundary_x(k, y) <= x  AND  x < boundary_x(k+1, y)
    boundaries = np.zeros((n + 1, H, W), dtype=np.float64)
    for i in range(n + 1):
        boundaries[i] = i * W / n - total_shift * y_norm  # broadcast (H,1) → (H,W)

    # Count how many boundaries are <= x for each pixel → strip index
    x_broad = np.broadcast_to(x_coords, (n + 1, H, W))
    strip_index = np.clip(
        np.sum(x_broad >= boundaries, axis=0) - 1, 0, n - 1
    )

    # Assemble: for each pixel, pick the pixel from the right source image
    stacked = np.stack([np.array(img) for img in images], axis=0)  # (n, H, W, 3)
    # Index trick: advanced indexing with strip_index selects the right slice
    output_arr = stacked[strip_index, np.arange(H)[:, None], np.arange(W)[None, :]]

    Image.fromarray(output_arr.astype(np.uint8)).save(ASSETS / output, quality=95)
    print(f"  saved {output}  ({W}×{H}, {n} strips, slant={total_shift}px)")


def main() -> None:
    ASSETS.mkdir(parents=True, exist_ok=True)

    print("→ 4-flavour combined preview …")
    combine_slanted(
        ["latte.png", "frappe.png", "macchiato.png", "mocha.png"],
        "combined.png",
    )

    print("→ 2-flavour glass combined preview …")
    combine_slanted(
        ["glass-latte.png", "glass-mocha.png"],
        "glass-combined.png",
    )

    print("Done.")


if __name__ == "__main__":
    main()