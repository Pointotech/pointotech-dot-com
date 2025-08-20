resource "aws_acm_certificate" "cert" {
  domain_name = var.root_domain
  subject_alternative_names = [
    "www.${var.root_domain}"
  ]
  validation_method = "DNS"

  # Prevent the infinte destroy/recreate loop.
  lifecycle {
    create_before_destroy = true
  }

  # ACM for CloudFront must be in us-east-1.
  provider = aws.us_east_1
}

# Create DNS validation records in Cloudflare.
resource "cloudflare_dns_record" "acm_validation" {
  for_each = {
    for dvo in aws_acm_certificate.cert.domain_validation_options : dvo.domain_name => {
      name = dvo.resource_record_name
      type = dvo.resource_record_type
      value = dvo.resource_record_value
    }
  }

  zone_id = data.cloudflare_zone.main.zone_id
  name    = each.value.name
  type    = each.value.type
  content = each.value.value
  ttl     = 60
  proxied = false
}

# Validate the ACM certificate.
resource "aws_acm_certificate_validation" "cert" {
  certificate_arn = aws_acm_certificate.cert.arn

  validation_record_fqdns = [
    for r in cloudflare_dns_record.acm_validation : r.name
  ]

  provider = aws.us_east_1
}
