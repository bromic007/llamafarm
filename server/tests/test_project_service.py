"""
Unit tests for ProjectService.

This module includes tests for project creation, deletion, and namespace management.
"""

import os
import shutil
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest
from config import ConfigError
from config.datamodel import (
    Dataset,
    LlamaFarmConfig,
    Model,
    PromptMessage,
    PromptSet,
    Provider,
    Runtime,
    Version,
)

from api.errors import ProjectNotFoundError, ReservedNamespaceError
from services.project_service import ProjectService


def test_create_project_reserved_namespace_raises_error():
    """Ensure creating a project in a reserved namespace is rejected."""
    with pytest.raises(ReservedNamespaceError, match="Namespace llamafarm is reserved"):
        ProjectService.create_project("llamafarm", "any_project")


class TestProjectDeletion:
    """Test cases for ProjectService.delete_project() method."""

    @pytest.fixture
    def temp_data_dir(self):
        """Create a temporary data directory for testing."""
        temp_dir = tempfile.mkdtemp()
        yield temp_dir
        # Cleanup after test
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)

    @pytest.fixture
    def mock_config(self):
        """Create a mock LlamaFarm configuration for testing."""
        return LlamaFarmConfig(
            version=Version.v1,
            name="test_project",
            namespace="test_namespace",
            prompts=[
                PromptSet(
                    name="default",
                    messages=[
                        PromptMessage(
                            role="system", content="You are a helpful assistant."
                        )
                    ],
                )
            ],
            rag={
                "databases": [
                    {
                        "name": "test_db",
                        "type": "ChromaStore",
                        "config": {},
                        "embedding_strategies": [
                            {
                                "name": "test_embedding",
                                "type": "OllamaEmbedder",
                                "config": {"model": "nomic-embed-text"},
                            }
                        ],
                        "retrieval_strategies": [
                            {
                                "name": "test_retrieval",
                                "type": "BasicSimilarityStrategy",
                                "config": {},
                                "default": True,
                            }
                        ],
                    }
                ],
                "data_processing_strategies": [
                    {
                        "name": "test_strategy",
                        "parsers": [
                            {
                                "type": "CSVParser_LlamaIndex",
                                "config": {},
                                "file_extensions": [".csv"],
                            }
                        ],
                    }
                ],
            },
            datasets=[
                Dataset(
                    name="test_dataset",
                    data_processing_strategy="test_strategy",
                    database="test_db",
                    files=["test_file.csv"],
                )
            ],
            runtime=Runtime(
                models=[
                    Model(
                        name="default",
                        provider=Provider.openai,
                        model="llama3.1:8b",
                        api_key="test_key",
                        base_url="http://localhost:11434/v1",
                    )
                ]
            ),
        )

    def test_delete_project_nonexistent_raises_not_found(self, temp_data_dir):
        """Test that deleting a non-existent project raises ProjectNotFoundError."""
        with (
            patch("core.settings.settings.lf_data_dir", temp_data_dir),
            pytest.raises(
                ProjectNotFoundError, match="Project test_ns/nonexistent not found"
            ),
        ):
            ProjectService.delete_project("test_ns", "nonexistent")

    def test_delete_project_success(self, temp_data_dir, mock_config):
        """Test successful deletion of a project."""
        with patch("core.settings.settings.lf_data_dir", temp_data_dir):
            # Create project directory structure
            namespace = "test_ns"
            project_id = "test_proj"
            project_dir = ProjectService.get_project_dir(namespace, project_id)
            os.makedirs(project_dir, exist_ok=True)

            # Save config to project directory
            ProjectService.save_config(namespace, project_id, mock_config)

            # Verify project exists
            assert os.path.exists(project_dir)
            project = ProjectService.get_project(namespace, project_id)
            # Note: project.name gets normalized to project_id when saved
            assert project.name == project_id

            # Delete the project
            deleted_project = ProjectService.delete_project(namespace, project_id)

            # Verify project info was returned
            assert deleted_project.namespace == namespace
            assert deleted_project.name == project_id
            assert deleted_project.config.namespace == mock_config.namespace

            # Verify project directory was deleted
            assert not os.path.exists(project_dir)

            # Verify getting the project now raises error
            with pytest.raises(ProjectNotFoundError):
                ProjectService.get_project(namespace, project_id)

    def test_delete_project_with_sessions(self, temp_data_dir, mock_config):
        """Test that deleting a project removes session directories."""
        with patch("core.settings.settings.lf_data_dir", temp_data_dir):
            # Create project
            namespace = "test_ns"
            project_id = "test_proj_sessions"
            project_dir = ProjectService.get_project_dir(namespace, project_id)
            os.makedirs(project_dir, exist_ok=True)
            ProjectService.save_config(namespace, project_id, mock_config)

            # Create session directory
            sessions_dir = Path(project_dir) / "sessions" / "session_123"
            sessions_dir.mkdir(parents=True, exist_ok=True)
            history_file = sessions_dir / "history.json"
            history_file.write_text('{"messages": []}')

            # Verify session exists
            assert sessions_dir.exists()
            assert history_file.exists()

            # Delete project
            ProjectService.delete_project(namespace, project_id)

            # Verify project and sessions are gone
            assert not os.path.exists(project_dir)
            assert not sessions_dir.exists()
            assert not history_file.exists()

    def test_delete_project_with_datasets(self, temp_data_dir, mock_config):
        """Test that deleting a project removes associated datasets."""
        with patch("core.settings.settings.lf_data_dir", temp_data_dir):
            from services.dataset_service import DatasetService

            # Create project
            namespace = "test_ns"
            project_id = "test_proj_datasets"
            project_dir = ProjectService.get_project_dir(namespace, project_id)
            os.makedirs(project_dir, exist_ok=True)
            ProjectService.save_config(namespace, project_id, mock_config)

            # Verify dataset exists in config
            datasets = DatasetService.list_datasets(namespace, project_id)
            assert len(datasets) == 1
            assert datasets[0].name == "test_dataset"

            # Delete project
            ProjectService.delete_project(namespace, project_id)

            # Verify project is gone
            assert not os.path.exists(project_dir)

            # Verify we can't list datasets for deleted project
            with pytest.raises((ProjectNotFoundError, ConfigError, OSError)):
                DatasetService.list_datasets(namespace, project_id)

    def test_delete_project_with_data_directory(self, temp_data_dir, mock_config):
        """Test that deleting a project removes the data directory."""
        with patch("core.settings.settings.lf_data_dir", temp_data_dir):
            # Create project
            namespace = "test_ns"
            project_id = "test_proj_data"
            project_dir = ProjectService.get_project_dir(namespace, project_id)
            os.makedirs(project_dir, exist_ok=True)
            ProjectService.save_config(namespace, project_id, mock_config)

            # Create data directory structure
            data_dir = Path(project_dir) / "data"
            data_dir.mkdir(parents=True, exist_ok=True)
            (data_dir / "meta").mkdir()
            (data_dir / "raw").mkdir()
            (data_dir / "stores").mkdir()

            # Add some test files
            (data_dir / "meta" / "test_meta.json").write_text('{"test": "data"}')
            (data_dir / "raw" / "test_file").write_bytes(b"test content")

            # Verify data exists
            assert (data_dir / "meta" / "test_meta.json").exists()
            assert (data_dir / "raw" / "test_file").exists()

            # Delete project
            ProjectService.delete_project(namespace, project_id)

            # Verify everything is gone
            assert not os.path.exists(project_dir)
            assert not data_dir.exists()

    def test_delete_project_partial_failure_continues(self, temp_data_dir, mock_config):
        """Test that deletion continues even if dataset deletion fails."""
        with patch("core.settings.settings.lf_data_dir", temp_data_dir):
            from services.dataset_service import DatasetService

            # Create project
            namespace = "test_ns"
            project_id = "test_proj_partial"
            project_dir = ProjectService.get_project_dir(namespace, project_id)
            os.makedirs(project_dir, exist_ok=True)
            ProjectService.save_config(namespace, project_id, mock_config)

            # Mock dataset deletion to raise an error
            def mock_delete_error(*args, **kwargs):
                raise ValueError("Simulated dataset deletion error")

            with patch.object(
                DatasetService, "delete_dataset", side_effect=mock_delete_error
            ):
                # Delete project should succeed despite dataset deletion failure
                deleted_project = ProjectService.delete_project(namespace, project_id)

                # Verify project was still deleted
                assert deleted_project.namespace == namespace
                assert not os.path.exists(project_dir)

    def test_delete_project_permission_error_raises(self, temp_data_dir, mock_config):
        """Test that permission errors during deletion are raised."""
        with patch("core.settings.settings.lf_data_dir", temp_data_dir):
            # Create project
            namespace = "test_ns"
            project_id = "test_proj_perms"
            project_dir = ProjectService.get_project_dir(namespace, project_id)
            os.makedirs(project_dir, exist_ok=True)
            ProjectService.save_config(namespace, project_id, mock_config)

            # Mock shutil.rmtree to raise PermissionError
            def mock_rmtree_permission(*args, **kwargs):
                if "ignore_errors" in kwargs and not kwargs["ignore_errors"]:
                    raise PermissionError("Permission denied")

            with (
                patch("shutil.rmtree", side_effect=mock_rmtree_permission),
                pytest.raises(PermissionError, match="Permission denied"),
            ):
                ProjectService.delete_project(namespace, project_id)
