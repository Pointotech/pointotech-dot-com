resource "aws_s3_bucket" "site" {
  bucket = "pointotech-site"
}

resource "aws_s3_bucket_ownership_controls" "site" {
  bucket = aws_s3_bucket.site.id
  rule { object_ownership = "BucketOwnerEnforced" }
}

resource "aws_s3_bucket_public_access_block" "site" {
  bucket = aws_s3_bucket.site.id
  block_public_acls = true
  block_public_policy = false
  ignore_public_acls = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_policy" "site" {
  bucket = aws_s3_bucket.site.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid = "AllowCloudFrontRead"
        Effect = "Allow"
        Principal = {
          CanonicalUser = aws_cloudfront_origin_access_identity.site.s3_canonical_user_id
        }
        Action = ["s3:GetObject"]
        Resource = "${aws_s3_bucket.site.arn}/*"
      }
    ]
  })
}

locals {
  mime = {
    css = "text/css"
    gif = "image/gif"
    html = "text/html"
    jpeg = "image/jpeg"
    jpg = "image/jpeg"
    js = "application/javascript"
    json = "application/json"
    map = "application/json"
    png = "image/png"
    svg = "image/svg+xml"
    webp = "image/webp"
    woff = "font/woff"
    woff2 = "font/woff2"
  }

  site_files = fileset("${path.module}/site", "**")
  site_hash = sha1(join(",", [for f in local.site_files : filemd5("${path.module}/site/${f}")]))
}

resource "aws_s3_object" "site_files" {
  for_each = local.site_files

  bucket = aws_s3_bucket.site.id
  key = each.value
  source = "${path.module}/site/${each.value}"
  etag = filemd5("${path.module}/site/${each.value}")
  
  content_type = lookup(
    local.mime,
    lower(try(regex("\\.([^.]+)$", each.value)[0], "")),
    "application/octet-stream"
  )

  # Force browser revalidation so users never see stale bytes.
  cache_control = "no-cache, must-revalidate"
}

# Invalidate CloudFront cache whenever site contents change.
resource "null_resource" "cf_invalidation" {
  triggers = {
    site_hash = local.site_hash
    distribution_id = aws_cloudfront_distribution.cdn.id
  }

  # Requires AWS CLI in the shell's PATH with credentials for the same account.
  provisioner "local-exec" {
    command = "aws cloudfront create-invalidation --distribution-id ${aws_cloudfront_distribution.cdn.id} --paths '/*'"
  }

  # Ensure uploads finish before invalidation.
  depends_on = [aws_s3_object.site_files]
}