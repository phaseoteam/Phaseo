resource "phaseo_api_key" "example" {
  name        = "Production application"
  limit       = 250
  limit_reset = "monthly"
}
