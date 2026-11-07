use phaseo::gen::models::{DecisionAudioSource, DecisionBox, DecisionBoxAnswer, DecisionInputAudio};

#[test]
fn decision_box_answer_exposes_the_box_field_as_a_raw_identifier() {
    let answer = DecisionBoxAnswer {
        r#box: DecisionBox { left: 0.1, top: 0.2, right: 0.6, bottom: 0.9 },
        confidence: Some(0.9),
        name: Some("mug".into()),
        r#type: "box".into(),
    };
    assert_eq!(answer.r#box.right, 0.6);
    assert_eq!(answer.r#type, "box");
    assert_eq!(answer.name.as_deref(), Some("mug"));
}

#[test]
fn decision_audio_accepts_structured_inline_and_remote_sources() {
    let inline = DecisionInputAudio {
        input_audio: DecisionAudioSource { data: Some("AQID".into()), format: Some("wav".into()), url: None },
        r#type: "input_audio".into(),
    };
    assert_eq!(inline.input_audio.data.as_deref(), Some("AQID"));
    let remote = DecisionInputAudio {
        input_audio: DecisionAudioSource { data: None, format: None, url: Some("https://media.example/audio.wav".into()) },
        r#type: "input_audio".into(),
    };
    assert_eq!(remote.input_audio.url.as_deref(), Some("https://media.example/audio.wav"));
}
