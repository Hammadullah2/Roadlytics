# =============================================================================
# Road Condition V2 — Improved K-Means + EfficientNet Regression
# Google Colab Script
# =============================================================================
#
# PART A — K-Means v2 (improved spectral features)
#   Adds NDWI, EVI, and local texture to the feature set.
#   Uses k=4 clusters mapped to a 0-10 quality score via spectral quality ranking.
#   Does NOT require any trained model — outputs condition map immediately.
#
# PART B — EfficientNet Regression Training  (0–10 score per road patch)
#   Retains the same 4-channel input (B, G, R, NIR) + 32×32 patches.
#   Replaces the 3-class head with a single sigmoid×10 regression output.
#   Trains using Huber loss on pseudo-labels derived from PART A spectral scores.
#   Saves weights to weights/road_condition_model_v2.pth
#
# PART C — Gradient Mask Generation
#   Produces a single-band GeoTIFF where road pixel intensity = condition score.
#   White (255) = best paved road (score 10)
#   Black  (0)  = unpaved / severely damaged (score 0)
#   Also generates a red-yellow-green colormap overlay for visual inspection.
#
# Drive layout expected:
#   My Drive/fyp test/
#     data/raw/<satellite>.tif
#     data/segmentation masks/<road_mask>.tif   <- use _postprocessed.tif if available
#     weights/road_condition_model_v2.pth        <- written by Part B
#     data/classification masks/                 <- outputs written here
# =============================================================================


# ── Section 1: Install dependencies ──────────────────────────────────────────
import subprocess, sys

def _pip(*pkgs):
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", *pkgs], check=True)

print("Installing …")
_pip(
    "rasterio", "scikit-image", "opencv-python-headless",
    "matplotlib", "numpy", "scipy", "scikit-learn", "tqdm",
    "torch", "torchvision",
)
print("Ready.\n")


# ── Section 2: Mount Drive + configure paths ──────────────────────────────────
from google.colab import drive
drive.mount("/content/drive")

from pathlib import Path
import os, numpy as np, rasterio, cv2
from scipy.ndimage import generic_filter
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
import matplotlib.pyplot as plt
import matplotlib.colors as mcolors
import torch
import torch.nn as nn
from torchvision import models
from torch.utils.data import Dataset, DataLoader
from tqdm import tqdm

DRIVE_ROOT = Path("/content/drive/MyDrive/fyp test")

# ── CONFIGURE ────────────────────────────────────────────────────────────────
STACK_PATH = None         # None = auto-pick first .tif in data/raw/
MASK_PATH  = None         # None = auto-pick first .tif in segmentation masks/
                          # Recommend using the _postprocessed.tif from mask_postprocess_colab.py

# K-Means
N_CLUSTERS = 4            # 4 gives finer granularity than the original 3

# EfficientNet regression training (Part B)
PATCH_SIZE   = 32         # patch side in pixels — must match existing model
BATCH_SIZE   = 128
EPOCHS       = 20
LR           = 1e-3
MAX_PATCHES  = 30000      # cap patches to avoid OOM; reduce if Colab crashes
DEVICE       = "cuda" if torch.cuda.is_available() else "cpu"

WEIGHTS_OUT  = DRIVE_ROOT / "weights" / "road_condition_model_v2.pth"
# ─────────────────────────────────────────────────────────────────────────────

# Auto-detect paths
if STACK_PATH is None:
    tifs = sorted((DRIVE_ROOT / "data" / "raw").glob("*.tif"))
    if not tifs: raise FileNotFoundError("No .tif in data/raw/")
    STACK_PATH = tifs[0]

if MASK_PATH is None:
    seg_dir = DRIVE_ROOT / "data" / "segmentation masks"
    # Prefer post-processed mask if it exists
    pp = sorted(seg_dir.glob("*_postprocessed.tif"))
    all_masks = sorted(seg_dir.glob("*.tif"))
    MASK_PATH = pp[0] if pp else (all_masks[0] if all_masks else None)
    if MASK_PATH is None: raise FileNotFoundError("No mask in segmentation masks/")

print(f"Stack  : {STACK_PATH.name}")
print(f"Mask   : {MASK_PATH.name}")
print(f"Device : {DEVICE}\n")


# ── Section 3: Load data ──────────────────────────────────────────────────────
print("Loading data …")

