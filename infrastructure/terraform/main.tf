terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = var.default_tags
  }
}

module "network" {
  source = "./modules/network"

  environment          = var.environment
  project_name         = var.project_name
  vpc_cidr_block       = var.vpc_cidr
  availability_zones   = var.availability_zones
  public_subnet_cidrs  = var.public_subnet_cidrs
  private_subnet_cidrs = var.private_subnet_cidrs
  acm_certificate_arn  = var.acm_certificate_arn
}

module "security" {
  source = "./modules/security"

  environment    = var.environment
  vpc_id         = module.network.vpc_id
  app_name       = var.app_name
  s3_bucket_name = module.storage.s3_bucket_name
}

module "compute" {
  source = "./modules/compute"

  environment           = var.environment
  vpc_id                = module.network.vpc_id
  public_subnet_ids     = module.network.public_subnet_ids
  private_subnet_ids    = module.network.private_subnet_ids
  instance_type         = var.instance_type
  key_name              = var.key_name
  app_name              = var.app_name
  security_group_ids    = [module.security.app_security_group_id]
  instance_profile_name = module.security.instance_profile_name
  acm_certificate_arn   = var.acm_certificate_arn
  asg_min_size          = var.asg_min_size
  asg_max_size          = var.asg_max_size
  asg_desired_capacity  = var.asg_desired_capacity
}

module "database" {
  source = "./modules/database"

  environment        = var.environment
  project_name       = var.project_name
  vpc_id             = module.network.vpc_id
  private_subnet_ids = module.network.private_subnet_ids
  db_instance_class  = var.db_instance_class
  db_name            = var.db_name
  db_username        = var.db_username
  db_password        = var.db_password
  security_group_ids = [module.security.db_security_group_id]
  db_multi_az        = var.environment == "prod" ? true : false
  db_deletion_protection = var.environment == "prod" ? true : false
  db_skip_final_snapshot = var.environment == "prod" ? false : true
}

module "storage" {
  source = "./modules/storage"

  environment = var.environment
  app_name    = var.app_name
}

module "cost_optimization" {
  source = "./modules/cost_optimization"

  autoscaling_group_name = module.compute.autoscaling_group_name
  project_name           = var.project_name
  s3_bucket_id           = module.storage.app_data_bucket_id
}
