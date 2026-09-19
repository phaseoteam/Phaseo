import phaseo
from phaseo import Phaseo


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