with rasterio.open(STACK_PATH) as src:
    profile   = src.profile.copy()
    H, W      = src.height, src.width
    N_BANDS   = src.count
    raw_int   = src.read().astype(np.float32)   # (B, H, W) — raw int16 surface reflectance×10000
    transform = src.transform

# Normalise reflectance to [0, 1]
stack = np.clip(raw_int, 0.0, 10000.0) / 10000.0   # (N_BANDS, H, W)

print(f"Stack shape: {stack.shape}  |  bands: {N_BANDS}  |  resolution: {abs(transform.a):.1f} m/px")

# Band assignment — assumes 4-band Sentinel-2 ordered (Blue, Green, Red, NIR)
# Change these indices if your TIF has a different band order
BLUE_IDX  = 0
GREEN_IDX = 1
RED_IDX   = 2
NIR_IDX   = 3
SWIR_IDX  = 4 if N_BANDS >= 5 else None   # optional

B   = stack[BLUE_IDX]
G   = stack[GREEN_IDX]
R   = stack[RED_IDX]
NIR = stack[NIR_IDX]
SWIR = stack[SWIR_IDX] if SWIR_IDX is not None else None

print(f"Band assignment: B={BLUE_IDX} G={GREEN_IDX} R={RED_IDX} NIR={NIR_IDX} SWIR={SWIR_IDX}")

# Load binary road mask
with rasterio.open(MASK_PATH) as src:
    mask_raw = src.read(1)

road_mask = (mask_raw > 0)
road_y, road_x = np.where(road_mask)
print(f"Road pixels: {len(road_y):,}  ({road_mask.mean()*100:.2f}% of image)\n")


# ── Helper: build satellite RGB for visualisation ─────────────────────────────
def _make_rgb_vis():
    rgb = np.stack([R, G, B], axis=-1)   # (H, W, 3)
    lo  = np.percentile(rgb, 2,  axis=(0,1))
    hi  = np.percentile(rgb, 98, axis=(0,1))
    return np.clip((rgb - lo) / (hi - lo + 1e-6), 0, 1)

sat_rgb = _make_rgb_vis()


# =============================================================================
# PART A — Improved K-Means clustering with extended spectral features
# =============================================================================
print("=" * 60)
print("PART A — K-Means v2")
print("=" * 60)

# ── A1: Compute spectral indices ─────────────────────────────────────────────
print("Computing spectral features …")

NDVI       = (NIR - R) / (NIR + R + 1e-8)
NDWI       = (G - NIR) / (G + NIR + 1e-8)          # <0 for roads, >0 for water
EVI        = 2.5 * (NIR - R) / (NIR + 6*R - 7.5*B + 1 + 1e-8)  # more robust than NDVI
brightness = (B + G + R) / 3.0

# Texture: local 5×5 standard deviation of brightness — smooth paved roads have low texture
# generic_filter is slow on large images; use only road pixels window
# We compute it globally then sample at road pixels (fastest approach in pure numpy)
print("  Computing local texture (5×5 std dev) — may take ~30 sec …")
texture = generic_filter(brightness, np.std, size=5)
print("  Done.\n")


# ── A2: Assemble feature matrix for road pixels ───────────────────────────────
def _road_features(ys, xs):
    """
    Returns (N, 9) feature matrix for the given road pixel coordinates.

    Features: [B, G, R, NIR, NDVI, NDWI, EVI, brightness, texture_std]
    These give the K-Means much more discriminative power than the original 6.
    """
    feats = np.column_stack([
        B[ys, xs],
        G[ys, xs],
        R[ys, xs],
        NIR[ys, xs],
        NDVI[ys, xs],
        NDWI[ys, xs],
        EVI[ys, xs],
        brightness[ys, xs],
        texture[ys, xs],
    ])
    # Clip extreme outliers
    feats = np.clip(feats, -2.0, 2.0)
    return feats.astype(np.float32)

features_raw = _road_features(road_y, road_x)
scaler       = StandardScaler()
features_sc  = scaler.fit_transform(features_raw)

print(f"Feature matrix: {features_raw.shape}  (9 features per road pixel)\n")


# ── A3: Elbow method — choose k ───────────────────────────────────────────────
print("Running elbow method (k=2 … 7) …")
# Subsample for speed
sample_n  = min(20000, len(features_sc))
rng       = np.random.default_rng(42)
sample_idx = rng.choice(len(features_sc), sample_n, replace=False)
feats_sub  = features_sc[sample_idx]

