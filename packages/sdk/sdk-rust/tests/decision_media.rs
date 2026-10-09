use std::collections::HashMap;
use phaseo::gen::models::DecisionInputAudio;

#[test]
fn decision_audio_accepts_structured_inline_and_remote_sources() {
    let inline = DecisionInputAudio {
        input_audio: HashMap::from([("data".into(), "AQID".into()), ("format".into(), "wav".into())]),
        r#type: "input_audio".into(),
    };
    assert_eq!(inline.input_audio.get("data").map(String::as_str), Some("AQID"));
    let remote = DecisionInputAudio {
        input_audio: HashMap::from([("url".into(), "https://media.example/audio.wav".into())]),
        r#type: "input_audio".into(),
    };
    assert_eq!(remote.input_audio.get("url").map(String::as_str), Some("https://media.example/audio.wav"));
}
