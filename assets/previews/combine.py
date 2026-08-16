from PIL import Image
import numpy as np

latte = Image.open(r'D:\Vibe-Coding\dsh-catppuccin\screenshot-latte.png').convert('RGB')
frappe = Image.open(r'D:\Vibe-Coding\dsh-catppuccin\screenshot-frappe.png').convert('RGB')
macchiato = Image.open(r'D:\Vibe-Coding\dsh-catppuccin\screenshot-macchiato.png').convert('RGB')
mocha = Image.open(r'D:\Vibe-Coding\dsh-catppuccin\screenshot-mocha.png').convert('RGB')

W, H = latte.size
images_arr = [np.array(img) for img in [latte, frappe, macchiato, mocha]]

# For each pixel (y, x), determine strip index
# Strip boundary i at row y: x_boundary = i * W/4 - shift * (y/H)
# A pixel at (y, x) belongs to strip i if x_boundary_i <= x < x_boundary_{i+1}

total_shift = W // 4
y_coords = np.arange(H).reshape(-1, 1) / H  # (H, 1)
x_coords = np.arange(W).reshape(1, -1)       # (1, W)

# boundaries: shape (5, H, W) — 5 boundaries for 4 strips
boundaries = np.zeros((5, H, W))
for i in range(5):
    boundaries[i] = i * W / 4 - total_shift * y_coords

# For each pixel, find which strip: strip_index = number of boundaries that x >= boundary
# x_coords broadcast: (1, W) vs boundaries (5, H, W)
x_broad = np.broadcast_to(x_coords, (5, H, W))
strip_index = np.sum(x_broad >= boundaries, axis=0) - 1  # 0..3
strip_index = np.clip(strip_index, 0, 3)

# Stack all images: (4, H, W, 3)
stacked = np.stack(images_arr, axis=0)

# Gather: output[y, x] = stacked[strip_index[y,x], y, x]
output = stacked[strip_index, np.arange(H)[:, None], np.arange(W)[None, :]]

result = Image.fromarray(output.astype(np.uint8))
result.save(r'D:\Vibe-Coding\dsh-catppuccin\preview-combined.png', quality=95)
print("Done")