inertias = []
K_range  = range(2, 8)
for k in K_range:
    km = KMeans(n_clusters=k, random_state=42, n_init=5)
    km.fit(feats_sub)
    inertias.append(km.inertia_)
    print(f"  k={k}  inertia={km.inertia_:.1f}")

fig, ax = plt.subplots(figsize=(7, 4))
ax.plot(list(K_range), inertias, "o-", lw=2)
ax.set_xlabel("k"); ax.set_ylabel("Inertia"); ax.set_title("Elbow method — choose k where curve bends")
plt.tight_layout(); plt.show()
print(f"\nUsing N_CLUSTERS={N_CLUSTERS}  (change in Section 2 if the elbow suggests otherwise)\n")


# ── A4: Fit final K-Means ──────────────────────────────────────────────────────
print(f"Fitting KMeans(k={N_CLUSTERS}) on all road pixels …")
km_final  = KMeans(n_clusters=N_CLUSTERS, random_state=42, n_init=10)
clusters  = km_final.fit_predict(features_sc)   # (N,)
print("Done.\n")


# ── A5: Map clusters → quality score (0-10) ──────────────────────────────────
# Rank clusters by a composite quality proxy computed from cluster centroids.
# Spectral reasoning for Sentinel-2 / Pakistan:
#   Low NDVI  → road not overgrown         → higher score
#   Low EVI   → less vegetation            → higher score
#   Low NDWI  → dry surface (not wet)      → higher score
#   Low texture → smooth surface           → higher score
# Note: brightness alone is misleading (asphalt=dark, sand=bright, both can be roads).

# Centroid stats in UNSCALED (original reflectance) feature space
NDVI_COL    = 4
NDWI_COL    = 5
EVI_COL     = 6
BRIGHT_COL  = 7
TEX_COL     = 8

centroid_ndvi    = np.array([features_raw[clusters == k, NDVI_COL].mean()   for k in range(N_CLUSTERS)])
centroid_ndwi    = np.array([features_raw[clusters == k, NDWI_COL].mean()   for k in range(N_CLUSTERS)])
centroid_evi     = np.array([features_raw[clusters == k, EVI_COL].mean()    for k in range(N_CLUSTERS)])
centroid_bright  = np.array([features_raw[clusters == k, BRIGHT_COL].mean() for k in range(N_CLUSTERS)])
centroid_texture = np.array([features_raw[clusters == k, TEX_COL].mean()    for k in range(N_CLUSTERS)])

print("Cluster centroid diagnostics:")
print(f"{'Cluster':>7}  {'NDVI':>6}  {'NDWI':>6}  {'EVI':>6}  {'Bright':>7}  {'Texture':>8}")
for k in range(N_CLUSTERS):
    print(f"  {k:>5d}  {centroid_ndvi[k]:>6.3f}  {centroid_ndwi[k]:>6.3f}  "
          f"{centroid_evi[k]:>6.3f}  {centroid_bright[k]:>7.4f}  {centroid_texture[k]:>8.5f}")

# Compute composite quality score per cluster (0 = bad, 1 = best)
# Normalise each metric to [0, 1] across clusters then combine
def _norm(arr):
    lo, hi = arr.min(), arr.max()
    return (arr - lo) / (hi - lo + 1e-8)

# Lower NDVI / EVI / texture / NDWI (less vegetation, smoother, drier) → better road
q_ndvi    = 1 - _norm(centroid_ndvi)     # lower NDVI  = better
q_evi     = 1 - _norm(centroid_evi)      # lower EVI   = better
q_texture = 1 - _norm(centroid_texture)  # lower texture = smoother = better
q_ndwi    = 1 - _norm(centroid_ndwi)     # lower NDWI (more negative) = drier = better

quality_score = 0.35 * q_ndvi + 0.25 * q_evi + 0.25 * q_texture + 0.15 * q_ndwi

# Map quality rank to evenly-spaced 0-10 scores
# Rank 0 = worst (score ~1), Rank N_CLUSTERS-1 = best (score ~9)
rank_order = np.argsort(quality_score)       # cluster IDs from worst to best
score_per_cluster = np.zeros(N_CLUSTERS)
for rank, cluster_id in enumerate(rank_order):
    # Spread scores: rank 0 → 1.0, rank N-1 → 9.0
    score_per_cluster[cluster_id] = 1.0 + (rank / (N_CLUSTERS - 1)) * 8.0

