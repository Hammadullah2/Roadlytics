"""
models.py - Shared dataclasses for structured pipeline outputs.
"""

from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Dict, List


@dataclass
class ConnectivityArtifacts:
    component_map: Path
    betweenness_map: Path
    components_csv: Path
    summary_json: Path
    critical_junctions_geojson: Path
    stats: Dict[str, object] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, object]:
        data = asdict(self)
        for key in (
            "component_map",
            "betweenness_map",
            "components_csv",
            "summary_json",
            "critical_junctions_geojson",
        ):
            data[key] = str(data[key])
        return data


@dataclass
class PipelineDirectories:
    root: Path
    segmentation: Path
    classification: Path
    shapefiles: Path
    connectivity: Path

    def create(self) -> "PipelineDirectories":
        for path in (
            self.root,
            self.segmentation,
            self.classification,
            self.shapefiles,
            self.connectivity,
        ):
            path.mkdir(parents=True, exist_ok=True)
        return self


@dataclass
class PipelineRunResult:
    input_tif: Path
    segmenter: str
    classifier: str
    directories: PipelineDirectories
    seg_mask: Path
    class_tifs: Dict[str, Path]
    combined: Path
    shapefiles: List[Path]
    connectivity: ConnectivityArtifacts

    def to_dict(self) -> Dict[str, object]:
        return {
            "input_tif": str(self.input_tif),
            "segmenter": self.segmenter,
            "classifier": self.classifier,
            "directories": {
                "root": str(self.directories.root),
                "segmentation": str(self.directories.segmentation),
                "classification": str(self.directories.classification),
                "shapefiles": str(self.directories.shapefiles),
                "connectivity": str(self.directories.connectivity),
            },
            "seg_mask": str(self.seg_mask),
            "class_tifs": {name: str(path) for name, path in self.class_tifs.items()},
            "combined": str(self.combined),
            "shapefiles": [str(path) for path in self.shapefiles],
            "connectivity": self.connectivity.to_dict(),
        }
