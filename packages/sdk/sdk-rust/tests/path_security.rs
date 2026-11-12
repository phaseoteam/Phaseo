use std::cell::RefCell;
use std::collections::HashMap;
use phaseo::client::{Client, Response, Transport};

struct Capture(RefCell<Vec<String>>);
impl Transport for Capture {
    fn request(&self, _: &str, url: &str, _: Option<&str>, _: &HashMap<String, String>) -> Result<Response, String> {
        self.0.borrow_mut().push(url.into());
        Ok(Response { status: 200, headers: HashMap::new(), body: "{}".into() })
    }
}
#[test]
fn capability_parameters_cannot_change_the_authenticated_path() {
    let client = Client::new("https://example.test/v1".into(), Capture(RefCell::new(vec![])));
    for value in [".", ".."] {
        let path = HashMap::from([("author".into(), value.into()), ("slug".into(), "model".into())]);
        assert!(phaseo::operations::listModelEndpoints(&client, &path, None).is_err());
    }
    assert!(client.transport.0.borrow().is_empty());
    let path = HashMap::from([("author".into(), "author".into()), ("slug".into(), "model.1?x#fragment/a".into())]);
    phaseo::operations::listModelEndpoints(&client, &path, None).unwrap();
    assert_eq!(client.transport.0.borrow()[0], "https://example.test/v1/models/author/model.1%3Fx%23fragment%2Fa/endpoints");
}
