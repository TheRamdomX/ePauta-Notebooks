import os
from typing import Any, ClassVar, Dict, Optional, Union

from esperanto import (
    AIFactory,
    EmbeddingModel,
    LanguageModel,
    SpeechToTextModel,
    TextToSpeechModel,
)
from loguru import logger

from open_notebook.database.repository import ensure_record_id, repo_query
from open_notebook.domain.base import ObjectModel, RecordModel
from open_notebook.exceptions import ConfigurationError

ModelType = Union[LanguageModel, EmbeddingModel, SpeechToTextModel, TextToSpeechModel]


class Model(ObjectModel):
    table_name: ClassVar[str] = "model"
    nullable_fields: ClassVar[set[str]] = {"credential"}
    name: str
    provider: str
    type: str
    credential: Optional[str] = None

    @classmethod
    async def get_models_by_type(cls, model_type):
        models = await repo_query(
            "SELECT * FROM model WHERE type=$model_type;", {"model_type": model_type}
        )
        return [Model(**model) for model in models]

    @classmethod
    async def get_by_credential(cls, credential_id: str):
        """Get all models linked to a specific credential."""
        models = await repo_query(
            "SELECT * FROM model WHERE credential=$cred_id;",
            {"cred_id": ensure_record_id(credential_id)},
        )
        return [Model(**model) for model in models]

    def _prepare_save_data(self) -> Dict[str, Any]:
        data = super()._prepare_save_data()
        if data.get("credential"):
            data["credential"] = ensure_record_id(data["credential"])
        return data

    async def get_credential_obj(self):
        """Get the Credential object linked to this model, if any."""
        if not self.credential:
            return None
        from open_notebook.domain.credential import Credential

        try:
            return await Credential.get(self.credential)
        except Exception:
            logger.warning(f"Could not load credential {self.credential} for model {self.id}")
            return None


class DefaultModels(RecordModel):
    record_id: ClassVar[str] = "open_notebook:default_models"
    default_chat_model: Optional[str] = None
    default_transformation_model: Optional[str] = None
    large_context_model: Optional[str] = None
    default_text_to_speech_model: Optional[str] = None
    default_speech_to_text_model: Optional[str] = None
    # default_vision_model: Optional[str]
    default_embedding_model: Optional[str] = None
    default_tools_model: Optional[str] = None

    @classmethod
    async def get_instance(cls) -> "DefaultModels":
        """Always fetch fresh defaults from database (override parent caching behavior)"""
        result = await repo_query(
            "SELECT * FROM ONLY $record_id",
            {"record_id": ensure_record_id(cls.record_id)},
        )

        if result:
            if isinstance(result, list) and len(result) > 0:
                data = result[0]
            elif isinstance(result, dict):
                data = result
            else:
                data = {}
        else:
            data = {}

        # Create new instance with fresh data (bypass singleton cache)
        instance = object.__new__(cls)
        object.__setattr__(instance, "__dict__", {})
        super(RecordModel, instance).__init__(**data)
        return instance


