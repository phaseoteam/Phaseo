#![forbid(unsafe_code)]

#[allow(non_snake_case, unused_imports, unused_variables)]
#[path = "gen/lib.rs"]
pub mod gen;
#[allow(clippy::module_inception, rustdoc::bare_urls)]
pub mod model_ids;
mod parameter_support;
mod phaseo;

pub use parameter_support::{check_parameter_support, ParameterSupportOptions};
pub use phaseo::{
    Phaseo, PhaseoError, PhaseoResponse, RequestEvent, RequestHook, RequestOptions, ResponseEvent,
    ResponseHook, RetryEvent, RetryHook,
};

pub mod client {
    pub use crate::gen::client::*;
}

pub mod models {
    pub use crate::gen::models::*;
}

pub mod operations {
    pub use crate::gen::operations::*;
}
