output "instance_ids" {
  description = "Name of the Auto Scaling group"
  value       = aws_autoscaling_group.app.id
}

output "load_balancer_dns" {
  description = "DNS name of the load balancer"
  value       = aws_lb.app.dns_name
}

output "load_balancer_arn" {
  description = "ARN of the load balancer"
  value       = aws_lb.app.arn
}

output "autoscaling_group_name" {
  description = "Name of the Auto Scaling group"
  value       = aws_autoscaling_group.app.name
}

output "launch_template_id" {
  description = "ID of the launch template"
  value       = aws_launch_template.app.id
}

output "target_group_arn" {
  description = "ARN of the ALB target group"
  value       = aws_lb_target_group.app.arn
}
