# =============================================================================
# Road Mask Post-Processing — Google Colab Script
# =============================================================================
# Fixes the fat, broken DeepLabV3 segmentation mask in three steps:
#
#   Step 1 — Noise removal   : drop isolated blobs too small to be roads
#   Step 2 — Closing gaps    : morphological close bridges short breaks
#   Step 3 — Skeletonize     : extract 1-pixel-wide road centreline
#   Step 4 — Uniform width   : re-dilate to a clean, thin road width
#
# INPUT  : binary segmentation mask .tif from the DeepLab pipeline
# OUTPUT : cleaned mask .tif (same CRS/resolution), drop it in the same folder
#          and use it as the mask input for the classification stage
#
# Drive layout expected:
#   My Drive/fyp test/
#     data/segmentation masks/<mask>.tif
#     data/raw/<satellite>.tif          <- optional, used for overlay
# =============================================================================


# ── Section 1: Install dependencies ──────────────────────────────────────────
import subprocess, sys

def _pip(*pkgs):
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", *pkgs], check=True)

print("Installing …")
_pip("rasterio", "scikit-image", "opencv-python-headless", "matplotlib", "numpy", "scipy")
print("Ready.\n")


# ── Section 2: Mount Drive + configure ───────────────────────────────────────
from google.colab import drive
drive.mount("/content/drive")

from pathlib import Path
import numpy as np
import cv2
import rasterio
from skimage.morphology import skeletonize, remove_small_objects
import matplotlib.pyplot as plt

DRIVE_ROOT = Path("/content/drive/MyDrive/fyp test")

# ── TUNE THESE ──────────────────────────────────────────────────────────────
#
# MASK_PATH : set to None to auto-pick the first .tif in segmentation masks/
#             or set explicitly, e.g.:
#   MASK_PATH = DRIVE_ROOT / "data" / "segmentation masks" / "sindh_deeplab.tif"
MASK_PATH = None

# SAT_PATH  : satellite TIF for overlay visualisation (set None to skip)
SAT_PATH  = None

# CLOSE_KERNEL — how aggressively to bridge gaps.
#   At 10 m/px:  7 bridges ~70 m gaps,  11 → ~110 m,  15 → ~150 m
#   Start with 11; raise if roads still look broken, lower if unrelated roads merge.
CLOSE_KERNEL = 11

# ROAD_WIDTH_PX — final uniform road half-width in pixels after thinning.
#   At 10 m/px:  2 → 20 m width,  3 → 30 m,  4 → 40 m
#   The original DeepLab mask looks ~20-30 px wide; this makes it much thinner.
ROAD_WIDTH_PX = 3

# MIN_SEGMENT_PX — remove isolated blobs smaller than this (noise/buildings/etc.)
MIN_SEGMENT_PX = 100
# ─────────────────────────────────────────────────────────────────────────────

# Auto-detect paths
if MASK_PATH is None:
    seg_dir = DRIVE_ROOT / "data" / "segmentation masks"
    masks = sorted(seg_dir.glob("*.tif"))
    if not masks:
        raise FileNotFoundError(f"No .tif files in {seg_dir}")
    MASK_PATH = masks[0]

if SAT_PATH is None:
    raw_dir = DRIVE_ROOT / "data" / "raw"
    tifs = sorted(raw_dir.glob("*.tif"))
    SAT_PATH = tifs[0] if tifs else None

print(f"Mask      : {MASK_PATH.name}")
print(f"Satellite : {SAT_PATH.name if SAT_PATH else '(none — will use blank background)'}")
print(f"Settings  : close_kernel={CLOSE_KERNEL}px  road_width={ROAD_WIDTH_PX}px  min_blob={MIN_SEGMENT_PX}px\n")


# ── Section 3: Load mask ──────────────────────────────────────────────────────
with rasterio.open(MASK_PATH) as src:
    raw_mask  = src.read(1)
    profile   = src.profile.copy()
    transform = src.transform

binary = (raw_mask > 0).astype(np.uint8)
H, W   = binary.shape
pixel_m = abs(transform.a)     # pixel size in metres (from CRS transform)

print(f"Mask size : {H} × {W} pixels  ({H*pixel_m/1000:.1f} × {W*pixel_m/1000:.1f} km)")
print(f"Road px   : {binary.sum():,}  ({binary.mean()*100:.2f}% of image)")


# ── Section 4: Load satellite RGB for overlay ─────────────────────────────────
def _load_rgb(path, h, w):
    if path is None:
        return np.zeros((h, w, 3), dtype=np.uint8)
    with rasterio.open(path) as src:
        n = min(3, src.count)
        bands = src.read(list(range(1, n + 1))).astype(np.float32)
    rgb = np.zeros((h, w, 3), dtype=np.float32)
    for i in range(n):
        lo, hi = np.percentile(bands[i], 2), np.percentile(bands[i], 98)
        rgb[..., i] = np.clip((bands[i] - lo) / (hi - lo + 1e-6), 0, 1)
    return (rgb * 255).astype(np.uint8)

sat = _load_rgb(SAT_PATH, H, W)


def _overlay(rgb, mask, color=(0, 0, 0), alpha=0.85):
    """Paint a binary mask over an RGB image."""
    out = rgb.copy().astype(np.float32)
    for c, v in enumerate(color):
        out[..., c] = np.where(mask > 0, (1 - alpha) * out[..., c] + alpha * v, out[..., c])
    return out.clip(0, 255).astype(np.uint8)


