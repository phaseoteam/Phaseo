import phaseo
import json
import httpx
from phaseo import Phaseo


def test_clef_images_are_serialized_to_decisions_endpoint():
    images = ["data:image/png;base64,AQID", {"content_type": "image/webp", "base64": "AQID"}]

    def handler(request):
        assert str(request.url) == "https://example.test/v1/decisions"
        body = json.loads(request.content)
        assert body["images"] == images
        assert body["model"] == "cloudflare/clef-flash"
        return httpx.Response(200, json={"model": body["model"], "answers": {"visible": {"type": "noul", "noul": 0.9}}})

    with httpx.Client(transport=httpx.MockTransport(handler)) as transport:
        client = Phaseo(api_key="sk_test_123", base_url="https://example.test/v1", http_client=transport, enable_deprecation_warnings=False)
        result = client.decisions.make({"model": "cloudflare/clef-flash", "state": "Photo", "images": images,
                                        "questions": {"visible": {"type": "noul", "instructions": "Visible?"}}})
        assert result["answers"]["visible"]["noul"] == 0.9


def test_decisions_resource_calls_structured_endpoint(monkeypatch):
    captured = []

    def fake_make_decision(_client, body):
        captured.append(body)
        return {"model": body["model"], "answers": {"segment": "startup"}}

    client = Phaseo(
        api_key="sk_test_123",
        base_url="https://example.test/v1",
        enable_deprecation_warnings=False,
    )
    monkeypatch.setattr(client, "_maybe_warn_for_payload", lambda _payload: None)
    monkeypatch.setattr(phaseo.ops, "makeDecision", fake_make_decision)

    response = client.decisions.make(
        {
            "model": "typesafe/jev-1.13.0",
            "state": {"plan": "pro"},
            "questions": {
                "segment": {
                    "type": "choice",
                    "instructions": "Which segment?",
                    "criteria": {"startup": "An early-stage company."},
                }
            },
        }
    )

    assert response["answers"] == {"segment": "startup"}
    assert captured == [
        {
            "model": "typesafe/jev-1.13.0",
            "state": {"plan": "pro"},
            "questions": {
                "segment": {
                    "type": "choice",
                    "instructions": "Which segment?",
                    "criteria": {"startup": "An early-stage company."},
                }
            },
        }
    ]
