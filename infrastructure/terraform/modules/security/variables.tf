variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

variable "vpc_id" {
  description = "The VPC ID to associate with security resources"
  type        = string
}

variable "app_name" {
  description = "Application name"
  type        = string
}

variable "vpc_cidr_block" {
  description = "The CIDR block of the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "s3_bucket_name" {
  description = "Name of the S3 bucket for read-only access (leave empty to skip)"
  type        = string
  default     = ""
}
