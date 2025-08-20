variable "aws_region" {
  description = "AWS region"
  type = string
  default = "us-east-1"
}

variable "cloudflare_api_token" {
  description = "Cloudflare API token with DNS edit for the domain"
  type = string
  sensitive = true
}

variable "root_domain" {
  type = string
  default = "pointotech.com"
}
