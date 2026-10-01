use std::thread;
use std::time::Duration;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Page<T> {
    pub data: Vec<T>,
    pub has_more: bool,
}

pub struct Pager<T, E, F>
where
    F: FnMut(usize, usize) -> Result<Page<T>, E>,
{
    fetch: F,
    limit: usize,
    offset: usize,
    done: bool,
}

impl<T, E, F> Pager<T, E, F>
where
    F: FnMut(usize, usize) -> Result<Page<T>, E>,
{
    pub fn new(limit: usize, offset: usize, fetch: F) -> Self {
        Self {
            fetch,
            limit: limit.max(1),
            offset,
            done: false,
        }
    }
}

impl<T, E, F> Iterator for Pager<T, E, F>
where
    F: FnMut(usize, usize) -> Result<Page<T>, E>,
{
    type Item = Result<Page<T>, E>;

    fn next(&mut self) -> Option<Self::Item> {
        if self.done {
            return None;
        }
        match (self.fetch)(self.limit, self.offset) {
            Ok(page) => {
                let count = page.data.len();
                self.offset += count;
                self.done = !page.has_more || count == 0;
                Some(Ok(page))
            }
            Err(error) => {
                self.done = true;
                Some(Err(error))
            }
        }
    }
}

pub struct JobHandle<T, E, F, S>
where
    F: FnMut(&str) -> Result<T, E>,
    S: for<'a> Fn(&'a T) -> &'a str,
{
    pub kind: String,
    pub id: String,
    fetch: F,
    status: S,
}

impl<T, E, F, S> JobHandle<T, E, F, S>
where
    F: FnMut(&str) -> Result<T, E>,
    S: for<'a> Fn(&'a T) -> &'a str,
{
    pub fn new(kind: impl Into<String>, id: impl Into<String>, fetch: F, status: S) -> Self {
        Self {
            kind: kind.into(),
            id: id.into(),
            fetch,
            status,
        }
    }

    pub fn refresh(&mut self) -> Result<T, E> {
        (self.fetch)(&self.id)
    }

    pub fn wait(&mut self, interval: Duration) -> Result<T, String>
    where
        E: std::fmt::Display,
    {
        loop {
            let value = self.refresh().map_err(|error| error.to_string())?;
            let current = (self.status)(&value).to_ascii_lowercase();
            if current == "completed" {
                return Ok(value);
            }
            if matches!(
                current.as_str(),
                "failed" | "cancelled" | "canceled" | "expired"
            ) {
                return Err(format!(
                    "{} job {} ended with status {}",
                    self.kind, self.id, current
                ));
            }
            thread::sleep(interval);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pagination_and_job_handles_advance_safely() {
        let mut pages = Pager::new(2, 0, |_, offset| -> Result<Page<i32>, String> {
            Ok(if offset == 0 {
                Page {
                    data: vec![1, 2],
                    has_more: true,
                }
            } else {
                Page {
                    data: vec![3],
                    has_more: false,
                }
            })
        });
        assert_eq!(pages.next().unwrap().unwrap().data, vec![1, 2]);
        assert_eq!(pages.next().unwrap().unwrap().data, vec![3]);
        assert!(pages.next().is_none());

        let mut statuses = vec!["completed".to_string(), "running".to_string()];
        let mut job = JobHandle::new(
            "video",
            "video_1",
            move |_| -> Result<String, String> { Ok(statuses.pop().unwrap()) },
            |value: &String| value.as_str(),
        );
        assert_eq!(job.wait(Duration::from_millis(1)).unwrap(), "completed");
    }
}
