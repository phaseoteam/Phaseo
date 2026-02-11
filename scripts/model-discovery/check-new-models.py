#!/usr/bin/env python3
import os
import json
import requests
from pathlib import Path
import boto3
from botocore.exceptions import NoCredentialsError, PartialCredentialsError
from dotenv import load_dotenv
import sys

# Load environment variables from .env.local
load_dotenv('.env.local')

# Constants
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
MODELS_ROOT = REPO_ROOT / "apps" / "web" / "src" / "data" / "models"
PRICING_ROOT = REPO_ROOT / "apps" / "web" / "src" / "data" / "pricing"
API_PROVIDERS_ROOT = REPO_ROOT / "apps" / "web" / "src" / "data" / "api_providers"

def normalize_model_key(value: str) -> str:
    return ''.join(c.lower() for c in value if c.isalnum() or c in '-_.')

def list_model_files(root: Path) -> list[Path]:
    if not root.exists():
        return []
    files = []
    for org in root.iterdir():
        if org.is_dir():
            for model in org.iterdir():
                if model.is_dir():
                    model_json = model / "model.json"
                    if model_json.exists():
                        files.append(model_json)
    return files

def list_pricing_files(root: Path) -> list[Path]:
    if not root.exists():
        return []
    files = []
    for provider in root.iterdir():
        if provider.is_dir():
            for level_one in provider.iterdir():
                if level_one.is_dir():
                    for level_two in level_one.iterdir():
                        if level_two.is_dir():
                            pricing_json = level_two / "pricing.json"
                            if pricing_json.exists():
                                files.append(pricing_json)
    return files

