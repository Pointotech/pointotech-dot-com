data "cloudflare_zone" "main" {
  filter = {
    name = var.root_domain
    status = "active"
  }
}
