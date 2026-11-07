use std::collections::HashMap;
use phaseo::gen::models::{WorkspaceMemberAddFailure, WorkspaceMemberAddResponse};

// Adding several members reports each user's outcome. A failure is flat strings (user_id, code,
// message), so the generated response can hold it as it holds other objects: a string map per item.
#[test]
fn add_members_response_holds_each_failure() {
    let response = WorkspaceMemberAddResponse {
        added_count: 1,
        approved: vec!["user_1".into()],
        data: Some(vec![HashMap::from([("user_id".into(), "user_1".into()), ("role".into(), "member".into())])]),
        error: Some("conflict".into()),
        failed: vec![HashMap::from([
            ("user_id".into(), "user_2".into()),
            ("code".into(), "conflict".into()),
            ("message".into(), "Invite has no uses left".into()),
        ])],
        message: Some("Added 1 of 3 users.".into()),
        not_attempted: vec!["user_3".into()],
    };
    assert_eq!(response.failed[0].get("user_id").map(String::as_str), Some("user_2"));
    assert_eq!(response.failed[0].get("code").map(String::as_str), Some("conflict"));
    assert_eq!(response.not_attempted, vec!["user_3".to_string()]);
    // The member details can be left out when they couldn't be read back.
    let without_details = WorkspaceMemberAddResponse { data: None, ..response };
    assert!(without_details.data.is_none());

    // The failure model itself has the same three fields.
    let failure = WorkspaceMemberAddFailure { code: "forbidden".into(), message: "Only the workspace owner can add admins.".into(), user_id: "user_4".into() };
    assert_eq!(failure.code, "forbidden");
}