print("\nCluster → quality score mapping:")
label_map = {k: ("good" if score_per_cluster[k] >= 7 else
                 "damaged" if score_per_cluster[k] >= 4 else
                 "unpaved") for k in range(N_CLUSTERS)}
for k in range(N_CLUSTERS):
    print(f"  Cluster {k}  quality={quality_score[k]:.3f}  → score {score_per_cluster[k]:.1f}  ({label_map[k]})")


# ── A6: Build condition maps ──────────────────────────────────────────────────
# score_map: per-pixel float score [0, 10]
# label_map_arr: per-pixel label {0=bg, 1=good, 2=unpaved, 3=damaged}
score_map = np.zeros((H, W), dtype=np.float32)
score_map[road_y, road_x] = score_per_cluster[clusters]

label_arr = np.zeros((H, W), dtype=np.uint8)
for k in range(N_CLUSTERS):
    idx = clusters == k
    if label_map[k] == "good":    label_arr[road_y[idx], road_x[idx]] = 1
    elif label_map[k] == "unpaved": label_arr[road_y[idx], road_x[idx]] = 2
    else:                           label_arr[road_y[idx], road_x[idx]] = 3


# ── A7: Visualise K-Means result ──────────────────────────────────────────────
cmap_cond = mcolors.ListedColormap(["white", "#2ca02c", "#d62728", "#ff7f0e"])
bounds = [-0.5, 0.5, 1.5, 2.5, 3.5]
norm_c = mcolors.BoundaryNorm(bounds, cmap_cond.N)

fig, axes = plt.subplots(1, 2, figsize=(16, 7))
axes[0].imshow(sat_rgb)
axes[0].imshow(label_arr, cmap=cmap_cond, norm=norm_c, alpha=0.65)
axes[0].set_title("K-Means v2 — condition labels (green=good, red=damaged, orange=unpaved)")
axes[0].axis("off")

# Score heatmap
score_vis = np.zeros((H, W, 4), dtype=np.float32)
cmap_score = plt.cm.RdYlGn
for ry, rx in zip(road_y, road_x):
    score_vis[ry, rx] = cmap_score(score_map[ry, rx] / 10)
axes[1].imshow(sat_rgb)
axes[1].imshow(score_vis, alpha=0.75)
sm = plt.cm.ScalarMappable(cmap=plt.cm.RdYlGn, norm=plt.Normalize(0, 10))
plt.colorbar(sm, ax=axes[1], fraction=0.03, pad=0.04, label="Condition score (0=worst, 10=best)")
axes[1].set_title("K-Means v2 — continuous condition score")
axes[1].axis("off")

plt.suptitle("Road Condition K-Means v2", fontsize=13, fontweight="bold")
plt.tight_layout(); plt.show()

print("\nPart A complete.\n")


# =============================================================================
# PART B — EfficientNet-B2 Regression Training (0–10 score)
# =============================================================================
# This section TRAINS A NEW MODEL.  Runtime:
#   GPU (T4): ~15-30 min for 20 epochs × 30k patches
#   CPU:      ~2-3 hours  (not recommended)
# Skip to Part C if you just want the K-Means gradient mask without training.
# =============================================================================
print("=" * 60)
print("PART B — EfficientNet-B2 Regression Training")
print("=" * 60)
print(f"Device: {DEVICE}")

# ── B1: Build spectral pseudo-label per road pixel (0–10) ─────────────────────
# We reuse the K-Means quality scores from Part A as pseudo-labels.
# This is more principled than raw spectral thresholds because it has already
# been calibrated to THIS image's reflectance distribution.
pixel_labels = score_per_cluster[clusters].astype(np.float32)   # (N,) ∈ [1, 9]

print(f"Pseudo-label stats: min={pixel_labels.min():.1f}  max={pixel_labels.max():.1f}  "
      f"mean={pixel_labels.mean():.2f}  std={pixel_labels.std():.2f}")

