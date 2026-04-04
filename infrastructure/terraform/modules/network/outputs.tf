output "vpc_id" {
  description = "ID of the VPC"
  value       = aws_vpc.main.id
}

output "public_subnet_ids" {
  description = "IDs of the public subnets"
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "IDs of the private subnets"
  value       = aws_subnet.private[*].id
}

output "cloudfront_domain_name" {
  description = "Domain name of the CloudFront distribution"
  value       = length(aws_cloudfront_distribution.s3_distribution) > 0 ? aws_cloudfront_distribution.s3_distribution[0].domain_name : ""
}

output "nat_gateway_ids" {
  description = "IDs of the NAT gateways"
  value       = aws_nat_gateway.nat[*].id
}
