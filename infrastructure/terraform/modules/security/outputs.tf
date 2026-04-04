output "alb_security_group_id" {
  description = "ID of the ALB security group"
  value       = aws_security_group.alb.id
}

output "app_security_group_id" {
  description = "ID of the application security group"
  value       = aws_security_group.app.id
}

output "db_security_group_id" {
  description = "ID of the database security group"
  value       = aws_security_group.db.id
}

output "instance_profile_name" {
  description = "Name of the IAM instance profile for EC2 instances"
  value       = aws_iam_instance_profile.app.name
}

output "app_role_arn" {
  description = "ARN of the IAM role for application servers"
  value       = aws_iam_role.app_role.arn
}
