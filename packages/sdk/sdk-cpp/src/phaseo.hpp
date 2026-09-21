#pragma once

#include <algorithm>
#include <any>
#include <cmath>
#include <map>
#include <set>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

#include "gen/client.hpp"
#include "gen/operations.hpp"
#include "workflows.hpp"

namespace phaseo {

struct ParameterSupportOptions { std::string endpoint; std::set<std::string> providers; };
struct ModelEndpointCapabilities { std::string id; std::vector<std::map<std::string, std::any>> endpoints; };
struct ParameterRouteReference { std::string id; std::string provider; std::string endpoint; std::string public_path; };
struct ParameterConstraint { ParameterRouteReference route; std::map<std::string, std::any> detail; };
struct ParameterSupport { std::string name; std::any value; std::string status; std::vector<ParameterRouteReference> supported_by; std::vector<ParameterRouteReference> accepted_by; std::vector<ParameterRouteReference> unsupported_by; std::vector<ParameterConstraint> constraints; std::vector<std::string> issues; };
struct ParameterSupportReport { bool ok = false; std::string model_id; std::size_t route_count = 0; std::vector<ParameterRouteReference> matching_routes; std::vector<ParameterSupport> parameters; std::vector<std::string> issues; };
struct PreflightReport { bool ok = false; std::string model_id; std::map<std::string, std::any> checked_parameters; ParameterSupportReport parameter_support; };
inline ParameterSupportReport CheckParameterSupport(const ModelEndpointCapabilities&, const std::map<std::string, std::any>&, const ParameterSupportOptions&);

inline gen::Response GetModelEndpointCapabilities(gen::Client& client, const std::string& model_id) {
  const auto separator = model_id.find('/');
  if (separator == std::string::npos || separator == 0 || separator + 1 == model_id.size()) throw std::invalid_argument("model ID must use author/slug format");
  return gen::ListModelEndpoints(client, {{"author", model_id.substr(0, separator)}, {"slug", model_id.substr(separator + 1)}});
}

inline PreflightReport PreflightRequest(
    const ModelEndpointCapabilities& capabilities,
    const std::map<std::string, std::any>& request,
    const ParameterSupportOptions& options = {}) {
  auto model = request.find("model");
  if (model == request.end() || model->second.type() != typeid(std::string) || std::any_cast<std::string>(model->second).empty()) {
    throw std::invalid_argument("preflight requires request model");
  }
  static const std::set<std::string> structural = {"model", "input", "messages", "prompt", "contents", "provider", "providers", "routing", "metadata", "session_id", "app", "webhook", "idempotency_key"};
  std::map<std::string, std::any> values;
  for (const auto& [name, value] : request) if (structural.count(name) == 0) values.emplace(name, value);
  auto support = CheckParameterSupport(capabilities, values, options);
  return PreflightReport{support.ok, std::any_cast<std::string>(model->second), values, std::move(support)};
}

namespace detail {
template <typename T> inline const T* any_ptr(const std::map<std::string, std::any>& object, const std::string& key) { auto it=object.find(key); return it==object.end()?nullptr:std::any_cast<T>(&it->second); }
inline std::string text(const std::map<std::string,std::any>& object,const std::string& key,const std::string& fallback="") { auto value=any_ptr<std::string>(object,key);return value?*value:fallback; }
inline double number(const std::any& value,bool& ok){if(auto item=std::any_cast<double>(&value)){ok=true;return *item;}if(auto item=std::any_cast<int>(&value)){ok=true;return *item;}if(auto item=std::any_cast<long>(&value)){ok=true;return static_cast<double>(*item);}ok=false;return 0;}
inline std::string normalized(std::string value){if(value.rfind("/v1/",0)==0)return value.substr(4);if(!value.empty()&&value[0]=='/')return value.substr(1);return value;}
inline bool same(const std::any& left,const std::any& right){if(left.type()!=right.type())return false;if(auto value=std::any_cast<std::string>(&left))return *value==std::any_cast<std::string>(right);if(auto value=std::any_cast<bool>(&left))return *value==std::any_cast<bool>(right);bool lok=false,rok=false;auto l=number(left,lok),r=number(right,rok);return lok&&rok&&l==r;}
inline ParameterRouteReference reference(const std::map<std::string,std::any>& route){auto provider_map=any_ptr<std::map<std::string,std::any>>(route,"provider");auto provider=provider_map?text(*provider_map,"id","unknown"):"unknown";auto endpoint=text(route,"endpoint",text(route,"capability_id","unknown"));return {text(route,"id",provider+":"+endpoint),provider,endpoint,text(route,"public_path",endpoint)};}
inline std::vector<std::string> value_issues(const std::string& name,const std::any& value,const std::map<std::string,std::any>& constraint){std::vector<std::string> issues;auto allowed=any_ptr<std::vector<std::any>>(constraint,"values");if(!allowed)allowed=any_ptr<std::vector<std::any>>(constraint,"enum");if(allowed&&!std::any_of(allowed->begin(),allowed->end(),[&](const auto& item){return same(item,value);})){issues.push_back(name+" is outside the allowed values");}bool valid=false;double numeric=number(value,valid);if(valid){if(!std::isfinite(numeric))issues.push_back(name+" must be finite");for(auto key: {"minimum","maximum"}){auto it=constraint.find(key);if(it==constraint.end())continue;bool has=false;double limit=number(it->second,has);if(has&&((std::string(key)=="minimum"&&numeric<limit)||(std::string(key)=="maximum"&&numeric>limit)))issues.push_back(name+(std::string(key)=="minimum"?" must be at least ":" must be at most ")+std::to_string(limit));}auto step_it=constraint.find("step");if(step_it!=constraint.end()){bool has=false;double step=number(step_it->second,has);if(has&&step>0){double start=0;auto min_it=constraint.find("minimum");if(min_it!=constraint.end()){bool ignored=false;start=number(min_it->second,ignored);}double steps=(numeric-start)/step;if(std::abs(steps-std::round(steps))>1e-8)issues.push_back(name+" must use the advertised step");}}}return issues;}
inline void unique(std::vector<std::string>& values){std::set<std::string> seen;values.erase(std::remove_if(values.begin(),values.end(),[&](const auto& value){return !seen.insert(value).second;}),values.end());}
}  // namespace detail

inline ParameterSupportReport CheckParameterSupport(const ModelEndpointCapabilities& model,const std::map<std::string,std::any>& values,const ParameterSupportOptions& options={}) {
  std::vector<const std::map<std::string,std::any>*> routes;
  for(const auto& route:model.endpoints){auto routable=detail::any_ptr<bool>(route,"routable");auto status=detail::text(route,"status");auto ref=detail::reference(route);if(!routable||!*routable||status!="active")continue;if(!options.providers.empty()&&!options.providers.count(ref.provider))continue;if(!options.endpoint.empty()&&detail::normalized(options.endpoint)!=ref.endpoint&&detail::normalized(options.endpoint)!=detail::normalized(ref.public_path)&&options.endpoint!=detail::text(route,"capability_id"))continue;routes.push_back(&route);}
  ParameterSupportReport report;report.model_id=model.id;report.route_count=routes.size();
  for(const auto& [name,value]:values){ParameterSupport item;item.name=name;item.value=value;std::size_t known=0;std::vector<std::string> value_issues;for(const auto* route:routes){auto ref=detail::reference(*route);auto capabilities=detail::any_ptr<std::map<std::string,std::any>>(*route,"capabilities");auto parameters=capabilities?detail::any_ptr<std::vector<std::string>>(*capabilities,"parameters"):nullptr;if(!parameters){item.unsupported_by.push_back(ref);continue;}known++;auto details=detail::any_ptr<std::map<std::string,std::any>>(*capabilities,"parameter_details");const std::map<std::string,std::any>* constraint=nullptr;if(details){auto it=details->find(name);if(it!=details->end())constraint=std::any_cast<std::map<std::string,std::any>>(&it->second);}bool supported=std::find(parameters->begin(),parameters->end(),name)!=parameters->end();if(constraint){if(auto flag=detail::any_ptr<bool>(*constraint,"supported"))supported=*flag;}if(!supported){item.unsupported_by.push_back(ref);continue;}item.supported_by.push_back(ref);if(constraint)item.constraints.push_back({ref,*constraint});auto issues=constraint?detail::value_issues(name,value,*constraint):std::vector<std::string>{};if(issues.empty())item.accepted_by.push_back(ref);else value_issues.insert(value_issues.end(),issues.begin(),issues.end());}item.status=routes.empty()||known==0?"unknown":item.supported_by.empty()?"unsupported":item.supported_by.size()==routes.size()?"supported":"partial";if(item.status=="unsupported")item.issues.push_back(name+" is not supported by any matching active route");else if(!item.supported_by.empty()&&item.accepted_by.empty()){detail::unique(value_issues);item.issues=value_issues;}report.parameters.push_back(std::move(item));}
  for(const auto* route:routes){auto ref=detail::reference(*route);bool accepted=true;for(const auto& parameter:report.parameters)if(std::none_of(parameter.accepted_by.begin(),parameter.accepted_by.end(),[&](const auto& candidate){return candidate.id==ref.id;})){accepted=false;break;}if(accepted)report.matching_routes.push_back(ref);}
  report.ok=!routes.empty()&&!report.matching_routes.empty();if(routes.empty())report.issues.push_back("No active routable model endpoints matched the filters");else if(report.matching_routes.empty()&&!report.parameters.empty())report.issues.push_back("No active route supports all requested parameter values together");for(const auto& parameter:report.parameters)report.issues.insert(report.issues.end(),parameter.issues.begin(),parameter.issues.end());detail::unique(report.issues);return report;
}

}  // namespace phaseo
