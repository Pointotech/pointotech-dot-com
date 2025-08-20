resource "aws_cloudfront_origin_access_identity" "site" {
  comment = "Access identity for ${var.root_domain}"
}

resource "aws_cloudfront_distribution" "cdn" {
  enabled = true
  is_ipv6_enabled = true
  comment = "CDN for ${var.root_domain}"
  default_root_object = "index.html"

  aliases = [
    var.root_domain,
    "www.${var.root_domain}"
  ]

  origin {
    domain_name = aws_s3_bucket.site.bucket_regional_domain_name
    origin_id = "s3-origin"

    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.site.cloudfront_access_identity_path
    }
  }

  default_cache_behavior {
    target_origin_id = "s3-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods = ["GET", "HEAD"]
    cached_methods = ["GET", "HEAD"]

    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }

    min_ttl = 0
    default_ttl = 0
    max_ttl = 31536000
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  viewer_certificate {
    acm_certificate_arn = aws_acm_certificate_validation.cert.certificate_arn
    ssl_support_method = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}
