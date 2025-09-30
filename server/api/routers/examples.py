from __future__ import annotations

import json
import os
from glob import glob
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from core.logging import FastAPIStructLogger
from config.datamodel import LlamaFarmConfig
from services.project_service import ProjectService
from services.dataset_service import DatasetService
from services.data_service import DataService, MetadataFileContent
from core.celery.tasks.task_process_dataset import process_dataset_task

logger = FastAPIStructLogger()

router = APIRouter(prefix="/examples", tags=["examples"])


class ExampleSummary(BaseModel):
    id: str
    slug: str | None = None
    title: str
    description: str | None = None
    primaryModel: str | None = None
    tags: list[str] = []
    dataset_count: int | None = None


def _repo_root() -> str:
    return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))


def _examples_root() -> str:
    return os.path.join(_repo_root(), "examples")


def _scan_manifests() -> list[dict[str, Any]]:
    manifests: list[dict[str, Any]] = []
    for manifest_path in glob(os.path.join(_examples_root(), "*", "manifest.yaml")):
        try:
            import yaml

            with open(manifest_path) as f:
                m = yaml.safe_load(f) or {}
            if not m.get("id") or not m.get("title"):
                continue
            ds_list = m.get("datasets") or []
            manifests.append(
                {
                    "id": m.get("id"),
                    "slug": m.get("slug"),
                    "title": m.get("title"),
                    "description": m.get("description"),
                    "tags": m.get("tags", []),
                    "primaryModel": m.get("primaryModel"),
                    "dataset_count": len(ds_list) if isinstance(ds_list, list) else None,
                }
            )
        except Exception as e:
            logger.warning("Failed to read example manifest", path=manifest_path, error=str(e))
    return manifests


@router.get("")
async def list_examples() -> dict[str, list[ExampleSummary]]:
    data = _scan_manifests()
    items = [ExampleSummary(**ex) for ex in data]
    return {"examples": items}


def _load_manifest_by_id(example_id: str) -> dict[str, Any]:
    for manifest_path in glob(os.path.join(_examples_root(), "*", "manifest.yaml")):
        import yaml

        with open(manifest_path) as f:
            m = yaml.safe_load(f) or {}
        if m.get("id") == example_id:
            # Attach base_dir for resolving relative paths
            m["_base_dir"] = os.path.dirname(manifest_path)
            return m
    raise HTTPException(status_code=404, detail=f"Example '{example_id}' not found")


class ImportProjectRequest(BaseModel):
    namespace: str
    name: str
    process: bool = True


class ImportProjectResponse(BaseModel):
    project: str
    namespace: str
    datasets: list[str]
    task_ids: list[str]


def _ensure_path_under_examples(path: str) -> str:
    abs_path = os.path.abspath(path)
    ex_root = os.path.abspath(_examples_root()) + os.sep
    if not abs_path.startswith(ex_root):
        raise HTTPException(status_code=400, detail="Path outside examples directory")
    return abs_path


def _add_file_from_path(namespace: str, project: str, dataset: str, source_path: str) -> MetadataFileContent:
    # Replicate DataService.add_data_file for local path
    data_dir = DataService.get_data_dir(namespace, project)
    with open(source_path, "rb") as f:
        file_data = f.read()
    data_hash = DataService.hash_data(file_data)
    original_name = os.path.basename(source_path)
    resolved_file_name = DataService.append_collision_timestamp(original_name)

    # Write metadata
    meta_path = os.path.join(data_dir, "meta", f"{data_hash}.json")
    meta = MetadataFileContent(
        original_file_name=original_name,
        resolved_file_name=resolved_file_name,
        timestamp=float(os.path.getmtime(source_path)),
        size=len(file_data),
        mime_type="application/octet-stream",
        hash=data_hash,
    )
    with open(meta_path, "w") as f:
        f.write(meta.model_dump_json())

    # Write raw
    raw_path = os.path.join(data_dir, "raw", data_hash)
    with open(raw_path, "wb") as f:
        f.write(file_data)

    # Index symlink
    index_dir = os.path.join(data_dir, "index", "by_name")
    os.makedirs(index_dir, exist_ok=True)
    index_path = os.path.join(index_dir, resolved_file_name)
    try:
        os.symlink(raw_path, index_path)
    except FileExistsError:
        pass

    DatasetService.add_file_to_dataset(namespace, project, dataset, meta)
    return meta


