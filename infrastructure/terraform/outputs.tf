output "vpc_id" {
  description = "ID of the VPC"
  value       = module.network.vpc_id
}

output "public_subnet_ids" {
  description = "IDs of the public subnets"
  value       = module.network.public_subnet_ids
}

output "private_subnet_ids" {
  description = "IDs of the private subnets"
  value       = module.network.private_subnet_ids
}

output "alb_security_group_id" {
  description = "ID of the ALB security group"
  value       = module.security.alb_security_group_id
}

output "app_security_group_id" {
  description = "ID of the application security group"
  value       = module.security.app_security_group_id
}

output "db_security_group_id" {
  description = "ID of the database security group"
  value       = module.security.db_security_group_id
}

output "load_balancer_dns" {
  description = "DNS name of the Application Load Balancer"
  value       = module.compute.load_balancer_dns
}

output "autoscaling_group_name" {
  description = "Name of the Auto Scaling group"
  value       = module.compute.autoscaling_group_name
}

output "db_endpoint" {
  description = "Endpoint of the database"
  value       = module.database.db_endpoint
  sensitive   = true
}

output "s3_bucket_name" {
  description = "Name of the S3 bucket"
  value       = module.storage.s3_bucket_name
}

output "instance_profile_name" {
  description = "IAM instance profile name for EC2 instances"
  value       = module.security.instance_profile_name
}