def get_existing_model_ids() -> set[str]:
    model_files = list_model_files(MODELS_ROOT)
    ids = set()
    for file in model_files:
        try:
            with open(file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if 'model_id' in data:
                    ids.add(data['model_id'])
        except (json.JSONDecodeError, IOError):
            pass
    return ids

def get_existing_provider_model_slugs() -> set[str]:
    pricing_files = list_pricing_files(PRICING_ROOT)
    ids = set()
    for file in pricing_files:
        try:
            with open(file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                provider_slug = data.get('provider_slug') or data.get('api_provider_id') or ''
                provider_model_slug = data.get('provider_model_slug') or ''
                model_id = data.get('model_id') or ''
                if provider_slug and provider_model_slug:
                    ids.add(f"{provider_slug}/{provider_model_slug}")
                elif model_id:
                    ids.add(model_id)
        except (json.JSONDecodeError, IOError):
            pass
    
    # Also scan api_providers/*/models.json files
    if API_PROVIDERS_ROOT.exists():
        for provider_dir in API_PROVIDERS_ROOT.iterdir():
            if provider_dir.is_dir():
                models_json = provider_dir / "models.json"
                if models_json.exists():
                    try:
                        with open(models_json, 'r', encoding='utf-8') as f:
                            models_data = json.load(f)
                            for model in models_data:
                                provider_slug = provider_dir.name  # directory name is the provider
                                provider_model_slug = model.get('provider_model_slug')
                                if provider_model_slug:
                                    ids.add(f"{provider_slug}/{provider_model_slug}")
                    except (json.JSONDecodeError, IOError):
                        pass
    
    return ids

def check_model_exists(existing_models: set[str], provider_id: str, model_id: str) -> bool:
    normalized_model_id = model_id.lower()
    provider_prefix = provider_id.lower()
    for existing in existing_models:
        normalized_existing = existing.lower()
        parts = normalized_existing.split('/')
        if len(parts) >= 2:
            existing_provider = parts[0]
            existing_model = '/'.join(parts[1:])
            if existing_provider == provider_prefix:
                if existing_model == normalized_model_id:
                    return True
                if normalized_model_id in existing_model or existing_model in normalized_model_id:
                    return True
    return False

# Provider fetch functions
def fetch_openai_models() -> list[str]:
    api_key = os.getenv('OPENAI_API_KEY')
    if not api_key:
        return []
    try:
        response = requests.get('https://api.openai.com/v1/models', headers={'Authorization': f'Bearer {api_key}'})
        if response.status_code != 200:
            return []
        data = response.json()
        return [f"openai/{m['id']}" for m in data.get('data', [])]
    except requests.RequestException:
        return []

def fetch_anthropic_models() -> list[str]:
    api_key = os.getenv('ANTHROPIC_API_KEY')
    if not api_key:
        return []
    try:
        response = requests.get('https://api.anthropic.com/v1/models', headers={
            'Authorization': f'Bearer {api_key}',
            'anthropic-version': '2023-06-01'
        })
        if response.status_code != 200:
            return []
        data = response.json()
        return [f"anthropic/{m['id']}" for m in data.get('data', [])]
    except requests.RequestException:
        return []

def fetch_mistral_models() -> list[str]:
    api_key = os.getenv('MISTRAL_API_KEY')
    if not api_key:
        return []
    try:
        response = requests.get('https://api.mistral.ai/v1/models', headers={'Authorization': f'Bearer {api_key}'})
        if response.status_code != 200:
            return []
        data = response.json()
        return [f"mistral/{m['id']}" for m in data.get('data', [])]
    except requests.RequestException:
        return []

def fetch_xai_models() -> list[str]:
    api_key = os.getenv('XAI_API_KEY')
    if not api_key:
        return []
    try:
        response = requests.get('https://api.x.ai/v1/models', headers={'Authorization': f'Bearer {api_key}'})
        if response.status_code != 200:
            return []
        data = response.json()
        return [f"x-ai/{m['id']}" for m in data.get('data', [])]
    except requests.RequestException:
        return []

def fetch_deepseek_models() -> list[str]:
    api_key = os.getenv('DEEPSEEK_API_KEY')
    if not api_key:
        return []
    try:
        response = requests.get('https://api.deepseek.com/models', headers={'Authorization': f'Bearer {api_key}'})
        if response.status_code != 200:
            return []
        data = response.json()
        return [f"deepseek/{m['id']}" for m in data.get('data', [])]
    except requests.RequestException:
        return []

def fetch_novitaai_models() -> list[str]:
    api_key = os.getenv('NOVITA_API_KEY')
    if not api_key:
        return []
    try:
        response = requests.get('https://api.novita.ai/v3/openai/v1/models', headers={'Authorization': f'Bearer {api_key}'})
        if response.status_code != 200:
            return []
        data = response.json()
        return [f"novitaai/{m['id']}" for m in data.get('data', [])]
    except requests.RequestException:
        return []

def fetch_google_ai_studio_models() -> list[str]:
    api_key = os.getenv('GOOGLE_API_KEY')
    if not api_key:
        return []
    try:
        url = f'https://generativelanguage.googleapis.com/v1beta/models?key={api_key}'
        response = requests.get(url)
        if response.status_code != 200:
            return []
        data = response.json()
        return [f"google/{m['name'].split('/')[1]}" for m in data.get('models', [])]
    except requests.RequestException:
        return []

def fetch_cohere_models() -> list[str]:
    api_key = os.getenv('COHERE_API_KEY')
    if not api_key:
        return []
    try:
        response = requests.get('https://api.cohere.ai/v1/models', headers={'Authorization': f'Bearer {api_key}'})
        if response.status_code != 200:
            return []
        data = response.json()
        return [f"cohere/{m['id']}" for m in data.get('data', [])]
    except requests.RequestException:
        return []

def fetch_groq_models() -> list[str]:
    api_key = os.getenv('GROQ_API_KEY')
    if not api_key:
        return []
    try:
        response = requests.get('https://api.groq.com/openai/v1/models', headers={'Authorization': f'Bearer {api_key}'})
        if response.status_code != 200:
            return []
        data = response.json()
        return [f"groq/{m['id']}" for m in data.get('data', [])]
    except requests.RequestException:
        return []

def fetch_cerebras_models() -> list[str]:
    api_key = os.getenv('CEREBRAS_API_KEY')
    if not api_key:
        return []
    try:
        response = requests.get('https://api.cerebras.ai/v1/models', headers={'Authorization': f'Bearer {api_key}'})
        if response.status_code != 200:
            return []
        data = response.json()
        return [f"cerebras/{m['id']}" for m in data.get('data', [])]
    except requests.RequestException:
        return []

def fetch_siliconflow_models() -> list[str]:
    api_key = os.getenv('SILICONFLOW_API_KEY')
    if not api_key:
        return []
    try:
        response = requests.get('https://api.siliconflow.ai/v1/models', headers={'Authorization': f'Bearer {api_key}'})
        if response.status_code != 200:
            return []
        data = response.json()
        return [f"siliconflow/{m['id']}" for m in data.get('data', [])]
    except requests.RequestException:
        return []

def fetch_together_models() -> list[str]:
    api_key = os.getenv('TOGETHER_API_KEY')
    if not api_key:
        return []
    try:
        response = requests.get('https://api.together.ai/models', headers={'Authorization': f'Bearer {api_key}'})
        if response.status_code != 200:
            return []
        data = response.json()
        return [f"together/{m['id']}" for m in data.get('data', [])]
    except requests.RequestException:
        return []

def fetch_moonshot_ai_models() -> list[str]:
    api_key = os.getenv('MOONSHOT_AI_API_KEY')
    if not api_key:
        return []
    try:
        response = requests.get('https://api.moonshot.cn/v1/models', headers={'Authorization': f'Bearer {api_key}'})
        if response.status_code != 200:
            return []
        data = response.json()
        return [f"moonshot-ai/{m['id']}" for m in data.get('data', [])]
    except requests.RequestException:
        return []

def fetch_minimax_models() -> list[str]:
    api_key = os.getenv('MINIMAX_API_KEY')
    if not api_key:
        return []
    try:
        response = requests.get('https://api.minimax.chat/v1/models', headers={'Authorization': f'Bearer {api_key}'})
        if response.status_code != 200:
            return []
        data = response.json()
        return [f"minimax/{m['id']}" for m in data.get('data', [])]
    except requests.RequestException:
        return []

def fetch_zai_models() -> list[str]:
    api_key = os.getenv('ZAI_API_KEY')
    if not api_key:
        return []
    try:
        response = requests.get('https://open.bigmodel.cn/api/paas/v4/models', headers={'Authorization': f'Bearer {api_key}'})
        if response.status_code != 200:
            return []
        data = response.json()
        return [f"z-ai/{m['id']}" for m in data.get('data', [])]
    except requests.RequestException:
        return []

def fetch_chutes_models() -> list[str]:
    api_key = os.getenv('CHUTES_API_KEY')
    if not api_key:
        return []
    try:
        response = requests.get('https://api.chutes.ai/v1/models', headers={'Authorization': f'Bearer {api_key}'})
        if response.status_code != 200:
            return []
        data = response.json()
        return [f"chutes/{m['id']}" for m in data.get('data', [])]
    except requests.RequestException:
        return []

def fetch_fireworks_models() -> list[str]:
    api_key = os.getenv('FIREWORKS_API_KEY')
    account_id = os.getenv('FIREWORKS_ACCOUNT_ID')
    if not api_key or not account_id:
        return []
    try:
        url = f'https://api.fireworks.ai/v1/accounts/{account_id}/models'
        response = requests.get(url, headers={'Authorization': f'Bearer {api_key}'})
        if response.status_code != 200:
            return []
        data = response.json()
        return [f"fireworks/{m['id']}" for m in data.get('data', [])]
    except requests.RequestException:
        return []

def fetch_cloudflare_models() -> list[str]:
    api_token = os.getenv('CF_API_TOKEN')
    account_id = os.getenv('CF_ACCOUNT_ID')
    if not api_token or not account_id:
        return []
    try:
        url = f'https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/models/search'
        response = requests.post(url, headers={
            'Authorization': f'Bearer {api_token}',
            'Content-Type': 'application/json'
        }, json={})
        if response.status_code != 200:
            return []
        data = response.json()
        return [f"cloudflare/{m['name']}" for m in data.get('result', {}).get('data', [])]
    except requests.RequestException:
        return []

def fetch_bedrock_models() -> list[str]:
    access_key = os.getenv('AWS_ACCESS_KEY_ID')
    secret_key = os.getenv('AWS_SECRET_ACCESS_KEY')
    region = os.getenv('AWS_REGION', 'us-east-1')
    if not access_key or not secret_key:
        return []
    try:
        client = boto3.client('bedrock', region_name=region, aws_access_key_id=access_key, aws_secret_access_key=secret_key)
        response = client.list_foundation_models()
        return [f"bedrock/{m['modelId']}" for m in response.get('modelSummaries', [])]
    except (NoCredentialsError, PartialCredentialsError, Exception):
        return []

def fetch_ai21_models() -> list[str]:
    api_key = os.getenv('AI21_API_KEY')
    if not api_key:
        return []
    try:
        response = requests.get('https://api.ai21.com/studio/v1/models', headers={'Authorization': f'Bearer {api_key}'})
        if response.status_code != 200:
            return []
        data = response.json()
        return [f"ai21/{m['id']}" for m in data.get('models', [])]
    except requests.RequestException:
        return []

def fetch_azure_models() -> list[str]:
    api_key = os.getenv('AZURE_API_KEY')
    endpoint = os.getenv('AZURE_ENDPOINT')
    if not api_key or not endpoint:
        return []
    try:
        url = f'{endpoint}/openai/models?api-version=2024-10-21'
        response = requests.get(url, headers={'api-key': api_key})
        if response.status_code != 200:
            return []
        data = response.json()
        return [f"azure/{m['id']}" for m in data.get('data', [])]
    except requests.RequestException:
        return []

def fetch_all_provider_models() -> list[dict]:
    providers = [
        {'id': 'openai', 'name': 'OpenAI', 'fetch': fetch_openai_models},
        {'id': 'anthropic', 'name': 'Anthropic', 'fetch': fetch_anthropic_models},
        {'id': 'mistral', 'name': 'Mistral', 'fetch': fetch_mistral_models},
        {'id': 'x-ai', 'name': 'xAI', 'fetch': fetch_xai_models},
        {'id': 'deepseek', 'name': 'DeepSeek', 'fetch': fetch_deepseek_models},
        {'id': 'minimax', 'name': 'MiniMax', 'fetch': fetch_minimax_models},
        {'id': 'z-ai', 'name': 'z.AI', 'fetch': fetch_zai_models},
        {'id': 'novitaai', 'name': 'NovitaAI', 'fetch': fetch_novitaai_models},
        {'id': 'google-ai-studio', 'name': 'Google AI Studio', 'fetch': fetch_google_ai_studio_models},
        {'id': 'cohere', 'name': 'Cohere', 'fetch': fetch_cohere_models},
        {'id': 'groq', 'name': 'Groq', 'fetch': fetch_groq_models},
        {'id': 'cerebras', 'name': 'Cerebras', 'fetch': fetch_cerebras_models},
        {'id': 'siliconflow', 'name': 'SiliconFlow', 'fetch': fetch_siliconflow_models},
        {'id': 'together', 'name': 'Together AI', 'fetch': fetch_together_models},
        {'id': 'moonshot-ai', 'name': 'Moonshot AI', 'fetch': fetch_moonshot_ai_models},
        {'id': 'chutes', 'name': 'Chutes', 'fetch': fetch_chutes_models},
        {'id': 'fireworks', 'name': 'Fireworks AI', 'fetch': fetch_fireworks_models},
        {'id': 'cloudflare', 'name': 'Cloudflare', 'fetch': fetch_cloudflare_models},
        {'id': 'bedrock', 'name': 'Amazon Bedrock', 'fetch': fetch_bedrock_models},
        {'id': 'azure', 'name': 'Azure OpenAI', 'fetch': fetch_azure_models},
        {'id': 'ai21', 'name': 'AI21', 'fetch': fetch_ai21_models},
    ]
    results = []
    for provider in providers:
        print(f"Checking {provider['name']}...")
        import time
        start = time.time()
        models = provider['fetch']()
        elapsed = time.time() - start
        print(f"  Fetched {len(models)} models from {provider['name']} ({int(elapsed * 1000)}ms)")
        results.append({
            'provider': provider['id'],
            'models': models,
            'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
        })
    return results

def send_discord_webhook(message: str):
    webhook_url = os.getenv('DISCORD_WEBHOOK_URL')
    if not webhook_url:
        return
    user_id = os.getenv('DISCORD_USER_ID')
    content = f"<@{user_id}>\n{message}" if user_id else message
    payload = {'content': content}
    if user_id:
        payload['allowed_mentions'] = {'users': [user_id]}
    try:
        requests.post(webhook_url, json=payload)
    except requests.RequestException as e:
        print(f"Failed to send Discord webhook: {e}")

def main():
    existing = get_existing_model_ids() | get_existing_provider_model_slugs()
    existing_normalized = {normalize_model_key(v) for v in existing}
    print(f"Found {len(existing)} existing models.")

    results = fetch_all_provider_models()
    new_models = []
    for result in results:
        if not result['models']:
            continue
        new_ones = [m for m in result['models'] if m not in existing and not check_model_exists(existing, result['provider'], m.split('/', 1)[1])]
        if new_ones:
            new_models.append({'provider': result['provider'], 'models': new_ones})

    if not new_models:
        print("No new models found.")
        return

    message = "🚀 New models detected:\n\n"
    for item in new_models:
        message += f"**{item['provider']}**: {len(item['models'])} new\n"
        message += '\n'.join(f"- {m}" for m in item['models']) + '\n\n'

    print(message)
    send_discord_webhook(message)

if __name__ == '__main__':
    main()
