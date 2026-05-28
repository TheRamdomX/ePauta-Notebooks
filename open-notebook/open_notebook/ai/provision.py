import os

from esperanto import LanguageModel
from langchain_core.language_models.chat_models import BaseChatModel
from loguru import logger

from open_notebook.ai.models import model_manager
from open_notebook.exceptions import ConfigurationError
from open_notebook.utils import token_count


async def provision_langchain_model(
    content, model_id, default_type, **kwargs
) -> BaseChatModel:
    """
    Returns the best model to use based on context size and configuration.
    Prioritizes hardcoded Google AI models from .env, then falls back to model_id or database defaults.
    """
    tokens = token_count(content)
    model = None
    selection_reason = ""

    api_key = os.getenv("GOOGLE_API_KEY")
    default_chat_model = os.getenv("DEFAULT_CHAT_MODEL")

    logger.debug(
        f"provision_langchain_model called: model_id={model_id}, default_type={default_type}, "
        f"DEFAULT_CHAT_MODEL={default_chat_model}, GOOGLE_API_KEY={'SET' if api_key else 'NOT SET'}"
    )

    if tokens > 105_000 and default_chat_model:
        selection_reason = f"large_context via Google AI (content has {tokens} tokens)"
        logger.debug(
            f"Using Google AI large context model because content has {tokens} tokens"
        )
        try:
            from esperanto import AIFactory
            model = AIFactory.create_language(
                model_name=default_chat_model,
                provider="google",
                config={"api_key": api_key} if api_key else {}
            )
        except Exception as e:
            logger.error(f"Failed to create Google AI model: {e}")
            model = None
    elif model_id:
        selection_reason = f"explicit model_id={model_id}"
        model = await model_manager.get_model(model_id, **kwargs)
    elif default_chat_model and api_key and default_type in ("chat", "transformation", "tools"):
        selection_reason = f"hardcoded Google AI model: {default_chat_model}"
        logger.info(f"Provisioning hardcoded Google AI model: {default_chat_model}")
        try:
            from esperanto import AIFactory
            logger.debug(f"Creating language model with: model_name={default_chat_model}, provider=google, api_key={'SET' if api_key else 'NOT SET'}")
            model = AIFactory.create_language(
                model_name=default_chat_model,
                provider="google",
                config={"api_key": api_key}
            )
            logger.info(f"Successfully created Google AI model: {model}")
        except Exception as e:
            logger.error(f"Failed to create Google AI model: {e}", exc_info=True)
            model = None
    else:
        selection_reason = f"database default for type={default_type}"
        model = await model_manager.get_default_model(default_type, **kwargs)

    logger.debug(f"Using model: {model} ({selection_reason})")

    if model is None:
        logger.error(
            f"Model provisioning failed: No model found. "
            f"Selection reason: {selection_reason}. "
            f"Check: DEFAULT_CHAT_MODEL={default_chat_model}, GOOGLE_API_KEY set={bool(api_key)}"
        )
        raise ConfigurationError(
            f"No model configured for {selection_reason}. "
            f"Set DEFAULT_CHAT_MODEL and GOOGLE_API_KEY in .env"
        )

    if not isinstance(model, LanguageModel):
        logger.error(
            f"Model type mismatch: Expected LanguageModel but got {type(model).__name__}. "
            f"Selection reason: {selection_reason}."
        )
        raise ConfigurationError(
            f"Model is not a LanguageModel: {model}. "
            f"Ensure DEFAULT_CHAT_MODEL points to a valid language model."
        )

    return model.to_langchain()
