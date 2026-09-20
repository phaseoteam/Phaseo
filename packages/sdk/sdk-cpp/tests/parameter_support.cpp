#include <cassert>
#include <map>
#include <string>
#include "../src/phaseo.hpp"

int main() {
  phaseo::ModelEndpointCapabilities model;
  model.id = "openai/example";
  model.endpoints.push_back({
    {"id", std::string("openai:responses")}, {"endpoint", std::string("responses")}, {"routable", true}, {"status", std::string("active")},
    {"provider", std::map<std::string,std::any>{{"id",std::string("openai")}}},
    {"capabilities", std::map<std::string,std::any>{{"parameters",std::vector<std::string>{"temperature"}},{"parameter_details",std::map<std::string,std::any>{{"temperature",std::map<std::string,std::any>{{"supported",true},{"minimum",0.0},{"maximum",1.0}}}}}}}
  });
  auto report = phaseo::CheckParameterSupport(model, {{"temperature", 1.5}});
  assert(!report.ok);
  assert(report.parameters[0].status == "supported");
  assert(report.parameters[0].accepted_by.empty());
}
