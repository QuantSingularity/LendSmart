aws_region   = "us-west-2"
environment  = "prod"
app_name     = "lendsmart"
project_name = "lendsmart"

vpc_cidr             = "10.2.0.0/16"
availability_zones   = ["us-west-2a", "us-west-2b", "us-west-2c"]
public_subnet_cidrs  = ["10.2.1.0/24", "10.2.2.0/24", "10.2.3.0/24"]
private_subnet_cidrs = ["10.2.4.0/24", "10.2.5.0/24", "10.2.6.0/24"]

instance_type        = "t3.large"
key_name             = "lendsmart-prod-key"
asg_min_size         = 2
asg_max_size         = 10
asg_desired_capacity = 3

db_instance_class = "db.r6g.large"
db_name           = "lendsmartdb"
db_username       = "admin"
db_password       = "REPLACE_WITH_SECRETS_MANAGER_VALUE"

default_tags = {
  Terraform   = "true"
  Environment = "prod"
  Project     = "LendSmart"
  ManagedBy   = "Terraform"
}
