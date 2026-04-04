terraform {
  required_providers {
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

locals {
  bucket_name = var.bucket_name != "" ? var.bucket_name : "${var.app_name}-${var.environment}-data-${random_id.bucket_suffix.hex}"
}

resource "random_id" "bucket_suffix" {
  byte_length = 4
}

resource "aws_s3_bucket" "app_data_bucket" {
  bucket = local.bucket_name

  tags = {
    Name        = "${var.app_name}-${var.environment}-app-data"
    Environment = var.environment
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "app_data_bucket_encryption" {
  bucket = aws_s3_bucket.app_data_bucket.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_versioning" "app_data_bucket_versioning" {
  bucket = aws_s3_bucket.app_data_bucket.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "app_data_bucket_public_access_block" {
  bucket = aws_s3_bucket.app_data_bucket.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_logging" "app_data_bucket_logging" {
  bucket        = aws_s3_bucket.app_data_bucket.id
  target_bucket = aws_s3_bucket.app_data_bucket.id
  target_prefix = "access-logs/"
}