# Visualise label distribution
fig, ax = plt.subplots(figsize=(6, 3))
ax.hist(pixel_labels, bins=50, edgecolor="k", color="steelblue")
ax.set_xlabel("Quality score"); ax.set_ylabel("# road pixels")
ax.set_title("Pseudo-label distribution")
plt.tight_layout(); plt.show()


# ── B2: Patch extraction + pseudo-labels ──────────────────────────────────────
print("\nExtracting patches …")
pad = PATCH_SIZE // 2

# Pad stack with reflect mode (same as existing efficientnet.py)
stack_padded = np.pad(stack, ((0, 0), (pad, pad), (pad, pad)), mode="reflect")

# Sample road pixels (cap to MAX_PATCHES to avoid OOM)
n_total = len(road_y)
if n_total > MAX_PATCHES:
    rng    = np.random.default_rng(0)
    idx    = rng.choice(n_total, MAX_PATCHES, replace=False)
    s_y, s_x = road_y[idx], road_x[idx]
    s_lbl    = pixel_labels[idx]
else:
    s_y, s_x, s_lbl = road_y, road_x, pixel_labels

print(f"Using {len(s_y):,} patches (capped from {n_total:,})")


class RoadPatchDataset(Dataset):
    """32×32 patches centred on road pixels with float condition score labels."""

    def __init__(self, padded_stack, ys, xs, labels):
        self.stack  = padded_stack   # (4, H+2p, W+2p)
        self.ys     = ys
        self.xs     = xs
        self.labels = labels
        self.p      = PATCH_SIZE // 2

    def __len__(self):
        return len(self.ys)

    def __getitem__(self, i):
        r, c = self.ys[i] + self.p, self.xs[i] + self.p
        patch = self.stack[:, r - self.p: r + self.p, c - self.p: c + self.p].astype(np.float32)
        return torch.from_numpy(patch), torch.tensor(self.labels[i], dtype=torch.float32)


# Train / val split 80/20
split  = int(0.8 * len(s_y))
idx_all = np.arange(len(s_y))
np.random.default_rng(1).shuffle(idx_all)
tr_idx, va_idx = idx_all[:split], idx_all[split:]

train_ds = RoadPatchDataset(stack_padded, s_y[tr_idx], s_x[tr_idx], s_lbl[tr_idx])
val_ds   = RoadPatchDataset(stack_padded, s_y[va_idx], s_x[va_idx], s_lbl[va_idx])
train_dl = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True,  num_workers=2)
val_dl   = DataLoader(val_ds,   batch_size=BATCH_SIZE, shuffle=False, num_workers=2)

print(f"Train: {len(train_ds):,}  |  Val: {len(val_ds):,}")


# ── B3: Model — EfficientNet-B2 regression (4-ch input, score output) ─────────
def build_regression_model(pretrained=True):
    """
    EfficientNet-B2 adapted for 4-channel input and single scalar regression output.
    Architecture mirrors the existing classification model (efficientnet.py) so
    the backbone weights can potentially be transferred later if desired.
    """
    weights = models.EfficientNet_B2_Weights.DEFAULT if pretrained else None
    backbone = models.efficientnet_b2(weights=weights)

    # Patch stem conv from 3-ch → 4-ch.
    # Initialise the extra channel by averaging the 3 ImageNet channels
    # so we start from a good representation rather than random noise.
    old_conv = backbone.features[0][0]
    new_conv  = nn.Conv2d(
        4, old_conv.out_channels,
        kernel_size=old_conv.kernel_size,
        stride=old_conv.stride,
        padding=old_conv.padding,
        bias=False,
    )
    with torch.no_grad():
        new_conv.weight[:, :3] = old_conv.weight        # copy RGB weights
        new_conv.weight[:, 3]  = old_conv.weight.mean(dim=1)  # NIR ← avg(RGB)
    backbone.features[0][0] = new_conv

    # Replace 3-class head with regression head: Linear(→1) → Sigmoid → ×10
    in_features = backbone.classifier[1].in_features
    backbone.classifier[1] = nn.Sequential(
        nn.Linear(in_features, 1),
        nn.Sigmoid(),
    )
    return backbone


class RoadQualityRegressor(nn.Module):
    def __init__(self, pretrained=True):
        super().__init__()
        self.net = build_regression_model(pretrained)

    def forward(self, x):
        return self.net(x).squeeze(1) * 10.0   # → [0, 10]


