import os
from datetime import datetime
from pathlib import Path
from typing import Union

from pydantic import BaseModel, ValidationError

from api.errors import (
    ConfigTemplateNotFoundError,
    NamespaceNotFoundError,
    ProjectConfigError,
    ProjectNotFoundError,
    ReservedNamespaceError,
)
from core.logging import FastAPIStructLogger
from core.settings import settings

from config import (  # noqa: E402
    ConfigError,
    generate_base_config,
    load_config,
    load_config_dict,
    save_config,
)
from config.datamodel import LlamaFarmConfig  # noqa: E402

logger = FastAPIStructLogger()

RESERVED_NAMESPACES = ["llamafarm"]


class Project(BaseModel):
    namespace: str
    name: str
    config: Union[LlamaFarmConfig, dict]
    validation_error: str | None = None
    last_modified: datetime | None = None


class ProjectService:
    """
    Service for managing projects.
    """

    @classmethod
    def get_namespace_dir(cls, namespace: str):
        base_path = os.path.join(settings.lf_data_dir, "projects")
        raw_path = os.path.join(base_path, namespace)
        norm_path = os.path.normpath(raw_path)
        # Ensure the normalized path is within the base_path
        if not norm_path.startswith(os.path.abspath(base_path) + os.sep):
            raise NamespaceNotFoundError("Invalid namespace: path traversal detected")
        return norm_path

    @classmethod
    def get_project_dir(cls, namespace: str, project_id: str):
        # All projects now use the standard .llamafarm directory structure
        base_path = os.path.join(settings.lf_data_dir, "projects")
        raw_path = os.path.join(base_path, namespace, project_id)
        norm_path = os.path.normpath(raw_path)
        # Ensure the normalized path is within the base_path
        if not norm_path.startswith(os.path.abspath(base_path) + os.sep):
            raise NamespaceNotFoundError(
                "Invalid namespace or project_id: path traversal detected"
            )
        return norm_path

    @classmethod
    def get_project_last_modified(cls, project_dir: str) -> datetime | None:
        """
        Get the last modified timestamp of the project's config file.
        This works in both local and containerized environments as long as
        the project directory is mounted.
        """
        try:
            # Look for config files in order of preference
            config_files = ["llamafarm.yaml", "llamafarm.yml", "llamafarm.toml", "llamafarm.json"]
            for config_file in config_files:
                config_path = os.path.join(project_dir, config_file)
                if os.path.isfile(config_path):
                    mtime = os.path.getmtime(config_path)
                    return datetime.fromtimestamp(mtime)
            return None
        except (OSError, ValueError) as e:
            logger.warning(
                "Failed to get last modified time",
                project_dir=project_dir,
                error=str(e),
            )
            return None

    @classmethod
    def create_project(
        cls,
        namespace: str,
        project_id: str,
        config_template: str | None = None,
    ) -> LlamaFarmConfig:
        """
        Create a new project.
        @param project_id: The ID of the project to create. (e.g. MyNamespace/MyProject)
        """
        if namespace in RESERVED_NAMESPACES:
            raise ReservedNamespaceError(namespace)

        project_dir = cls.get_project_dir(namespace, project_id)
        os.makedirs(project_dir, exist_ok=True)

        # Resolve config template path using shared helper
        config_template_path = cls._resolve_template_path(config_template)

        # Generate config directly with correct name
        cfg_dict = generate_base_config(
            namespace=namespace,
            name=project_id,
            config_template_path=str(config_template_path),
        )

        return cls.save_config(namespace, project_id, LlamaFarmConfig(**cfg_dict))

    @classmethod
    def _resolve_template_path(cls, config_template: str | None) -> Path:
        """
        Resolve a config template name to a concrete filesystem path.

        The resolution order is:
        - If settings.lf_templates_dir is set: {lf_templates_dir}/{template}.yaml
        - Otherwise, look under repo 'config/templates/{template}.yaml'
        - Finally, fall back to 'rag/schemas/consolidated.yaml' as a generic schema
        """
        template = config_template or settings.lf_config_template

        absolute_path = (
            Path(__file__).parent.parent.parent
            / "config"
            / "templates"
            / f"{template}.yaml"
        )

        if not absolute_path.exists():
            raise ConfigTemplateNotFoundError(template, [str(absolute_path)])

        return absolute_path

    @classmethod
    def list_projects(cls, namespace: str) -> list[Project]:
        namespace_dir = cls.get_namespace_dir(namespace)
        logger.info(f"Listing projects in {namespace_dir}")

        dirs: list[str]
        try:
            dirs = os.listdir(namespace_dir)
        except FileNotFoundError as e:
            raise NamespaceNotFoundError(namespace) from e

        projects = []
        for project_name in dirs:
            project_path = os.path.join(namespace_dir, project_name)

            # Skip non-directories and hidden/system entries (e.g., .DS_Store)
            if not os.path.isdir(project_path) or project_name.startswith("."):
                logger.warning(
                    "Skipping non-project entry",
                    entry=project_name,
                    path=project_path,
                )
                continue

            # Attempt to load project config
            # If validation fails, still include the project but mark it with an error
            validation_error_msg = None
            cfg = None

            try:
                # First try to load with full validation
                cfg = load_config(
                    directory=project_path,
                    validate=False,
                )
            except ValidationError as e:
                # Config file exists but has validation errors
                # Load as raw dict so it can still be edited in UI
                logger.warning(
                    "Project has validation errors, including with error flag",
                    entry=project_name,
                    error=str(e),
                )
                # Extract structured error messages from Pydantic validation errors
                if hasattr(e, "errors") and callable(e.errors):
                    error_details = []
                    for err in e.errors():
                        loc = ".".join(str(x) for x in err.get("loc", []))
                        msg = err.get("msg", "validation error")
                        error_details.append(f"{loc}: {msg}")
                    validation_error_msg = "; ".join(error_details[:5])  # Limit to first 5 errors
                    if len(e.errors()) > 5:
                        validation_error_msg += f" (and {len(e.errors()) - 5} more errors)"
                else:
                    validation_error_msg = f"Config validation failed: {str(e)}"
                try:
                    cfg = load_config_dict(
                        directory=project_path,
                        validate=False,
                    )
                except Exception as dict_load_error:
                    # If we can't even load as dict, skip this project
                    logger.error(
                        "Failed to load project config even as dict",
                        entry=project_name,
                        error=str(dict_load_error),
                    )
                    continue
            except ConfigError as e:
                # Config file is missing or malformed - skip
                logger.warning(
                    "Skipping project without valid config file",
                    entry=project_name,
                    error=str(e),
                )
                continue
            except OSError as e:
                # Filesystem error - skip
                logger.warning(
                    "Skipping project due to filesystem error",
                    entry=project_name,
                    error=str(e),
                )
                continue

            if cfg is not None:
                # Get last modified timestamp
                last_modified = cls.get_project_last_modified(project_path)

                projects.append(
                    Project(
                        namespace=namespace,
                        name=project_name,
                        config=cfg,
                        validation_error=validation_error_msg,
                        last_modified=last_modified,
                    )
                )
        return projects

    @classmethod
    def get_project(cls, namespace: str, project_id: str) -> Project:
        project_dir = cls.get_project_dir(namespace, project_id)
        # Validate project directory exists (and is a directory)
        if not os.path.isdir(project_dir):
            logger.info(
                "Project directory not found",
                namespace=namespace,
                project_id=project_id,
                path=project_dir,
            )
            raise ProjectNotFoundError(namespace, project_id)

        # Ensure a config file exists inside the directory
        validation_error_msg = None
        cfg = None

        try:
            from config.helpers.loader import find_config_file

            config_file = find_config_file(project_dir)
            if not config_file:
                logger.warning(
                    "Config file not found in project directory",
                    namespace=namespace,
                    project_id=project_id,
                    path=project_dir,
                )
                raise ProjectConfigError(
                    namespace,
                    project_id,
                    message="No configuration file found in project directory",
                )

            # Attempt to load config (do not validate here; align with list_projects)
            cfg = load_config(directory=project_dir, validate=False)
        except ValidationError as e:
            # Config file exists but has validation errors
            # Load as raw dict so it can still be edited in UI
            logger.warning(
                "Project has validation errors, loading as dict",
                namespace=namespace,
                project_id=project_id,
                error=str(e),
            )
            # Extract structured error messages from Pydantic validation errors
            if hasattr(e, "errors") and callable(e.errors):
                error_details = []
                for err in e.errors():
                    loc = ".".join(str(x) for x in err.get("loc", []))
                    msg = err.get("msg", "validation error")
                    error_details.append(f"{loc}: {msg}")
                validation_error_msg = "; ".join(error_details[:5])  # Limit to first 5 errors
                if len(e.errors()) > 5:
                    validation_error_msg += f" (and {len(e.errors()) - 5} more errors)"
            else:
                validation_error_msg = f"Config validation failed: {str(e)}"
            try:
                cfg = load_config_dict(
                    directory=project_dir,
                    validate=False,
                )
            except Exception as dict_load_error:
                # If we can't even load as dict, raise error
                logger.error(
                    "Failed to load project config even as dict",
                    namespace=namespace,
                    project_id=project_id,
                    error=str(dict_load_error),
                )
                raise ProjectConfigError(
                    namespace,
                    project_id,
                    message="Failed to load project configuration",
                ) from dict_load_error
        except ProjectConfigError:
            # bubble our structured error
            raise
        except ConfigError as e:
            # Config present but invalid/malformed
            logger.warning(
                "Invalid project config",
                namespace=namespace,
                project_id=project_id,
                error=str(e),
            )
            raise ProjectConfigError(
                namespace,
                project_id,
                message="Invalid project configuration",
            ) from e
        except OSError as e:
            # Filesystem-related errors
            logger.error(
                "Filesystem error loading project config",
                namespace=namespace,
                project_id=project_id,
                error=str(e),
            )
            raise

        # Get last modified timestamp
        last_modified = cls.get_project_last_modified(project_dir)

        return Project(
            namespace=namespace,
            name=project_id,
            config=cfg,
            validation_error=validation_error_msg,
            last_modified=last_modified,
        )

    @classmethod
    def load_config(cls, namespace: str, project_id: str) -> LlamaFarmConfig:
        return load_config(cls.get_project_dir(namespace, project_id))

    @classmethod
    def save_config(
        cls,
        namespace: str,
        project_id: str,
        config: LlamaFarmConfig,
    ) -> LlamaFarmConfig:
        file_path, cfg = save_config(config, cls.get_project_dir(namespace, project_id))
        logger.debug("Saved project config", config=config, file_path=file_path)
        return cfg

    @classmethod
    def update_project(
        cls,
        namespace: str,
        project_id: str,
        updated_config: LlamaFarmConfig,
    ) -> LlamaFarmConfig:
        """
        Full-replacement update of a project's configuration.
        - Ensures the project exists
        - Validates config via the datamodel when saving
        - Enforces immutable fields (namespace, name alignment)
        - Performs atomic save with backup via loader.save_config
        """
        # Ensure project exists and has a config file
        _ = cls.get_project(namespace, project_id)

        # Enforce immutable name: align to path project_id regardless of payload
        config_dict = updated_config.model_dump(mode="json", exclude_none=True)
        config_dict["name"] = project_id

        # Validate by reconstructing model
        cfg_model = LlamaFarmConfig(**config_dict)

        return cls.save_config(namespace, project_id, cfg_model)
