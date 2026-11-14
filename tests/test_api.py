"""Tests for the optional local FastAPI bridge."""

from fastapi.testclient import TestClient

from llmw_codebook.api import app

client = TestClient(app)


def test_api_health_and_info() -> None:
    health = client.get("/api/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"

    info = client.post("/api/info", json={"n": 12, "u": 127, "construction": "linear"})
    assert info.status_code == 200
    data = info.json()
    assert data["gilbert_varshamov_d"] >= 38
    assert data["bch"]["native_length"] == 127


def test_api_embed_attack_extract_flow() -> None:
    emb = client.post(
        "/api/embed",
        json={
            "prompt": "This compact wireless charger delivers fast power for laptops",
            "watermark": 517,
            "secret_key": "api-test-key",
            "n": 10,
            "u": 127,
            "method": "levenshtein",
        },
    )
    assert emb.status_code == 200
    emb_data = emb.json()
    assert len(emb_data["steps"]) == 127

    atk = client.post(
        "/api/attack",
        json={
            "text": emb_data["generated_text"],
            "attack_type": "word_deletion",
            "budget": 0.1,
            "seed": 4,
        },
    )
    assert atk.status_code == 200
    atk_text = atk.json()["attacked_text"]

    ext = client.post(
        "/api/extract",
        json={
            "text": atk_text,
            "secret_key": "api-test-key",
            "n": 10,
            "u": 127,
            "method": "levenshtein",
            "include_alignment": True,
        },
    )
    assert ext.status_code == 200
    ext_data = ext.json()
    assert ext_data["watermark"] == 517
    assert len(ext_data["alignment"]) >= 120