def _merge_rag_components(base_cfg: LlamaFarmConfig, example_cfg: LlamaFarmConfig) -> LlamaFarmConfig:
    # Extend databases and strategies by name without duplicates
    base = base_cfg.model_dump(mode="json")
    ex = example_cfg.model_dump(mode="json")
    base_rag = base.get("rag") or {}
    ex_rag = ex.get("rag") or {}

    # Databases
    base_dbs = {d["name"]: d for d in base_rag.get("databases", []) or []}
    for d in ex_rag.get("databases", []) or []:
        base_dbs.setdefault(d.get("name"), d)
    # Strategies
    base_strats = {s["name"]: s for s in base_rag.get("data_processing_strategies", []) or []}
    for s in ex_rag.get("data_processing_strategies", []) or []:
        base_strats.setdefault(s.get("name"), s)

    base_rag["databases"] = list(base_dbs.values())
    base_rag["data_processing_strategies"] = list(base_strats.values())
    if ex_rag.get("default_embedding_strategy"):
        base_rag.setdefault("default_embedding_strategy", ex_rag.get("default_embedding_strategy"))
    if ex_rag.get("default_retrieval_strategy"):
        base_rag.setdefault("default_retrieval_strategy", ex_rag.get("default_retrieval_strategy"))
    base["rag"] = base_rag

    return LlamaFarmConfig(**base)


@router.post("/{example_id}/import-project", response_model=ImportProjectResponse)
async def import_project(example_id: str, request: ImportProjectRequest) -> ImportProjectResponse:
    import yaml

    m = _load_manifest_by_id(example_id)
    base_dir = m.get("_base_dir")
    cfg_path = m.get("config", {}).get("yaml_path")
    if not cfg_path:
        raise HTTPException(status_code=400, detail="Manifest missing config.yaml_path")
    cfg_abs = _ensure_path_under_examples(os.path.join(_repo_root(), cfg_path))

    # Create project and write example config with overridden name/namespace
    ProjectService.create_project(request.namespace, request.name, config_template=None)

    with open(cfg_abs) as f:
        cfg_dict = yaml.safe_load(f) or {}
    cfg_dict["name"] = request.name
    cfg_dict["namespace"] = request.namespace
    cfg_model = LlamaFarmConfig(**cfg_dict)
    ProjectService.save_config(request.namespace, request.name, cfg_model)

    # Create datasets and ingest files
    datasets = []
    task_ids: list[str] = []
    for ds in m.get("datasets", []) or []:
        ds_name = ds.get("name")
        strategy = ds.get("strategy")
        database = ds.get("database")
        if not (ds_name and strategy and database):
            continue
        try:
            DatasetService.create_dataset(request.namespace, request.name, ds_name, strategy, database)
        except Exception:
            # Dataset may already exist; proceed to add files
            pass
        datasets.append(ds_name)

        # Expand globs relative to repo root
        for pattern in ds.get("ingest", []) or []:
            abs_glob = _ensure_path_under_examples(os.path.join(_repo_root(), pattern))
            for path in glob(abs_glob):
                _add_file_from_path(request.namespace, request.name, ds_name, path)

        if request.process:
            res = process_dataset_task.apply_async(args=[request.namespace, request.name, ds_name])
            task_ids.append(res.id)

    return ImportProjectResponse(project=request.name, namespace=request.namespace, datasets=datasets, task_ids=task_ids)


class ImportDataRequest(BaseModel):
    namespace: str
    project: str
    include_strategies: bool = True
    process: bool = True


class ImportDataResponse(BaseModel):
    project: str
    namespace: str
    datasets: list[str]
    task_ids: list[str]


@router.post("/{example_id}/import-data", response_model=ImportDataResponse)
async def import_data(example_id: str, request: ImportDataRequest) -> ImportDataResponse:
    import yaml

    m = _load_manifest_by_id(example_id)
    cfg_path = m.get("config", {}).get("yaml_path")
    if not cfg_path:
        raise HTTPException(status_code=400, detail="Manifest missing config.yaml_path")

    # Optionally merge strategies/databases
    if request.include_strategies:
        cfg_abs = _ensure_path_under_examples(os.path.join(_repo_root(), cfg_path))
        with open(cfg_abs) as f:
            ex_cfg_dict = yaml.safe_load(f) or {}
        ex_cfg = LlamaFarmConfig(**ex_cfg_dict)
        base_cfg = ProjectService.load_config(request.namespace, request.project)
        merged = _merge_rag_components(base_cfg, ex_cfg)
        ProjectService.update_project(request.namespace, request.project, merged)

    datasets = []
    task_ids: list[str] = []
    for ds in m.get("datasets", []) or []:
        ds_name = ds.get("name")
        strategy = ds.get("strategy")
        database = ds.get("database")
        if not (ds_name and strategy and database):
            continue
        # Create if missing
        try:
            DatasetService.create_dataset(request.namespace, request.project, ds_name, strategy, database)
        except Exception:
            pass
        datasets.append(ds_name)

        for pattern in ds.get("ingest", []) or []:
            abs_glob = _ensure_path_under_examples(os.path.join(_repo_root(), pattern))
            for path in glob(abs_glob):
                _add_file_from_path(request.namespace, request.project, ds_name, path)

        if request.process:
            res = process_dataset_task.apply_async(args=[request.namespace, request.project, ds_name])
            task_ids.append(res.id)

    return ImportDataResponse(project=request.project, namespace=request.namespace, datasets=datasets, task_ids=task_ids)


