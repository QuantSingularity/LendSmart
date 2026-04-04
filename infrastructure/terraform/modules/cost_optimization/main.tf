# Scale-out policy
resource "aws_autoscaling_policy" "scale_out" {
  name                   = "${var.project_name}-scale-out-policy"
  scaling_adjustment     = var.scaling_adjustment
  cooldown               = var.scaling_cooldown
  adjustment_type        = "ChangeInCapacity"
  autoscaling_group_name = var.autoscaling_group_name
}

# Scale-in policy
resource "aws_autoscaling_policy" "scale_in" {
  name                   = "${var.project_name}-scale-in-policy"
  scaling_adjustment     = -1
  cooldown               = var.scaling_cooldown
  adjustment_type        = "ChangeInCapacity"
  autoscaling_group_name = var.autoscaling_group_name
}

resource "aws_cloudwatch_metric_alarm" "cpu_utilization_high" {
  alarm_name          = "${var.project_name}-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = 300
  statistic           = "Average"
  threshold           = var.cpu_threshold
  alarm_description   = "Scale out when CPU utilization is high"
  treat_missing_data  = "notBreaching"

  dimensions = {
    AutoScalingGroupName = var.autoscaling_group_name
  }

  alarm_actions = [aws_autoscaling_policy.scale_out.arn]
}

resource "aws_cloudwatch_metric_alarm" "cpu_utilization_low" {
  alarm_name          = "${var.project_name}-cpu-low"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = 300
  statistic           = "Average"
  threshold           = var.cpu_low_threshold
  alarm_description   = "Scale in when CPU utilization is low"
  treat_missing_data  = "notBreaching"

  dimensions = {
    AutoScalingGroupName = var.autoscaling_group_name
  }

  alarm_actions = [aws_autoscaling_policy.scale_in.arn]
}

resource "aws_s3_bucket_lifecycle_configuration" "app_data_bucket_lifecycle" {
  bucket = var.s3_bucket_id

  rule {
    id     = "transition-and-expire"
    status = "Enabled"

    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = 90
      storage_class = "GLACIER"
    }

    expiration {
      days = 365
    }

    noncurrent_version_transition {
      noncurrent_days = 30
      storage_class   = "STANDARD_IA"
    }

    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }
}