# ── Section 5: Step 1 — Remove small isolated blobs ──────────────────────────
# Small blobs (rooftops, car shadows, noise) confuse closing and thinning.
print("Step 1 — Removing isolated noise blobs …")
no_noise = remove_small_objects(binary.astype(bool), min_size=MIN_SEGMENT_PX).astype(np.uint8)
print(f"  {binary.sum():,} → {no_noise.sum():,} road pixels  (removed {binary.sum()-no_noise.sum():,})\n")


# ── Section 6: Step 2 — Bridge gaps with morphological closing ────────────────
# Closing = dilate then erode.  Expands road regions to bridge short gaps,
# then contracts back.  Elliptical kernel handles diagonal roads better than square.
print("Step 2 — Closing connectivity gaps …")
close_k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (CLOSE_KERNEL, CLOSE_KERNEL))
closed  = cv2.morphologyEx(no_noise, cv2.MORPH_CLOSE, close_k)
print(f"  Road pixels after closing: {closed.sum():,}")
print(f"  (This bridged {closed.sum() - no_noise.sum():,} gap pixels)\n")


# ── Section 7: Step 3 — Skeletonize to 1-pixel centreline ────────────────────
# Skeletonize reduces the thick road blobs to their medial axis — a 1-px-wide
# line that passes exactly through the centre of each road segment.
print("Step 3 — Extracting road centreline (skeletonize) …")
skeleton = skeletonize(closed.astype(bool)).astype(np.uint8)
road_km  = skeleton.sum() * pixel_m / 1000
print(f"  Centreline: {skeleton.sum():,} px ≈ {road_km:.1f} km of road detected\n")


# ── Section 8: Step 4 — Dilate back to uniform thin road ─────────────────────
# The 1-px skeleton is accurate but invisible at full image scale.
# Re-dilate with a small, uniform kernel to get a consistent road width.
print("Step 4 — Dilating centreline to uniform road width …")
dil_size = ROAD_WIDTH_PX * 2 + 1    # e.g., width=3 → kernel 7×7
dil_k    = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (dil_size, dil_size))
thin_mask = cv2.dilate(skeleton, dil_k)
print(f"  Final road pixels: {thin_mask.sum():,}  (width ≈ {ROAD_WIDTH_PX*2+1} px = {(ROAD_WIDTH_PX*2+1)*pixel_m:.0f} m)\n")


# ── Section 9: Compare all stages ────────────────────────────────────────────
fig, axes = plt.subplots(2, 3, figsize=(20, 13))

axes[0, 0].imshow(_overlay(sat, binary));         axes[0, 0].set_title("Original DeepLab output",      fontsize=12)
axes[0, 1].imshow(_overlay(sat, no_noise));        axes[0, 1].set_title(f"After noise removal (min={MIN_SEGMENT_PX}px)", fontsize=12)
axes[0, 2].imshow(_overlay(sat, closed));          axes[0, 2].set_title(f"After closing  (kernel={CLOSE_KERNEL}px)", fontsize=12)
axes[1, 0].imshow(_overlay(sat, skeleton));        axes[1, 0].set_title("Centreline  (skeletonized)",  fontsize=12)
axes[1, 1].imshow(_overlay(sat, thin_mask));       axes[1, 1].set_title(f"Final cleaned mask  (width={ROAD_WIDTH_PX}px = {(ROAD_WIDTH_PX*2+1)*pixel_m:.0f}m)", fontsize=12)

# Side-by-side diff: before vs after
diff = np.zeros((H, W, 3), dtype=np.uint8)
diff[..., 0] = binary    * 255   # original  = red channel
diff[..., 2] = thin_mask * 255   # cleaned   = blue channel
# Red = removed pixels, Blue = kept pixels, Purple = overlap
axes[1, 2].imshow(diff)
axes[1, 2].set_title("Before (red) vs After (blue) overlay", fontsize=12)

for ax in axes.flat:
    ax.axis("off")
plt.suptitle(f"Road Mask Post-Processing  |  {MASK_PATH.name}", fontsize=14, fontweight="bold")
plt.tight_layout()
plt.show()


# ── Section 10: Save cleaned mask ────────────────────────────────────────────
out_profile = profile.copy()
out_profile.update(dtype=rasterio.uint8, count=1, nodata=None)

out_path = MASK_PATH.parent / (MASK_PATH.stem + "_postprocessed.tif")
with rasterio.open(out_path, "w", **out_profile) as dst:
    dst.write(thin_mask.astype(np.uint8), 1)

print(f"Saved → {out_path.relative_to(DRIVE_ROOT)}")
print()
print("Next steps:")
print("  1. Open the side-by-side panel above and adjust CLOSE_KERNEL / ROAD_WIDTH_PX if needed.")
print("  2. Once satisfied, use the _postprocessed.tif as the mask input for classification:")
print("     In road_pipeline_colab.py → set INPUT_MASK = DRIVE_ROOT / 'data' / 'segmentation masks' / '<mask>_postprocessed.tif'")
print("     (The pipeline currently auto-runs segmentation then classification; swap in this mask")
print("      before the classification stage to skip re-running DeepLab.)")
