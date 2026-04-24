"""Azure Blob and local filesystem storage abstractions."""

from __future__ import annotations

import shutil
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import BinaryIO, Dict, Protocol

try:
    from azure.core.exceptions import ResourceExistsError
    from azure.storage.blob import BlobSasPermissions, BlobServiceClient, ContentSettings
    from azure.storage.blob import generate_blob_sas
except ImportError:  # pragma: no cover - optional until dependencies are installed
    ResourceExistsError = None
    BlobSasPermissions = BlobServiceClient = ContentSettings = generate_blob_sas = None

from ..config import Settings


def _guess_content_type(path: str) -> str:
    suffix = Path(path).suffix.lower()
    if suffix == ".tif" or suffix == ".tiff":
        return "image/tiff"
    if suffix == ".geojson":
        return "application/geo+json"
    if suffix == ".json":
        return "application/json"
    if suffix == ".csv":
        return "text/csv"
    if suffix == ".html":
        return "text/html; charset=utf-8"
    if suffix == ".zip":
        return "application/zip"
    return "application/octet-stream"


@dataclass(frozen=True)
class PreparedUpload:
    upload_id: str
    blob_path: str
    filename: str
    content_type: str
    kind: str
    url: str
    method: str
    headers: Dict[str, str]


class StorageBackend(Protocol):
    def create_upload_session(
        self,
        upload_id: str,
        blob_path: str,
        filename: str,
        content_type: str,
    ) -> PreparedUpload: ...

    def upload_stream(self, blob_path: str, stream: BinaryIO, content_type: str) -> None: ...

    def upload_file(self, local_path: Path, blob_path: str, content_type: str | None = None) -> None: ...

    def download_file(self, blob_path: str, destination: Path) -> None: ...

    def exists(self, blob_path: str) -> bool: ...

    def generate_download_url(self, blob_path: str, expires_minutes: int) -> str: ...


class LocalStorageBackend:
    def __init__(self, base_dir: Path) -> None:
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def _resolve(self, blob_path: str) -> Path:
        path = (self.base_dir / blob_path).resolve()
        base = self.base_dir.resolve()
        if base not in path.parents and path != base:
            raise ValueError("Blob path resolved outside the storage root.")
        return path

    def create_upload_session(
        self,
        upload_id: str,
        blob_path: str,
        filename: str,
        content_type: str,
    ) -> PreparedUpload:
        return PreparedUpload(
            upload_id=upload_id,
            blob_path=blob_path,
            filename=filename,
            content_type=content_type,
            kind="backend_proxy",
            url=f"/api/uploads/{upload_id}/file",
            method="POST",
            headers={},
        )

    def upload_stream(self, blob_path: str, stream: BinaryIO, content_type: str) -> None:
        destination = self._resolve(blob_path)
        destination.parent.mkdir(parents=True, exist_ok=True)
        with destination.open("wb") as handle:
            shutil.copyfileobj(stream, handle)

    def upload_file(self, local_path: Path, blob_path: str, content_type: str | None = None) -> None:
        destination = self._resolve(blob_path)
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(local_path, destination)

    def download_file(self, blob_path: str, destination: Path) -> None:
        source = self._resolve(blob_path)
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)

    def exists(self, blob_path: str) -> bool:
        return self._resolve(blob_path).exists()

    def generate_download_url(self, blob_path: str, expires_minutes: int) -> str:
        return f"/api/files/{blob_path}"

    def resolve_local_path(self, blob_path: str) -> Path:
        return self._resolve(blob_path)


class AzureBlobStorageBackend:
    def __init__(self, connection_string: str, container_name: str) -> None:
        if BlobServiceClient is None or generate_blob_sas is None or BlobSasPermissions is None:
            raise RuntimeError(
                "azure-storage-blob is required for Azure storage mode."
            )
        self.connection_string = connection_string
        self.container_name = container_name
        self.service_client = BlobServiceClient.from_connection_string(connection_string)
        self.container_client = self.service_client.get_container_client(container_name)
        try:
            self.container_client.create_container()
        except ResourceExistsError:
            pass
        self.account_name = self.service_client.account_name
        self.account_key = self._extract_account_key(connection_string)

    @staticmethod
    def _extract_account_key(connection_string: str) -> str:
        parts = {}
        for token in connection_string.split(";"):
            if "=" not in token:
                continue
            key, value = token.split("=", 1)
            parts[key] = value
        if "AccountKey" not in parts:
            raise RuntimeError("Azure connection string must include AccountKey.")
        return parts["AccountKey"]

    def create_upload_session(
        self,
        upload_id: str,
        blob_path: str,
        filename: str,
        content_type: str,
    ) -> PreparedUpload:
        expires = datetime.now(UTC) + timedelta(minutes=60)
        sas = generate_blob_sas(
            account_name=self.account_name,
            container_name=self.container_name,
            blob_name=blob_path,
            account_key=self.account_key,
            permission=BlobSasPermissions(create=True, write=True),
            expiry=expires,
            content_type=content_type,
        )
        blob_client = self.container_client.get_blob_client(blob_path)
        url = f"{blob_client.url}?{sas}"
        return PreparedUpload(
            upload_id=upload_id,
            blob_path=blob_path,
            filename=filename,
            content_type=content_type,
            kind="azure_sas",
            url=url,
            method="PUT",
            headers={
                "x-ms-blob-type": "BlockBlob",
                "Content-Type": content_type,
            },
        )

    def upload_stream(self, blob_path: str, stream: BinaryIO, content_type: str) -> None:
        blob = self.container_client.get_blob_client(blob_path)
        blob.upload_blob(
            stream,
            overwrite=True,
            content_settings=ContentSettings(content_type=content_type),
        )

    def upload_file(self, local_path: Path, blob_path: str, content_type: str | None = None) -> None:
        with Path(local_path).open("rb") as handle:
            self.upload_stream(blob_path, handle, content_type or _guess_content_type(blob_path))

    def download_file(self, blob_path: str, destination: Path) -> None:
        destination.parent.mkdir(parents=True, exist_ok=True)
        blob = self.container_client.get_blob_client(blob_path)
        with destination.open("wb") as handle:
            download = blob.download_blob()
            download.readinto(handle)

    def exists(self, blob_path: str) -> bool:
        return self.container_client.get_blob_client(blob_path).exists()

    def generate_download_url(self, blob_path: str, expires_minutes: int) -> str:
        expires = datetime.now(UTC) + timedelta(minutes=expires_minutes)
        sas = generate_blob_sas(
            account_name=self.account_name,
            container_name=self.container_name,
            blob_name=blob_path,
            account_key=self.account_key,
            permission=BlobSasPermissions(read=True),
            expiry=expires,
        )
        blob_client = self.container_client.get_blob_client(blob_path)
        return f"{blob_client.url}?{sas}"


def build_storage_backend(settings: Settings) -> StorageBackend:
    if settings.storage_mode == "azure":
        return AzureBlobStorageBackend(
            connection_string=settings.blob_connection_string,
            container_name=settings.blob_container,
        )
    return LocalStorageBackend(settings.local_storage_root)
