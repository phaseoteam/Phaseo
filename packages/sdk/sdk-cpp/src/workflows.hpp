#pragma once

#include <algorithm>
#include <chrono>
#include <functional>
#include <optional>
#include <stdexcept>
#include <string>
#include <thread>
#include <utility>
#include <vector>

namespace phaseo {

template <typename T>
struct Page {
  std::vector<T> data;
  bool has_more = false;
};

template <typename T>
class PageIterator {
 public:
  using Fetcher = std::function<Page<T>(std::size_t limit, std::size_t offset)>;

  PageIterator(Fetcher fetcher, std::size_t limit = 50, std::size_t offset = 0)
      : fetcher_(std::move(fetcher)), limit_(std::max<std::size_t>(1, limit)), offset_(offset) {}

  std::optional<Page<T>> Next() {
    if (done_) return std::nullopt;
    auto page = fetcher_(limit_, offset_);
    offset_ += page.data.size();
    done_ = !page.has_more || page.data.empty();
    return page;
  }

 private:
  Fetcher fetcher_;
  std::size_t limit_;
  std::size_t offset_;
  bool done_ = false;
};

template <typename T>
class JobHandle {
 public:
  using Fetcher = std::function<T(const std::string&)>;
  using Status = std::function<std::string(const T&)>;

  JobHandle(std::string kind, std::string id, Fetcher fetcher, Status status)
      : kind(std::move(kind)), id(std::move(id)), fetcher_(std::move(fetcher)), status_(std::move(status)) {
    if (this->id.empty()) throw std::invalid_argument("Job ID is required");
  }

  T Refresh() { return fetcher_(id); }

  T Wait(std::chrono::milliseconds interval = std::chrono::seconds(1)) {
    while (true) {
      auto value = Refresh();
      auto status = status_(value);
      if (status == "completed") return value;
      if (status == "failed" || status == "cancelled" || status == "canceled" || status == "expired") {
        throw std::runtime_error(kind + " job " + id + " ended with status " + status);
      }
      std::this_thread::sleep_for(interval);
    }
  }

  std::string kind;
  std::string id;

 private:
  Fetcher fetcher_;
  Status status_;
};

}  // namespace phaseo