model = RoadQualityRegressor(pretrained=True).to(DEVICE)
print(f"\nModel built on {DEVICE}.")
total_params = sum(p.numel() for p in model.parameters())
print(f"Total parameters: {total_params:,}")


# ── B4: Training loop ─────────────────────────────────────────────────────────
criterion = nn.HuberLoss(delta=1.0)   # robust to outlier pseudo-labels
optimiser = torch.optim.Adam(model.parameters(), lr=LR)
scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimiser, T_max=EPOCHS)

history = {"train_loss": [], "val_loss": [], "val_mae": []}

print(f"\nTraining for {EPOCHS} epochs …\n")
for epoch in range(1, EPOCHS + 1):
    # ── train ──
    model.train()
    tr_loss = 0.0
    for patches, labels in tqdm(train_dl, desc=f"Epoch {epoch:3d}/{EPOCHS} train", leave=False):
        patches, labels = patches.to(DEVICE), labels.to(DEVICE)
        optimiser.zero_grad()
        preds = model(patches)
        loss  = criterion(preds, labels)
        loss.backward()
        optimiser.step()
        tr_loss += loss.item() * len(labels)
    tr_loss /= len(train_ds)

    # ── validate ──
    model.eval()
    va_loss, va_mae = 0.0, 0.0
    with torch.no_grad():
        for patches, labels in val_dl:
            patches, labels = patches.to(DEVICE), labels.to(DEVICE)
            preds = model(patches)
            va_loss += criterion(preds, labels).item() * len(labels)
            va_mae  += (preds - labels).abs().sum().item()
    va_loss /= len(val_ds)
    va_mae  /= len(val_ds)
    scheduler.step()

    history["train_loss"].append(tr_loss)
    history["val_loss"].append(va_loss)
    history["val_mae"].append(va_mae)
    print(f"Epoch {epoch:3d}  train_loss={tr_loss:.4f}  val_loss={va_loss:.4f}  val_mae={va_mae:.3f}")

# Plot training curves
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 4))
ax1.plot(history["train_loss"], label="train"); ax1.plot(history["val_loss"], label="val")
ax1.set_title("Huber loss"); ax1.set_xlabel("epoch"); ax1.legend()
ax2.plot(history["val_mae"], color="orange")
ax2.set_title("Val MAE (score units 0-10)"); ax2.set_xlabel("epoch")
plt.tight_layout(); plt.show()

# Save weights
WEIGHTS_OUT.parent.mkdir(parents=True, exist_ok=True)
torch.save(model.state_dict(), WEIGHTS_OUT)
print(f"\nWeights saved → {WEIGHTS_OUT.relative_to(DRIVE_ROOT)}")
print("Final val MAE:", f"{history['val_mae'][-1]:.3f}")


# =============================================================================
# PART C — Gradient Mask Generation
# =============================================================================
# Generates a single-band float GeoTIFF where road pixel intensity = condition
# score (0-10 → 0-255) and a colourmap overlay for visual inspection.
# Can be run independently of Part B — uses K-Means scores if model not available.
# =============================================================================
print("\n" + "=" * 60)
print("PART C — Gradient Mask Generation")
print("=" * 60)

USE_MODEL = True    # Set False to use K-Means scores from Part A instead
                    # (automatically falls back to False if Part B was skipped)

# Check if model is available
_model_available = 'model' in dir() and model is not None
if USE_MODEL and not _model_available:
    print("Model not found — using K-Means quality scores from Part A instead.")
    USE_MODEL = False


# ── C1: Get per-pixel condition scores ───────────────────────────────────────
if USE_MODEL:
    print("Running regression model on all road patches …")
    model.eval()

    # Reuse RoadPatchDataset but with ALL road pixels, no label needed
    class _InfDataset(Dataset):
        def __init__(self, padded_stack, ys, xs):
            self.stack = padded_stack; self.ys = ys; self.xs = xs; self.p = PATCH_SIZE // 2
        def __len__(self): return len(self.ys)
        def __getitem__(self, i):
            r, c = self.ys[i] + self.p, self.xs[i] + self.p
            patch = self.stack[:, r-self.p:r+self.p, c-self.p:c+self.p].astype(np.float32)
            return torch.from_numpy(patch)

    inf_ds = _InfDataset(stack_padded, road_y, road_x)
    inf_dl = DataLoader(inf_ds, batch_size=512, shuffle=False, num_workers=2)
    all_scores = []
    with torch.no_grad():
        for patches in tqdm(inf_dl, desc="Inference"):
            all_scores.append(model(patches.to(DEVICE)).cpu().numpy())
    all_scores = np.concatenate(all_scores)    # (N,) ∈ [0, 10]
    source = "EfficientNet regression model"
