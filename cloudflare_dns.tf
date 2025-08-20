resource "cloudflare_dns_record" "root" {
  zone_id = data.cloudflare_zone.main.zone_id
  name    = var.root_domain
  type    = "CNAME"
  content = aws_cloudfront_distribution.cdn.domain_name

  # Required when proxied, because Cloudflare will manage the TTL.
  ttl = 1

  proxied = true
}

resource "cloudflare_dns_record" "www" {
  zone_id = data.cloudflare_zone.main.zone_id
  name    = "www"
  type    = "CNAME"
  content = aws_cloudfront_distribution.cdn.domain_name

  # Required when proxied, because Cloudflare will manage the TTL.
  ttl = 1

  proxied = true
}