#include <cassert>
#include <string>
#include <vector>
#include "workflows.hpp"

int main() {
  std::vector<std::size_t> offsets;
  phaseo::PageIterator<int> pages([&](std::size_t, std::size_t offset) {
    offsets.push_back(offset);
    return offset == 0 ? phaseo::Page<int>{{1, 2}, true} : phaseo::Page<int>{{3}, false};
  }, 2);
  auto first = pages.Next();
  auto second = pages.Next();
  assert(first && first->data.size() == 2);
  assert(second && second->data.size() == 1);
  assert(!pages.Next());
  assert(offsets == std::vector<std::size_t>({0, 2}));

  std::vector<std::string> statuses{"running", "completed"};
  phaseo::JobHandle<std::string> job("video", "video_1", [&](const std::string&) {
    auto value = statuses.front(); statuses.erase(statuses.begin()); return value;
  }, [](const std::string& value) { return value; });
  assert(job.Wait(std::chrono::milliseconds(1)) == "completed");
}