class ModelManager:
    def __init__(self):
        pass  # No caching needed

    async def get_model(self, model_id: str, **kwargs) -> Optional[ModelType]:
        """Get a model by ID. Esperanto will cache the actual model instance."""
        if not model_id:
            return None

        try:
            model: Model = await Model.get(model_id)
        except Exception:
            raise ConfigurationError(f"Model with ID {model_id} not found")

        if not model.type or model.type not in [
            "language",
            "embedding",
            "speech_to_text",
            "text_to_speech",
        ]:
            raise ConfigurationError(f"Invalid model type: {model.type}")

        # Build config from credential if linked, otherwise fall back to env vars
        config: dict = {}
        if model.credential:
            credential = await model.get_credential_obj()
            if credential:
                config = credential.to_esperanto_config()
                logger.debug(
                    f"Using credential '{credential.name}' for model {model.name}"
                )
            else:
                logger.warning(
                    f"Model {model.id} has credential {model.credential} but it could not be loaded. "
                    f"Falling back to env vars."
                )
                # Fall back to env var provisioning
                from open_notebook.ai.key_provider import provision_provider_keys

                await provision_provider_keys(model.provider)
        else:
            # No credential linked - use env var fallback
            from open_notebook.ai.key_provider import provision_provider_keys

            await provision_provider_keys(model.provider)

        # Merge any additional kwargs (e.g. temperature)
        config.update(kwargs)

        # Normalize provider name: DB stores underscores but Esperanto expects hyphens
        provider = model.provider.replace("_", "-")

        # Create model based on type (Esperanto will cache the instance)
        if model.type == "language":
            return AIFactory.create_language(
                model_name=model.name,
                provider=provider,
                config=config,
            )
        elif model.type == "embedding":
            return AIFactory.create_embedding(
                model_name=model.name,
                provider=provider,
                config=config,
            )
        elif model.type == "speech_to_text":
            return AIFactory.create_speech_to_text(
                model_name=model.name,
                provider=provider,
                config=config,
            )
        elif model.type == "text_to_speech":
            return AIFactory.create_text_to_speech(
                model_name=model.name,
                provider=provider,
                config=config,
            )
        else:
            raise ConfigurationError(f"Invalid model type: {model.type}")

    async def get_defaults(self) -> DefaultModels:
        """Get the default models configuration from database"""
        defaults = await DefaultModels.get_instance()
        if not defaults:
            raise RuntimeError("Failed to load default models configuration")
        return defaults

    async def get_speech_to_text(self, **kwargs) -> Optional[SpeechToTextModel]:
        """Get the default speech-to-text model"""
        defaults = await self.get_defaults()
        model_id = defaults.default_speech_to_text_model
        if not model_id:
            return None
        model = await self.get_model(model_id, **kwargs)
        assert model is None or isinstance(model, SpeechToTextModel), (
            f"Expected SpeechToTextModel but got {type(model)}"
        )
        return model

    async def get_text_to_speech(self, **kwargs) -> Optional[TextToSpeechModel]:
        """Get the default text-to-speech model"""
        defaults = await self.get_defaults()
        model_id = defaults.default_text_to_speech_model
        if not model_id:
            return None
        model = await self.get_model(model_id, **kwargs)
        assert model is None or isinstance(model, TextToSpeechModel), (
            f"Expected TextToSpeechModel but got {type(model)}"
        )
        return model

    async def get_embedding_model(self, **kwargs) -> Optional[EmbeddingModel]:
        """Get the default embedding model - prioritizes environment variables from .env"""
        from esperanto import AIFactory
        from open_notebook.ai.key_provider import provision_provider_keys

        default_embedding_model = os.getenv("DEFAULT_EMBEDDING_MODEL")
        if not default_embedding_model:
            return None

        # Determine the provider based on the environment variables present
        provider = "google" # Default assumption
        api_key = os.getenv("GOOGLE_API_KEY")
        
        if not api_key:
             if os.getenv("OPENAI_API_KEY"):
                 provider = "openai"
                 api_key = os.getenv("OPENAI_API_KEY")
             elif os.getenv("ANTHROPIC_API_KEY"):
                 provider = "anthropic"
                 api_key = os.getenv("ANTHROPIC_API_KEY")
             elif os.getenv("OLLAMA_BASE_URL") or os.getenv("OLLAMA_HOST"):
                 provider = "ollama"
                 api_key = "dummy" # Ollama does not need a real api_key, but may need something to pass check

        if default_embedding_model and api_key:
            logger.debug(f"Using hardcoded {provider} embedding model: {default_embedding_model}")
            try:
                model = AIFactory.create_embedding(
                    model_name=default_embedding_model,
                    provider=provider,
                    config={"api_key": api_key},
                    **kwargs
                )
                assert isinstance(model, EmbeddingModel), (
                    f"Expected EmbeddingModel but got {type(model)}"
                )
                return model
            except Exception as e:
                logger.error(f"Failed to create {provider} embedding model: {e}")
        
        return None

    async def get_default_model(self, model_type: str, **kwargs) -> Optional[ModelType]:
        """
        Get the default model for a specific type.
        Prioritizes environment variables from .env and ignores database.
        """
        from esperanto import AIFactory
        
        if model_type == "embedding":
            return await self.get_embedding_model(**kwargs)

        default_chat_model = os.getenv("DEFAULT_CHAT_MODEL")
        if not default_chat_model:
             logger.debug(f"DEFAULT_CHAT_MODEL not set in .env")
             return None

        # Determine the provider based on the environment variables present
        provider = "google" # Default assumption for old .env config
        
        # If the string contains "gemma", "llama", "qwen", "mistral" etc and no GOOGLE_API_KEY... 
        # But we will rely on checking what is available or using a mapping:
        
        api_key = os.getenv("GOOGLE_API_KEY")
        
        if not api_key:
            if os.getenv("OPENAI_API_KEY"):
                provider = "openai"
                api_key = os.getenv("OPENAI_API_KEY")
            elif os.getenv("ANTHROPIC_API_KEY"):
                provider = "anthropic"
                api_key = os.getenv("ANTHROPIC_API_KEY")
            elif os.getenv("OLLAMA_BASE_URL") or os.getenv("OLLAMA_HOST") or "gemma" in default_chat_model.lower():
                # Simple fallback heuristic for Ollama locally
                provider = "ollama"
                api_key = "dummy"
        else:
            # We have a google api key, but if the user literally put "gemma-X" as model name
            # Google AI Studio does not host gemma via that name or at all usually. 
            if "gemma" in default_chat_model.lower() and (os.getenv("OLLAMA_BASE_URL") or os.getenv("OLLAMA_HOST")):
                 provider = "ollama"

        if model_type in ("chat", "transformation", "tools", "large_context") and default_chat_model and api_key:
            logger.debug(f"Using hardcoded {provider} model: {default_chat_model}")
            try:
                model = AIFactory.create_language(
                    model_name=default_chat_model,
                    provider=provider,
                    config={"api_key": api_key} if provider != "ollama" else {},
                    **kwargs
                )
                return model
            except Exception as e:
                logger.error(f"Failed to create {provider} model: {e}")
                return None
        
        return None


model_manager = ModelManager()
