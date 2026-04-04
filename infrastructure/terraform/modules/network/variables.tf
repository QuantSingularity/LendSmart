variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

variable "project_name" {
  description = "The name of the project"
  type        = string
}

variable "vpc_cidr_block" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "List of availability zones"
  type        = list(string)
  default     = []
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets"
  type        = list(string)
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private subnets"
  type        = list(string)
}

variable "s3_bucket_name" {
  description = "The name of the S3 bucket for CloudFront origin (leave empty to skip CloudFront)"
  type        = string
  default     = ""
}

variable "s3_bucket_regional_domain_name" {
  description = "The regional domain name of the S3 bucket"
  type        = string
  default     = ""
}

variable "s3_origin_access_identity" {
  description = "The CloudFront Origin Access Identity path for S3"
  type        = string
  default     = ""
}

variable "alb_security_groups" {
  description = "A list of security group IDs to associate with the ALB"
  type        = list(string)
  default     = []
}

variable "acm_certificate_arn" {
  description = "The ARN of the ACM certificate for HTTPS"
  type        = string
  default     = ""
}
