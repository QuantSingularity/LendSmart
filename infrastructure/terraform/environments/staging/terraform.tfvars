aws_region   = "us-west-2"
environment  = "staging"
app_name     = "lendsmart"
project_name = "lendsmart"

vpc_cidr             = "10.1.0.0/16"
availability_zones   = ["us-west-2a", "us-west-2b", "us-west-2c"]
public_subnet_cidrs  = ["10.1.1.0/24", "10.1.2.0/24", "10.1.3.0/24"]
private_subnet_cidrs = ["10.1.4.0/24", "10.1.5.0/24", "10.1.6.0/24"]

instance_type        = "t3.small"
key_name             = "lendsmart-staging-key"
asg_min_size         = 2
asg_max_size         = 4
asg_desired_capacity = 2

db_instance_class = "db.t3.small"
db_name           = "lendsmartdb_staging"
db_username       = "admin"
db_password       = "REPLACE_WITH_SECRETS_MANAGER_VALUE"

default_tags = {
  Terraform   = "true"
  Environment = "staging"
  Project     = "LendSmart"
  ManagedBy   = "Terraform"
}
