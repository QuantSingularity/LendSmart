resource "aws_db_subnet_group" "main" {
  name       = "${var.environment}-${var.project_name}-db-subnet-group"
  subnet_ids = var.private_subnet_ids

  tags = {
    Name        = "${var.environment}-${var.project_name}-db-subnet-group"
    Environment = var.environment
  }
}

resource "aws_db_instance" "lend_smart_db" {
  allocated_storage      = var.db_allocated_storage
  engine                 = var.db_engine
  engine_version         = var.db_engine_version
  instance_class         = var.db_instance_class
  db_name                = var.db_name
  username               = var.db_username
  password               = var.db_password
  parameter_group_name   = var.db_parameter_group_name
  skip_final_snapshot    = var.db_skip_final_snapshot
  final_snapshot_identifier = var.db_skip_final_snapshot ? null : "${var.project_name}-${var.environment}-final-snapshot"
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = var.security_group_ids

  storage_encrypted = true
  kms_key_id        = var.db_kms_key_id

  backup_retention_period = var.db_backup_retention_period
  backup_window           = var.db_backup_window
  maintenance_window      = var.db_maintenance_window
  multi_az                = var.db_multi_az

  deletion_protection = var.db_deletion_protection

  performance_insights_enabled          = var.db_performance_insights_enabled
  performance_insights_retention_period = var.db_performance_insights_enabled ? var.db_performance_insights_retention_period : null
  performance_insights_kms_key_id       = var.db_performance_insights_enabled ? var.db_performance_insights_kms_key_id : null

  enabled_cloudwatch_logs_exports = ["audit", "error", "general", "slowquery"]

  auto_minor_version_upgrade = true

  tags = {
    Name        = "${var.project_name}-${var.environment}-db"
    Environment = var.environment
  }
}

resource "aws_rds_cluster" "lend_smart_aurora_cluster" {
  count                   = var.enable_aurora ? 1 : 0
  cluster_identifier      = "${var.project_name}-${var.environment}-aurora-cluster"
  engine                  = "aurora-mysql"
  engine_version          = "8.0.mysql_aurora.3.05.2"
  availability_zones      = var.aurora_availability_zones
  database_name           = var.db_name
  master_username         = var.db_username
  master_password         = var.db_password
  backup_retention_period = var.db_backup_retention_period
  preferred_backup_window = var.db_backup_window
  preferred_maintenance_window = var.db_maintenance_window
  vpc_security_group_ids  = var.security_group_ids
  db_subnet_group_name    = aws_db_subnet_group.main.name
  storage_encrypted       = true
  kms_key_id              = var.db_kms_key_id
  skip_final_snapshot     = var.db_skip_final_snapshot
  final_snapshot_identifier = var.db_skip_final_snapshot ? null : "${var.project_name}-${var.environment}-aurora-final-snapshot"
  deletion_protection     = var.db_deletion_protection

  enabled_cloudwatch_logs_exports = ["audit", "error", "general", "slowquery"]

  tags = {
    Name        = "${var.project_name}-${var.environment}-aurora-cluster"
    Environment = var.environment
  }
}

resource "aws_rds_cluster_instance" "lend_smart_aurora_instance" {
  count              = var.enable_aurora ? var.aurora_instance_count : 0
  cluster_identifier = aws_rds_cluster.lend_smart_aurora_cluster[0].id
  instance_class     = var.aurora_instance_class
  engine             = aws_rds_cluster.lend_smart_aurora_cluster[0].engine
  engine_version     = aws_rds_cluster.lend_smart_aurora_cluster[0].engine_version

  auto_minor_version_upgrade = true

  tags = {
    Name        = "${var.project_name}-${var.environment}-aurora-instance-${count.index + 1}"
    Environment = var.environment
  }
}
