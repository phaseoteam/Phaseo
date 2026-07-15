-- Expand Gemini Live voice metadata to Google's documented 30 Live API voices.

update public.data_api_provider_model_capabilities
set params = jsonb_set(
      coalesce(params, '{}'::jsonb),
      '{voice}',
      '{
        "type": "enum",
        "default": "Puck",
        "values": [
          { "id": "Zephyr", "description": "Bright" },
          { "id": "Kore", "description": "Firm" },
          { "id": "Orus", "description": "Firm" },
          { "id": "Autonoe", "description": "Bright" },
          { "id": "Umbriel", "description": "Easy-going" },
          { "id": "Erinome", "description": "Clear" },
          { "id": "Laomedeia", "description": "Upbeat" },
          { "id": "Schedar", "description": "Even" },
          { "id": "Achird", "description": "Friendly" },
          { "id": "Sadachbia", "description": "Lively" },
          { "id": "Puck", "description": "Upbeat" },
          { "id": "Fenrir", "description": "Excitable" },
          { "id": "Aoede", "description": "Breezy" },
          { "id": "Enceladus", "description": "Breathy" },
          { "id": "Algieba", "description": "Smooth" },
          { "id": "Algenib", "description": "Gravelly" },
          { "id": "Achernar", "description": "Soft" },
          { "id": "Gacrux", "description": "Mature" },
          { "id": "Zubenelgenubi", "description": "Casual" },
          { "id": "Sadaltager", "description": "Knowledgeable" },
          { "id": "Charon", "description": "Informative" },
          { "id": "Leda", "description": "Youthful" },
          { "id": "Callirrhoe", "description": "Easy-going" },
          { "id": "Iapetus", "description": "Clear" },
          { "id": "Despina", "description": "Smooth" },
          { "id": "Rasalgethi", "description": "Informative" },
          { "id": "Alnilam", "description": "Firm" },
          { "id": "Pulcherrima", "description": "Forward" },
          { "id": "Vindemiatrix", "description": "Gentle" },
          { "id": "Sulafat", "description": "Warm" }
        ],
        "source_url": "https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/live-api/configure-language-voice"
      }'::jsonb,
      true
    ),
    updated_at = now()
where provider_api_model_id = 'google-ai-studio:google/gemini-3.1-flash-live-preview'
  and capability_id = 'audio.realtime';

