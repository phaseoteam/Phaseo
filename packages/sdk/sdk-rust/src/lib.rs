#[path = "gen/lib.rs"]
pub mod gen;

pub mod client {
    pub use crate::gen::client::*;
}

pub mod models {
    pub use crate::gen::models::*;
}

pub mod operations {
    pub use crate::gen::operations::*;
}
