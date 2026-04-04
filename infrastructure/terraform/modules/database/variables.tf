variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "lendsmart"
}

variable "vpc_id" {
  description = "ID of the VPC"
  type        = string
}

variable "private_subnet_ids" {
  description = "IDs of the private subnets"
  type        = list(string)
}

variable "security_group_ids" {
  description = "List of security group IDs"
  type        = list(string)
}

variable "db_instance_class" {
  description = "The instance type of the RDS database"
  type        = string
  default     = "db.t3.micro"
}

variable "db_name" {
  description = "The name of the database"
  type        = string
  default     = "lendsmartdb"
}

variable "db_username" {
  description = "The master username for the database"
  type        = string
  sensitive   = true
}

variable "db_password" {
  description = "The master password for the database"
  type        = string
  sensitive   = true
}

variable "db_allocated_storage" {
  description = "The allocated storage in GBs"
  type        = number
  default     = 20
}

variable "db_engine" {
  description = "The database engine to use"
  type        = string
  default     = "mysql"
}

variable "db_engine_version" {
  description = "The database engine version"
  type        = string
  default     = "8.0.35"
}

variable "db_parameter_group_name" {
  description = "The name of the DB parameter group to associate"
  type        = string
  default     = "default.mysql8.0"
}

variable "db_skip_final_snapshot" {
  description = "Determines whether a final DB snapshot is created before deletion"
  type        = bool
  default     = false
}

variable "db_kms_key_id" {
  description = "The ARN of the KMS key for encryption at rest"
  type        = string
  default     = null
}

variable "db_backup_retention_period" {
  description = "The number of days to retain backups"
  type        = number
  default     = 7
}

variable "db_backup_window" {
  description = "The daily time range (in UTC) for automated backups"
  type        = string
  default     = "03:00-04:00"
}

variable "db_maintenance_window" {
  description = "The weekly time range for system maintenance"
  type        = string
  default     = "sun:05:00-sun:06:00"
}

variable "db_multi_az" {
  description = "A boolean indicating whether the DB instance is Multi-AZ"
  type        = bool
  default     = false
}

variable "db_deletion_protection" {
  description = "Whether deletion protection is enabled for the DB instance"
  type        = bool
  default     = true
}

variable "db_performance_insights_enabled" {
  description = "Specifies whether Performance Insights is enabled"
  type        = bool
  default     = false
}

variable "db_performance_insights_retention_period" {
  description = "Amount of time in days to retain Performance Insights data (7 or 731)"
  type        = number
  default     = 7
}

variable "db_performance_insights_kms_key_id" {
  description = "KMS key identifier for encryption of Performance Insights data"
  type        = string
  default     = null
}

variable "enable_aurora" {
  description = "Whether to create an Aurora cluster in addition to the RDS instance"
  type        = bool
  default     = false
}

variable "aurora_availability_zones" {
  description = "List of EC2 AZs for Aurora cluster instances"
  type        = list(string)
  default     = []
}

variable "aurora_instance_count" {
  description = "Number of Aurora instances to create"
  type        = number
  default     = 1
}

variable "aurora_instance_class" {
  description = "Instance class of Aurora instances"
  type        = string
  default     = "db.t3.medium"
}
