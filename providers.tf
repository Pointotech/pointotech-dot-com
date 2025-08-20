terraform {
  required_version = ">= 1.8.0"

  required_providers {
    aws = {
      source = "hashicorp/aws"
      version = ">= 6.0.0"
    }
    cloudflare = {
      source = "cloudflare/cloudflare"
      version = ">= 4.34.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# Alias provider for us-east-1 (needed for ACM certificates used in CloudFront).
provider "aws" {
  alias = "us_east_1"
  region = "us-east-1"
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}