else:
    all_scores = score_per_cluster[clusters]   # K-Means scores from Part A
    source = "K-Means quality scores (Part A)"

print(f"Score source: {source}")
print(f"Score range:  min={all_scores.min():.2f}  max={all_scores.max():.2f}  mean={all_scores.mean():.2f}\n")


# ── C2: Build gradient mask GeoTIFF ───────────────────────────────────────────
# White (255) = score 10 (best paved road)
# Black (0)   = score 0  (unpaved / worst condition)
# Non-road    = 0 (NoData / background)

gradient_mask = np.zeros((H, W), dtype=np.uint8)
pixel_values  = np.clip((all_scores / 10.0) * 255, 0, 255).astype(np.uint8)
gradient_mask[road_y, road_x] = pixel_values

# Also build a float version for GIS (direct score values)
score_map_final = np.zeros((H, W), dtype=np.float32)
score_map_final[road_y, road_x] = all_scores.astype(np.float32)


# ── C3: Visualise gradient mask ────────────────────────────────────────────────
cmap_ryg = plt.cm.RdYlGn   # red=bad, yellow=medium, green=good

# Create RGBA overlay: road pixels coloured by condition, background transparent
overlay_rgba = np.zeros((H, W, 4), dtype=np.float32)
overlay_rgba[road_y, road_x] = cmap_ryg(all_scores / 10)[:, :4]

# Create grayscale version for "pure" gradient mask
gradient_rgb = np.zeros((H, W, 3), dtype=np.uint8)
for c in range(3):
    gradient_rgb[road_y, road_x, c] = pixel_values  # white=good, black=bad

fig, axes = plt.subplots(1, 3, figsize=(21, 7))

axes[0].imshow(sat_rgb)
axes[0].set_title("Satellite (RGB)")

axes[1].imshow(sat_rgb)
axes[1].imshow(overlay_rgba, alpha=0.8)
sm = plt.cm.ScalarMappable(cmap=cmap_ryg, norm=plt.Normalize(0, 10))
plt.colorbar(sm, ax=axes[1], fraction=0.03, pad=0.04, label="Condition (0=worst, 10=best)")
axes[1].set_title(f"Condition overlay (RdYlGn)\n{source}")

axes[2].imshow(gradient_rgb)
axes[2].set_title("Gradient mask\nWhite = paved / good,  Black = unpaved / bad")

for ax in axes: ax.axis("off")
plt.suptitle("Road Condition Gradient Mask", fontsize=13, fontweight="bold")
plt.tight_layout(); plt.show()


# ── C4: Save outputs ──────────────────────────────────────────────────────────
out_dir = DRIVE_ROOT / "data" / "classification masks"
out_dir.mkdir(parents=True, exist_ok=True)

stem = STACK_PATH.stem

# 1. Gradient mask (0-255 grayscale — black=bad, white=good)
grad_path = out_dir / f"{stem}_gradient_mask.tif"
out_profile = profile.copy()
out_profile.update(dtype=rasterio.uint8, count=1, nodata=0)
with rasterio.open(grad_path, "w", **out_profile) as dst:
    dst.write(gradient_mask, 1)
print(f"Gradient mask (uint8, 0-255) → {grad_path.relative_to(DRIVE_ROOT)}")

# 2. Score map (float32 — direct 0-10 values for GIS analysis)
score_path = out_dir / f"{stem}_score_map.tif"
out_profile_f = profile.copy()
out_profile_f.update(dtype=rasterio.float32, count=1, nodata=0.0)
with rasterio.open(score_path, "w", **out_profile_f) as dst:
    dst.write(score_map_final, 1)
print(f"Score map   (float32, 0-10)   → {score_path.relative_to(DRIVE_ROOT)}")

print("\nDone.")
print("Open the gradient_mask.tif in QGIS with a grayscale or colour-ramp symbology.")
print("Load score_map.tif with a classified renderer (0-10) for quantitative analysis.")
